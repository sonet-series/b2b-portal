import { formatMinor } from "./money";
import { describe } from "./destinations";
import type { ItineraryDay, QuoteOption } from "./quote-types";

/**
 * The customer-facing itinerary document.
 *
 * The agent hands this to their own customer, so it is written as a tour, not
 * as a costing: what happens on each day, what the price covers, and what it
 * does not. The operational view — the measured road segments, the depot
 * positioning runs, the local-running allowance — is deliberately NOT here.
 * Confirmed with Sonet, 20 Sept 2026: legs and their kilometres are for the
 * admin screens, where they explain a price; on a customer document they only
 * invite an argument about a number that was never a charge.
 *
 * Built in ONE place, with no server-only import, so the portal page and the
 * PDF render the same document. Two renderers deriving the same prose
 * separately is how a quote comes to claim two different things.
 *
 * Every sentence here is DERIVED — from the day plan the agent typed and from
 * what the pricing actually charged. Nothing is a fixed string kept in step by
 * hand; that is precisely how the old "toll and parking at actuals" line came
 * to contradict a price that already included them.
 */

export type ItineraryDocumentDay = {
  /** "Day 1". */
  label: string;
  /** ISO date, so the caller formats it however it formats every other date. */
  date: string;
  /** "Cochin International Airport to Munnar", "Munnar local sightseeing". */
  heading: string;
  /** The agent's own notes when they wrote any, otherwise a plain description. */
  description: string;
  /** The places visited on the way, or on the excursion. May be empty. */
  activities: string[];
};

export type ItineraryDocument = {
  /** "4-Day Cab Tour: Mysore & Bangalore". */
  title: string;
  /** "From Cochin International Airport · 4 days / 3 nights". */
  subtitle: string;
  overview: string;
  days: ItineraryDocumentDay[];
  included: string[];
  excluded: string[];
};

export type ItineraryDocumentInput = {
  days: readonly ItineraryDay[];
  /**
   * The rest of a combined trip — hotel stays, a houseboat — as the labels the
   * agent chose them by.
   *
   * Named in WHAT'S INCLUDED, because a document that describes the driving
   * and says nothing about four nights of hotels is describing a trip the
   * customer is not buying.
   */
  alsoIncluded?: readonly string[];
  /** What is being hired, frozen with the option. Absent on older quotes. */
  subject?: QuoteOption["subject"];
  terms?: QuoteOption["terms"];
};

