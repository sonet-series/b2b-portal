"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import {
  houseboatSchema,
  houseboatRateSchema,
  formObject,
  toFormState,
  type FormState,
} from "@/lib/validation";

async function requireAdmin() {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
}

export async function createHouseboat(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = houseboatSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const boat = await prisma.houseboat.create({ data: parsed.data });
  revalidatePath("/admin/houseboats");
  redirect(`/admin/houseboats/${boat.id}?created=1`);
}

export async function updateHouseboat(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const parsed = houseboatSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.houseboat.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/houseboats");
  revalidatePath(`/admin/houseboats/${id}`);
  return { ok: true, message: "Houseboat saved." };
}

export async function createHouseboatRate(
  houseboatId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const parsed = houseboatRateSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.houseboatRate.create({ data: { ...parsed.data, houseboatId } });
  revalidatePath(`/admin/houseboats/${houseboatId}`);
  return { ok: true, message: "Rate added." };
}

export async function updateHouseboatRate(
  rateId: string,
  houseboatId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const parsed = houseboatRateSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.houseboatRate.update({ where: { id: rateId }, data: parsed.data });
  revalidatePath(`/admin/houseboats/${houseboatId}`);
  return { ok: true, message: "Rate saved." };
}

export async function archiveHouseboatRate(rateId: string, houseboatId: string) {
  await requireAdmin();
  await prisma.houseboatRate.update({ where: { id: rateId }, data: { active: false } });
  revalidatePath(`/admin/houseboats/${houseboatId}`);
}

export async function restoreHouseboatRate(rateId: string, houseboatId: string) {
  await requireAdmin();
  await prisma.houseboatRate.update({ where: { id: rateId }, data: { active: true } });
  revalidatePath(`/admin/houseboats/${houseboatId}`);
}
