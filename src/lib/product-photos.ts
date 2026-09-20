import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "./db";
import { storeUpload, discardUploads, isImage, readUpload, UploadError } from "./uploads";
import type { PhotoKind } from "./quote-types";
import { zipSafeName } from "./zip";

/**
 * Photographs of catalogue products, shown to AGENTS inside the portal.
 *
 * Never on the customer's PDF. That document carries the agency's branding and
 * nothing of ours, and our photographs on their letterhead tell their customer
 * exactly who the supplier is. Confirmed with Sonet, 20 Sept 2026.
 *
 * This module is the ONLY write path, which is what makes the two invariants
 * SQLite cannot express hold: that exactly one parent column is set, and that
 * the per-product limit is respected. Adding a second write path breaks both
 * guarantees at once — the same reasoning as src/lib/validation.ts.
 */

/*
 * The type lives in quote-types.ts, which has no server-only import, so a
 * client component can name a kind. This list `satisfies` it, so the two can
 * never drift apart without a compile error.
 */
export const PHOTO_KIND = ["vehicle", "hotel", "houseboat"] as const satisfies readonly PhotoKind[];
export type { PhotoKind };

/**
 * How many photographs each product may carry. Sonet, 20 Sept 2026: five for a
 * vehicle, ten for a hotel or houseboat.
 *
 * A vehicle is one object photographed from a few angles; a property has rooms,
 * a pool, a restaurant and a view. The numbers reflect that, and they are the
 * reason this is a table rather than one figure.
 */
export const PHOTO_LIMIT: Record<PhotoKind, number> = {
  vehicle: 5,
  hotel: 10,
  houseboat: 10,
};

export function isPhotoKind(value: string): value is PhotoKind {
  return (PHOTO_KIND as readonly string[]).includes(value);
}

/**
 * The one place that turns a kind into a column.
 *
 * Every query and every write goes through this, so "exactly one parent is
 * set" is true by construction rather than by everyone remembering.
 */
function parentWhere(kind: PhotoKind, id: string) {
  switch (kind) {
    case "vehicle":
      return { vehicleId: id };
    case "hotel":
      return { hotelId: id };
    case "houseboat":
      return { houseboatId: id };
  }
}

export type ProductPhotoRow = {
  id: string;
  sortOrder: number;
};

/** A product's photographs, cover first. */
export async function listPhotos(kind: PhotoKind, id: string): Promise<ProductPhotoRow[]> {
  return prisma.productPhoto.findMany({
    where: parentWhere(kind, id),
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, sortOrder: true },
  });
}

/** Just the ids, cover first — what the gallery components take. */
export async function listPhotoIds(kind: PhotoKind, id: string): Promise<string[]> {
  return (await listPhotos(kind, id)).map((p) => p.id);
}

/**
 * Photo ids for SEVERAL products of one kind, in one query.
 *
 * The vehicle picker offers every vehicle at a depot and has to know which
 * pictures each one has before the agent chooses. One query rather than one
 * per vehicle.
 */
export async function listPhotoIdsFor(
  kind: PhotoKind,
  ids: readonly string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (ids.length === 0) return out;

  const column = kind === "vehicle" ? "vehicleId" : kind === "hotel" ? "hotelId" : "houseboatId";
  const rows = await prisma.productPhoto.findMany({
    where: { [column]: { in: [...ids] } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, vehicleId: true, hotelId: true, houseboatId: true },
  });

  for (const row of rows) {
    const parent = row.vehicleId ?? row.hotelId ?? row.houseboatId;
    if (!parent) continue;
    const list = out.get(parent);
    if (list) list.push(row.id);
    else out.set(parent, [row.id]);
  }
  return out;
}

export class PhotoError extends Error {}

