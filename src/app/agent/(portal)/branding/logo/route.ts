import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAgent } from "@/lib/auth";
import { readUpload, UploadError } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Serves the signed-in agency its OWN logo.
 *
 * Nothing is written under public/, so this is the only read path — the same
 * rule the identity documents follow, for a different reason: not secrecy, but
 * that one agency must never be able to fetch another's branding by guessing a
 * filename. The agent id comes from the session, never from the URL, so there
 * is no id to tamper with.
 */
export async function GET() {
  const agent = await getAgent();
  if (!agent) return new NextResponse("Not authorised", { status: 401 });

  const row = await prisma.agent.findUnique({
    where: { id: agent.id },
    select: { logoStoredName: true, logoMimeType: true },
  });
  if (!row?.logoStoredName || !row.logoMimeType) {
    return new NextResponse("No logo", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readUpload(row.logoStoredName);
  } catch (e) {
    if (e instanceof UploadError) return new NextResponse("Not found", { status: 404 });
    throw e;
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.logoMimeType,
      "Content-Length": String(bytes.byteLength),
      // Private: a logo is not secret, but it is one agency's and should not
      // sit in a shared cache keyed only by URL — every agency uses this path.
      "Cache-Control": "private, max-age=300",
    },
  });
}
