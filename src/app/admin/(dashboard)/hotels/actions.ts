"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import {
  hotelSchema,
  hotelRateSchema,
  formObject,
  toFormState,
  type FormState,
} from "@/lib/validation";

/**
 * Server actions are their own entry point — the layout guard does not run for
 * them. Every action re-checks the session itself.
 */
async function requireAdmin() {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
}

export async function createHotel(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const parsed = hotelSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const hotel = await prisma.hotel.create({ data: parsed.data });
  revalidatePath("/admin/hotels");
  redirect(`/admin/hotels/${hotel.id}?created=1`);
}

export async function updateHotel(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const parsed = hotelSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.hotel.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/hotels");
  revalidatePath(`/admin/hotels/${id}`);
  return { ok: true, message: "Hotel saved." };
}

export async function createHotelRate(
  hotelId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const parsed = hotelRateSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.hotelRate.create({ data: { ...parsed.data, hotelId } });
  revalidatePath(`/admin/hotels/${hotelId}`);
  return { ok: true, message: "Rate added." };
}

export async function updateHotelRate(
  rateId: string,
  hotelId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const parsed = hotelRateSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.hotelRate.update({ where: { id: rateId }, data: parsed.data });
  revalidatePath(`/admin/hotels/${hotelId}`);
  return { ok: true, message: "Rate saved." };
}

/**
 * Soft delete. Catalogue rows that have been quoted against are never removed —
 * a deleted rate would orphan any agent override pointing at it.
 */
export async function archiveHotelRate(rateId: string, hotelId: string) {
  await requireAdmin();
  await prisma.hotelRate.update({ where: { id: rateId }, data: { active: false } });
  revalidatePath(`/admin/hotels/${hotelId}`);
}

export async function restoreHotelRate(rateId: string, hotelId: string) {
  await requireAdmin();
  await prisma.hotelRate.update({ where: { id: rateId }, data: { active: true } });
  revalidatePath(`/admin/hotels/${hotelId}`);
}