/**
 * Adds photographs, refusing the whole batch if it would exceed the limit.
 *
 * WHOLE BATCH, deliberately. Accepting the first two of four and silently
 * dropping the rest looks like an upload that worked — and the admin has no
 * way to tell which two are missing. Better to say "you have room for two"
 * and let them choose.
 *
 * Files are stored one at a time and every one already written is discarded if
 * a later one is rejected, so a failed batch leaves nothing behind in
 * UPLOAD_DIR. An orphan there has nothing pointing at it and no way to tell
 * which product it was meant for.
 */
export async function addPhotos(
  kind: PhotoKind,
  id: string,
  files: readonly File[]
): Promise<number> {
  const real = files.filter((f) => f instanceof File && f.size > 0);
  if (real.length === 0) throw new PhotoError("Choose at least one photograph to upload.");

  const limit = PHOTO_LIMIT[kind];
  const existing = await listPhotos(kind, id);
  const room = limit - existing.length;
  if (room <= 0) {
    throw new PhotoError(
      `This ${kind} already has the maximum of ${limit} photographs. Remove one first.`
    );
  }
  if (real.length > room) {
    throw new PhotoError(
      `Room for ${room} more photograph${room === 1 ? "" : "s"} — the limit is ${limit} per ${kind}, and this one has ${existing.length}.`
    );
  }

  const stored: string[] = [];
  try {
    let next = existing.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;
    for (const file of real) {
      const upload = await storeUpload(file, "Photograph");
      stored.push(upload.storedName);

      // storeUpload also accepts PDFs — right for identity documents, wrong
      // here: a PDF cannot go in an <img>.
      if (!isImage(upload.mimeType)) {
        throw new PhotoError(
          `${upload.originalName} is not an image — photographs must be JPG, PNG or WEBP.`
        );
      }

      await prisma.productPhoto.create({
        data: {
          storedName: upload.storedName,
          mimeType: upload.mimeType,
          sortOrder: next++,
          ...parentWhere(kind, id),
        },
      });
    }
  } catch (e) {
    /*
     * Every file written by this call goes, including ones whose rows were
     * already created — those rows are removed first. A half-applied batch is
     * worse than a refused one: the admin sees an error and three new
     * photographs, and cannot tell whether to retry.
     */
    await prisma.productPhoto.deleteMany({ where: { storedName: { in: stored } } });
    await discardUploads(stored);
    if (e instanceof PhotoError || e instanceof UploadError) {
      throw new PhotoError(e.message);
    }
    throw e;
  }

  return real.length;
}

/** Removes one photograph and the file behind it. */
export async function removePhoto(photoId: string): Promise<void> {
  const photo = await prisma.productPhoto.findUnique({
    where: { id: photoId },
    select: { storedName: true },
  });
  if (!photo) return;

  await prisma.productPhoto.delete({ where: { id: photoId } });
  // After the row is gone, never before: a file deleted while a row still
  // points at it is a broken picture with no way to fix it from the admin.
  await discardUploads([photo.storedName]);
}

/**
 * Makes one photograph the cover.
 *
 * Moves it BELOW the current minimum rather than renumbering the whole set —
 * one update instead of N, and no window in which two photographs share a
 * sortOrder.
 */
export async function makeCover(photoId: string): Promise<void> {
  const photo = await prisma.productPhoto.findUnique({
    where: { id: photoId },
    select: { vehicleId: true, hotelId: true, houseboatId: true },
  });
  if (!photo) return;

  const parent = photo.vehicleId
    ? { vehicleId: photo.vehicleId }
    : photo.hotelId
      ? { hotelId: photo.hotelId }
      : { houseboatId: photo.houseboatId };

  const lowest = await prisma.productPhoto.findFirst({
    where: parent,
    orderBy: { sortOrder: "asc" },
    select: { sortOrder: true },
  });

  await prisma.productPhoto.update({
    where: { id: photoId },
    data: { sortOrder: (lowest?.sortOrder ?? 0) - 1 },
  });
}

/**
 * A product's photographs WITH their bytes and a human filename.
 *
 * Used for downloads, where the agent is going to send these on to their own
 * customer and "0a835346-6192-4105-b94c-b7d08b55ce2f.jpg" is not something to
 * put in front of one.
 */
