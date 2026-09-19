import { NextResponse } from "next/server";
import { getAgent } from "@/lib/auth";
import { suggestPlaces, PlacesError, MIN_QUERY_LENGTH } from "@/lib/places";

export const dynamic = "force-dynamic";

/**
 * Place suggestions for the itinerary builder.
 *
 * A route handler is its own entry point — the portal layout does not run for
 * it — so the agent session is re-checked here. Without that this would be an
 * open proxy onto a billed Google API.
 *
 * getAgent() rather than requireAgent(): the latter redirects to the sign-in
 * page, which a fetch() would follow and then try to parse as JSON.
 */
export async function GET(request: Request) {
  const agent = await getAgent();
  if (!agent) return NextResponse.json({ suggestions: [] }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    return NextResponse.json({ suggestions: await suggestPlaces(query) });
  } catch (e) {
    // Suggestions are an accuracy aid, never a gate. If Google is unreachable
    // or the key lacks the Places API, the agent must still be able to type a
    // place name and get a quote — so this reports empty rather than failing.
    console.error("[places]", e instanceof PlacesError ? e.message : e);
    return NextResponse.json({ suggestions: [], unavailable: true });
  }
}
