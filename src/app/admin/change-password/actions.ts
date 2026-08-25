"use server";

import { redirect } from "next/navigation";
import { getAdminSessionId, changeAdminPassword } from "@/lib/auth";
import { passwordChangeSchema, formObject, toFormState, type FormState } from "@/lib/validation";

export async function changeAdminPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const adminId = await getAdminSessionId();
  if (!adminId) redirect("/admin/login");

  const parsed = passwordChangeSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const result = await changeAdminPassword(
    adminId,
    parsed.data.currentPassword,
    parsed.data.password
  );
  if (!result.ok) return { ok: false, message: result.error };

  redirect("/admin");
}
