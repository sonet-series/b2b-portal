"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { garageSchema, formObject, toFormState, type FormState } from "@/lib/validation";

// Server actions are their own entry point — the dashboard layout does not run
// for them, so every action checks the session itself.
async function requireAdmin() {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
}

export async function createGarage(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = garageSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const existing = await prisma.garage.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    return { ok: false, message: "A garage with that name already exists.", errors: { name: "Already in use" } };
  }

  const garage = await prisma.garage.create({ data: parsed.data });
  revalidatePath("/admin/garages");
  redirect(`/admin/garages/${garage.id}?created=1`);
}

export async function updateGarage(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = garageSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const clash = await prisma.garage.findFirst({
    where: { name: parsed.data.name, NOT: { id } },
  });
  if (clash) {
    return { ok: false, message: "A garage with that name already exists.", errors: { name: "Already in use" } };
  }

  await prisma.garage.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/garages");
  revalidatePath(`/admin/garages/${id}`);
  return { ok: true, message: "Garage saved." };
}

/**
 * Set which vehicles this garage holds.
 *
 * Existing rows are reactivated rather than recreated, and removed ones are
 * deactivated rather than deleted — the same soft-delete rule the rest of the
 * catalogue follows, so a garage that briefly lost a vehicle does not lose the
 * record that it ever had one.
 */
export async function setGarageFleet(
  garageId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const wanted = new Set(formData.getAll("vehicleIds").map(String).filter((v) => v !== ""));
  const existing = await prisma.garageVehicle.findMany({ where: { garageId } });
  const known = new Map(existing.map((e) => [e.vehicleId, e]));

  await prisma.$transaction([
    ...[...wanted]
      .filter((vehicleId) => !known.has(vehicleId))
      .map((vehicleId) => prisma.garageVehicle.create({ data: { garageId, vehicleId } })),
    ...existing
      .filter((e) => wanted.has(e.vehicleId) !== e.active)
      .map((e) =>
        prisma.garageVehicle.update({ where: { id: e.id }, data: { active: wanted.has(e.vehicleId) } })
      ),
  ]);

  revalidatePath(`/admin/garages/${garageId}`);
  revalidatePath("/admin/garages");
  return { ok: true, message: `Fleet saved — ${wanted.size} vehicle${wanted.size === 1 ? "" : "s"} at this garage.` };
}
