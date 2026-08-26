import "server-only";
import { prisma } from "./db";
import { resolvePrices, overrideKey } from "./rate-card";
import { loadMarkupTable } from "./markup-store";
import { sellPrice, sellPriceOptional, type MarkupTable } from "./markup";
import { priceHouseboat, priceItinerary, PricingError } from "./pricing";
import {
  parseDateOnly,
  formatDateDisplay,
  nightsBetween,
  daysBetween,
  eachNight,
  isWithin,
  MS_PER_DAY,
  startOfUtcDay,
} from "./dates";
import type { ProductType } from "./enums";
import {
  CRUISE_PACKAGE_LABEL,
  VEHICLE_RATE_TYPE_LABEL,
  MEAL_PLAN_LABEL,
  ITINERARY_PRICING_MODE_LABEL,
  type CruisePackage,
  type RateCharge,
  type VehicleRateType,
  type MealPlan,
  type HouseboatPricingMode,
  type ItineraryPricingMode,
} from "./enums";
import { sumMinor } from "./money";
import { totalLegKm } from "./quote-types";
import type {
  QuotingAgent,
  QuoteLineDraft,
  QuoteOption,
  QuoteResult,
  QuoteUnavailable,
  HotelQuoteInput,
  HouseboatQuoteInput,
  VehicleQuoteInput,
  ItineraryQuoteInput,
} from "./quote-types";

/**
 * The quote engine.
 *
 * Two rules run through everything here:
 *
 *  1. **Price resolution runs in three steps**, highest priority first:
 *       a. the agent's own rate-card override, if one exists — an absolute
 *          price, unaffected by markup;
 *       b. otherwise the stored COST marked up for that agent's tier, using
 *          the current MarkupRule (src/lib/markup.ts). Sell prices are never
 *          stored, so editing a markup takes effect on the next quote;
 *       c. there is no step c. Cost is a required column, so a rate row that
 *          cannot price somebody does not exist.
 *     A missing override never blocks a quote. Every line records whether an
 *     override supplied its price, so "why is this price what it is" stays
 *     answerable.
 *
 *  2. **Seasons are resolved per night / per day, not once for the trip.** A
 *     stay that crosses from off-season into peak must reprice at the boundary.
 *     Getting this wrong silently undercharges on exactly the bookings that
 *     matter most.
 *
 * Single-product quoting: one hotel, one boat, one vehicle, or one package per
 * quote. Combining them into one multi-line quote is deliberately not built.
 */

/** Groups consecutive days that share a rate, so a quote reads as seasons not days. */
type Segment<T> = { rate: T; from: Date; to: Date; units: number };

function segmentByRate<T extends { id: string }>(
  days: Date[],
  rateFor: (day: Date) => T | undefined
): { segments: Segment<T>[]; uncovered: Date[] } {
  const segments: Segment<T>[] = [];
  const uncovered: Date[] = [];

  for (const day of days) {
    const rate = rateFor(day);
    if (!rate) {
      uncovered.push(day);
      continue;
    }
    const last = segments[segments.length - 1];
    if (last && last.rate.id === rate.id && last.to.getTime() + MS_PER_DAY === day.getTime()) {
      last.to = day;
      last.units += 1;
    } else {
      segments.push({ rate, from: day, to: day, units: 1 });
    }
  }
  return { segments, uncovered };
}

/**
 * The catalogue default for this agent's tier: the stored cost, marked up.
 * Never a fallback — cost is required, so this always produces a number.
 */
function tierDefault(
  markup: MarkupTable,
  productType: ProductType,
  tier: QuotingAgent["tier"],
  costMinor: number
): number {
  return sellPrice(markup, productType, tier, costMinor);
}

/**
 * Resolves ONE charge on a rate row: the agent's override for that charge if
 * there is one, otherwise the catalogue default for their tier.
 *
 * Ancillary charges may legitimately not be offered at all, in which case both
 * tier columns are null and this returns null — validation guarantees they are
 * null together, so a half-priced charge cannot reach here.
 */
function resolveCharge(
  agent: QuotingAgent,
  markup: MarkupTable,
  productType: ProductType,
  overrides: Map<string, number>,
  referenceId: string,
  charge: RateCharge,
  costMinor: number | null
): { minor: number; usedOverride: boolean } | null {
  const override = overrides.get(overrideKey(referenceId, charge));
  if (override !== undefined) return { minor: override, usedOverride: true };

  // Ancillary charges inherit the PARENT PRODUCT's markup — an extra bed is
  // marked up by the hotel rule, not one of its own.
  const marked = sellPriceOptional(markup, productType, agent.tier, costMinor);
  return marked === null ? null : { minor: marked, usedOverride: false };
}

