"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth";
import { addPhotos, removePhoto, makeCover, isPhotoKind, PhotoError } from "@/lib/product-photos";
import type { FormState } from "@/lib/validation";

/*
 * Photograph management, for all three catalogue types.
 *
 * Server actions are their own entry point — the dashboard layout does not run
 * for them — so every one of these re-checks the admin session itself.
 */
async function requireAdmin() {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
}

/** Where to revalidate after a change. Derived, so a new kind cannot forget. */
function pathFor(kind: string, id: string): string {
  const segment = kind === "vehicle" ? "vehicles" : kind === "hotel" ? "hotels" : "houseboats";
  return `/admin/${segment}/${id}`;
}

export async function uploadPhotos(
  kind: string,
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  if (!isPhotoKind(kind)) return { ok: false, message: "Unknown product type." };

  // getAll: the input is multiple, and one at a time would make uploading ten
  // hotel photographs ten round trips.
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File);

  try {
    const added = await addPhotos(kind, id, files);
    revalidatePath(pathFor(kind, id));
    return {
      ok: true,
      message: `${added} photograph${added === 1 ? "" : "s"} added. Agents will see them while quoting.`,
    };
  } catch (e) {
    if (e instanceof PhotoError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function deletePhoto(kind: string, id: string, photoId: string): Promise<void> {
  await requireAdmin();
  await removePhoto(photoId);
  revalidatePath(pathFor(kind, id));
}

export async function setCoverPhoto(kind: string, id: string, photoId: string): Promise<void> {
  await requireAdmin();
  await makeCover(photoId);
  revalidatePath(pathFor(kind, id));
}
