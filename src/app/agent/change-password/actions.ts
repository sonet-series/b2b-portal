"use server";

import { redirect } from "next/navigation";
import { getAgentSessionId, changeAgentPassword } from "@/lib/auth";
import {
  passwordChangeSchema,
  formObject,
  toFormState,
  type FormState,
} from "@/lib/validation";

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const agentId = await getAgentSessionId();
  if (!agentId) redirect("/login");

  const parsed = passwordChangeSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const result = await changeAgentPassword(
    agentId,
    parsed.data.currentPassword,
    parsed.data.password
  );
  if (!result.ok) return { ok: false, message: result.error };

  redirect("/agent?password=changed");
}
