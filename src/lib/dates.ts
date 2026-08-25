/**
 * Rate seasons are stored as inclusive [validFrom, validTo] date windows so the
 * quote engine can resolve a price from a travel date with no human involved.
 *
 * Everything here works in whole days at UTC midnight. Travel dates are
 * calendar dates, not instants — a Kerala check-in on 3 Oct is 3 Oct whatever
 * timezone the agent's browser is in.
 */

/** Parses "2026-10-03" to a Date at UTC midnight. */
export function parseDateOnly(input: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) throw new Error(`Expected YYYY-MM-DD, got: ${input}`);
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) throw new Error(`Not a real date: ${input}`);
  return date;
}

/** Date -> "2026-10-03". */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Strips any time component, returning UTC midnight of the same calendar day. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export const MS_PER_DAY = 86_400_000;

/**
 * Hotel nights between check-in and check-out. 3 Oct -> 5 Oct is 2 nights.
 * Returns 0 rather than a negative for an inverted range; callers validate.
 */
export function nightsBetween(from: Date, to: Date): number {
  const n = Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / MS_PER_DAY);
  return n > 0 ? n : 0;
}

/** Days a vehicle is engaged. 3 Oct -> 5 Oct is 3 days (nights + 1). */
export function daysBetween(from: Date, to: Date): number {
  return nightsBetween(from, to) + 1;
}

/** Inclusive on both ends. */
export function isWithin(date: Date, from: Date, to: Date): boolean {
  const t = startOfUtcDay(date).getTime();
  return t >= startOfUtcDay(from).getTime() && t <= startOfUtcDay(to).getTime();
}

/** Every calendar day in [from, to). Used to price a stay night by night. */
export function eachNight(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let cursor = startOfUtcDay(from);
  const end = startOfUtcDay(to).getTime();
  while (cursor.getTime() < end) {
    out.push(cursor);
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }
  return out;
}

/** True if two inclusive date windows share any day. */
export function rangesOverlap(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): boolean {
  return startOfUtcDay(aFrom).getTime() <= startOfUtcDay(bTo).getTime() &&
    startOfUtcDay(bFrom).getTime() <= startOfUtcDay(aTo).getTime();
}
