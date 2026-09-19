import "server-only";
import { routeHops, metersToKm, type Hop } from "./distance";
import { parseDateOnly, formatDateOnly, startOfUtcDay, daysBetween } from "./dates";
import { perStopKm } from "./settings";
import type { VehicleLeg, ItineraryDay } from "./quote-types";

/**
 * Turning an agent's day-by-day plan into billable kilometres.
 *
 * Agents do not think in legs, they think in days: day 1 Cochin to Munnar,
 * day 2 at Munnar with a run up to Top Station, day 3 Munnar to Thekkady. The
 * itinerary is what they know; the distance is what we derive from it.
 *
 * This module only ASSEMBLES and MEASURES. It never prices. The legs it
 * produces are the same shape the pricing engine has always consumed, so the
 * per-day / per-km maths in src/lib/quote.ts is untouched by any of this.
 */

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Building the day rows
// ---------------------------------------------------------------------------

/**
 * One blank row per day of the hire, dated.
 *
 * The number of rows is DERIVED from the dates, never typed. An itinerary with
 * a different number of days than the hire it prices is not a thing that
 * should be expressible.
 */
export function blankDays(startDate: string, endDate: string): ItineraryDay[] {
  const start = startOfUtcDay(parseDateOnly(startDate));
  const end = startOfUtcDay(parseDateOnly(endDate));
  if (end < start) return [];

  const count = daysBetween(start, end);
  const days: ItineraryDay[] = [];
  for (let i = 0; i < count; i++) {
    days.push({
      date: formatDateOnly(new Date(start.getTime() + i * MS_PER_DAY)),
      from: "",
      to: "",
      via: [],
      bufferKm: 0,
    });
  }
  return days;
}

/**
 * Force each day to start where the previous one ended.
 *
 * The vehicle is with the party for the whole hire, so it cannot begin day 3
 * somewhere other than where it finished day 2. Letting both be typed would
 * allow an itinerary with an invisible gap in it — and that gap is unbilled
 * distance the operator still pays for. Only day 1's origin is a real choice;
 * the rest are consequences.
 */
