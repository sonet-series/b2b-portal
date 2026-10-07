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

/**
 * Rounds to a whole rupee, dropping the paise.
 *
 * For figures a customer READS AS A RATE rather than pays as a total — Sonet,
 * 7 Oct 2026: *"for extra km also we need it in 1 figure, no need of showing
 * or charging for eg. 23.10. just 23 is fine"*. A per-km rate falls out of a
 * percentage markup as ₹23.10, and nobody quotes a fare in paise.
 *
 * The rule, stated by him the same day: *"if its 50 or less than 50 paise then
 * make it 23/- if its above 50 paise then make it 24"*. So fifty paise rounds
 * DOWN, and only above fifty rounds up.
 *
 * That is NOT `Math.round`, which breaks ties upward and would send ₹23.50 to
 * ₹24. The difference is one paisa wide and shows up on exactly the values a
 * percentage markup likes to produce — a ₹20 cost at +15% is ₹23.00, a ₹20.44
 * cost is ₹23.50 — so it is worth being exact about rather than approximately
 * right.
 *
 * Nor is it always-up, which is the rule for KILOMETRES. The two differ on
 * purpose: a kilometre under-counted is diesel already burnt that nobody paid
 * for, while on a rate the paise are noise in either direction, and ₹23.01
 * becoming ₹24 is a 4% jump off a single paisa.
 *
 * Rates are never negative, so `Math.floor` needs no special case here.
 *
 * Deliberately NOT applied to totals. A quote's total is a sum of real line
 * amounts, and rounding it would make the lines stop adding up to it — which
 * is the one property that makes "why is this number what it is" answerable.
 */
export function toWholeRupees(minor: number): number {
  const rupees = Math.floor(minor / MINOR_PER_MAJOR);
  const paise = minor - rupees * MINOR_PER_MAJOR;
  return (paise > 50 ? rupees + 1 : rupees) * MINOR_PER_MAJOR;
}

/** Sums line totals without ever leaving integer space. */
export function sumMinor(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
