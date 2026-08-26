"use server";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { storeUpload, discardUploads, UploadError } from "@/lib/uploads";
import { DOCUMENT_KIND, type DocumentKind } from "@/lib/enums";
import { DOCUMENT_LABEL } from "@/lib/uploads";
import {
  agentRegistrationSchema,
  formObject,
  toFormState,
  type FormState,
} from "@/lib/validation";

/** Same wording whichever way registration ends — see below. */
const RECEIVED =
  "Thanks — your registration has been received. We'll be in touch once it has been reviewed.";

export async function registerAgent(_prev: FormState, formData: FormData): Promise<FormState> {
  // Strip the File entries before zod sees them; files are validated separately
  // by storeUpload, which checks the bytes rather than the declared type.
  const fields = formObject(formData);
  for (const kind of DOCUMENT_KIND) delete fields[kind];

  // Echoed back on failure so the agent does not lose what they typed.
  // Passwords are excluded on purpose.
  const echo: Record<string, string> = {};
  for (const key of ["agencyName", "contactName", "address", "phone", "email", "altPhone", "altEmail"]) {
    const value = formData.get(key);
    if (typeof value === "string") echo[key] = value;
  }

  const parsed = agentRegistrationSchema.safeParse(fields);
  if (!parsed.success) return { ...toFormState(parsed.error), values: echo };

  const { password, confirmPassword: _confirm, ...agent } = parsed.data;

  // Check for an existing account BEFORE writing any files, so a duplicate
  // registration cannot litter the upload directory.
  const existing = await prisma.agent.findUnique({
    where: { email: agent.email },
    select: { id: true },
  });
  if (existing) {
    // Deliberately identical to the success message: revealing that an email is
    // already registered would let a stranger enumerate which agencies work
    // with Series Tours.
    return { ok: true, message: RECEIVED };
  }

  const stored: { kind: DocumentKind; storedName: string; originalName: string; mimeType: string; sizeBytes: number }[] = [];
  const errors: Record<string, string> = {};

  for (const kind of DOCUMENT_KIND) {
    const file = formData.get(kind);
    if (!(file instanceof File)) {
      errors[kind] = `${DOCUMENT_LABEL[kind]} is required`;
      continue;
    }
    try {
      stored.push({ kind, ...(await storeUpload(file, DOCUMENT_LABEL[kind])) });
    } catch (e) {
      errors[kind] = e instanceof UploadError ? e.message : `${DOCUMENT_LABEL[kind]} could not be read`;
    }
  }

  if (Object.keys(errors).length > 0) {
    // Any file that did land is removed, so a retry does not leave orphans.
    await discardUploads(stored.map((s) => s.storedName));
    return { ok: false, message: "Please fix the highlighted fields.", errors, values: echo };
  }

  try {
    await prisma.agent.create({
      data: {
        ...agent,
        passwordHash: await hashPassword(password),
        status: "pending", // Nothing auto-approves. Sonet reviews every signup.
        documents: { create: stored },
      },
    });
  } catch {
    // The row is what makes the files findable; without it they are litter.
    await discardUploads(stored.map((s) => s.storedName));
    return {
      ok: false,
      message: "Something went wrong saving your registration. Please try again.",
      values: echo,
    };
  }

  return { ok: true, message: RECEIVED };
}
