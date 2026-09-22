import "server-only";
import { prisma } from "./db";
import { gstBps, depositBps } from "./settings";
import { bookingMoney } from "./booking-shared";
import { storeUpload, discardUploads, isImage, UploadError } from "./uploads";
import { notifyBookingRequested } from "./mailer";
import { readSnapshot } from "./quote-store";
import { parseDateOnly } from "./dates";
import type { ItineraryDay } from "./quote-types";
import type { BookingStatus, PaymentStatus } from "./enums";

/**
 * Booking requests, and the payments recorded against them.
 *
 * v1 is a REQUEST and an APPROVAL — never a transaction. No money moves
 * through this portal. The agent pays Series Tours however they already do,
 * then files the proof here for Sonet to verify. Everything below is a ledger
 * of things that happened elsewhere.
 *
 * This module is the only write path, which is what makes the rules hold:
 * one booking per quote, only Sonet decides, and nothing counts as paid until
 * he says it does.
 */

export class BookingError extends Error {}

/** SB-YYMM-NNNN. Deliberately not ST- — a booking is not a quote. */
async function nextReference(now = new Date()): Promise<string> {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `SB-${yy}${mm}-`;

  const last = await prisma.booking.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  const n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/**
 * An agent asks for a saved quote to become a trip.
 *
 * The rate, GST and deposit percentage are all FROZEN here rather than read
 * later: a booking is an agreement about specific numbers, and a statutory
 * rate change or an edited setting must not silently restate one.
 */
export async function requestBooking(
  agentId: string,
  quoteReference: string,
  agentNote: string | null
): Promise<string> {
  // Scoped to the agent — another agency's reference must not be bookable
  // even by someone who guesses it.
  const quote = await prisma.quote.findFirst({
    where: { reference: quoteReference, agentId },
    select: { id: true, reference: true, totalMinor: true, booking: { select: { reference: true } } },
  });
  if (!quote) throw new BookingError("That quote no longer exists.");
  if (quote.booking) {
    throw new BookingError(
      `This quote already has booking ${quote.booking.reference} against it.`
    );
  }

  const [gst, deposit] = await Promise.all([gstBps(), depositBps()]);

  // Retry on the unique index: the reference comes from a read-then-write, so
  // two requests in the same instant can collide.
  let reference = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const booking = await prisma.booking.create({
        data: {
          reference: await nextReference(),
          quoteId: quote.id,
          agentId,
          status: "REQUESTED",
          agreedTotalMinor: quote.totalMinor,
          gstBps: gst,
          depositBps: deposit,
          agentNote: agentNote?.trim() || null,
        },
        select: { reference: true },
      });
      reference = booking.reference;
      break;
    } catch (e) {
      const isUnique =
        typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
      if (!isUnique || attempt === 2) throw e;
    }
  }
  if (!reference) throw new Error("Could not allocate a booking reference.");

  /*
   * Told about, never blocked by.
   *
   * The booking is already committed. If the mail server is unreachable,
   * misconfigured, or simply has no credentials yet, the agent must still
   * have a booking — the admin queue is the source of truth and the email is
   * a convenience on top of it. `notifyBookingRequested` never throws.
   */
  await notifyBookingRequested(reference);

  return reference;
}

/**
 * Sonet's decision, at a rate he may have changed.
 *
 * "on approval final rate might change" — so confirming takes a total. It is
 * stored on the BOOKING and never written back to the quote: the quote is a
 * frozen record of what was priced, and rewriting it would destroy the only
 * evidence of what the agent was originally quoted.
 */
