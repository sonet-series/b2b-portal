import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";
import { vehiclePhotoResponse } from "@/lib/vehicle-photo";

export const dynamic = "force-dynamic";

/**
 * The same photograph, for the admin.
 *
 * A separate handler rather than a shared one taking either session: the two
 * audiences are separate on purpose throughout this app, and an "any signed-in
 * user" check is the kind of thing that quietly widens later. The file-reading
 * half is shared; only the question of who may ask differs.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return new NextResponse("Not authorised", { status: 401 });

  const { id } = await params;
  return vehiclePhotoResponse(id);
}
