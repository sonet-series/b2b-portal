/**
 * Setting maths with no server-only import, so client components can use it.
 *
 * The VALUES live in src/lib/settings.ts, which reads the database and is
 * server-only. Only the arithmetic lives here — the rate itself is always
 * passed in, never fetched, so a client component cannot accidentally render
 * a stale or defaulted tax rate.
 */

export type QuoteTotals = {
  /** The hire, before tax. Paise. */
  netMinor: number;
  /** Tax on it. Paise. */
  gstMinor: number;
  /** What the customer pays. Paise. */
  grossMinor: number;
  gstBps: number;
};

/**
 * Splits a quote total into net, GST and gross.
 *
 * Rounded to the nearest paisa: a tax is not the operator's to round up, and
 * rounding down would under-collect.
 */
export function withGst(netMinor: number, bps: number): QuoteTotals {
  const gstMinor = Math.round((netMinor * bps) / 10_000);
  return { netMinor, gstMinor, grossMinor: netMinor + gstMinor, gstBps: bps };
}

/** "5%" or "2.5%" — never "5.0%". */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
