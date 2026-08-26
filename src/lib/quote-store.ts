import "server-only";
import { prisma } from "./db";
import { parseDateOnly, formatDateDisplay, MS_PER_DAY, startOfUtcDay } from "./dates";
import { quoteHotel, quoteHouseboat, quoteVehicle, quoteItinerary } from "./quote";
import { PricingError } from "./pricing";
import { priceCart, itemLabel } from "./combined-quote";
import type { AnyQuoteInput, CombinedItem, QuoteOption, QuotingAgent } from "./quote-types";

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
        pax: 0,
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
  const { options } = await recompute(agent, input);
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
    legs: input.productType === "vehicle" ? input.legs : undefined,
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

/** Scoped to the agent — a reference from another agency must not resolve. */
export async function getQuote(agentId: string, reference: string) {
  return prisma.quote.findFirst({
    where: { reference, agentId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
}

export type QuoteOptionForDisplay = QuoteOption;