export async function decideBooking(
  reference: string,
  decision: Extract<BookingStatus, "CONFIRMED" | "DECLINED">,
  opts: { agreedTotalMinor?: number; adminNote?: string | null }
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { reference },
    select: { id: true, status: true },
  });
  if (!booking) throw new BookingError("That booking no longer exists.");
  if (booking.status !== "REQUESTED") {
    throw new BookingError(
      `This booking is already ${booking.status.toLowerCase()} — it cannot be decided again.`
    );
  }

  if (opts.agreedTotalMinor !== undefined) {
    if (!Number.isInteger(opts.agreedTotalMinor) || opts.agreedTotalMinor < 0) {
      throw new BookingError("The agreed total must be a whole amount, not negative.");
    }
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: decision,
      decidedAt: new Date(),
      adminNote: opts.adminNote?.trim() || null,
      ...(opts.agreedTotalMinor !== undefined
        ? { agreedTotalMinor: opts.agreedTotalMinor }
        : {}),
    },
  });
}

/** Either side pulling out after a decision. Distinct from DECLINED. */
export async function cancelBooking(reference: string, adminNote: string | null): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { reference },
    select: { id: true, status: true },
  });
  if (!booking) throw new BookingError("That booking no longer exists.");
  if (booking.status === "CANCELLED") return;

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED", decidedAt: new Date(), adminNote: adminNote?.trim() || null },
  });
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentInput = {
  amountMinor: number;
  reference?: string | null;
  paidOn?: Date | null;
  note?: string | null;
};

/**
 * The agent files proof of a payment made elsewhere.
 *
 * Refused unless the booking is CONFIRMED: there is nothing to pay against a
 * request Sonet has not agreed to, and money sent on the strength of an
 * unconfirmed booking is exactly the confusion this flow exists to prevent.
 *
 * The proof is REQUIRED. A payment line with no screenshot is an assertion
 * with nothing behind it, and Sonet would have to go and find the transaction
 * himself — which is the work this is meant to save.
 */
export async function submitPayment(
  agentId: string,
  bookingReference: string,
  input: PaymentInput,
  proof: File
): Promise<void> {
  const booking = await prisma.booking.findFirst({
    where: { reference: bookingReference, agentId },
    select: { id: true, status: true },
  });
  if (!booking) throw new BookingError("That booking no longer exists.");
  if (booking.status !== "CONFIRMED") {
    throw new BookingError(
      "Payments can only be recorded against a confirmed booking. This one is still awaiting approval."
    );
  }

  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new BookingError("Enter the amount you paid.");
  }

  let stored;
  try {
    stored = await storeUpload(proof, "Payment proof");
  } catch (e) {
    throw new BookingError(
      e instanceof UploadError ? e.message : "Could not read that file."
    );
  }

  // Images and PDFs both make sense here — a bank screenshot or a downloaded
  // receipt — so unlike a logo this does NOT insist on an image.
  if (!isImage(stored.mimeType) && stored.mimeType !== "application/pdf") {
    await discardUploads([stored.storedName]);
    throw new BookingError("The proof must be an image or a PDF.");
  }

  try {
    await prisma.bookingPayment.create({
      data: {
        bookingId: booking.id,
        amountMinor: input.amountMinor,
        reference: input.reference?.trim() || null,
        paidOn: input.paidOn ?? null,
        note: input.note?.trim() || null,
        storedName: stored.storedName,
        mimeType: stored.mimeType,
        status: "SUBMITTED",
      },
    });
  } catch (e) {
    // The file is on disk before the row exists, so any path that does not end
    // with a row pointing at it has to clean up. An orphan in UPLOAD_DIR has
    // nothing pointing at it and no way to tell which booking it belonged to.
    await discardUploads([stored.storedName]);
    throw e;
  }
}

