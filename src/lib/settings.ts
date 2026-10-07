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
   * Local running, in KILOMETRES, allowed for each NIGHT of the hire.
   *
   * Replaced a percentage road margin on 19 Sept 2026 — a percentage scales
   * with the distance driven, which is backwards, since local running happens
   * where the party stops and not on the long transfers.
   *
   * Then counted per distinct PLACE until 7 Oct 2026, on the reasoning that
   * "two nights at Munnar is one place to drive around". **That was wrong, and
   * measurement proved it.** It is one place and TWO DAYS of driving around
   * it — Top Station one day, Mattupetty and Echo Point the next — and the
   * per-place model gave the second day nothing at all.
   *
   * Sonet's six real circuits, measured against the portal on 7 Oct 2026, were
   * under-counted on every single one, from -4% to -22%. Dividing the missing
   * distance by NIGHTS gave 68, 64, 57, 64, 61, 62 — across trips from 350 to
   * 1,650 km. Least squares puts it at 61.9. Per place it ranged 70 to 136 and
   * fitted nothing.
   *
   * The worst row was Cochin–Munnar–Cochin at -22%: two nights in one place,
   * which is exactly the case the old model handled worst, and his
   * highest-volume trip.
   *
   * NIGHTS, not days: nights are days minus one, which is what stops the
   * arrival afternoon and the departure morning being charged as two full days
   * of sightseeing. Fitting per-day instead gave more than twice the error.
   *
   * A NEW KEY rather than a change of meaning on the old one. `perStopKm` may
   * hold a number somebody chose for a different model, and silently
   * reinterpreting it per night would quietly reprice every hire by whatever
   * that number happened to be.
   */
  PER_NIGHT_KM: "perNightKm",

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

  /**
   * Deposit due when a booking is confirmed, in BASIS POINTS of the GROSS
   * total (2500 = 25%).
   *
   * Of the gross, not the net: "25% up front" means a quarter of what the
   * agent actually has to pay, and a deposit computed before tax understates
   * it by the GST every time.
   *
   * FROZEN onto each booking at confirmation. Changing it here moves the next
   * booking, never one already agreed — the same rule markup rules follow.
   */
  DEPOSIT_BPS: "depositBps",
} as const;

const DEFAULTS: Record<string, number> = {
  [SETTING_KEYS.PER_NIGHT_KM]: 62,
  [SETTING_KEYS.GST_BPS]: 500, // 5%
  [SETTING_KEYS.TOLL_PARKING_PER_DAY_MINOR]: 30_000, // ₹300/day
  [SETTING_KEYS.DEPOSIT_BPS]: 2500, // 25%
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
export async function perNightKm(): Promise<number> {
  return getSetting(SETTING_KEYS.PER_NIGHT_KM);
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

/** Deposit due on a confirmed booking, basis points of the gross. */
export async function depositBps(): Promise<number> {
  return getSetting(SETTING_KEYS.DEPOSIT_BPS);
}
