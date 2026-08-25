"use server";

import { redirect } from "next/navigation";
import { loginAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/validation";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, message: "Enter your email and password." };
  }

  const result = await loginAdmin(email, password);
  if (!result.ok) return { ok: false, message: result.error };

  redirect("/admin");
}
