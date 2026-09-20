import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "./db";
import { readUpload, UploadError } from "./uploads";

/**
 * Serving a vehicle photograph.
 *
 * The bytes live on disk under UPLOAD_DIR, never under public/ — the same
 * storage every other upload uses, so they survive a container rebuild with
 * the database and are picked up by `deploy/backup.sh`.
 *
 * This function does NOT check a session. It is the file-reading half, shared
 * by the two route handlers so there is one place that knows how a photo is
 * stored; each handler decides who may call it, because a route handler is its
 * own entry point and the layouts do not run for it.
 *
 * Unlike an agent's logo the id comes from the URL here, and that is fine: a
 * vehicle is shared catalogue, not one agency's property. There is nothing to
 * learn by guessing an id that the vehicle dropdown does not already show.
 */
export async function vehiclePhotoResponse(vehicleId: string): Promise<NextResponse> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { photoStoredName: true, photoMimeType: true },
  });
  if (!vehicle?.photoStoredName || !vehicle.photoMimeType) {
    return new NextResponse("No photo", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readUpload(vehicle.photoStoredName);
  } catch (e) {
    // A row pointing at a file that is no longer on disk. A missing photo must
    // never be a 500 — the page around it has a quote to render.
    if (e instanceof UploadError) return new NextResponse("Not found", { status: 404 });
    throw e;
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": vehicle.photoMimeType,
      "Content-Length": String(bytes.byteLength),
      // The same photo for every agency, but still behind a session, so it
      // must not land in a shared cache. Short, so replacing a photo in the
      // admin shows up without anyone clearing anything.
      "Cache-Control": "private, max-age=300",
    },
  });
}
