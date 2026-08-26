import "server-only";
import { prisma } from "./db";
import { toMarkupTable, DEFAULT_MARKUP, type MarkupTable } from "./markup";
import { AGENT_TIER, PRODUCT_TYPE } from "./enums";

/**
 * Loads the markup rules.
 *
 * Read fresh on each quote rather than cached in module scope: the whole point
 * of the settings screen is that a change takes effect immediately, and a
 * process-lifetime cache would make "immediately" mean "after the next
 * deploy". It is eight small rows behind an indexed unique key.
 */
export async function loadMarkupTable(): Promise<MarkupTable> {
  const rows = await prisma.markupRule.findMany({
    select: { productType: true, tier: true, kind: true, value: true },
  });
  return toMarkupTable(rows);
}

/** Creates any missing rule at its confirmed default. Idempotent. */
export async function ensureMarkupRules(): Promise<number> {
  let created = 0;
  for (const productType of PRODUCT_TYPE) {
    for (const tier of AGENT_TIER) {
      const existing = await prisma.markupRule.findUnique({
        where: { productType_tier: { productType, tier } },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.markupRule.create({
        data: { productType, tier, ...DEFAULT_MARKUP[productType][tier] },
      });
      created++;
    }
  }
  return created;
}
