"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
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
