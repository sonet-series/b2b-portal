"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import {
  itinerarySchema,
  itineraryRateSchema,
  formObject,
  toFormState,
  type FormState,
} from "@/lib/validation";

async function requireAdmin() {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
}

export async function createItinerary(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = itinerarySchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const itinerary = await prisma.itinerary.create({ data: parsed.data });
  revalidatePath("/admin/itineraries");
  redirect(`/admin/itineraries/${itinerary.id}?created=1`);
}

export async function updateItinerary(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = itinerarySchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.itinerary.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/itineraries");
  revalidatePath(`/admin/itineraries/${id}`);
  return { ok: true, message: "Package saved." };
}

export async function createItineraryRate(
  itineraryId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const parsed = itineraryRateSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.itineraryRate.create({ data: { ...parsed.data, itineraryId } });
  revalidatePath(`/admin/itineraries/${itineraryId}`);
  return { ok: true, message: "Rate added." };
}

export async function updateItineraryRate(
  rateId: string,
  itineraryId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const parsed = itineraryRateSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.itineraryRate.update({ where: { id: rateId }, data: parsed.data });
  revalidatePath(`/admin/itineraries/${itineraryId}`);
  return { ok: true, message: "Rate saved." };
}

export async function archiveItineraryRate(rateId: string, itineraryId: string) {
  await requireAdmin();
  await prisma.itineraryRate.update({ where: { id: rateId }, data: { active: false } });
  revalidatePath(`/admin/itineraries/${itineraryId}`);
}

export async function restoreItineraryRate(rateId: string, itineraryId: string) {
  await requireAdmin();
  await prisma.itineraryRate.update({ where: { id: rateId }, data: { active: true } });
  revalidatePath(`/admin/itineraries/${itineraryId}`);
}
