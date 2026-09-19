import "server-only";

/**
 * Place name suggestions for the itinerary builder.
 *
 * Typed place names are the weakest link in a measured itinerary. "Cochin
 * Airport" and "Cochin International Airport" are the same place to a person
 * and two different strings to a router; worse, a bare "Munnar" or a misspelt
 * resort name can resolve somewhere plausible but wrong, and the quote that
 * comes out looks perfectly normal. Letting the agent PICK from Google's own
 * list means the string we route on is one Google already recognises.
 *
 * Server-only, and deliberately so: the API key is IP-restricted to the
 * server, so a browser calling Google directly would be rejected — and the key
 * would be in the page source for anyone to take.
 */

const AUTOCOMPLETE_ENDPOINT = "https://places.googleapis.com/v1/places:autocomplete";

/** Below this, suggestions are noise and every keystroke is a billed request. */
export const MIN_QUERY_LENGTH = 3;

export type PlaceSuggestion = {
  /** What goes in the field: "Munnar", "Cochin International Airport". */
  main: string;
  /** Shown beside it to tell two similar places apart: "Kerala, India". */
  secondary: string;
};

export class PlacesError extends Error {}

/**
 * A small in-memory cache.
 *
 * Autocomplete bills per request and agents type the same handful of Kerala
 * place names all day, so the same prefixes recur constantly. This is
 * per-process and forgetful by design — suggestions are not worth a table, and
 * a stale one only ever costs a slightly old list.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: PlaceSuggestion[] }>();

function cacheGet(key: string): PlaceSuggestion[] | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key: string, value: PlaceSuggestion[]) {
  // Oldest-first eviction. Map preserves insertion order, so the first key is
  // the oldest — enough for a cache this size without pulling in an LRU.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

export function usingPlacesStub(): boolean {
  return !process.env.GOOGLE_MAPS_API_KEY && process.env.NODE_ENV !== "production";
}

/**
 * The dev stub. Gated on NODE_ENV so it can never run in production, for the
 * same reason as the distance stub: a fabricated list would be indistinguishable
 * from a real one, and picking from it would silently produce a place name
 * Google has never heard of.
 */
const STUB_PLACES: PlaceSuggestion[] = [
  { main: "Cochin International Airport", secondary: "Nedumbassery, Kerala" },
  { main: "Munnar", secondary: "Kerala, India" },
  { main: "Thekkady", secondary: "Kerala, India" },
  { main: "Alleppey", secondary: "Kerala, India" },
  { main: "Kovalam", secondary: "Kerala, India" },
  { main: "Trivandrum International Airport", secondary: "Kerala, India" },
  { main: "Top Station", secondary: "Munnar, Kerala" },
  { main: "Kanyakumari", secondary: "Tamil Nadu, India" },
  { main: "Madurai", secondary: "Tamil Nadu, India" },
  { main: "Wayanad", secondary: "Kerala, India" },
];

/** Google wraps the useful sentence in {error:{message}}; fall back to raw. */
function extractGoogleMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Not JSON — an HTML error page, or a truncated body.
  }
  return body.slice(0, 200) || "(no detail returned)";
}

export async function suggestPlaces(rawQuery: string): Promise<PlaceSuggestion[]> {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  if (query.length < MIN_QUERY_LENGTH) return [];

  const key = query.toLowerCase();
  const cached = cacheGet(key);
  if (cached) return cached;

  if (usingPlacesStub()) {
    return STUB_PLACES.filter((p) => p.main.toLowerCase().includes(key));
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new PlacesError("GOOGLE_MAPS_API_KEY is not set on this server.");
  }

  const res = await fetch(AUTOCOMPLETE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      input: query,
      // Every trip these agents quote runs inside India. Restricting the
      // region keeps a half-typed "Kov" from offering somewhere in Europe.
      includedRegionCodes: ["in"],
      languageCode: "en",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Google's own message is included verbatim, because the two causes of a
    // 403 need opposite fixes and only Google can tell them apart: "has not
    // been used in project ... or it is disabled" means enable the API, while
    // "not authorized to use this service" means the API is enabled but this
    // KEY still restricts itself to the other one. A generic message sends
    // whoever reads the log to the wrong screen.
    throw new PlacesError(
      res.status === 403 || res.status === 401
        ? `Google rejected the key for Places (HTTP ${res.status}). Either enable the Places API (New), or add it to the key's API restrictions — Google says: ${extractGoogleMessage(body)}`
        : `Places lookup failed (HTTP ${res.status}). ${body.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }[];
  };

  const out: PlaceSuggestion[] = [];
  for (const s of data.suggestions ?? []) {
    const p = s.placePrediction;
    if (!p) continue;
    // Prefer the structured main text: it is the name a person would write.
    // The full `text` carries the whole formatted address, which would make
    // every itinerary line and quote unreadable.
    const main = p.structuredFormat?.mainText?.text ?? p.text?.text;
    if (!main) continue;
    out.push({ main, secondary: p.structuredFormat?.secondaryText?.text ?? "" });
  }

  cacheSet(key, out);
  return out;
}
