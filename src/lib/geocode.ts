import "server-only";

/**
 * Which states a road actually passes through.
 *
 * A permit is due for a state you DRIVE THROUGH, not only one you stop in.
 * Kochi to Bangalore names no Tamil Nadu stop and crosses Tamil Nadu for most
 * of its length — and an agent outside South India has no way of knowing that,
 * which is exactly why this cannot be a tick box on the quote form.
 *
 * So the route's own polyline is sampled and each sample reverse-geocoded.
 * Expensive once, then cached with the distance for good: the road between two
 * places does not change.
 */

const GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * How far apart the samples are.
 *
 * 20 km is short enough that a state cannot be crossed between two samples on
 * any road worth quoting — the narrowest stretch of Tamil Nadu a Kerala route
 * clips is far wider than that — and long enough that a 600 km route costs
 * about thirty lookups rather than hundreds.
 */
const SAMPLE_EVERY_KM = 20;

/** A hard ceiling, so one absurd itinerary cannot run up a geocoding bill. */
const MAX_SAMPLES = 40;

export type LatLng = { lat: number; lng: number };

/**
 * Decodes Google's encoded polyline.
 *
 * The algorithm is Google's own and unchanged for years; it is implemented
 * here rather than pulled in as a dependency because it is twenty lines and
 * the alternative is another package to keep current.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const axis of ["lat", "lng"] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "lat") lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** Great-circle distance in km. Accurate enough to space samples by. */
function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Points along the route, roughly `SAMPLE_EVERY_KM` apart.
 *
 * Both ENDS are always included. A short hop that never reaches the sampling
 * interval would otherwise contribute no samples at all and look like it
 * crossed nowhere.
 */
export function samplePath(points: readonly LatLng[]): LatLng[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];

  const out: LatLng[] = [points[0]];
  let since = 0;

  for (let i = 1; i < points.length; i++) {
    since += haversineKm(points[i - 1], points[i]);
    if (since >= SAMPLE_EVERY_KM) {
      out.push(points[i]);
      since = 0;
      if (out.length >= MAX_SAMPLES - 1) break;
    }
  }

  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Google's spelling of a state, normalised to ours.
 *
 * Only the cases that actually differ. Anything unrecognised is returned as
 * Google gave it — a state we have never seen must still surface, because a
 * permit we cannot name is one we would otherwise fail to charge.
 */
const STATE_ALIASES: Record<string, string> = {
  tamilnadu: "Tamil Nadu",
  "tamil nadu": "Tamil Nadu",
  kerala: "Kerala",
  karnataka: "Karnataka",
  "andhra pradesh": "Andhra Pradesh",
  puducherry: "Puducherry",
  pondicherry: "Puducherry",
  goa: "Goa",
  telangana: "Telangana",
};

export function normaliseState(raw: string): string {
  return STATE_ALIASES[raw.trim().toLowerCase()] ?? raw.trim();
}

export class GeocodeError extends Error {}

async function stateAt(point: LatLng, apiKey: string): Promise<string | null> {
  const url =
    `${GEOCODE_ENDPOINT}?latlng=${point.lat},${point.lng}` +
    `&result_type=administrative_area_level_1&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new GeocodeError(`Geocoding failed (HTTP ${res.status}).`);

  const data = (await res.json()) as {
    status?: string;
    error_message?: string;
    results?: { address_components?: { long_name?: string; types?: string[] }[] }[];
  };

  // ZERO_RESULTS is ordinary — a point at sea, or a gap in coverage. Anything
  // else is a real failure and must not be mistaken for "crossed nowhere".
  if (data.status === "ZERO_RESULTS") return null;
  if (data.status && data.status !== "OK") {
    throw new GeocodeError(
      `Geocoding rejected the request (${data.status}). ${data.error_message ?? ""}`.trim()
    );
  }

  for (const result of data.results ?? []) {
    for (const component of result.address_components ?? []) {
      if (component.types?.includes("administrative_area_level_1") && component.long_name) {
        return normaliseState(component.long_name);
      }
    }
  }
  return null;
}

/**
 * Every state the given route passes through.
 *
 * Throws rather than returning an empty set when geocoding is unavailable.
 * An empty set means "this road crosses no other state", which is a claim;
 * silence about a failure would turn a missing permit into a confident zero.
 */
export async function statesAlongRoute(encodedPolyline: string): Promise<string[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new GeocodeError("GOOGLE_MAPS_API_KEY is not set, so route states cannot be checked.");
  }

  const samples = samplePath(decodePolyline(encodedPolyline));
  const states = new Set<string>();

  for (const point of samples) {
    const state = await stateAt(point, apiKey);
    if (state) states.add(state);
  }

  return [...states].sort();
}
