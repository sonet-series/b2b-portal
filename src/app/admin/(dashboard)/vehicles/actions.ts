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

  // Onto the END of the fleet, not the front. The column defaults to 0, which
  // would put every new vehicle first and tie it with whatever is already
  // there — and a tie is exactly what `reorderVehicle` renumbers to avoid.
  const last = await prisma.vehicle.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: { ...parsed.data, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
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
// Fleet order
// ---------------------------------------------------------------------------

/**
 * Moves one vehicle up or down the fleet.
 *
 * Renumbers the WHOLE list rather than swapping two rows. Swapping is fewer
 * writes and is wrong the moment two rows share a sortOrder — which happens
 * the first time somebody adds a vehicle, or restores an archived one, or
 * imports a row. Renumbering makes ties impossible rather than merely
 * unlikely, and with a dozen vehicles it costs nothing.
 *
 * Inactive vehicles are included: they are still in the list Sonet is looking
 * at, and skipping them would make the arrows move things by two.
 */
export async function reorderVehicle(id: string, direction: "up" | "down"): Promise<void> {
  await requireAdmin();

  // The same ordering the admin list and the fleet page use. Tie-breakers
  // included, so this cannot disagree with what is on screen.
  const vehicles = await prisma.vehicle.findMany({
    orderBy: [{ sortOrder: "asc" }, { capacity: "asc" }, { type: "asc" }],
    select: { id: true, sortOrder: true },
  });

  const from = vehicles.findIndex((v) => v.id === id);
  if (from === -1) return;
  const to = direction === "up" ? from - 1 : from + 1;
  // Already at the end it is being moved toward. The buttons are disabled
  // there, but a server action is its own entry point.
  if (to < 0 || to >= vehicles.length) return;

  const [moved] = vehicles.splice(from, 1);
  vehicles.splice(to, 0, moved);

  const changed = vehicles
    .map((v, index) => ({ id: v.id, index }))
    .filter((v, index) => vehicles[index].sortOrder !== v.index);

  if (changed.length > 0) {
    await prisma.$transaction(
      changed.map((v) =>
        prisma.vehicle.update({ where: { id: v.id }, data: { sortOrder: v.index } })
      )
    );
  }

  revalidatePath("/admin/vehicles");
  revalidatePath("/agent/fleet");
}