/** Sonet's verdict on one recorded payment. Only APPROVED counts as money in. */
export async function decidePayment(
  paymentId: string,
  decision: Extract<PaymentStatus, "APPROVED" | "REJECTED">,
  adminNote: string | null
): Promise<void> {
  const payment = await prisma.bookingPayment.findUnique({
    where: { id: paymentId },
    select: { id: true },
  });
  if (!payment) throw new BookingError("That payment no longer exists.");

  await prisma.bookingPayment.update({
    where: { id: payment.id },
    data: { status: decision, decidedAt: new Date(), adminNote: adminNote?.trim() || null },
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const BOOKING_INCLUDE = {
  payments: { orderBy: { submittedAt: "asc" } },
  guests: { orderBy: { sortOrder: "asc" } },
  stays: { orderBy: { dayIndex: "asc" } },
  quote: {
    select: {
      reference: true,
      productType: true,
      travelStart: true,
      travelEnd: true,
      totalMinor: true,
      snapshotJson: true,
      // The party size, so the guest list can say "2 of 4 named". Read
      // Quote.pax carefully — it means different things per product type,
      // and for a vehicle it is the headcount. See the comment on the column.
      pax: true,
    },
  },
} as const;

/**
 * Just enough to decide whether to seed the nights — id and status.
 *
 * A separate query because `getBooking` pulls payments, guests, stays and the
 * quote snapshot, and running all that twice per page view to learn two fields
 * is work nobody asked for.
 */
export async function bookingStub(reference: string, agentId?: string) {
  return prisma.booking.findFirst({
    where: { reference, ...(agentId ? { agentId } : {}) },
    select: { id: true, status: true },
  });
}

/** One booking with its money worked out. Scoped when an agentId is given. */
export async function getBooking(reference: string, agentId?: string) {
  const booking = await prisma.booking.findFirst({
    where: { reference, ...(agentId ? { agentId } : {}) },
    include: {
      ...BOOKING_INCLUDE,
      agent: { select: { id: true, agencyName: true, email: true, phone: true } },
    },
  });
  if (!booking) return null;

  return {
    ...booking,
    money: bookingMoney(
      booking.agreedTotalMinor,
      booking.gstBps,
      booking.depositBps,
      booking.payments
    ),
  };
}

export async function listBookingsForAgent(agentId: string) {
  const bookings = await prisma.booking.findMany({
    where: { agentId },
    orderBy: { requestedAt: "desc" },
    include: BOOKING_INCLUDE,
  });
  return bookings.map((b) => ({
    ...b,
    money: bookingMoney(b.agreedTotalMinor, b.gstBps, b.depositBps, b.payments),
  }));
}

export async function listBookingsForAdmin(status?: BookingStatus) {
  const bookings = await prisma.booking.findMany({
    where: status ? { status } : {},
    // Oldest request first: this is a QUEUE, and an agent waiting since
    // Tuesday should not be behind one who asked this morning.
    orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
    include: {
      ...BOOKING_INCLUDE,
      agent: { select: { agencyName: true } },
    },
  });
  return bookings.map((b) => ({
    ...b,
    money: bookingMoney(b.agreedTotalMinor, b.gstBps, b.depositBps, b.payments),
  }));
}

/** Counts for the admin overview: what is actually waiting on Sonet. */
export async function pendingCounts(): Promise<{ bookings: number; payments: number }> {
  const [bookings, payments] = await Promise.all([
    prisma.booking.count({ where: { status: "REQUESTED" } }),
    prisma.bookingPayment.count({ where: { status: "SUBMITTED" } }),
  ]);
  return { bookings, payments };
}

// ---------------------------------------------------------------------------
// Trip details — who travels, how they arrive, where they sleep
// ---------------------------------------------------------------------------

/**
 * Creates one stay row per NIGHT from the quote's day plan.
 *
 * Seeded rather than left empty, and seeded LAZILY the first time the details
 * screen is opened — so bookings made before this existed get their rows too,
 * without a migration that would have had to re-read every snapshot.
 *
 * Nights, not days: a five-day trip has four nights, and the last day is a
 * departure. The final day's row is deliberately absent rather than present
 * and blank, which would invite somebody to fill it in.
 *
 * Safe to call repeatedly — the unique index on (bookingId, dayIndex) is what
 * makes that true, not a check that could race.
 */
export async function ensureStays(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { quote: { select: { snapshotJson: true } }, stays: { select: { id: true } } },
  });
  if (!booking || booking.stays.length > 0) return;

  const days: ItineraryDay[] = readSnapshot(booking.quote.snapshotJson).days;
  if (days.length < 2) return;

  try {
    await prisma.bookingStay.createMany({
      data: days.slice(0, -1).map((day, i) => ({
        bookingId,
        dayIndex: i,
        date: parseDateOnly(day.date),
        // Where they END the day is where they sleep.
        place: day.to.trim() || day.from.trim() || "—",
      })),
    });
  } catch (e) {
    /*
     * A unique violation means another request seeded these first — two tabs,
     * or a double-click. That is the outcome we wanted, so it is not an error.
     *
     * `skipDuplicates` would say this more plainly but Prisma does not offer
     * it on SQLite. The UNIQUE INDEX is what guarantees no double list either
     * way; this only decides whether the loser of the race sees a stack trace.
     */
    const isUnique =
      typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
    if (!isUnique) throw e;
  }
}

export type TripDetailsInput = {
  leadGuestName?: string | null;
  leadGuestPhone?: string | null;
  leadGuestEmail?: string | null;
  arrivalDate?: Date | null;
  arrivalTime?: string | null;
  arrivalFlight?: string | null;
  arrivalFrom?: string | null;
  departureDate?: Date | null;
  departureTime?: string | null;
  departureFlight?: string | null;
  departureTo?: string | null;
};

/** "06:40", or null. Anything else is refused rather than stored half-read. */
export function parseClockTime(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  const m = /^(\d{1,2}):?(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * The agent fills these in whenever they have them.
 *
 * Allowed on a REQUESTED booking as well as a confirmed one: flight numbers
 * arrive days after a request and the driver needs them regardless. Refused
 * once a booking is declined or cancelled — there is no trip to detail.
 */
export async function saveTripDetails(
  agentId: string,
  reference: string,
  input: TripDetailsInput
): Promise<void> {
  const booking = await prisma.booking.findFirst({
    where: { reference, agentId },
    select: { id: true, status: true },
  });
  if (!booking) throw new BookingError("That booking no longer exists.");
  if (booking.status === "DECLINED" || booking.status === "CANCELLED") {
    throw new BookingError(`This booking is ${booking.status.toLowerCase()} — there is no trip to detail.`);
  }

  await prisma.booking.update({ where: { id: booking.id }, data: input });
}

/** Replaces the guest list wholesale — the form posts all of it every time. */
export async function saveGuests(
  agentId: string,
  reference: string,
  guests: readonly { name: string; age: number | null }[]
): Promise<void> {
  const booking = await prisma.booking.findFirst({
    where: { reference, agentId },
    select: { id: true },
  });
  if (!booking) throw new BookingError("That booking no longer exists.");

  const rows = guests
    .map((g) => ({ name: g.name.trim(), age: g.age }))
    .filter((g) => g.name !== "");

  /*
   * Replaced in ONE transaction. A delete that commits without its insert
   * leaves a booking with no guests at all, which reads as "the agent removed
   * them" rather than "the write failed".
   */
  await prisma.$transaction([
    prisma.bookingGuest.deleteMany({ where: { bookingId: booking.id } }),
    prisma.bookingGuest.createMany({
      data: rows.map((g, i) => ({ bookingId: booking.id, name: g.name, age: g.age, sortOrder: i })),
    }),
  ]);
}

/** One night's accommodation. */
export async function saveStay(
  agentId: string,
  reference: string,
  dayIndex: number,
  input: { property: string | null; confirmationRef: string | null; notes: string | null }
): Promise<void> {
  const booking = await prisma.booking.findFirst({
    where: { reference, agentId },
    select: { id: true },
  });
  if (!booking) throw new BookingError("That booking no longer exists.");

  // Scoped by bookingId as well as dayIndex, so a hand-edited form cannot
  // write a night onto somebody else's booking.
  await prisma.bookingStay.updateMany({
    where: { bookingId: booking.id, dayIndex },
    data: input,
  });
}