/** "A, B and C" — an Oxford-free list, which is how an itinerary reads aloud. */
function list(items: readonly string[]): string {
  const parts = items.filter((p) => p.trim() !== "");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Same list, with "&", capped — a title, not an index.
 *
 * A twelve-day tour names a dozen stops, and a title that wraps to three lines
 * stops being a title. The overview below still names them all.
 */
function titleList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length > 5) return `${items.slice(0, 5).join(", ")} & more`;
  return `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}

/** "a" or "an", so "A 8-day tour" cannot reach a customer. */
function article(n: number): string {
  return n === 8 || n === 11 || n === 18 || (n >= 80 && n < 90) ? "An" : "A";
}

function clean(places: readonly string[]): string[] {
  return places.map((p) => p.trim()).filter((p) => p !== "");
}

/**
 * The places the party actually stays at.
 *
 * The end of every day except the last, de-duplicated in order. The last day's
 * drop point is where they leave from, not somewhere they stay — and a tour
 * titled after the airport they flew out of reads like a mistake.
 */
function stayPlaces(days: readonly ItineraryDay[]): string[] {
  const seen: string[] = [];
  for (const day of days.slice(0, -1)) {
    const to = day.to.trim();
    if (to !== "" && !seen.includes(to)) seen.push(to);
  }
  return seen;
}

/**
 * A driving day.
 *
 * The first and last days are named for what they are — people arrive and
 * depart, they do not "drive from an airport". A gateway reached on the last
 * day gets the flight or the onward journey, never a description of what to
 * see there.
 */
function describeTransfer(
  from: string,
  to: string,
  via: readonly string[],
  at: { first: boolean; last: boolean }
): string {
  const fromPlace = describe(from);
  const toPlace = describe(to);
  const byRoad = via.length > 0 ? ` by way of ${list(via)}` : "";

  if (at.last && toPlace?.gateway) {
    const purpose = /airport/i.test(to) ? "the departure flight" : "the onward journey";
    return `Drive from ${from} to ${to}${byRoad}, in time for ${purpose}.`;
  }

  const lead =
    at.first && fromPlace?.gateway
      ? `Arrive at ${from} and drive on to ${to}${byRoad}.`
      : `Drive from ${from} to ${to}${byRoad}.`;

  if (!toPlace?.blurb) return lead;

  /*
   * With a via point the blurb becomes its OWN sentence.
   *
   * Appended as an apposition it lands after the wrong noun: "drive on to
   * Mysore by way of Kabini, the old seat of the Wadiyar kings" reads as
   * though Kabini were the Wadiyar seat. Naming the destination again costs a
   * word and removes the ambiguity.
   */
  return byRoad === ""
    ? lead.replace(/\.$/, `, ${toPlace.blurb}.`)
    : `${lead} ${to} is ${toPlace.blurb}.`;
}

/** A day spent in one place, with or without an excursion. */
function describeLocalDay(place: string, via: readonly string[]): string {
  const known = describe(place);

  if (via.length > 0) {
    return `A day out from ${place} to ${list(via)}, back to ${place} for the night.`;
  }
  if (known?.blurb) {
    return `A full day at ${place}, ${known.blurb}.`;
  }
  return `A full day at ${place}.`;
}

export function buildItineraryDocument(input: ItineraryDocumentInput): ItineraryDocument | null {
  const days = input.days;
  if (days.length === 0) return null;

  const nights = days.length - 1;
  const start = days[0].from.trim();
  const stays = stayPlaces(days);
  const headline = stays.length > 0 ? stays : clean([days[0].from, days[days.length - 1].to]);

  const title = `${days.length}-Day Cab Tour: ${titleList(headline)}`;
  const subtitle =
    (start ? `From ${start}` : "Private cab tour") +
    ` · ${days.length} ${days.length === 1 ? "day" : "days"}` +
    (nights > 0 ? ` / ${nights} ${nights === 1 ? "night" : "nights"}` : "");

  const vehicle = input.subject?.name;
  const overview =
    `${article(days.length)} ${days.length}-day private cab tour` +
    (start ? ` starting at ${start}` : "") +
    (stays.length > 0 ? `, covering ${list(stays)}` : "") +
    ". " +
    (vehicle
      ? `Travel is by ${vehicle} with a driver throughout`
      : "Travel is by private vehicle with a driver throughout") +
    ", on the day-by-day plan below.";

  const documentDays: ItineraryDocumentDay[] = days.map((day, i) => {
    const from = day.from.trim();
    const to = day.to.trim();
    const via = clean(day.via);
    const local = from === to;
    const first = i === 0;
    const last = i === days.length - 1;

    const heading = local
      ? via.length > 0 || day.bufferKm > 0
        ? `${from} local sightseeing`
        : `At ${from}`
      : `${from} to ${to}`;

    /*
     * The description is OURS, not the agent's.
     *
     * Sonet, 21 Sept 2026: *"day description needs to be derived from our
     * side. not the agent."* An agent writing their own gets it different
     * every time or leaves it blank; Series Tours knows these places, so the
     * same thing is said about them on every quote that visits them.
     *
     * `notes` still WINS where present — quotes saved while the form asked for
     * it keep reading exactly as they were sent. It is simply no longer
     * collected.
     */
    let description = (day.notes ?? "").trim();
    if (description === "") {
      description = local
        ? describeLocalDay(from, via)
        : describeTransfer(from, to, via, { first, last });
    }

    /*
     * The Sightseeing line: the agent's via points where they gave any, and
     * otherwise what the place is known for — but only on a day SPENT there.
     * A transfer day arrives in the evening, and listing four sights on it
     * promises an afternoon nobody has.
     */
    const place = describe(from);
    const activities =
      via.length > 0 ? via : local ? (place?.highlights ?? []).slice(0, 4) : [];

    return { label: `Day ${i + 1}`, date: day.date, heading, description, activities };
  });

  // --- what the price covers --------------------------------------------
  /*
   * Every entry below is conditional on the pricing having actually charged
   * for it. A document may only claim what it charged: "interstate permits
   * included" on a trip whose permit was never priced is a promise the
   * operator then pays for at a border.
   */
  const terms = input.terms;
  const included: string[] = [];
  included.push(
    (vehicle ?? "Private vehicle") +
      ` with driver for ${days.length} ${days.length === 1 ? "day" : "days"}` +
      (input.subject?.detail ? ` (${input.subject.detail.toLowerCase()})` : "")
  );
  included.push("All transfers and sightseeing as set out in the day-by-day plan above");
  for (const item of input.alsoIncluded ?? []) included.push(item);
  if (terms?.includedKm != null) {
    included.push(
      `${terms.includedKm.toLocaleString("en-IN")} km of running over the hire, depot to depot`
    );
  }
  if (terms?.includesDriverAllowance) {
    included.push("Driver's allowance, and the driver's own meals and accommodation");
  }
  if (terms?.includesTollParking) included.push("All toll and parking charges");
  if ((terms?.permitStates?.length ?? 0) > 0) {
    included.push(`Interstate permit for ${list(terms!.permitStates!)}`);
  }

  const excluded: string[] = [];
  /*
   * Worded from what the trip actually holds. "Hotels ... not listed above" is
   * correct on a cab-only quote and flatly wrong on a combined one that just
   * listed four nights of them two lines earlier.
   */
  excluded.push(
    (input.alsoIncluded?.length ?? 0) > 0
      ? "Anything not listed above"
      : "Hotels, meals and anything not listed above"
  );
  excluded.push("Entry tickets, guide fees and activity charges");
  if (terms?.extraKmRateMinor != null) {
    excluded.push(
      `Running beyond the included distance, charged at ${formatMinor(terms.extraKmRateMinor)} per km`
    );
  }
  if (!terms?.includesTollParking) excluded.push("Toll and parking charges");
  if ((terms?.permitStates?.length ?? 0) === 0) excluded.push("Interstate permits, where applicable");
  excluded.push("Airfare, train tickets, personal expenses and tips");

  return { title, subtitle, overview, days: documentDays, included, excluded };
}