function seasonSpan(from: Date, to: Date): string {
  return from.getTime() === to.getTime()
    ? formatDateDisplay(from)
    : `${formatDateDisplay(from)}–${formatDateDisplay(to)}`;
}

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

export async function quoteHotel(
  agent: QuotingAgent,
  input: HotelQuoteInput
): Promise<QuoteResult> {
  const checkIn = parseDateOnly(input.checkIn);
  const checkOut = parseDateOnly(input.checkOut);
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw new PricingError("Check-out must be after check-in.");

  const hotel = await prisma.hotel.findFirst({
    where: { id: input.hotelId, active: true },
    include: { rates: { where: { active: true } } },
  });
  if (!hotel) throw new PricingError("That hotel is not available.");

  // Loaded per quote, never cached: the settings screen must take effect now.
  const markup = await loadMarkupTable();
  const overrides = await resolvePrices(agent.id, "hotel", hotel.rates.map((r) => r.id));
  const stayNights = eachNight(checkIn, checkOut);

  // An "option" is a room type + meal plan. Its price may still change night to
  // night as the stay crosses season boundaries.
  const groups = new Map<string, typeof hotel.rates>();
  for (const rate of hotel.rates) {
    const key = `${rate.roomType}|${rate.mealPlan}`;
    groups.set(key, [...(groups.get(key) ?? []), rate]);
  }

  const options: QuoteOption[] = [];
  const unavailable: QuoteUnavailable[] = [];

  for (const [key, rates] of groups) {
    const [roomType, mealPlan] = key.split("|");
    const title = `${roomType} · ${MEAL_PLAN_LABEL[mealPlan as MealPlan] ?? mealPlan}`;

    const { segments, uncovered } = segmentByRate(stayNights, (night) =>
      rates.find((r) => isWithin(night, r.validFrom, r.validTo))
    );

    if (uncovered.length > 0) {
      unavailable.push({
        title,
        reason: `No rate loaded for ${uncovered.length} night${uncovered.length === 1 ? "" : "s"} of this stay (from ${formatDateDisplay(uncovered[0])}).`,
      });
      continue;
    }

    const lines: QuoteLineDraft[] = [];
    let usedOverride = false;

    for (const seg of segments) {
      const override = overrides.get(overrideKey(seg.rate.id, "MAIN"));
      const unitMinor =
        override ?? tierDefault(markup, "hotel", agent.tier, seg.rate.costPerNightMinor);
      if (override !== undefined) usedOverride = true;

      const quantity = seg.units * input.rooms;
      lines.push({
        description:
          `${roomType} · ${seg.rate.seasonLabel} · ${seasonSpan(seg.from, seg.to)}` +
          (input.rooms > 1 ? ` · ${input.rooms} rooms` : ""),
        quantity,
        unitMinor,
        totalMinor: unitMinor * quantity,
        usedOverride: override !== undefined,
      });
    }

    if (input.extraBeds > 0) {
      // Extra beds are priced off the first segment's rate. They are a
      // per-night add-on, and splitting them across seasons would add a line
      // per season for what is usually a single small charge.
      const first = segments[0];
      const extraBed = resolveCharge(
        agent, markup, "hotel", overrides, first.rate.id, "EXTRA_BED",
        first.rate.extraBedCostMinor
      );
      if (!extraBed) {
        unavailable.push({
          title,
          reason: "No extra bed rate is loaded for this room type.",
        });
        continue;
      }
      if (extraBed.usedOverride) usedOverride = true;
      const quantity = nights * input.extraBeds;
      lines.push({
        description: `Extra bed × ${input.extraBeds}`,
        quantity,
        unitMinor: extraBed.minor,
        totalMinor: extraBed.minor * quantity,
        usedOverride: extraBed.usedOverride,
      });
    }

    options.push({
      key,
      productType: "hotel",
      title,
      detail: `${nights} night${nights === 1 ? "" : "s"} · ${input.rooms} room${input.rooms === 1 ? "" : "s"}`,
      lines,
      totalMinor: sumMinor(lines.map((l) => l.totalMinor)),
      usedOverride,
    });
  }

  options.sort((a, b) => a.totalMinor - b.totalMinor);
  return { options, unavailable };
}

// ---------------------------------------------------------------------------
// Houseboats
// ---------------------------------------------------------------------------

