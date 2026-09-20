import { NextResponse } from "next/server";
import { getAgent } from "@/lib/auth";
import { photosForDownload, isPhotoKind } from "@/lib/product-photos";
import { createZip, zipSafeName } from "@/lib/zip";

export const dynamic = "force-dynamic";

/**
 * Every photograph of one product, as a zip.
 *
 * Agents send these to their own customers, and doing that one right-click at
 * a time across five vehicle photographs is the kind of friction that means it
 * does not get done.
 *
 * A route handler is its own entry point, so the session is checked here.
 * `kind` comes from the URL and is validated against the known list rather
 * than trusted — it selects a database column further down.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const agent = await getAgent();
  if (!agent) return new NextResponse("Not authorised", { status: 401 });

  const { kind, id } = await params;
  if (!isPhotoKind(kind)) return new NextResponse("Unknown product type", { status: 400 });

  const { productName, files } = await photosForDownload(kind, id);
  if (files.length === 0) return new NextResponse("No photos", { status: 404 });

  const zip = createZip(files);
  const filename = zipSafeName(`${productName} photos.zip`);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Built per request from files that can change in the admin, and it is
      // one agency's download — never a shared cache.
      "Cache-Control": "private, no-store",
    },
  });
}
