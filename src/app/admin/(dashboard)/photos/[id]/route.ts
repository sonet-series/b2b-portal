import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";
import { photoResponse } from "@/lib/product-photos";

export const dynamic = "force-dynamic";

/**
 * The same photograph, for the admin.
 *
 * A separate handler rather than one taking either session: the two audiences
 * are separate on purpose throughout this app, and an "any signed-in user"
 * check is the kind of thing that quietly widens later. Only the question of
 * who may ask differs; the file reading is shared.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return new NextResponse("Not authorised", { status: 401 });

  const { id } = await params;
  return photoResponse(id);
}
