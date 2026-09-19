"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { setSetting, SETTING_KEYS } from "@/lib/settings";
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
 * Sets the road margin.
 *
 * Accepts a percentage because that is what a person thinks in, and stores
 * BASIS POINTS because that is what the arithmetic needs to be exact — the
 * same reason MarkupRule does it.
 */
export async function saveRoadMargin(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminSession())) throw new Error("Not signed in.");

  const raw = String(formData.get("percent") ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, message: "Enter a percentage like 5 or 7.5.", errors: { percent: "Not a percentage" } };
  }
  const bps = Math.round(Number(raw) * 100);
  if (bps > 5000) {
    return { ok: false, message: "That is more than 50% — check the number.", errors: { percent: "Too large" } };
  }

  await setSetting(SETTING_KEYS.ROAD_MARGIN_BPS, bps);
  revalidatePath("/admin/settings");
  return { ok: true, message: `Road margin set to ${raw}%.` };
}
