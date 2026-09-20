import "server-only";
import { prisma } from "./db";
import { parseDateOnly, formatDateDisplay, MS_PER_DAY, startOfUtcDay } from "./dates";
import { quoteHotel, quoteHouseboat, quoteVehicle, quoteItinerary } from "./quote";
import { PricingError } from "./pricing";
import { priceCart, itemLabel } from "./combined-quote";
import { totalPax } from "./quote-types";
import type {
  AnyQuoteInput,
  CombinedItem,
  ItineraryDay,
  ItinerarySummary,
  QuoteOption,
  QuotingAgent,
  VehicleLeg,
} from "./quote-types";

/**
 * Persisting a quote.
 *
 * v1 is QUOTE-ONLY. A saved quote is a record of what was priced — it confers
 * no booking, holds no inventory, and moves no money.
 */

/** ST-YYMM-NNNN, e.g. ST-2609-0042. Short enough to read down a phone line. */
async function nextReference(now = new Date()): Promise<string> {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `ST-${yy}${mm}-`;

  const last = await prisma.quote.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  const n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/** Travel window a saved quote covers, per product type. */
function travelWindow(input: AnyQuoteInput): { start: Date; end: Date; pax: number } {
  switch (input.productType) {
    case "hotel":
      return {
        start: parseDateOnly(input.checkIn),
        end: parseDateOnly(input.checkOut),
        // Rooms, not people — the hotel screen never asks for a headcount.
        pax: input.rooms,
      };
    case "houseboat": {
      const d = parseDateOnly(input.travelDate);
      return { start: d, end: d, pax: input.pax };
    }
    case "vehicle":
      return {
        start: parseDateOnly(input.startDate),
        end: parseDateOnly(input.endDate),
        // Was hard-coded to 0 when the vehicle screen had no headcount at all.
        // It asks now, and the number belongs on the customer's quote — a
        // party size is the first thing anyone checks on one.
        pax: totalPax(input.adults, input.childAges),
      };
    case "itinerary": {
      const d = parseDateOnly(input.startDate);
      return { start: d, end: d, pax: input.pax };
    }
  }
}

async function recompute(agent: QuotingAgent, input: AnyQuoteInput) {
  switch (input.productType) {
    case "hotel":
      return quoteHotel(agent, input);
    case "houseboat":
      return quoteHouseboat(agent, input);
    case "vehicle":
      return quoteVehicle(agent, input);
    case "itinerary":
      return quoteItinerary(agent, input);
  }
}

/**
 * Saves the option the agent picked.
 *
 * The price is RECOMPUTED here from the inputs and the option key — the
 * client's displayed total is never trusted, since it arrives over a form post
 * an agent could edit.
 */
export async function saveQuote(
  agent: QuotingAgent,
  input: AnyQuoteInput,
  optionKey: string
): Promise<string> {
  // Re-priced from the inputs and the agent's CURRENT tier — the browser's
  // total is never trusted, and neither is a tier the client might send.
  const { options, itinerary: measured } = await recompute(agent, input);
  const option = options.find((o) => o.key === optionKey);
  if (!option) {
    throw new PricingError("That option is no longer available at this price. Please requote.");
  }

  const window = travelWindow(input);

  // The itinerary end date is derived from the package length rather than
  // asked for, so the saved window reflects the real trip.
  if (input.productType === "itinerary") {
    const itinerary = await prisma.itinerary.findUnique({
      where: { id: input.itineraryId },
      select: { durationNights: true },
    });
    if (itinerary) {
      window.end = new Date(
        startOfUtcDay(window.start).getTime() + itinerary.durationNights * MS_PER_DAY
      );
    }
  }

  const snapshot = {
    input,
    // For a vehicle hire this is what makes a saved reference readable later:
    // the itinerary the km total was built from, not just the lump sum. The
    // legs are inputs to one priced line, not charges of their own, so they
    // are recorded here rather than as zero-value QuoteLine rows that would
    // break "lines sum to the total".
    // Taken from the RE-PRICED result, not from the input. A vehicle quote
    // built from a day-by-day plan carries no legs on the way in — they are
    // measured during pricing — so reading them off the input would freeze an
    // empty itinerary onto the quote. Older quotes, whose legs really were
    // typed, still fall back to the input.
    legs:
      input.productType === "vehicle" ? (measured?.legs ?? input.legs) : undefined,
    /**
     * The day plan and the distance behind it, frozen with everything else.
     * Rates are not the only thing that drifts — Google's idea of the road
     * between two places changes too, so a reference has to carry the
     * kilometres it was actually priced on.
     */
    itinerary: input.productType === "vehicle" && measured ? measured : undefined,
    // Recorded so a saved quote explains itself later, after a tier override
    // or a rate change would otherwise make the number look arbitrary.
    tier: agent.tier,
    option,
    quotedAt: new Date().toISOString(),
    // Rates change. A quote already sent to an agent must not change with them.
    note: "Frozen at quote time. Catalogue rate changes do not affect this record.",
  };

  // Retry once: the reference is derived from a read-then-write, so two quotes
  // saved in the same instant can collide on the unique index.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const quote = await prisma.quote.create({
        data: {
          reference: await nextReference(),
          agentId: agent.id,
          productType: input.productType,
          travelStart: window.start,
          travelEnd: window.end,
          pax: window.pax,
          totalMinor: option.totalMinor,
          snapshotJson: JSON.stringify(snapshot),
          lines: {
            create: option.lines.map((line, i) => ({
              description: line.description,
              quantity: line.quantity,
              unitMinor: line.unitMinor,
              totalMinor: line.totalMinor,
              usedOverride: line.usedOverride,
              sortOrder: i,
            })),
          },
        },
        select: { reference: true },
      });
      return quote.reference;
    } catch (e) {
      const isUniqueViolation =
        typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
      if (!isUniqueViolation || attempt === 2) throw e;
    }
  }
  throw new Error("Could not allocate a quote reference.");
}

