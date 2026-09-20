import { NextResponse } from "next/server";
import { getAgent } from "@/lib/auth";
import { photoResponse } from "@/lib/product-photos";

export const dynamic = "force-dynamic";

/**
 * A catalogue photograph, for a signed-in agent.
 *
 * A route handler is its own entry point — the portal layout does not run for
 * it — so the session is checked here. Nothing is written under public/, so
 * this is the only read path.
 *
 * Keyed by the PHOTOGRAPH's id, not the product's. That is what lets the
 * response be cached immutably: replacing a picture creates a new row with a
 * new id rather than new bytes behind an old URL, so there is nothing to
 * invalidate.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await getAgent();
  if (!agent) return new NextResponse("Not authorised", { status: 401 });

  const { id } = await params;
  return photoResponse(id);
}
