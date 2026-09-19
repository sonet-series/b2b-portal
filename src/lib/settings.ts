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
   * Local running allowed at each overnight stop, in KILOMETRES.
   *
   * Replaced a percentage road margin on 19 Sept 2026. A percentage scales
   * with the distance driven, which is backwards: local running happens where
   * the party STOPS, not on the long transfers. A 400 km transfer day does not
   * need 20 km of slack; a night at Munnar needs a day around the tea estates.
   *
   * Counted per DISTINCT place they overnight at, not per night and not per
   * day — two nights at Munnar is one place to drive around. The final day's
   * drop point does not count: they leave from there.
   */
  PER_STOP_KM: "perStopKm",

  /**
   * GST on the hire, in BASIS POINTS (500 = 5%).
   *
   * A setting rather than a constant because statutory rates change, and when
   * one does it must not need a deploy. 5% is the rate for passenger road
   * transport in India at the time of writing.
   *
   * Applied at DISPLAY time to the quote total, never folded into the line
   * items: a tax is not a price, and an agent asked to explain the number
   * needs to see it stated separately.
   */
  GST_BPS: "gstBps",

  /**
   * Toll and parking allowed per day of the hire, in PAISE. Cost, not the
   * agent price — marked up by the vehicle rule like every other charge.
   *
   * Per day rather than per route: tolls vary hop by hop and no operator
   * prices them individually. A daily figure is what is actually quoted, and
   * it is one number to keep current instead of a matrix nobody maintains.
   */
  TOLL_PARKING_PER_DAY_MINOR: "tollParkingPerDayMinor",
} as const;

const DEFAULTS: Record<string, number> = {
  [SETTING_KEYS.PER_STOP_KM]: 60,
  [SETTING_KEYS.GST_BPS]: 500, // 5%
  [SETTING_KEYS.TOLL_PARKING_PER_DAY_MINOR]: 30_000, // ₹300/day
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

/** Kilometres allowed for local running at each overnight stop. */
export async function perStopKm(): Promise<number> {
  return getSetting(SETTING_KEYS.PER_STOP_KM);
}


/** Basis points of GST currently applied to quote totals. */
export async function gstBps(): Promise<number> {
  return getSetting(SETTING_KEYS.GST_BPS);
}

export { withGst, formatBps, type QuoteTotals } from "./settings-shared";


/** Toll and parking COST allowed per day of hire, in paise. */
export async function tollParkingPerDayMinor(): Promise<number> {
  return getSetting(SETTING_KEYS.TOLL_PARKING_PER_DAY_MINOR);
}
