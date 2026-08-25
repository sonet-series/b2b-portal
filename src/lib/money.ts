/**
 * Money is stored as INTEGER minor units (paise) everywhere — never a float,
 * never a Decimal. SQLite has no exact decimal type, and floats silently lose
 * rupees across a multi-line quote.
 *
 * Every DB field holding money is named with a `Minor` suffix. If you are
 * reading a value whose name lacks that suffix, it is not paise.
 */

export const MINOR_PER_MAJOR = 100;

/** "1500.50" or 1500.5 (rupees, from a form) -> 150050 (paise). */
export function toMinor(rupees: string | number): number {
  const n = typeof rupees === "string" ? Number(rupees.replace(/,/g, "").trim()) : rupees;
  if (!Number.isFinite(n)) throw new Error(`Not a valid amount: ${rupees}`);
  // Round rather than truncate: 0.1 + 0.2 style drift must not eat a paisa.
  return Math.round(n * MINOR_PER_MAJOR);
}

/** 150050 (paise) -> 1500.5 (rupees, as a number). */
export function toMajor(minor: number): number {
  return minor / MINOR_PER_MAJOR;
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const INR_PAISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * 150050 -> "₹1,500.50", 150000 -> "₹1,500".
 * Paise are shown only when they are non-zero, which for Indian tour pricing
 * is almost never — but a rounded-away paisa in a quote total is a support call.
 */
export function formatMinor(minor: number): string {
  return minor % MINOR_PER_MAJOR === 0
    ? INR.format(toMajor(minor))
    : INR_PAISE.format(toMajor(minor));
}

/** Sums line totals without ever leaving integer space. */
export function sumMinor(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
