import "server-only";
import { prisma } from "./db";
import { resolvePrices, overrideKey } from "./rate-card";
import { loadMarkupTable } from "./markup-store";
import { sellPrice, sellPriceOptional, type MarkupTable } from "./markup";
import { priceHouseboat, priceItinerary, PricingError } from "./pricing";
import { measureItinerary } from "./itinerary";
import { priceAncillaries } from "./ancillary";
import { tourAllowanceKm as resolveTourAllowanceKm } from "./tours";
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
import { sumMinor, toWholeRupees } from "./money";
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
  ItinerarySummary,
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
): { minor: number; usedOverride: boolean; costMinor: number } | null {
  const override = overrides.get(overrideKey(referenceId, charge));
  /*
   * The cost comes back WITH the price, including on the override path.
   *
   * An override replaces what we charge, never what the thing cost us — so
   * the override branch is precisely where the cost matters most. It is the
   * only branch that can sell below cost, because it bypasses the markup
   * rules entirely, and nothing anywhere compared the two until now.
   */
  if (override !== undefined) {
    return { minor: override, usedOverride: true, costMinor: costMinor ?? 0 };
  }

  // Ancillary charges inherit the PARENT PRODUCT's markup — an extra bed is
  // marked up by the hotel rule, not one of its own.
  const marked = sellPriceOptional(markup, productType, agent.tier, costMinor);
  return marked === null ? null : { minor: marked, usedOverride: false, costMinor: costMinor ?? 0 };
}

/**
 * The MAIN charge on a rate row, resolved the same way and reporting the same
 * three things.
 *
 * This existed inline as `override ?? tierDefault(...)` at five call sites,
 * which is five places that each had the cost in hand and dropped it on the
 * floor. One helper means a product added later cannot quietly forget to
 * record what it cost.
 */
