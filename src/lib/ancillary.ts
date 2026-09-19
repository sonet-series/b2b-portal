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
  tier: AgentTier,
  markup: MarkupTable
): Promise<AncillaryResult> {
  const lines: QuoteLineDraft[] = [];

  // --- toll and parking -----------------------------------------------
  const perDayCost = await tollParkingPerDayMinor();
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

  if (states.length > 0) {
    const permits = await prisma.statePermit.findMany({
      where: { state: { in: states }, active: true },
    });
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
    unknownPlaces: unknown,
  };
}
