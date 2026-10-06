import "server-only";
import { prisma } from "./db";
import { MS_PER_DAY, formatDateOnly, parseDateOnly, startOfUtcDay } from "./dates";
import type { ItineraryDay } from "./quote-types";

/**
 * Standard tours — the circuits Series Tours actually sells.
 *
 * Sonet, 6 Oct 2026: *"b2b agents wont be know how many km there trip will
 * running"*. He is right, and it is not a gap in the agent's diligence: an
 * agency in Delhi selling a Kerala holiday has no way to know that Munnar to
 * Thekkady is 95 km, let alone what the whole circuit runs to. Asking them to
 * build the plan day by day asks them to know Kerala's roads.
 *
 * A template is a STARTING POINT, never a restriction — the same relationship
 * the destination chips have to free typing. It fills in exactly the day plan
 * the builder already produces, the agent can edit every row of it afterwards,
 * and the quote prices it through the same engine as a hand-built trip. There
 * is deliberately no second pricing path: two paths is how a quote comes to
 * disagree with itself.
 *
 * What the template DOES decide is the kilometre allowance — see
 * `TourTemplate.allowanceKm`. That is Sonet's commercial figure, not a
 * measurement, and it is what the hire is priced and quoted on.
 */

export type TourDay = {
  dayIndex: number;
  to: string;
  via: string[];
};

export type Tour = {
  id: string;
  name: string;
  startPlace: string;
  nights: number;
  allowanceKm: number;
  notes: string | null;
  sortOrder: number;
  active: boolean;
  days: TourDay[];
};

/** Days = nights + 1. Stated once, so no screen can get it different. */
export function dayCount(nights: number): number {
  return nights + 1;
}

export function parseVia(csv: string | null): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

export function viaToCsv(via: readonly string[]): string | null {
  const clean = via.map((p) => p.trim()).filter((p) => p !== "");
  return clean.length > 0 ? clean.join(", ") : null;
}

/**
 * The route as a line of text — "Cochin → Munnar → Thekkady → Cochin".
 *
 * Consecutive repeats are collapsed: two nights at Munnar is one stop on the
 * route, and "Munnar → Munnar" reads like a mistake. Via points are left out
 * here; this is how the tour is CHOSEN, and the day plan shows the detail.
 */
export function routeSummary(tour: Pick<Tour, "startPlace" | "days">): string {
  const places = [tour.startPlace, ...tour.days.map((d) => d.to)];
  const out: string[] = [];
  for (const place of places) {
    const p = place.trim();
    if (p !== "" && p !== out[out.length - 1]) out.push(p);
  }
  return out.join(" → ");
}

function toTour(row: {
  id: string;
  name: string;
  startPlace: string;
  nights: number;
  allowanceKm: number;
  notes: string | null;
  sortOrder: number;
  active: boolean;
  days: { dayIndex: number; to: string; viaCsv: string | null }[];
}): Tour {
  return {
    id: row.id,
    name: row.name,
    startPlace: row.startPlace,
    nights: row.nights,
    allowanceKm: row.allowanceKm,
    notes: row.notes,
    sortOrder: row.sortOrder,
    active: row.active,
    days: [...row.days]
      .sort((a, b) => a.dayIndex - b.dayIndex)
      .map((d) => ({ dayIndex: d.dayIndex, to: d.to, via: parseVia(d.viaCsv) })),
  };
}

/**
 * The same order everywhere — admin list, agent picker, anywhere else.
 *
 * Identical tie-breakers to the fleet, and for the same reason: an agent who
 * reads the list and then opens the picker must not have to hunt for what was
 * third a moment ago.
 */
const TOUR_ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

export async function listTours(opts?: { activeOnly?: boolean }): Promise<Tour[]> {
  const rows = await prisma.tourTemplate.findMany({
    where: opts?.activeOnly ? { active: true } : undefined,
    orderBy: TOUR_ORDER,
    include: { days: true },
  });
  return rows.map(toTour);
}

export async function getTour(id: string): Promise<Tour | null> {
  const row = await prisma.tourTemplate.findUnique({
    where: { id },
    include: { days: true },
  });
  return row ? toTour(row) : null;
}

