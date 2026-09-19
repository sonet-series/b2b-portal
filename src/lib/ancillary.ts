import "server-only";
import { prisma } from "./db";
import { tollParkingPerDayMinor } from "./settings";
import { statesEntered } from "./destinations";
import { sellPrice, type MarkupTable } from "./markup";
import type { AgentTier } from "./enums";
import type { QuoteLineDraft, ItineraryDay } from "./quote-types";

/**
 * Toll, parking and interstate permits.
 *
 * Charged rather than excluded, because "at actuals" means the agent cannot
 * tell their customer a final price — which is the whole point of this portal.
 *
 * Both are stored as COST and marked up by the VEHICLE rule, exactly like
 * driver allowance and extra km. They are charges on a vehicle hire, so they
 * inherit the vehicle's markup; giving them a rule of their own would be a
 * second place to keep in step for no gain.
 */

export type AncillaryResult = {
  lines: QuoteLineDraft[];
  totalMinor: number;
  /** Non-home states the itinerary enters, for display. */
  states: string[];
  /** States entered that have no permit set for this vehicle. */
  missingPermits: string[];
  /**
   * Places not on the destination list, so their state is unknown.
   *
   * Surfaced rather than assumed local: assuming would silently drop a permit
   * from the price, and a missing permit is money the operator pays at a
   * border with no way to recover it.
   */
  unknownPlaces: string[];
};

/**
 * Prices the charges that ride on top of a vehicle hire.
 *
 * `days` is the hire length; toll and parking are allowed per day, which is
 * how operators actually quote them — tolls vary hop by hop and nobody prices
 * them individually.
 */
export async function priceAncillaries(
  itineraryDays: readonly ItineraryDay[],
  hireDays: number,
  vehicleId: string,
  tier: AgentTier,
  markup: MarkupTable
): Promise<AncillaryResult> {
  const lines: QuoteLineDraft[] = [];

  // --- toll and parking -----------------------------------------------
  /*
   * Per vehicle where a rate is set, falling back to the global figure.
   *
   * Toll applies to EVERY hire, so a vehicle nobody has set a rate for must
   * still quote rather than block. A permit is the opposite — it only applies
   * when a trip actually crosses a border, so a missing one is flagged.
   */
  const vehicleToll = await prisma.vehicleTollRate.findUnique({ where: { vehicleId } });
  const perDayCost = vehicleToll?.costMinor ?? (await tollParkingPerDayMinor());
  if (perDayCost > 0 && hireDays > 0) {
    const unit = sellPrice(markup, "vehicle", tier, perDayCost);
    lines.push({
      description: `Toll and parking · ${hireDays} day${hireDays === 1 ? "" : "s"}`,
      quantity: hireDays,
      unitMinor: unit,
      totalMinor: unit * hireDays,
      usedOverride: false,
    });
  }

  // --- interstate permits ----------------------------------------------
  const places = itineraryDays.flatMap((d) => [d.from, d.to, ...d.via]);
  const { states, unknown } = statesEntered(places);
  let missingPermits: string[] = [];

  if (states.length > 0) {
    const permits = await prisma.statePermit.findMany({
      where: { state: { in: states }, vehicleId, active: true },
    });

    // A state we enter with no permit row for THIS vehicle is a fee we have
    // not charged, and an uncharged permit is money handed over at a border
    // with no way to recover it. Reported, never assumed to be zero.
    const priced = new Set(permits.map((p) => p.state));
    missingPermits = states.filter((st) => !priced.has(st));

    for (const permit of permits) {
      const unit = sellPrice(markup, "vehicle", tier, permit.costMinor);
      lines.push({
        description: `${permit.state} interstate permit`,
        quantity: 1,
        unitMinor: unit,
        totalMinor: unit,
        usedOverride: false,
      });
    }
  }

  return {
    lines,
    totalMinor: lines.reduce((sum, l) => sum + l.totalMinor, 0),
    states,
    missingPermits,
    unknownPlaces: unknown,
  };
}
