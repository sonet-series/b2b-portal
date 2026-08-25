"use server";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  agentRegistrationSchema,
  formObject,
  toFormState,
  type FormState,
} from "@/lib/validation";

export async function registerAgent(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = agentRegistrationSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const { password, confirmPassword: _ignored, ...agent } = parsed.data;

  const existing = await prisma.agent.findUnique({
    where: { email: agent.email },
    select: { id: true },
  });
  if (existing) {
    // Deliberately not "this email is already registered" — that would let a
    // stranger enumerate which agencies work with Series Tours.
    return {
      ok: true,
      message:
        "Thanks — your registration has been received. We'll be in touch once it has been reviewed.",
    };
  }

  await prisma.agent.create({
    data: {
      ...agent,
      passwordHash: await hashPassword(password),
      status: "pending", // Nothing auto-approves. Sonet reviews every signup.
    },
  });

  return {
    ok: true,
    message:
      "Thanks — your registration has been received. We'll be in touch once it has been reviewed.",
  };
}
