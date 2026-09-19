import "server-only";
import { prisma } from "./db";
import type { DistanceSource } from "./enums";

/**
 * Road distances between the places on an agent's itinerary.
 *
 * A vehicle quote is a distance problem before it is a pricing problem, and
 * until now the agent typed the kilometres themselves. Typed distances are
 * guesses, they vary between agents quoting the identical trip, and they are
 * the one input nobody can check after the fact.
 *
 * Everything here is server-only. The API key must never reach the browser,
 * so routing happens while the quote page renders and the agent only ever
 * sees the resulting kilometres.
 */

const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Cheap insurance against a typo turning into an unbounded API bill. */
const MAX_HOPS = 60;

// ---------------------------------------------------------------------------
// Place normalisation
// ---------------------------------------------------------------------------

/**
 * The cache key for a place.
 *
 * Case and spacing are meaningless to a router but fatal to a cache: "Munnar"
 * and "munnar " would be two rows, two API calls, and two chances to disagree.
 * Both the cache key and the string sent to Google come from here, so they can
 * never drift apart.
 */
export function normalisePlace(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * What is actually sent to Google.
 *
 * Bare Indian town names are ambiguous worldwide — there is more than one
 * Palakkad-sounding place on Earth, and a router asked for "Munnar" with no
 * country can answer with confidence about the wrong one. Appending the
 * country costs nothing and removes the whole class of error. Addresses that
 * already name India are left alone so a full garage address is not mangled.
 */
export function routableAddress(raw: string): string {
  const place = raw.trim().replace(/\s+/g, " ");
  if (/\bindia\b/i.test(place)) return place;
  return `${place}, India`;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * Metres to billable kilometres.
 *
 * Rounded UP, and only ever at the very end of a sum. A hire is billed in
 * whole kilometres and the operator does not absorb the remainder; rounding
 * each hop separately would also drift by several km across a long itinerary,
 * which is exactly why the cache stores metres.
 */
export function metersToKm(meters: number): number {
  return Math.ceil(meters / 1000);
}

// ---------------------------------------------------------------------------
// One hop
// ---------------------------------------------------------------------------

export type Hop = {
  /** Human label for the quote, e.g. "Cochin garage → Cochin Airport". */
  label: string;
  origin: string;
  destination: string;
};

/**
 * Where a hop's distance came from.
 *
 * Wider than the persisted DistanceSource because a stub distance is neither
 * measured nor typed by a person, and calling it either would be a lie told to
 * whoever reads the quote. It is never written to the cache, so the column's
 * own enum stays honest about what it can hold.
 */
export type HopSource = DistanceSource | "STUB";

export type HopResult = Hop & {
  meters: number;
  seconds: number;
  source: HopSource;
};

export type HopFailure = Hop & { error: string };

export class DistanceError extends Error {}

/**
 * True when routing will run against the fabricated stub below rather than
 * against Google. Screens use this to say so out loud.
 */
export function usingDistanceStub(): boolean {
  return !process.env.GOOGLE_MAPS_API_KEY && process.env.NODE_ENV !== "production";
}

/**
 * The dev stub.
 *
 * Local development has no Google billing account attached, and the whole
 * itinerary flow is unbuildable without SOME distance coming back. This
 * invents one from a hash of the two place names, so it is at least stable:
 * the same pair always returns the same number, which keeps tests and repeat
 * renders from disagreeing with each other.
 *
 * Gated on NODE_ENV so it can NEVER run in production. A stub quietly
 * inventing road distances on the live site would put a confidently wrong
 * number on a real customer's quote, which is far worse than an error message.
 */
function stubDistance(origin: string, destination: string): { meters: number; seconds: number } {
  const key = `${normalisePlace(origin)}|${normalisePlace(destination)}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  // 25–325 km, which spans the range of a real Kerala itinerary hop.
  const km = 25 + (hash % 300);
  return { meters: km * 1000, seconds: Math.round((km / 45) * 3600) };
}

/**
 * Ask Google for one distance.
 *
 * TRAFFIC_UNAWARE is deliberate. A quote is for a trip weeks away, so
 * this-minute traffic is noise — and worse, it is noise that would make the
 * same itinerary quote differently depending on when the agent pressed the
 * button. Typical road distance is both the right number and a stable one.
 */
async function fetchFromGoogle(
  origin: string,
  destination: string,
  apiKey: string
): Promise<{ meters: number; seconds: number }> {
  const res = await fetch(ROUTES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Routes API bills by the fields requested, so ask for only these two.
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: { address: routableAddress(origin) },
      destination: { address: routableAddress(destination) },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "METRIC",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DistanceError(
      res.status === 403 || res.status === 401
        ? "Google rejected the API key. Check GOOGLE_MAPS_API_KEY and that the Routes API is enabled for it."
        : `Google could not route this leg (HTTP ${res.status}). ${body.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as {
    routes?: { distanceMeters?: number; duration?: string }[];
  };
  const route = data.routes?.[0];
  if (!route || typeof route.distanceMeters !== "number") {
    throw new DistanceError(
      "Google found no driving route between these two places. Check the spelling, or enter the distance by hand."
    );
  }

  // duration arrives as a protobuf duration string: "12345s".
  const seconds = Number.parseInt(route.duration ?? "0", 10);

  return {
    meters: route.distanceMeters,
    seconds: Number.isFinite(seconds) ? seconds : 0,
  };
}

/**
 * One hop, cache first.
 *
 * The cache is not an optimisation bolted on afterwards — it is what keeps a
 * busy quoting day from becoming a Routes API bill, since every agent quoting
 * Cochin → Munnar is asking about the same road.
 */
export async function routeOne(origin: string, destination: string): Promise<HopResult> {
  const o = normalisePlace(origin);
  const d = normalisePlace(destination);

  if (o === "" || d === "") {
    throw new DistanceError("A leg is missing a place name.");
  }

  // Same place, no distance. Worth short-circuiting: a day spent entirely at
  // one stop is normal, and it should cost nothing to quote.
  if (o === d) {
    return { label: "", origin, destination, meters: 0, seconds: 0, source: "GOOGLE" };
  }

  // Checked before the cache, not after. The stub writes nothing and reads
  // nothing, so making it depend on a table existing would only mean local
  // development breaks for a reason that has nothing to do with the stub.
  if (usingDistanceStub()) {
    return { label: "", origin, destination, ...stubDistance(origin, destination), source: "STUB" };
  }

  const cached = await prisma.roadDistance.findUnique({
    where: { origin_destination: { origin: o, destination: d } },
  });
  if (cached) {
    return {
      label: "",
      origin,
      destination,
      meters: cached.meters,
      seconds: cached.seconds,
      source: cached.source as DistanceSource,
    };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  let measured: { meters: number; seconds: number };

  if (apiKey) {
    measured = await fetchFromGoogle(origin, destination, apiKey);
  } else {
    throw new DistanceError(
      "GOOGLE_MAPS_API_KEY is not set on this server, so distances cannot be calculated. Add it to .env.production and restart."
    );
  }

  await prisma.roadDistance.upsert({
    where: { origin_destination: { origin: o, destination: d } },
    create: { origin: o, destination: d, ...measured, source: "GOOGLE" },
    update: { ...measured, source: "GOOGLE" },
  });

  return { label: "", origin, destination, ...measured, source: "GOOGLE" };
}

/**
 * Route a whole itinerary.
 *
 * A failed hop is REPORTED, not thrown. One unroutable place name must not
 * cost the agent the other nine legs they just typed — they can correct the
 * spelling, or type that one distance by hand, and keep everything else. This
 * is the same rule the combined-trip cart already follows.
 */
export async function routeHops<T extends Hop>(
  hops: readonly T[]
): Promise<{ results: (T & HopResult)[]; failures: (T & { error: string })[] }> {
  if (hops.length > MAX_HOPS) {
    throw new DistanceError(`That itinerary has ${hops.length} legs, which is more than this can route.`);
  }

  const results: (T & HopResult)[] = [];
  const failures: (T & { error: string })[] = [];

  // Sequential on purpose. Cache writes for repeated hops within one itinerary
  // would race each other in parallel, and an itinerary is short enough that
  // the latency does not matter.
  for (const hop of hops) {
    try {
      const r = await routeOne(hop.origin, hop.destination);
      results.push({ ...hop, ...r, label: hop.label });
    } catch (e) {
      if (!(e instanceof DistanceError)) {
        console.error(`[distance] ${hop.origin} → ${hop.destination}:`, e);
      }
      failures.push({
        ...hop,
        error:
          e instanceof DistanceError
            ? e.message
            : "Could not measure this leg. The problem has been logged; enter the distance by hand to carry on.",
      });
    }
  }

  return { results, failures };
}
