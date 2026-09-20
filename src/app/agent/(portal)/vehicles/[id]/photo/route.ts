import { NextResponse } from "next/server";
import { getAgent } from "@/lib/auth";
import { vehiclePhotoResponse } from "@/lib/vehicle-photo";

export const dynamic = "force-dynamic";

/**
 * A vehicle photograph, for a signed-in agent.
 *
 * A route handler is its own entry point — the portal layout does not run for
 * it — so the session is checked here. Nothing is written under public/, so
 * this is the only read path.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await getAgent();
  if (!agent) return new NextResponse("Not authorised", { status: 401 });

  const { id } = await params;
  return vehiclePhotoResponse(id);
}
