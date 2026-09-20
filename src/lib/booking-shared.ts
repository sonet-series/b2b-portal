import { withGst, type QuoteTotals } from "./settings-shared";

/**
 * What is owed on a booking, and what has actually been paid.
 *
 * No server-only import, so the agent's screens and the admin's render the
 * SAME arithmetic. Two places computing a balance separately is how an agent
 * and an operator come to disagree about what is outstanding — and that is an
 * argument about money, which is the worst kind to have with a customer.
 *
 * Every figure is paise. The rates are always PASSED IN, never fetched here,
 * for the same reason `withGst` takes the GST rate: a client component must
 * not be able to render a defaulted percentage.
 */

export type PaymentLike = {
  amountMinor: number;
  /** Only APPROVED counts. See below. */
  status: string;
};

export type BookingMoney = {
  totals: QuoteTotals;
  /** Deposit due on confirmation, paise. */
  depositMinor: number;
  /** Sum of APPROVED payments. What has genuinely been received. */
  paidMinor: number;
  /** Sum of SUBMITTED payments — claimed, not yet verified, counts for nothing. */
  pendingMinor: number;
  /** Gross less what has been approved. Never below zero. */
  balanceMinor: number;
  /** Still owed on the deposit specifically. Zero once it is covered. */
  depositDueMinor: number;
  /** True when approved payments cover the deposit. */
  depositSettled: boolean;
  /** True when approved payments cover the whole gross. */
  settled: boolean;
  /** True when an approved payment exceeds what was due. Sonet's to resolve. */
  overpaid: boolean;
};

/**
 * The deposit, rounded to the nearest paisa.
 *
 * Of the GROSS, not the net: 25% of what the agent actually has to pay is what
 * anyone means by "25% up front", and quoting a deposit that excludes tax
 * would understate it by the GST every single time.
 */
export function depositOf(grossMinor: number, depositBps: number): number {
  return Math.round((grossMinor * depositBps) / 10_000);
}

export function bookingMoney(
  agreedTotalMinor: number,
  gstBps: number,
  depositBps: number,
  payments: readonly PaymentLike[]
): BookingMoney {
  const totals = withGst(agreedTotalMinor, gstBps);
  const depositMinor = depositOf(totals.grossMinor, depositBps);

  /*
   * APPROVED only.
   *
   * A submitted payment is a claim — a screenshot somebody uploaded. Counting
   * it toward the balance would mean a booking could read as fully paid
   * because an agent said so, which defeats the point of Sonet reviewing them.
   * Pending is reported separately so nobody thinks it was ignored.
   */
  let paidMinor = 0;
  let pendingMinor = 0;
  for (const payment of payments) {
    if (payment.status === "APPROVED") paidMinor += payment.amountMinor;
    else if (payment.status === "SUBMITTED") pendingMinor += payment.amountMinor;
  }

  const balanceMinor = Math.max(0, totals.grossMinor - paidMinor);
  const depositDueMinor = Math.max(0, depositMinor - paidMinor);

  return {
    totals,
    depositMinor,
    paidMinor,
    pendingMinor,
    balanceMinor,
    depositDueMinor,
    depositSettled: paidMinor >= depositMinor,
    settled: paidMinor >= totals.grossMinor,
    // Surfaced rather than silently clamped: money received that was not owed
    // is a refund or a credit, and either way somebody has to decide which.
    overpaid: paidMinor > totals.grossMinor,
  };
}