/**
 * Saves a whole trip as one Quote with grouped lines.
 *
 * Re-prices the entire cart from its inputs first — the browser's total is
 * never trusted, exactly as for a single-product save. If any item can no
 * longer be priced the save is refused outright rather than quietly dropping
 * it, because a quote that silently loses a hotel is worse than one that
 * fails loudly.
 */
export async function saveCombinedQuote(
  agent: QuotingAgent,
  items: readonly CombinedItem[]
): Promise<string> {
  if (items.length === 0) {
    throw new PricingError("Add at least one item before saving.");
  }

  const { cart, problems } = await priceCart(agent, items);
  if (problems.length > 0) {
    throw new PricingError(
      `Item ${problems[0].index + 1}: ${problems[0].reason}`
    );
  }

  const productTypes = new Set(cart.items.map((i) => i.productType));
  const snapshot = {
    combined: true,
    items: items.map((it, i) => ({ input: it.input, optionKey: it.optionKey, label: itemLabel(cart.items[i]) })),
    quotedAt: new Date().toISOString(),
    note: "Frozen at quote time. Catalogue rate and markup changes do not affect this record.",
  };

  // One flat line list, grouped by itemIndex so the saved quote can be read
  // back as the items the agent actually chose.
  const lines = cart.items.flatMap((item) =>
    item.lines.map((line, lineIndex) => ({
      description: line.description,
      quantity: line.quantity,
      unitMinor: line.unitMinor,
      totalMinor: line.totalMinor,
      usedOverride: line.usedOverride,
      productType: item.productType,
      itemIndex: item.index,
      itemLabel: itemLabel(item),
      sortOrder: item.index * 100 + lineIndex,
    }))
  );

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const quote = await prisma.quote.create({
        data: {
          reference: await nextReference(),
          agentId: agent.id,
          // "combined" only when it genuinely holds more than one product, so
          // a one-item cart still reads as a hotel quote in the list.
          productType: productTypes.size === 1 ? [...productTypes][0] : "combined",
          travelStart: parseDateOnly(cart.travelStart),
          travelEnd: parseDateOnly(cart.travelEnd),
          pax: 0, // no single headcount spans a mixed trip
          totalMinor: cart.totalMinor,
          snapshotJson: JSON.stringify(snapshot),
          lines: { create: lines },
        },
        select: { reference: true },
      });
      return quote.reference;
    } catch (e) {
      const isUnique =
        typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
      if (!isUnique || attempt === 2) throw e;
    }
  }
  throw new Error("Could not allocate a quote reference.");
}

/**
 * A saved quote's frozen snapshot, read back.
 *
 * One reader, because three screens now need it — the agent's quote page, the
 * PDF, and the admin view — and three hand-rolled `JSON.parse` blocks are
 * three chances to disagree about what a quote said. A malformed or older
 * snapshot yields empty fields rather than throwing: the priced lines are real
 * rows, so a quote must still render even when its snapshot cannot be read.
 */