export async function quoteHouseboat(
  agent: QuotingAgent,
  input: HouseboatQuoteInput
): Promise<QuoteResult> {
  const date = parseDateOnly(input.travelDate);

  const boat = await prisma.houseboat.findFirst({
    where: { id: input.houseboatId, active: true },
    include: { rates: { where: { active: true } } },
  });
  if (!boat) throw new PricingError("That houseboat is not available.");

  // Loaded per quote, never cached: the settings screen must take effect now.
  const markup = await loadMarkupTable();
  const overrides = await resolvePrices(agent.id, "houseboat", boat.rates.map((r) => r.id));

  const options: QuoteOption[] = [];
  const unavailable: QuoteUnavailable[] = [];

  // A cruise is one event on one start date, so unlike a hotel stay there is a
  // single season to resolve.
  for (const rate of boat.rates) {
    const label =
      `${CRUISE_PACKAGE_LABEL[rate.cruisePackage as CruisePackage] ?? rate.cruisePackage}` +
      ` · ${rate.pricingMode === "WHOLE_BOAT" ? "whole boat" : "per person"}`;

    if (!isWithin(date, rate.validFrom, rate.validTo)) continue;

    const override = overrides.get(overrideKey(rate.id, "MAIN"));
    const unitMinor = override ?? tierDefault(markup, "houseboat", agent.tier, rate.costMinor);

    const extraPax = resolveCharge(
      agent, markup, "houseboat", overrides, rate.id, "EXTRA_PAX", rate.extraPaxCostMinor
    );

    try {
      const breakdown = priceHouseboat(
        {
          pricingMode: rate.pricingMode as HouseboatPricingMode,
          rateMinor: unitMinor,
          includedPax: rate.includedPax,
          extraPaxRateMinor: extraPax?.minor ?? null,
          minPax: rate.minPax,
          maxPax: rate.maxPax,
        },
        input.pax
      );

      const lines: QuoteLineDraft[] =
        rate.pricingMode === "PER_PERSON"
          ? [
              {
                description: `${label} · ${rate.seasonLabel} · ${breakdown.basis}`,
                quantity: breakdown.chargedPax,
                unitMinor,
                totalMinor: breakdown.totalMinor,
                usedOverride: override !== undefined,
              },
            ]
          : [
              {
                description: `${label} · ${rate.seasonLabel} · ${breakdown.basis}`,
                quantity: 1,
                unitMinor,
                totalMinor: unitMinor,
                usedOverride: override !== undefined,
              },
              ...(breakdown.totalMinor > unitMinor
                ? [
                    {
                      description: `Extra pax × ${input.pax - (rate.includedPax ?? 0)}`,
                      quantity: input.pax - (rate.includedPax ?? 0),
                      unitMinor: extraPax?.minor ?? 0,
                      totalMinor: breakdown.totalMinor - unitMinor,
                      usedOverride: extraPax?.usedOverride ?? false,
                    },
                  ]
                : []),
            ];

      options.push({
        key: rate.id,
        productType: "houseboat",
        title: label,
        detail: `${formatDateDisplay(date)} · ${input.pax} pax · ${MEAL_PLAN_LABEL[rate.mealPlan as MealPlan] ?? rate.mealPlan}`,
        lines,
        totalMinor: breakdown.totalMinor,
        usedOverride: override !== undefined || (extraPax?.usedOverride ?? false),
      });
    } catch (e) {
      // A capacity or minimum-pax failure is information the agent needs, not
      // a reason to hide the boat.
      unavailable.push({
        title: label,
        reason: e instanceof PricingError ? e.message : "Cannot be priced for this party size.",
      });
    }
  }

  options.sort((a, b) => a.totalMinor - b.totalMinor);
  return { options, unavailable };
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export async function quoteVehicle(
  agent: QuotingAgent,
  input: VehicleQuoteInput
): Promise<QuoteResult> {
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (end < start) throw new PricingError("The end date must not be before the start date.");

  const days = daysBetween(start, end);

  // The itinerary is what the agent knows; the total is derived from it. The
  // pricing below is unchanged — it still consumes one number.
  const km = totalLegKm(input.legs);

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, active: true },
    include: { rates: { where: { active: true } } },
  });
  if (!vehicle) throw new PricingError("That vehicle is not available.");

  // Loaded per quote, never cached: the settings screen must take effect now.
  const markup = await loadMarkupTable();
  const overrides = await resolvePrices(agent.id, "vehicle", vehicle.rates.map((r) => r.id));

  const options: QuoteOption[] = [];
  const unavailable: QuoteUnavailable[] = [];

  const engagedDays: Date[] = [];
  for (let i = 0; i < days; i++) {
    engagedDays.push(new Date(startOfUtcDay(start).getTime() + i * MS_PER_DAY));
  }

  const perDayRates = vehicle.rates.filter((r) => r.rateType === "PER_DAY");
  const otherRates = vehicle.rates.filter((r) => r.rateType !== "PER_DAY");

  // --- per-day: resolved day by day, so a hire crossing a season reprices ---
  if (perDayRates.length > 0) {
    const title = VEHICLE_RATE_TYPE_LABEL.PER_DAY;
    const { segments, uncovered } = segmentByRate(engagedDays, (day) =>
      perDayRates.find((r) => isWithin(day, r.validFrom, r.validTo))
    );

    if (uncovered.length > 0) {
      unavailable.push({
        title,
        reason: `No rate loaded for ${uncovered.length} day${uncovered.length === 1 ? "" : "s"} of this hire (from ${formatDateDisplay(uncovered[0])}).`,
      });
    } else {
      const lines: QuoteLineDraft[] = [];
      let usedOverride = false;
      let includedKm = 0;

      for (const seg of segments) {
        const override = overrides.get(overrideKey(seg.rate.id, "MAIN"));
        const unitMinor =
          override ?? tierDefault(markup, "vehicle", agent.tier, seg.rate.costMinor);
        if (override !== undefined) usedOverride = true;

        includedKm += (seg.rate.includedKmPerDay ?? 0) * seg.units;

        lines.push({
          description: `Vehicle hire · ${seg.rate.seasonLabel} · ${seasonSpan(seg.from, seg.to)}`,
          quantity: seg.units,
          unitMinor,
          totalMinor: unitMinor * seg.units,
          usedOverride: override !== undefined,
        });

        const bata = resolveCharge(
          agent, markup, "vehicle", overrides, seg.rate.id, "DRIVER_ALLOWANCE",
          seg.rate.driverAllowanceCostMinor
        );
        if (bata) {
          if (bata.usedOverride) usedOverride = true;
          lines.push({
            description: `Driver allowance · ${seasonSpan(seg.from, seg.to)}`,
            quantity: seg.units,
            unitMinor: bata.minor,
            totalMinor: bata.minor * seg.units,
            usedOverride: bata.usedOverride,
          });
        }
      }

      // Extra km bill against the allowance accumulated across all segments,
      // not per segment — the allowance is a trip-level pool.
      if (km != null && km > includedKm) {
        const extraKm = km - includedKm;
        const extraRate = resolveCharge(
          agent, markup, "vehicle", overrides, segments[0].rate.id, "EXTRA_KM",
          segments[0].rate.extraKmCostMinor
        );
        if (!extraRate) {
          unavailable.push({
            title,
            reason: `This hire includes ${includedKm} km and no extra-km rate is loaded, so ${km} km cannot be quoted.`,
          });
        } else {
          if (extraRate.usedOverride) usedOverride = true;
          const legSummary =
            input.legs.length > 0
              ? ` across ${input.legs.length} leg${input.legs.length === 1 ? "" : "s"}`
              : "";
          lines.push({
            description: `Extra km (${km} km${legSummary}, ${includedKm} km included)`,
            quantity: extraKm,
            unitMinor: extraRate.minor,
            totalMinor: extraRate.minor * extraKm,
            usedOverride: extraRate.usedOverride,
          });
        }
      }

      if (lines.length > 0) {
        options.push({
          key: "PER_DAY",
          productType: "vehicle",
          title,
          detail:
            `${days} day${days === 1 ? "" : "s"}` +
            (includedKm > 0 ? ` · ${includedKm} km included` : ""),
          lines,
          totalMinor: sumMinor(lines.map((l) => l.totalMinor)),
          usedOverride,
        });
      }
    }
  }

  // --- per-km and transfer: single events, resolved on the start date ---
  for (const rate of otherRates) {
    const title = VEHICLE_RATE_TYPE_LABEL[rate.rateType as VehicleRateType] ?? rate.rateType;
    if (!isWithin(start, rate.validFrom, rate.validTo)) continue;

    const override = overrides.get(overrideKey(rate.id, "MAIN"));
    const unitMinor = override ?? tierDefault(markup, "vehicle", agent.tier, rate.costMinor);

    if (rate.rateType === "PER_KM") {
      if (km == null || km < 1) {
        unavailable.push({
          title,
          reason: "Add at least one leg with a distance to price a per-km rate.",
        });
        continue;
      }
      options.push({
        key: rate.id,
        productType: "vehicle",
        title,
        detail: `${km} km · ${rate.seasonLabel}`,
        lines: [
          {
            description: `${km} km · ${rate.seasonLabel}`,
            quantity: km,
            unitMinor,
            totalMinor: unitMinor * km,
            usedOverride: override !== undefined,
          },
        ],
        totalMinor: unitMinor * km,
        usedOverride: override !== undefined,
      });
    } else {
      options.push({
        key: rate.id,
        productType: "vehicle",
        title,
        detail: `Point to point · ${rate.seasonLabel}`,
        lines: [
          {
            description: `Transfer · ${rate.seasonLabel}`,
            quantity: 1,
            unitMinor,
            totalMinor: unitMinor,
            usedOverride: override !== undefined,
          },
        ],
        totalMinor: unitMinor,
        usedOverride: override !== undefined,
      });
    }
  }

  options.sort((a, b) => a.totalMinor - b.totalMinor);
  return { options, unavailable };
}

