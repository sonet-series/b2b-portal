import "server-only";
import { prisma } from "./db";
import { gstBps, depositBps } from "./settings";
import { bookingMoney } from "./booking-shared";
import { storeUpload, discardUploads, isImage, UploadError } from "./uploads";
import { notifyBookingRequested } from "./mailer";
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
  quote: {
    select: {
      reference: true,
      productType: true,
      travelStart: true,
      travelEnd: true,
      totalMinor: true,
      snapshotJson: true,
    },
  },
} as const;

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
