import "server-only";
import { prisma } from "./db";

/**
 * Operational numbers Sonet tunes from the admin screen.
 *
 * Each value is an integer whose unit is documented here. Integers, not
 * floats, for the same reason money is paise — the arithmetic has to be exact
 * and give the same answer every time.
 */

export const SETTING_KEYS = {
  /**
   * Road margin, in BASIS POINTS (500 = 5%).
   *
   * Google returns the shortest practical route. Real driving is longer:
   * diversions, one-ways, a wrong turn, the stretch from the main road to a
   * resort gate. Confirmed by Sonet on 19 Sept 2026 that measured distances
   * are close but consistently a little short.
   *
   * Applied to the ROUTED distance only, and shown as its own line rather
   * than folded into the legs — so "Cochin to Munnar 107 km" still matches
   * what anyone gets from Google, and the uplift stays something a customer
   * (and Sonet) can see and argue with.
   *
   * NOT the same thing as a day's sightseeing buffer, which is a specific
   * detour an agent knows about and adds on purpose.
   */
  ROAD_MARGIN_BPS: "roadMarginBps",
} as const;

const DEFAULTS: Record<string, number> = {
  [SETTING_KEYS.ROAD_MARGIN_BPS]: 500, // 5%
};

export async function getSetting(key: string): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? 0;
}

export async function setSetting(key: string, value: number): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** Basis points of margin currently applied to routed distance. */
export async function roadMarginBps(): Promise<number> {
  return getSetting(SETTING_KEYS.ROAD_MARGIN_BPS);
}

/**
 * The extra kilometres a margin adds to a routed distance.
 *
 * Rounded UP, like every other distance here: a hire is billed in whole
 * kilometres and the operator does not absorb the remainder.
 */
export function marginKm(routedKm: number, bps: number): number {
  if (bps <= 0 || routedKm <= 0) return 0;
  return Math.ceil((routedKm * bps) / 10_000);
}
