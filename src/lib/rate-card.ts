import { prisma } from "./db";
import { isProductType, type ProductType } from "./enums";

/**
 * Per-agent price resolution.
 *
 * FALLBACK RULE (confirmed with Sonet, 25 Aug 2026):
 *   If the agent has no AgentRateCard row for a given priced item, the agent is
 *   quoted the DEFAULT rate from the catalogue table. A missing override never
 *   blocks a quote and never hides a product.
 *
 * AgentRateCard.referenceId is polymorphic across four tables, so Prisma cannot
 * enforce that it points at a real row. `assertReferenceExists` is that check,
 * and every admin write path that creates an override must call it.
 */

export type ResolvedPrice = {
  /** Paise. */
  unitMinor: number;
  /** True when an agent override supplied the price, false when the default did. */
  usedOverride: boolean;
};

/**
 * Resolves one item's unit price for one agent.
 *
 * @param defaultMinor the catalogue default, already loaded by the caller —
 *   passed in rather than re-fetched so the caller controls the query shape.
 */
export async function resolvePrice(
  agentId: string,
  productType: ProductType,
  referenceId: string,
  defaultMinor: number
): Promise<ResolvedPrice> {
  const override = await prisma.agentRateCard.findUnique({
    where: { agentId_productType_referenceId: { agentId, productType, referenceId } },
    select: { overridePriceMinor: true },
  });

  return override
    ? { unitMinor: override.overridePriceMinor, usedOverride: true }
    : { unitMinor: defaultMinor, usedOverride: false };
}

/**
 * Batch form of resolvePrice — one query for a whole quote instead of one per
 * line. Returns a map keyed by referenceId.
 */
export async function resolvePrices(
  agentId: string,
  productType: ProductType,
  referenceIds: readonly string[]
): Promise<Map<string, number>> {
  if (referenceIds.length === 0) return new Map();

  const rows = await prisma.agentRateCard.findMany({
    where: { agentId, productType, referenceId: { in: [...referenceIds] } },
    select: { referenceId: true, overridePriceMinor: true },
  });

  return new Map(rows.map((r) => [r.referenceId, r.overridePriceMinor]));
}

/**
 * Confirms referenceId actually points at a live row in the table implied by
 * productType. Call before writing an AgentRateCard — otherwise a typo creates
 * an override that silently never applies to anything.
 */
export async function assertReferenceExists(
  productType: ProductType,
  referenceId: string
): Promise<void> {
  const exists = await (async () => {
    switch (productType) {
      case "hotel":
        return prisma.hotelRate.findUnique({ where: { id: referenceId }, select: { id: true } });
      case "houseboat":
        return prisma.houseboatRate.findUnique({ where: { id: referenceId }, select: { id: true } });
      case "vehicle":
        return prisma.vehicleRate.findUnique({ where: { id: referenceId }, select: { id: true } });
      case "itinerary":
        // Points at ItineraryRate, not Itinerary — packages carry seasonal
        // rate rows now, so the override attaches to a priced row like the
        // other three product types.
        return prisma.itineraryRate.findUnique({ where: { id: referenceId }, select: { id: true } });
    }
  })();

  if (!exists) {
    throw new Error(`No ${productType} row with id ${referenceId} — cannot create an override for it.`);
  }
}

/** Narrows an untrusted string (form field, query param) to a ProductType. */
export function parseProductType(value: unknown): ProductType {
  if (!isProductType(value)) {
    throw new Error(`Not a valid product type: ${String(value)}`);
  }
  return value;
}
