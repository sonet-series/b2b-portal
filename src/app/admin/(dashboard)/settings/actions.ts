"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { setSetting, SETTING_KEYS } from "@/lib/settings";
import { sendTestEmail } from "@/lib/mailer";
import { toMinor } from "@/lib/money";
import { getAdminSession } from "@/lib/auth";
import { markupRuleSchema, formObject, toFormState, type FormState } from "@/lib/validation";

/**
 * Saves one markup rule.
 *
 * Takes effect on the NEXT price calculation — nothing is rewritten. Saved
 * Quote/QuoteLine rows keep the numbers they were saved with, because they
 * store computed totals rather than pointing at this table.
 */
export async function saveMarkupRule(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminSession())) throw new Error("Not signed in.");

  const parsed = markupRuleSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const { productType, tier, kind, value } = parsed.data;

  await prisma.markupRule.upsert({
    where: { productType_tier: { productType, tier } },
    update: { kind, value },
    create: { productType, tier, kind, value },
  });

  // Every screen that shows a price derives it, so all of them go stale.
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Markup saved. It applies to quotes from now on." };
}


/**
 * Sets the local-running allowance per overnight stop.
 *
 * Kilometres, whole numbers — this is a distance an operator states to a
 * customer, not a derived quantity, so there is nothing to gain from
 * fractions of a kilometre.
 */
export async function savePerStopKm(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminSession())) throw new Error("Not signed in.");

  const raw = String(formData.get("km") ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) {
    return { ok: false, message: "Enter a whole number of kilometres.", errors: { km: "Not a number" } };
  }
  const km = Number(raw);
  if (km > 500) {
    return { ok: false, message: "That is a lot per stop — check the number.", errors: { km: "Too large" } };
  }

  await setSetting(SETTING_KEYS.PER_STOP_KM, km);
  revalidatePath("/admin/settings");
  return { ok: true, message: `Local running set to ${km} km per overnight stop.` };
}


/** "1,500" or "1500.50" — the same shape the rate forms accept. */
function parseAmount(raw: string): number | null {
  if (!/^\d[\d,]*(\.\d{1,2})?$/.test(raw)) return null;
  const minor = toMinor(raw);
  return minor >= 0 ? minor : null;
}

/**
 * Toll and parking, either the fallback or one vehicle's rate.
 *
 * An empty `vehicleId` means the fallback, which every vehicle without its own
 * rate uses. Toll applies to every hire, so there has to be a number that
 * always answers.
 */
export async function saveTollParking(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminSession())) throw new Error("Not signed in.");

  const raw = String(formData.get("amount") ?? "").trim();
  const vehicleId = String(formData.get("vehicleId") ?? "").trim();
  const minor = parseAmount(raw);
  if (minor === null) {
    return { ok: false, message: "Enter an amount like 300 or 300.50.", errors: { amount: "Not an amount" } };
  }

  if (vehicleId === "") {
    await setSetting(SETTING_KEYS.TOLL_PARKING_PER_DAY_MINOR, minor);
    revalidatePath("/admin/settings");
    return { ok: true, message: `Default toll and parking set to ₹${raw} per day.` };
  }

  await prisma.vehicleTollRate.upsert({
    where: { vehicleId },
    create: { vehicleId, costMinor: minor },
    update: { costMinor: minor },
  });
  revalidatePath("/admin/settings");
  return { ok: true, message: `Toll and parking set to ₹${raw} per day for that vehicle.` };
}

export async function saveStatePermit(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminSession())) throw new Error("Not signed in.");

  const state = String(formData.get("state") ?? "").trim();
  const vehicleId = String(formData.get("vehicleId") ?? "").trim();
  const raw = String(formData.get("amount") ?? "").trim();
  const minor = parseAmount(raw);
  if (state === "") return { ok: false, message: "Choose a state." };
  if (vehicleId === "") return { ok: false, message: "Choose a vehicle." };
  if (minor === null) {
    return { ok: false, message: "Enter an amount like 1500.", errors: { amount: "Not an amount" } };
  }

  await prisma.statePermit.upsert({
    where: { state_vehicleId: { state, vehicleId } },
    create: { state, vehicleId, costMinor: minor },
    update: { costMinor: minor, active: true },
  });
  revalidatePath("/admin/settings");
  return { ok: true, message: `${state} permit set to ₹${raw} per entry for that vehicle.` };
}

/**
 * The deposit an agent pays on a confirmed booking, as a percentage.
 *
 * Stored in BASIS POINTS so the arithmetic stays exact — the same reason
 * markup percentages and GST are. Frozen onto each booking when it is
 * confirmed, so changing this moves the next booking and never one already
 * agreed.
 */
export async function saveDepositPercent(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminSession())) throw new Error("Not signed in.");

  const raw = String(formData.get("percent") ?? "").trim();
  const n = Number(raw);
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw) || !Number.isFinite(n) || n < 0 || n > 100) {
    return {
      ok: false,
      message: "Enter a percentage between 0 and 100, like 25.",
      errors: { percent: "Not a percentage" },
    };
  }

  await setSetting(SETTING_KEYS.DEPOSIT_BPS, Math.round(n * 100));
  revalidatePath("/admin/settings");
  return { ok: true, message: `Deposit set to ${raw}% of the grand total.` };
}

/**
 * Sends one test message, so credentials can be proved without a fake booking.
 *
 * Returns the SMTP failure verbatim rather than a friendly summary: whoever is
 * configuring this needs "535 Authentication failed", not "could not send".
 */
export async function sendTestEmailAction(_prev: FormState): Promise<FormState> {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
  const result = await sendTestEmail();
  return { ok: result.ok, message: result.message };
}
