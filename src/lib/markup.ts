import { AGENT_TIER, PRODUCT_TYPE, type AgentTier, type MarkupKind, type ProductType } from "./enums";

/**
 * Turning a cost into the two agent-facing sell prices.
 *
 * The catalogue stores ONE cost per charge. Neither sell price is persisted —
 * both are computed here, at read time, from the current MarkupRule. That is
 * deliberate: a stored sell price goes stale the moment Sonet edits a markup,
 * and stale prices are indistinguishable from correct ones until someone is
 * quoted the wrong number.
 *
 * It also matches how saving a quote already works — re-priced server-side
 * from current catalogue data rather than trusting a number computed earlier.
 *
 * Per-agent rate-card overrides are NOT affected. Those are absolute prices
 * Sonet sets directly, and they beat the marked-up default outright.
 */

export type MarkupRule = {
  productType: ProductType;
  tier: AgentTier;
  kind: MarkupKind;
  /** FLAT: paise to add. PERCENT: basis points (500 = 5.00%). */
  value: number;
};

/** Every rule, keyed for lookup. Built once and passed down a quote. */
export type MarkupTable = Map<string, MarkupRule>;

export function markupKey(productType: ProductType, tier: AgentTier): string {
  return `${productType}::${tier}`;
}

/**
 * The confirmed rules, used to seed the table and as the fallback if a row is
 * somehow missing. Percentages are basis points so the maths stays integer.
 */
export const DEFAULT_MARKUP: Record<ProductType, Record<AgentTier, { kind: MarkupKind; value: number }>> = {
  hotel: {
    KERALA: { kind: "FLAT", value: 100_00 }, // cost + ₹100
    OUTSIDE_KERALA: { kind: "PERCENT", value: 500 }, // cost + 5%
  },
  vehicle: {
    KERALA: { kind: "PERCENT", value: 1000 }, // cost + 10%
    OUTSIDE_KERALA: { kind: "PERCENT", value: 1500 }, // cost + 15%
  },
  houseboat: {
    KERALA: { kind: "PERCENT", value: 500 }, // cost + 5%
    OUTSIDE_KERALA: { kind: "PERCENT", value: 1200 }, // cost + 12%
  },
  itinerary: {
    KERALA: { kind: "PERCENT", value: 1500 }, // cost + 15%
    OUTSIDE_KERALA: { kind: "PERCENT", value: 2700 }, // cost + 27%
  },
};

export const BASIS_POINTS = 10_000;

/**
 * Applies one rule to one cost.
 *
 * Rounds to the nearest paise. Rounding once here, on the unit price, rather
 * than on a line total keeps a quote's arithmetic checkable by hand: the agent
 * sees a unit price that actually multiplies out to the total shown.
 */
export function applyMarkup(costMinor: number, rule: MarkupRule): number {
  if (rule.kind === "FLAT") return costMinor + rule.value;
  return Math.round(costMinor * (BASIS_POINTS + rule.value) / BASIS_POINTS);
}

/** The sell price for one product, tier and cost. */
export function sellPrice(
  table: MarkupTable,
  productType: ProductType,
  tier: AgentTier,
  costMinor: number
): number {
  const rule = table.get(markupKey(productType, tier)) ?? {
    productType,
    tier,
    ...DEFAULT_MARKUP[productType][tier],
  };
  return applyMarkup(costMinor, rule);
}

/** Null-safe form, for ancillary charges that may not be offered. */
export function sellPriceOptional(
  table: MarkupTable,
  productType: ProductType,
  tier: AgentTier,
  costMinor: number | null
): number | null {
  return costMinor === null ? null : sellPrice(table, productType, tier, costMinor);
}

/** Human description of a rule, e.g. "cost + ₹100" or "cost + 5%". */
export function describeMarkup(rule: { kind: MarkupKind; value: number }): string {
  if (rule.kind === "FLAT") {
    const rupees = rule.value / 100;
    return `cost + ₹${rupees.toLocaleString("en-IN")}`;
  }
  return `cost + ${(rule.value / 100).toLocaleString("en-IN")}%`;
}

/** Builds the lookup table from rows loaded out of the database. */
export function toMarkupTable(
  rows: readonly { productType: string; tier: string; kind: string; value: number }[]
): MarkupTable {
  const table: MarkupTable = new Map();

  for (const productType of PRODUCT_TYPE) {
    for (const tier of AGENT_TIER) {
      const found = rows.find((r) => r.productType === productType && r.tier === tier);
      table.set(markupKey(productType, tier), {
        productType,
        tier,
        kind: (found?.kind as MarkupKind) ?? DEFAULT_MARKUP[productType][tier].kind,
        value: found?.value ?? DEFAULT_MARKUP[productType][tier].value,
      });
    }
  }
  return table;
}