// ---------------------------------------------------------------------------
// Itineraries
// ---------------------------------------------------------------------------

export async function quoteItinerary(
  agent: QuotingAgent,
  input: ItineraryQuoteInput
): Promise<QuoteResult> {
  const start = parseDateOnly(input.startDate);

  const itinerary = await prisma.itinerary.findFirst({
    where: { id: input.itineraryId, active: true },
    include: { rates: { where: { active: true } } },
  });
  if (!itinerary) throw new PricingError("That package is not available.");

  // Loaded per quote, never cached: the settings screen must take effect now.
  const markup = await loadMarkupTable();
  const overrides = await resolvePrices(agent.id, "itinerary", itinerary.rates.map((r) => r.id));

  const options: QuoteOption[] = [];
  const unavailable: QuoteUnavailable[] = [];

  // Packages are priced on their departure date, not day by day — the whole
  // package is one product with one season.
  for (const rate of itinerary.rates) {
    const title =
      ITINERARY_PRICING_MODE_LABEL[rate.pricingMode as ItineraryPricingMode] ?? rate.pricingMode;
    if (!isWithin(start, rate.validFrom, rate.validTo)) continue;

    const override = overrides.get(overrideKey(rate.id, "MAIN"));
    const unitMinor = override ?? tierDefault(markup, "itinerary", agent.tier, rate.costMinor);

    const supplement = resolveCharge(
      agent, markup, "itinerary", overrides, rate.id, "SINGLE_SUPPLEMENT",
      rate.singleSupplementCostMinor
    );

    try {
      const breakdown = priceItinerary(
        {
          pricingMode: rate.pricingMode as ItineraryPricingMode,
          priceMinor: unitMinor,
          singleSupplementMinor: supplement?.minor ?? null,
          maxPax: rate.maxPax,
        },
        input.pax
      );

      const perPerson = rate.pricingMode === "PER_PERSON_TWIN_SHARING";
      const baseTotal = perPerson ? unitMinor * input.pax : unitMinor;

      const lines: QuoteLineDraft[] = [
        {
          description: `${itinerary.name} · ${rate.seasonLabel} · ${breakdown.basis}`,
          quantity: perPerson ? input.pax : 1,
          unitMinor,
          totalMinor: baseTotal,
          usedOverride: override !== undefined,
        },
      ];

      if (breakdown.totalMinor > baseTotal) {
        lines.push({
          description: "Single supplement",
          quantity: 1,
          unitMinor: breakdown.totalMinor - baseTotal,
          totalMinor: breakdown.totalMinor - baseTotal,
          usedOverride: supplement?.usedOverride ?? false,
        });
      }

      options.push({
        key: rate.id,
        productType: "itinerary",
        title,
        detail: `${itinerary.durationNights} night${itinerary.durationNights === 1 ? "" : "s"} from ${formatDateDisplay(start)} · ${input.pax} pax`,
        lines,
        totalMinor: breakdown.totalMinor,
        usedOverride: override !== undefined || (supplement?.usedOverride ?? false),
      });
    } catch (e) {
      unavailable.push({
        title,
        reason: e instanceof PricingError ? e.message : "Cannot be priced for this party size.",
      });
    }
  }

  options.sort((a, b) => a.totalMinor - b.totalMinor);
  return { options, unavailable };
}