export type QuoteSnapshot = {
  input?: AnyQuoteInput & { days?: ItineraryDay[] };
  legs: VehicleLeg[];
  days: ItineraryDay[];
  option?: QuoteOption;
  /**
   * The measured distance behind a vehicle hire — routed km, the local-running
   * allowance and which stops earned it. Read by the ADMIN view only: it is
   * what explains a price, and it is not a number a customer was ever charged
   * line by line.
   */
  itinerary?: ItinerarySummary;
  /** Present only on quotes that have been edited since they were saved. */
  revisedAt?: string;
};

export function readSnapshot(snapshotJson: string): QuoteSnapshot {
  try {
    const snap = JSON.parse(snapshotJson) as {
      input?: AnyQuoteInput & { days?: ItineraryDay[] };
      legs?: VehicleLeg[];
      option?: QuoteOption;
      itinerary?: ItinerarySummary;
      revisedAt?: string;
    };
    return {
      input: snap.input,
      legs: Array.isArray(snap.legs) ? snap.legs : [],
      // The day plan the agent typed, as opposed to the road segments it was
      // measured into. Absent on quotes saved before the itinerary builder.
      days: Array.isArray(snap.input?.days) ? snap.input.days : [],
      option: snap.option,
      itinerary: snap.itinerary,
      revisedAt: typeof snap.revisedAt === "string" ? snap.revisedAt : undefined,
    };
  } catch {
    return { legs: [], days: [] };
  }
}

/**
 * What a quote is FOR, and where its photographs hang off.
 *
 * Quotes carry it on the frozen option from 20 Sept 2026. Older ones do not,
 * so it is rebuilt from the input — a fallback for DISPLAY only. The frozen
 * value always wins where it exists, because a renamed product must not
 * rewrite a quote that has already been sent.
 */
export async function resolveSubject(
  snapshot: QuoteSnapshot
): Promise<QuoteOption["subject"]> {
  const input = snapshot.input;
  const frozen = snapshot.option?.subject;

  if (frozen) {
    if (frozen.photo) return frozen;
    /*
     * The frozen NAME always wins — that is the whole point. A photo pointer
     * is a different kind of thing: not a claim about the quote, just where to
     * look for pictures. Quotes saved in the few hours between shipping a
     * single vehicle photograph and generalising it carry `vehicleId`; ones
     * from before that carry neither.
     */
    if (frozen.vehicleId) {
      return { ...frozen, photo: { kind: "vehicle", id: frozen.vehicleId } };
    }
    if (input?.productType === "vehicle") {
      return { ...frozen, photo: { kind: "vehicle", id: input.vehicleId } };
    }
    return frozen;
  }

  switch (input?.productType) {
    case "vehicle": {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: input.vehicleId },
        select: { id: true, type: true, capacity: true },
      });
      if (!vehicle) return undefined;
      return {
        name: vehicle.type,
        detail: `Up to ${vehicle.capacity} passenger${vehicle.capacity === 1 ? "" : "s"}`,
        photo: { kind: "vehicle", id: vehicle.id },
      };
    }
    case "hotel": {
      const hotel = await prisma.hotel.findUnique({
        where: { id: input.hotelId },
        select: { id: true, name: true, location: true },
      });
      if (!hotel) return undefined;
      return {
        name: hotel.name,
        detail: hotel.location,
        photo: { kind: "hotel", id: hotel.id },
      };
    }
    case "houseboat": {
      const boat = await prisma.houseboat.findUnique({
        where: { id: input.houseboatId },
        select: { id: true, name: true, category: true, bedrooms: true, location: true },
      });
      if (!boat) return undefined;
      return {
        name: boat.name,
        detail: `${boat.category} · ${boat.bedrooms} bedroom${boat.bedrooms === 1 ? "" : "s"} · ${boat.location}`,
        photo: { kind: "houseboat", id: boat.id },
      };
    }
    default:
      return undefined;
  }
}

export type SavedQuoteSummary = {
  reference: string;
  productType: string;
  travelStart: string;
  travelEnd: string;
  totalMinor: number;
  createdAt: Date;
};

export async function listQuotes(agentId: string): Promise<SavedQuoteSummary[]> {
  const quotes = await prisma.quote.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      reference: true,
      productType: true,
      travelStart: true,
      travelEnd: true,
      totalMinor: true,
      createdAt: true,
    },
  });

  return quotes.map((q) => ({
    ...q,
    travelStart: formatDateDisplay(q.travelStart),
    travelEnd: formatDateDisplay(q.travelEnd),
  }));
}