export async function photosForDownload(
  kind: PhotoKind,
  id: string
): Promise<{ productName: string; files: { name: string; data: Buffer }[] }> {
  const where = parentWhere(kind, id);

  const [product, photos] = await Promise.all([
    kind === "vehicle"
      ? prisma.vehicle.findUnique({ where: { id }, select: { type: true } })
      : kind === "hotel"
        ? prisma.hotel.findUnique({ where: { id }, select: { name: true } })
        : prisma.houseboat.findUnique({ where: { id }, select: { name: true } }),
    prisma.productPhoto.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { storedName: true, mimeType: true },
    }),
  ]);

  const productName =
    (product && ("type" in product ? product.type : product.name)) || "photos";

  const files: { name: string; data: Buffer }[] = [];
  let n = 0;
  for (const photo of photos) {
    n += 1;
    try {
      const data = await readUpload(photo.storedName);
      const ext = EXTENSION[photo.mimeType] ?? ".jpg";
      files.push({ name: zipSafeName(`${productName} ${n}${ext}`), data });
    } catch (e) {
      // A row pointing at a file that is gone must not cost the agent the
      // other four photographs. Skipped, and the bundle says how many it has.
      if (!(e instanceof UploadError)) throw e;
    }
  }

  return { productName, files };
}

/** Extension per stored type, so a download opens in the right thing. */
const EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/** One photograph's filename, for a single download. */
export async function photoDownloadName(photoId: string): Promise<string | null> {
  const photo = await prisma.productPhoto.findUnique({
    where: { id: photoId },
    select: {
      mimeType: true,
      sortOrder: true,
      vehicle: { select: { id: true, type: true } },
      hotel: { select: { id: true, name: true } },
      houseboat: { select: { id: true, name: true } },
    },
  });
  if (!photo) return null;

  const parent = photo.vehicle ?? photo.hotel ?? photo.houseboat;
  if (!parent) return null;
  const name = "type" in parent ? parent.type : parent.name;

  // Its position among its siblings, so a set downloaded one at a time does
  // not arrive as five files with the same name.
  const kind: PhotoKind = photo.vehicle ? "vehicle" : photo.hotel ? "hotel" : "houseboat";
  const siblings = await listPhotos(kind, parent.id);
  const index = siblings.findIndex((s) => s.sortOrder === photo.sortOrder) + 1;

  return zipSafeName(`${name} ${index || 1}${EXTENSION[photo.mimeType] ?? ".jpg"}`);
}

/**
 * Serves one photograph's bytes.
 *
 * Does NOT check a session — it is the file-reading half, shared by the agent
 * and admin route handlers so there is one place that knows how a photograph
 * is stored. Each handler decides who may ask, because a route handler is its
 * own entry point and no layout runs for it.
 */
export async function photoResponse(
  photoId: string,
  /** True serves it as a download — the agent sends these on to a customer. */
  download = false
): Promise<NextResponse> {
  const photo = await prisma.productPhoto.findUnique({
    where: { id: photoId },
    select: { storedName: true, mimeType: true },
  });
  if (!photo) return new NextResponse("No photo", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readUpload(photo.storedName);
  } catch (e) {
    // A row pointing at a file no longer on disk. A missing photograph must
    // never be a 500 — the page around it has a quote to render.
    if (e instanceof UploadError) return new NextResponse("Not found", { status: 404 });
    throw e;
  }

  const filename = download ? await photoDownloadName(photoId) : null;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(bytes.byteLength),
      ...(filename
        ? { "Content-Disposition": `attachment; filename="${filename}"` }
        : {}),
      /*
       * Immutable: the URL is the photograph's own id, and replacing a picture
       * creates a new row with a new id rather than new bytes behind an old
       * one. Nothing to invalidate, so it can be cached hard. Still private —
       * it sits behind a session.
       */
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