function resolveMain(
  agent: QuotingAgent,
  markup: MarkupTable,
  productType: ProductType,
  overrides: Map<string, number>,
  referenceId: string,
  costMinor: number
): { minor: number; usedOverride: boolean; costMinor: number } {
  const override = overrides.get(overrideKey(referenceId, "MAIN"));
  return override !== undefined
    ? { minor: override, usedOverride: true, costMinor }
    : { minor: tierDefault(markup, productType, agent.tier, costMinor), usedOverride: false, costMinor };
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
      const main = resolveMain(
        agent, markup, "hotel", overrides, seg.rate.id, seg.rate.costPerNightMinor
      );
      const unitMinor = main.minor;
      if (main.usedOverride) usedOverride = true;

      const quantity = seg.units * input.rooms;
      lines.push({
        description:
          `${roomType} · ${seg.rate.seasonLabel} · ${seasonSpan(seg.from, seg.to)}` +
          (input.rooms > 1 ? ` · ${input.rooms} rooms` : ""),
        quantity,
        unitMinor,
        totalMinor: unitMinor * quantity,
        usedOverride: main.usedOverride,
        costTotalMinor: main.costMinor * quantity,
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
        costTotalMinor: extraBed.costMinor * quantity,
      });
    }

    options.push({
      key,
      productType: "hotel",
      title,
      // What is being sold, and where its photographs hang off. The title is
      // the room type and meal plan; the property is what an agent pictures.
      subject: {
        name: hotel.name,
        detail: hotel.location,
        photo: { kind: "hotel", id: hotel.id },
      },
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

    const main = resolveMain(agent, markup, "houseboat", overrides, rate.id, rate.costMinor);
    const unitMinor = main.minor;

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
                usedOverride: main.usedOverride,
                // Per person: the boat's cost is a per-person cost here, so it
                // scales with the pax actually charged — the same number the
                // price was multiplied by, never the party size, which may be
                // below minPax.
                costTotalMinor: main.costMinor * breakdown.chargedPax,
              },
            ]
          : [
              {
                description: `${label} · ${rate.seasonLabel} · ${breakdown.basis}`,
                quantity: 1,
                unitMinor,
                totalMinor: unitMinor,
                usedOverride: main.usedOverride,
                costTotalMinor: main.costMinor,
              },
              ...(breakdown.totalMinor > unitMinor
                ? [
                    {
                      description: `Extra pax × ${input.pax - (rate.includedPax ?? 0)}`,
                      quantity: input.pax - (rate.includedPax ?? 0),
                      unitMinor: extraPax?.minor ?? 0,
                      totalMinor: breakdown.totalMinor - unitMinor,
                      usedOverride: extraPax?.usedOverride ?? false,
                      costTotalMinor:
                        (extraPax?.costMinor ?? 0) * (input.pax - (rate.includedPax ?? 0)),
                    },
                  ]
                : []),
            ];

      options.push({
        key: rate.id,
        productType: "houseboat",
        title: label,
        subject: {
          name: boat.name,
          detail: `${boat.category} · ${boat.bedrooms} bedroom${boat.bedrooms === 1 ? "" : "s"} · ${boat.location}`,
          photo: { kind: "houseboat", id: boat.id },
        },
        detail: `${formatDateDisplay(date)} · ${input.pax} pax · ${MEAL_PLAN_LABEL[rate.mealPlan as MealPlan] ?? rate.mealPlan}`,
        lines,
        totalMinor: breakdown.totalMinor,
        usedOverride: main.usedOverride || (extraPax?.usedOverride ?? false),
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

  /*
   * A standard tour's kilometre allowance, resolved from the id SERVER-SIDE.
   *
   * Never taken from the request. The allowance is what the hire is priced on,
   * so accepting a number off the query string would let a hand-edited URL buy
   * 5,000 km for the price of 650 — exactly the reason this function measures
   * the legs itself rather than reading `legKm` from the URL.
   */
  const tourAllowanceKm = await resolveTourAllowanceKm(input.tourId);

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, active: true },
    include: { rates: { where: { active: true } } },
  });
  if (!vehicle) throw new PricingError("That vehicle is not available.");

  /*
   * Which vehicle this quote is FOR.
   *
   * Frozen onto every option rather than looked up when a saved quote is read:
   * the option is the snapshot, and a vehicle that is later renamed or retired
   * must not change what a quote already sent to a customer says it was for.
   *
   * "Passengers", never "seats" — `capacity` is the maximum the vehicle
   * actually carries with luggage aboard, which for a Fortuner is four of its
   * seven seats.
   */
  const subject = {
    name: vehicle.type,
    detail: `Up to ${vehicle.capacity} passenger${vehicle.capacity === 1 ? "" : "s"}`,
    photo: { kind: "vehicle" as const, id: vehicle.id },
  };

  // Fetched once, up front: its state is home for the permit maths, and the
  // itinerary block below needs the same row.
  const depot = input.garageId
    ? await prisma.garage.findFirst({ where: { id: input.garageId, active: true } })
    : null;

  /*
   * Measure the itinerary HERE rather than taking distances from the caller.
   *
   * The legs are derived data, and deriving them in the engine is what makes
   * them trustworthy: the priced page and the save path both come through this
   * function, so they cannot disagree, and a hand-edited query string cannot
   * hand us its own kilometres. It is the same rule saving already follows by
   * re-pricing instead of trusting a total from the browser.
   *
   * Quotes saved before the itinerary builder existed carry typed `legs` and
   * no `days`, and those still price exactly as they always did.
   */
  let legs = input.legs;
  let itinerary: ItinerarySummary | undefined;
  // Defaults say "nothing was checked", which is the truth until a route is
  // actually measured — not "crosses nothing".
  let routeStates: string[] = [];
  let routeStatesIncomplete = true;

  if (input.garageId && input.days && input.days.length > 0) {
    const garage = depot
      ? await prisma.garage.findFirst({
          where: { id: input.garageId, active: true },
          include: { vehicles: { where: { vehicleId: input.vehicleId, active: true } } },
        })
      : null;
    if (!garage) throw new PricingError("That depot is not available.");

    // Checked server-side, not just hidden in the dropdown. The garage list
    // narrows what is offered; this is what makes it true.
    if (garage.vehicles.length === 0) {
      throw new PricingError(`The ${vehicle.type} is not available from the ${garage.name} depot.`);
    }

    const measured = await measureItinerary(garage.address, input.days);

    /*
     * A leg that could not be measured makes the whole trip unquotable.
     *
     * The tempting alternative — price what we could measure and mention the
     * rest — produces a number that looks complete and is short by however far
     * the missing leg runs. A quote that is confidently wrong is worse than
     * one that refuses, because only one of them gets sent to a customer.
     */
    if (measured.failures.length > 0) {
      const f = measured.failures[0];
      throw new PricingError(
        measured.failures.length === 1
          ? `${f.label}: ${f.error}`
          : `${measured.failures.length} legs could not be measured. First: ${f.label} — ${f.error}`
      );
    }

    legs = measured.legs;
    routeStates = measured.routeStates;
    routeStatesIncomplete = measured.routeStatesIncomplete;
    itinerary = {
      legs: measured.legs,
      routedKm: measured.routedKm,
      localKm: measured.localKm,
      stops: measured.stops,
      bufferKm: measured.bufferKm,
      totalKm: measured.totalKm,
      anyManual: measured.anyManual,
    };
  }

  // Whatever the source, the itinerary reduces to the one number the per-day
  // and per-km logic below has always consumed. None of that maths changed.
  const km = totalLegKm(legs);

  // Loaded per quote, never cached: the settings screen must take effect now.
  const markup = await loadMarkupTable();
  const overrides = await resolvePrices(agent.id, "vehicle", vehicle.rates.map((r) => r.id));

  const options: QuoteOption[] = [];
  const unavailable: QuoteUnavailable[] = [];

  /*
   * Toll, parking and permits ride on every option: they are incurred whether
   * the hire is priced per day, per km or as a flat transfer. Priced once here
   * and appended to each option's lines, so the totals cannot drift apart.
   */
  const ancillary =
    input.days?.length && depot
      ? await priceAncillaries(
          input.days,
          days,
          vehicle.id,
          depot.state,
          routeStates,
          routeStatesIncomplete,
          agent.tier,
          markup
        )
      : null;

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
      /*
       * What the hire's price covers, in km.
       *
       * Normally the per-day allowance pooled across the whole hire. For a
       * STANDARD TOUR it is the tour's own allowance instead — Sonet's round
       * commercial figure, which already carries the sightseeing at each stop.
       *
       * Confirmed with Sonet 6 Oct 2026, and it fixes the sentence he
       * objected to. A 3-day Cochin–Munnar–Cochin at 250 km/day stated "750
       * km included" on a trip that runs 350: arithmetic about an allowance,
       * not a fact about the journey, and nothing a customer could judge.
       * A tour states 350, because that is the number he stands behind.
       *
       * It replaces the per-day pool rather than adding to it. Two allowances
       * on one hire is two different answers to "how far before we charge per
       * km", and the line that reports it could only pick one.
       */
      let chargeAfterKm = tourAllowanceKm ?? 0;
      // Set where the bata line is actually pushed, so the customer document
      // can only claim a driver allowance that was really charged.
      let chargedBata = false;
      for (const seg of segments) {
        const main = resolveMain(
          agent, markup, "vehicle", overrides, seg.rate.id, seg.rate.costMinor
        );
        const unitMinor = main.minor;
        if (main.usedOverride) usedOverride = true;

        if (tourAllowanceKm == null) {
          chargeAfterKm += (seg.rate.includedKmPerDay ?? 0) * seg.units;
        }

        lines.push({
          description: `Vehicle hire · ${seg.rate.seasonLabel} · ${seasonSpan(seg.from, seg.to)}`,
          quantity: seg.units,
          unitMinor,
          totalMinor: unitMinor * seg.units,
          usedOverride: main.usedOverride,
          costTotalMinor: main.costMinor * seg.units,
        });

        const bata = resolveCharge(
          agent, markup, "vehicle", overrides, seg.rate.id, "DRIVER_ALLOWANCE",
          seg.rate.driverAllowanceCostMinor
        );
        if (bata) {
          if (bata.usedOverride) usedOverride = true;
          chargedBata = true;
          lines.push({
            description: `Driver allowance · ${seasonSpan(seg.from, seg.to)}`,
            quantity: seg.units,
            unitMinor: bata.minor,
            totalMinor: bata.minor * seg.units,
            usedOverride: bata.usedOverride,
            costTotalMinor: bata.costMinor * seg.units,
          });
        }
      }

      /*
       * Resolved ONCE, whether or not the trip goes over.
       *
       * The rate is a term of the hire — a customer asking "what if we add a
       * day trip" needs it stated on a quote that happens to be inside its
       * allowance. It was resolved twice, identically, and the charged line
       * and the stated term must be the SAME number: a document may only claim
       * what it charged, and two calls are two chances to drift.
       *
       * Rounded to a whole rupee. Sonet, 7 Oct 2026: *"for extra km also we
       * need it in 1 figure ... just 23 is fine"*. A percentage markup leaves
       * ₹23.10 per km, and nobody quotes a fare in paise.
       */
      const extraKmCharge =
        segments.length > 0
          ? resolveCharge(
              agent, markup, "vehicle", overrides, segments[0].rate.id, "EXTRA_KM",
              segments[0].rate.extraKmCostMinor
            )
          : null;
      const extraKmUnitMinor =
        extraKmCharge === null ? null : toWholeRupees(extraKmCharge.minor);
      // A trip-level figure, like the allowance it is charged beyond.
      const extraKmRateMinor: number | undefined = extraKmUnitMinor ?? undefined;

      // Extra km bill against the allowance accumulated across all segments,
      // not per segment — the allowance is a trip-level pool.
      if (km != null && km > chargeAfterKm) {
        const extraKm = km - chargeAfterKm;
        const extraRate =
          extraKmCharge && extraKmUnitMinor != null
            ? { ...extraKmCharge, minor: extraKmUnitMinor }
            : null;
        if (!extraRate) {
          unavailable.push({
            title,
            reason: `This hire covers ${chargeAfterKm} km and no extra-km rate is loaded, so ${km} km cannot be quoted.`,
          });
        } else {
          if (extraRate.usedOverride) usedOverride = true;
          const legSummary =
            legs.length > 0 ? ` across ${legs.length} leg${legs.length === 1 ? "" : "s"}` : "";
          lines.push({
            description: `Extra km (${km} km${legSummary}, ${chargeAfterKm} km on the daily rate)`,
            quantity: extraKm,
            unitMinor: extraRate.minor,
            totalMinor: extraRate.minor * extraKm,
            usedOverride: extraRate.usedOverride,
            costTotalMinor: extraRate.costMinor * extraKm,
          });
        }
      }

      if (lines.length > 0) {
        /*
         * What the quote STATES as included: the distance this trip actually
         * runs, not the rate card's per-day allowance.
         *
         * Those are two different numbers doing two different jobs, and
         * conflating them is what produced the sentence Sonet objected to. A
         * 5-day hire at 250 km/day told the customer "1,250 km included" on a
         * trip measuring 700 — and that is not merely confusing, it is a
         * PROMISE. Under those terms the party could ask the driver for
         * another 550 km and owe nothing, while the same document said
         * detours beyond the plan cost ₹23 a km. Both cannot be true.
         *
         * Confirmed with Sonet, 7 Oct 2026: state what the price was built
         * on. Since 7 Oct the trip distance is itself an operator-grade
         * figure — measured, 62 km a night for local running, rounded up to
         * the next 50 — so it already carries the cushion the per-day
         * allowance used to provide informally.
         *
         * `chargeAfterKm` still governs WHEN extra km is billed, and must:
         * the daily rate covers a normal day's running, and a 5-day trip to
         * Bangalore and back cannot cost the same as five days around Kerala.
         * Removing that threshold would silently undercharge every long hire.
         *
         * This REVERSES the 20 Sept rule for the under-allowance case only.
         * Over the allowance it is unchanged and still correct: the excess has
         * already been charged and is in the total, so a 1,189 km trip covers
         * 1,189 km and must not be billed for them twice.
         */
        const coveredKm = km ?? chargeAfterKm;
        options.push({
          key: "PER_DAY",
          productType: "vehicle",
          title,
          subject,
          detail:
            `${days} day${days === 1 ? "" : "s"}` +
            (coveredKm > 0 ? ` · ${coveredKm.toLocaleString("en-IN")} km included` : ""),
          lines,
          totalMinor: sumMinor(lines.map((l) => l.totalMinor)),
          usedOverride,
          terms: {
            /*
             * What the price COVERS, not the rate card's allowance.
             *
             * The allowance (100 km a day, say) is an input to the extra-km
             * calculation. By the time the quote is priced, any kilometres
             * over it have ALREADY been charged and are in the total — so a
             * 1,189 km trip on a 400 km allowance covers 1,189 km.
             *
             * Saying "400 km included, extra at ₹24.20" on that quote told the
             * customer they would be billed again for 789 km they had just
             * paid for. Under the allowance the answer is the allowance: four
             * days bought 400 km whether or not they were driven.
             */
            includedKm: coveredKm || undefined,
            extraKmRateMinor,
            includesDriverAllowance: chargedBata || undefined,
          },
        });
      }
    }
  }

  // --- per-km and transfer: single events, resolved on the start date ---
  for (const rate of otherRates) {
    const title = VEHICLE_RATE_TYPE_LABEL[rate.rateType as VehicleRateType] ?? rate.rateType;
    if (!isWithin(start, rate.validFrom, rate.validTo)) continue;

    const main = resolveMain(agent, markup, "vehicle", overrides, rate.id, rate.costMinor);
    const unitMinor = main.minor;

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
        subject,
        detail: `${km} km · ${rate.seasonLabel}`,
        lines: [
          {
            description: `${km} km · ${rate.seasonLabel}`,
            quantity: km,
            unitMinor,
            totalMinor: unitMinor * km,
            usedOverride: main.usedOverride,
            costTotalMinor: main.costMinor * km,
          },
        ],
        totalMinor: unitMinor * km,
        usedOverride: main.usedOverride,
      });
    } else {
      options.push({
        key: rate.id,
        productType: "vehicle",
        title,
        subject,
        detail: `Point to point · ${rate.seasonLabel}`,
        lines: [
          {
            description: `Transfer · ${rate.seasonLabel}`,
            quantity: 1,
            unitMinor,
            totalMinor: unitMinor,
            usedOverride: main.usedOverride,
            costTotalMinor: main.costMinor,
          },
        ],
        totalMinor: unitMinor,
        usedOverride: main.usedOverride,
      });
    }
  }

  options.sort((a, b) => a.totalMinor - b.totalMinor);
  /*
   * Appended here rather than inside each options.push, so a new pricing mode
   * cannot be added later that quietly omits them. Toll, parking and permits
   * are incurred whichever way the hire is priced.
   */
  if (ancillary && ancillary.lines.length > 0) {
    for (const option of options) {
      option.lines = [...option.lines, ...ancillary.lines];
      option.totalMinor += ancillary.totalMinor;
      // Recorded on the option so the customer document states only what was
      // actually charged, rather than a sentence that has to be kept in step
      // with the pricing by hand.
      option.terms = {
        ...option.terms,
        includesTollParking: ancillary.chargedTollParking,
        permitStates: ancillary.chargedPermits,
      };
    }
  }

  // A place we could not place is a permit we may have failed to charge, and
  // an unpaid permit is money handed over at a border with no way back.
  if (ancillary?.statesIncomplete) {
    unavailable.push({
      title: "Transit states not fully checked",
      reason:
        "Part of this route could not be checked for the states it passes through, so an " +
        "interstate permit may be missing from this price. This happens on days with a " +
        "hand-entered distance, and on routes measured before this check existed — requote to refresh it.",
    });
  }

  if (ancillary && ancillary.missingPermits.length > 0) {
    unavailable.push({
      title: "Interstate permit not set",
      reason:
        `This trip enters ${ancillary.missingPermits.join(" and ")}, and no permit fee is set for the ` +
        `${vehicle.type}. The price below does not include it — ask Series Tours to add the fee.`,
    });
  }

  if (ancillary && ancillary.unknownPlaces.length > 0) {
    unavailable.push({
      title: "Check the interstate permits",
      reason:
        `These places are not on our destination list, so we could not tell which state they are in: ` +
        `${ancillary.unknownPlaces.join(", ")}. If the trip crosses a state border, the permit may be missing from this price.`,
    });
  }


  return { options, unavailable, itinerary };
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

    const main = resolveMain(agent, markup, "itinerary", overrides, rate.id, rate.costMinor);
    const unitMinor = main.minor;

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
          usedOverride: main.usedOverride,
          costTotalMinor: main.costMinor * (perPerson ? input.pax : 1),
        },
      ];

      if (breakdown.totalMinor > baseTotal) {
        lines.push({
          description: "Single supplement",
          quantity: 1,
          unitMinor: breakdown.totalMinor - baseTotal,
          totalMinor: breakdown.totalMinor - baseTotal,
          usedOverride: supplement?.usedOverride ?? false,
          costTotalMinor: supplement?.costMinor ?? 0,
        });
      }

      options.push({
        key: rate.id,
        productType: "itinerary",
        title,
        detail: `${itinerary.durationNights} night${itinerary.durationNights === 1 ? "" : "s"} from ${formatDateDisplay(start)} · ${input.pax} pax`,
        lines,
        totalMinor: breakdown.totalMinor,
        usedOverride: main.usedOverride || (supplement?.usedOverride ?? false),
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