export function chainDays(days: readonly ItineraryDay[]): ItineraryDay[] {
  const out: ItineraryDay[] = [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const from = i === 0 ? day.from : (out[i - 1].to || out[i - 1].from);
    out.push({ ...day, from, to: day.to.trim() === "" ? from : day.to });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Days to hops
// ---------------------------------------------------------------------------

/**
 * The distinct places the party sleeps at.
 *
 * Each day's `to` is where they end up, so days 1..n-1 are overnight stops.
 * The LAST day's `to` is excluded — that is where they are dropped, and nobody
 * drives around a place they are leaving from.
 *
 * Deduplicated across the whole trip, not just consecutively: two separate
 * nights at Cochin either end of a trip is still one place to drive around,
 * and this allowance is per place rather than per night.
 */
export function overnightStops(days: readonly ItineraryDay[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  days.slice(0, -1).forEach((d) => {
    const place = (d.to || d.from).trim();
    const key = place.toLowerCase();
    if (place === "" || seen.has(key)) return;
    seen.add(key);
    out.push(place);
  });
  return out;
}

export type ItineraryHop = Hop & {
  /** Index into the day list, or -1 for the two garage runs. */
  dayIndex: number;
  /** Sightseeing km added on this hop. Non-zero only on a day's last hop. */
  bufferKm: number;
};

/**
 * Expand the itinerary into the individual road segments to measure.
 *
 * The garage bookends are the point of this function. A Kerala hire is billed
 * garage to garage: a car dispatched from Cochin to pick up at Cochin airport
 * has already driven that stretch, and after dropping the party in Madurai it
 * still has to come home empty. Both legs are real diesel. Quoting only what
 * the passengers were aboard for loses them silently, every single time.
 */
export function buildHops(garageAddress: string, days: readonly ItineraryDay[]): ItineraryHop[] {
  const chained = chainDays(days).filter((d) => d.from.trim() !== "");
  if (chained.length === 0) return [];

  const hops: ItineraryHop[] = [];

  hops.push({
    dayIndex: -1,
    bufferKm: 0,
    label: `Depot → ${chained[0].from}`,
    origin: garageAddress,
    destination: chained[0].from,
  });

  chained.forEach((day, i) => {
    // A day's route is from → via… → to. The via points carry double duty:
    // on a transfer day they are waypoints, and on a day spent at one stop
    // they are the excursion, which routes out and back to the same place.
    const stops = [day.from, ...day.via.filter((v) => v.trim() !== ""), day.to];
    const segments: [string, string][] = [];
    for (let s = 0; s < stops.length - 1; s++) segments.push([stops[s], stops[s + 1]]);

    segments.forEach(([origin, destination], s) => {
      const last = s === segments.length - 1;
      hops.push({
        dayIndex: i,
        // The whole day's sightseeing buffer rides on its final segment, so a
        // leg reads "Munnar → Thekkady, 95 km + 40 km sightseeing" rather than
        // adding a zero-distance row nobody asked for.
        bufferKm: last ? day.bufferKm : 0,
        label: `Day ${i + 1}: ${origin} → ${destination}`,
        origin,
        destination,
      });
    });
  });

  const last = chained[chained.length - 1];
  hops.push({
    dayIndex: -1,
    bufferKm: 0,
    label: `${last.to} → depot`,
    origin: last.to,
    destination: garageAddress,
  });

  return hops;
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

export type MeasuredItinerary = {
  /** The routed legs, in the shape the pricing engine already consumes. */
  legs: VehicleLeg[];
  /** What Google measured, garage to garage, before anything is added. km. */
  routedKm: number;
  /**
   * Local running allowed at the overnight stops — see PER_STOP_KM.
   * A separate number, not folded into the legs, so each routed leg still
   * matches exactly what anyone gets from Google.
   */
  localKm: number;
  /** The distinct places they overnight at, in order. */
  stops: string[];
  /** Sightseeing buffer the agent added across the trip. km. */
  bufferKm: number;
  /** routedKm + localKm + bufferKm — the number the hire is priced on. */
  totalKm: number;
  /** Legs that could not be measured. The agent fixes or overrides these. */
  failures: { label: string; origin: string; destination: string; error: string }[];
  /** True when any distance was typed by a person rather than measured. */
  anyManual: boolean;
};

/**
 * Measure a whole itinerary and reduce it to legs.
 *
 * `manualKm` on a day short-circuits routing for that day entirely: the agent
 * has told us the distance, so asking Google would only risk contradicting
 * them. That is the escape hatch for a place Google cannot find — a resort
 * with no useful address, a spelling only a local would recognise — and
 * without it one bad place name would make the trip unquotable.
 */
export async function measureItinerary(
  garageAddress: string,
  days: readonly ItineraryDay[]
): Promise<MeasuredItinerary> {
  const chained = chainDays(days);

  const manualDays = new Set(
    chained.map((d, i) => (d.manualKm != null ? i : -1)).filter((i) => i >= 0)
  );

  const hops = buildHops(garageAddress, chained).filter((h) => !manualDays.has(h.dayIndex));
  const { results, failures } = await routeHops(hops);

  const legs: VehicleLeg[] = [];
  let routedKm = 0;
  let bufferKm = 0;
  let anyManual = false;

  const byDay = new Map<number, (typeof results)[number][]>();
  for (const r of results) {
    const list = byDay.get(r.dayIndex) ?? [];
    list.push(r);
    byDay.set(r.dayIndex, list);
  }

  const push = (label: string, km: number, buffer: number, manual: boolean, dayIndex: number) => {
    routedKm += km;
    bufferKm += buffer;
    if (manual) anyManual = true;
    legs.push({ label, km, bufferKm: buffer, dayIndex });
  };

  // The two garage runs bracket the trip: the outbound one before day 1, the
  // return one after the last day. They share dayIndex -1, so they are pulled
  // apart here rather than emitted together in the middle of the itinerary.
  const garageRuns = byDay.get(-1) ?? [];
  const outbound = garageRuns[0];
  const inbound = garageRuns.length > 1 ? garageRuns[garageRuns.length - 1] : undefined;

  if (outbound) {
    push(outbound.label, metersToKm(outbound.meters), outbound.bufferKm, outbound.source === "MANUAL", -1);
  }

  for (let i = 0; i < chained.length; i++) {
    const day = chained[i];

    if (manualDays.has(i)) {
      push(
        `Day ${i + 1}: ${day.from} → ${day.to} (distance entered by hand)`,
        day.manualKm ?? 0,
        day.bufferKm,
        true,
        i
      );
      continue;
    }

    for (const r of byDay.get(i) ?? []) {
      push(r.label, metersToKm(r.meters), r.bufferKm, r.source === "MANUAL", i);
    }
  }

  if (inbound) {
    push(inbound.label, metersToKm(inbound.meters), inbound.bufferKm, inbound.source === "MANUAL", -1);
  }

  const stops = overnightStops(chained);
  const perStop = await perStopKm();
  const localAllowance = stops.length * perStop;

  /*
   * Rides as its own leg rather than being spread across the real ones. Every
   * routed leg then still matches exactly what anyone gets from Google, and
   * because the pricing engine consumes legs, an allowance that was not a leg
   * would be measured and then quietly not charged.
   */
  if (localAllowance > 0) {
    legs.push({
      label: `Local running at ${stops.length} stop${stops.length === 1 ? "" : "s"} (${perStop} km each)`,
      km: localAllowance,
      bufferKm: 0,
      dayIndex: -1,
    });
  }

  return {
    legs,
    routedKm,
    localKm: localAllowance,
    stops,
    bufferKm,
    totalKm: routedKm + localAllowance + bufferKm,
    failures: failures.map((f) => ({
      label: f.label,
      origin: f.origin,
      destination: f.destination,
      error: f.error,
    })),
    anyManual,
  };
}