/**
 * The template, rendered as the itinerary the agent would otherwise have typed.
 *
 * Dates come from the hire's start date, never from the template — a tour is a
 * route and a duration, not a departure. The number of day rows the quote
 * builder shows is already DERIVED from the hire dates, so a template whose
 * length disagrees with them has to be reconciled rather than trusted: this
 * returns only as many days as the template holds, and the caller fits them to
 * the dates.
 *
 * `from` is left for `chainDays` to fill, exactly as the form does. Day 1
 * starts at `startPlace`; every later day starts where the previous ended.
 * Deriving it here as well would be a second implementation of the one rule
 * that stops an itinerary containing an invisible, unbilled gap.
 */
export function daysFromTour(tour: Tour, startDate: string): ItineraryDay[] {
  // parseDateOnly throws on anything that is not YYYY-MM-DD. A malformed date
  // here means the caller has a bug, but it arrives from a query string, so it
  // yields no days rather than a 500 on the quote screen.
  let start: Date;
  try {
    start = startOfUtcDay(parseDateOnly(startDate));
  } catch {
    return [];
  }

  const days = [...tour.days].sort((a, b) => a.dayIndex - b.dayIndex);
  return days.map((d, i) => ({
    date: formatDateOnly(new Date(start.getTime() + i * MS_PER_DAY)),
    // Only day 1 is a real choice; chainDays fills the rest.
    from: i === 0 ? tour.startPlace : "",
    to: d.to,
    via: d.via,
    bufferKm: 0,
  }));
}

/**
 * The allowance for a hire, in km, or null when it is not a standard tour.
 *
 * Resolved from the id SERVER-SIDE and never taken from the request. The
 * allowance decides what the hire is priced on, so accepting it from the query
 * string would let a hand-edited URL buy 5,000 km for the price of 650 — the
 * same reason `quoteVehicle` measures the legs itself rather than reading
 * `legKm` off the URL.
 */
export async function tourAllowanceKm(tourId: string | undefined): Promise<number | null> {
  if (!tourId) return null;
  const row = await prisma.tourTemplate.findUnique({
    where: { id: tourId },
    select: { allowanceKm: true, active: true },
  });
  // An archived tour still prices, because a saved quote must keep repricing
  // to the same number when it is reopened for an edit.
  return row ? row.allowanceKm : null;
}

/**
 * A tour is only offerable once every day has somewhere to end.
 *
 * A half-built tour is HIDDEN from agents rather than offered — filling an
 * itinerary with blank days is worse than not offering the tour at all,
 * because the agent then has to work out which rows the portal left for them.
 */
export function isComplete(tour: Tour): boolean {
  return (
    tour.days.length === dayCount(tour.nights) &&
    tour.days.every((d) => d.to.trim() !== "")
  );
}

/** The tours an agent may pick: active, and completely planned. */
export async function listOfferableTours(): Promise<Tour[]> {
  return (await listTours({ activeOnly: true })).filter(isComplete);
}

/** New tours go to the END — the column defaults to 0, which would otherwise
 *  put every new one first AND tie it with whatever is already there. */
export async function nextTourSortOrder(): Promise<number> {
  const top = await prisma.tourTemplate.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (top?.sortOrder ?? -1) + 1;
}

/**
 * Renumbers the WHOLE list after a move, rather than swapping two rows.
 *
 * Swapping is fewer writes and is wrong the moment two rows share a
 * sortOrder, which happens the first time anything is added or restored.
 * Renumbering makes ties impossible instead of merely unlikely. Same as
 * `reorderVehicle`.
 */
export async function reorderTour(id: string, direction: "up" | "down"): Promise<void> {
  const all = await prisma.tourTemplate.findMany({
    orderBy: TOUR_ORDER,
    select: { id: true },
  });
  const from = all.findIndex((t) => t.id === id);
  if (from === -1) return;
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= all.length) return;

  const moved = [...all];
  const [row] = moved.splice(from, 1);
  moved.splice(to, 0, row);

  await prisma.$transaction(
    moved.map((t, i) =>
      prisma.tourTemplate.update({ where: { id: t.id }, data: { sortOrder: i } })
    )
  );
}
