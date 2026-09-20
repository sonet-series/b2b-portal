"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
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