/**
 * Every agency's quotes, for the admin.
 *
 * Deliberately UNSCOPED, unlike `listQuotes` — this is Sonet's own view of
 * what the portal has priced, which is the only place the cost build-up behind
 * a quote can still be read now that agents see a single number.
 */
export async function listAllQuotes(limit = 200) {
  const quotes = await prisma.quote.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      reference: true,
      productType: true,
      travelStart: true,
      travelEnd: true,
      totalMinor: true,
      createdAt: true,
      agent: { select: { agencyName: true } },
    },
  });

  return quotes.map((q) => ({
    ...q,
    agencyName: q.agent.agencyName,
    travelStart: formatDateDisplay(q.travelStart),
    travelEnd: formatDateDisplay(q.travelEnd),
  }));
}

/**
 * One quote, for the admin — not scoped to an agent.
 *
 * Safe only because /admin is gated by its own layout and every server action
 * re-checks. Nothing on the agent side may call this.
 */
export async function getQuoteForAdmin(reference: string) {
  return prisma.quote.findUnique({
    where: { reference },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      agent: { select: { id: true, agencyName: true, email: true, derivedTier: true, tierOverride: true } },
    },
  });
}

/** Scoped to the agent — a reference from another agency must not resolve. */
export async function getQuote(agentId: string, reference: string) {
  return prisma.quote.findFirst({
    where: { reference, agentId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
}

export type QuoteOptionForDisplay = QuoteOption;

/**
 * Deletes one of the agent's own quotes.
 *
 * Scoped by `agentId` in the WHERE clause, not checked beforehand — another
 * agency's reference must not be deletable even by someone who guesses it, and
 * a single scoped statement cannot be raced into deleting the wrong row.
 *
 * A hard delete, unlike the catalogue's soft deletes. A quote is the agent's
 * own working document, not a shared record others may have priced against:
 * nothing references it, and an agent clearing out a mistaken quote means they
 * want it gone rather than hidden. QuoteLine rows cascade with it.
 */
/**
 * Replaces a saved quote in place, keeping its reference.
 *
 * Re-prices from the inputs like any save, then swaps the lines and snapshot
 * inside one transaction — a quote must never be observable with the old
 * total and the new lines.
 *
 * Keeping the reference is the point: an agent who has already given
 * ST-2609-0003 to a customer and then fixes a date needs it to stay
 * ST-2609-0003. Freezing a snapshot protects against rates drifting
 * underneath a quote, which is a different thing from its author
 * deliberately changing it.
 */
export async function replaceQuote(
  agent: QuotingAgent,
  reference: string,
  input: AnyQuoteInput,
  optionKey: string
): Promise<string> {
  const existing = await prisma.quote.findFirst({
    where: { agentId: agent.id, reference },
    select: { id: true },
  });
  if (!existing) throw new PricingError("That quote no longer exists.");

  const { options, itinerary: measured } = await recompute(agent, input);
  const option = options.find((o) => o.key === optionKey);
  if (!option) {
    throw new PricingError("That option is no longer available at this price. Please requote.");
  }

  const window = travelWindow(input);
  const snapshot = {
    input,
    legs: input.productType === "vehicle" ? (measured?.legs ?? input.legs) : undefined,
    itinerary: input.productType === "vehicle" && measured ? measured : undefined,
    tier: agent.tier,
    option,
    quotedAt: new Date().toISOString(),
    revisedAt: new Date().toISOString(),
    note: "Frozen at quote time. Catalogue rate changes do not affect this record.",
  };

  await prisma.$transaction([
    prisma.quoteLine.deleteMany({ where: { quoteId: existing.id } }),
    prisma.quote.update({
      where: { id: existing.id },
      data: {
        productType: input.productType,
        travelStart: window.start,
        travelEnd: window.end,
        pax: window.pax,
        totalMinor: option.totalMinor,
        snapshotJson: JSON.stringify(snapshot),
        lines: {
          create: option.lines.map((line, i) => ({
            description: line.description,
            quantity: line.quantity,
            unitMinor: line.unitMinor,
            totalMinor: line.totalMinor,
            usedOverride: line.usedOverride,
            sortOrder: i,
          })),
        },
      },
    }),
  ]);

  return reference;
}

export async function deleteQuote(agentId: string, reference: string): Promise<boolean> {
  const result = await prisma.quote.deleteMany({ where: { agentId, reference } });
  return result.count > 0;
}
