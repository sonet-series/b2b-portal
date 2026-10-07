import { formatMinor } from "./money";

/**
 * What a quote earns, and whether anything on it sells below cost.
 *
 * No `server-only` import, so the admin screens and any future check can share
 * one implementation. Two places computing margin separately is how an
 * operator and a report come to disagree about what a trip made.
 *
 * Everything here reads `QuoteLine.costTotalMinor`, which is FROZEN at save
 * time. Looking up today's catalogue cost instead would drift — the same
 * staleness that makes this project derive sell prices rather than store them.
 *
 * NULL cost means NOT RECORDED, never free. Lines written before 7 Oct 2026
 * have none, and every function here keeps that distinction rather than
 * treating a missing cost as zero and reporting 100% margin on a quote nobody
 * measured.
 */

export type MarginLine = {
  description: string;
  totalMinor: number;
  costTotalMinor: number | null;
  usedOverride: boolean;
};

export type LineMargin = {
  /** Charged minus cost, in paise. Null when the cost was never recorded. */
  marginMinor: number | null;
  /** Margin as a percentage of what was charged. Null when unknown, or when
   *  nothing was charged — a zero-value line has no meaningful percentage. */
  marginPct: number | null;
  /**
   * Sells at or below what it cost.
   *
   * The failure this exists to catch: a rate-card override is an ABSOLUTE
   * price that bypasses the markup rules entirely, so a mistyped one — ₹1,500
   * where ₹15,000 was meant — produces a perfectly ordinary-looking quote that
   * loses money on every booking for that agency, for as long as nobody
   * notices. Nothing anywhere compared the two until now, and the quote shows
   * a GREEN "your agency rate applied" badge while it happens.
   */
  belowCost: boolean;
};

export function lineMargin(line: MarginLine): LineMargin {
  if (line.costTotalMinor == null) {
    return { marginMinor: null, marginPct: null, belowCost: false };
  }
  const marginMinor = line.totalMinor - line.costTotalMinor;
  return {
    marginMinor,
    marginPct: line.totalMinor > 0 ? (marginMinor / line.totalMinor) * 100 : null,
    // At cost counts. Selling for exactly what it cost is not a margin, and
    // on an override it is far more likely a typo than a decision.
    belowCost: marginMinor <= 0,
  };
}

export type QuoteMargin = {
  /** Charged across every line whose cost IS known. */
  chargedMinor: number;
  /** Cost across those same lines. */
  costMinor: number;
  marginMinor: number;
  marginPct: number | null;
  /** How many lines could not be included because no cost was recorded. */
  unknownLines: number;
  /** True when every line is missing its cost — i.e. an older quote. */
  allUnknown: boolean;
  /** Lines selling at or below cost, worst first. */
  belowCost: MarginLine[];
};

/**
 * The whole quote.
 *
 * Lines with no recorded cost are EXCLUDED from both sides rather than counted
 * as free, and the count of them is reported. A margin computed over half a
 * quote and presented as the whole thing is worse than no number.
 */
export function quoteMargin(lines: readonly MarginLine[]): QuoteMargin {
  const known = lines.filter((l) => l.costTotalMinor != null);
  const chargedMinor = known.reduce((sum, l) => sum + l.totalMinor, 0);
  const costMinor = known.reduce((sum, l) => sum + (l.costTotalMinor ?? 0), 0);
  const marginMinor = chargedMinor - costMinor;

  return {
    chargedMinor,
    costMinor,
    marginMinor,
    marginPct: chargedMinor > 0 ? (marginMinor / chargedMinor) * 100 : null,
    unknownLines: lines.length - known.length,
    allUnknown: lines.length > 0 && known.length === 0,
    belowCost: lines
      .filter((l) => lineMargin(l).belowCost)
      .sort((a, b) => (a.totalMinor - (a.costTotalMinor ?? 0)) - (b.totalMinor - (b.costTotalMinor ?? 0))),
  };
}

/** "+12.4%", "−3.1%", or "—" when the cost was never recorded. */
export function formatPct(pct: number | null): string {
  if (pct == null) return "—";
  const sign = pct < 0 ? "−" : "+";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** "₹1,240" or "—". Keeps a null out of `formatMinor`, which would print ₹0. */
export function formatMarginMinor(minor: number | null): string {
  return minor == null ? "—" : formatMinor(minor);
}
