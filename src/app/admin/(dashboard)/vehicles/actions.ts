"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { storeUpload, discardUploads, isImage, UploadError } from "@/lib/uploads";
import {
  vehicleSchema,
  vehicleRateSchema,
  formObject,
  toFormState,
  type FormState,
} from "@/lib/validation";

async function requireAdmin() {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
}

export async function createVehicle(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = vehicleSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const vehicle = await prisma.vehicle.create({ data: parsed.data });
  revalidatePath("/admin/vehicles");
  redirect(`/admin/vehicles/${vehicle.id}?created=1`);
}

export async function updateVehicle(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = vehicleSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.vehicle.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/vehicles");
  revalidatePath(`/admin/vehicles/${id}`);
  return { ok: true, message: "Vehicle saved." };
}

export async function createVehicleRate(
  vehicleId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const parsed = vehicleRateSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.vehicleRate.create({ data: { ...parsed.data, vehicleId } });
  revalidatePath(`/admin/vehicles/${vehicleId}`);
  return { ok: true, message: "Rate added." };
}

export async function updateVehicleRate(
  rateId: string,
  vehicleId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const parsed = vehicleRateSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.vehicleRate.update({ where: { id: rateId }, data: parsed.data });
  revalidatePath(`/admin/vehicles/${vehicleId}`);
  return { ok: true, message: "Rate saved." };
}

export async function archiveVehicleRate(rateId: string, vehicleId: string) {
  await requireAdmin();
  await prisma.vehicleRate.update({ where: { id: rateId }, data: { active: false } });
  revalidatePath(`/admin/vehicles/${vehicleId}`);
}

export async function restoreVehicleRate(rateId: string, vehicleId: string) {
  await requireAdmin();
  await prisma.vehicleRate.update({ where: { id: rateId }, data: { active: true } });
  revalidatePath(`/admin/vehicles/${vehicleId}`);
}

// ---------------------------------------------------------------------------
// Photographs
// ---------------------------------------------------------------------------

/**
 * The picture of the vehicle an agent sees while quoting.
 *
 * Shown inside the PORTAL only — never on the customer's PDF. That document
 * carries the agency's own branding and nothing of ours, and a supplier's
 * vehicle photograph on their letterhead is precisely what it exists to keep
 * off. Confirmed with Sonet, 20 Sept 2026.
 */
export async function uploadVehiclePhoto(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a photograph to upload." };
  }

  let stored;
  try {
    stored = await storeUpload(file, "Photo");
  } catch (e) {
    return { ok: false, message: e instanceof UploadError ? e.message : "Could not read that file." };
  }

  // storeUpload also accepts PDFs — right for identity documents, wrong here:
  // a PDF cannot go in an <img>.
  if (!isImage(stored.mimeType)) {
    await discardUploads([stored.storedName]);
    return { ok: false, message: "The photograph must be an image — JPG, PNG or WEBP." };
  }

  /*
   * The file is on disk before any of this runs, so every path out of here
   * that does not end with the row pointing at it has to clean it up —
   * including an unexpected throw. A failed upload that silently leaves bytes
   * in UPLOAD_DIR is a directory that only ever grows, and nothing points at
   * them to say which vehicle they were meant for.
   */
  let previous: { photoStoredName: string | null } | null;
  try {
    previous = await prisma.vehicle.findUnique({
      where: { id },
      select: { photoStoredName: true },
    });
    if (!previous) {
      await discardUploads([stored.storedName]);
      return { ok: false, message: "That vehicle no longer exists." };
    }

    await prisma.vehicle.update({
      where: { id },
      data: { photoStoredName: stored.storedName, photoMimeType: stored.mimeType },
    });
  } catch (e) {
    await discardUploads([stored.storedName]);
    throw e;
  }

  // Only after the row points at the new file. Deleting first would leave the
  // vehicle with no photograph at all if the write failed.
  if (previous.photoStoredName) await discardUploads([previous.photoStoredName]);

  revalidatePath(`/admin/vehicles/${id}`);
  return { ok: true, message: "Photograph saved. Agents will see it while quoting this vehicle." };
}

export async function removeVehiclePhoto(id: string): Promise<void> {
  await requireAdmin();

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    select: { photoStoredName: true },
  });

  await prisma.vehicle.update({
    where: { id },
    data: { photoStoredName: null, photoMimeType: null },
  });
  if (vehicle?.photoStoredName) await discardUploads([vehicle.photoStoredName]);

  revalidatePath(`/admin/vehicles/${id}`);
}
