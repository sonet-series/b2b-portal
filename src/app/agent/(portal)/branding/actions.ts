"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getAgent } from "@/lib/auth";
import { storeUpload, discardUploads, isImage, UploadError } from "@/lib/uploads";
import type { FormState } from "@/lib/validation";

// Server actions are their own entry point — the portal layout does not run
// for them — so the agent session is re-checked here.
async function requireAgentId(): Promise<string> {
  const agent = await getAgent();
  if (!agent) throw new Error("Not signed in.");
  return agent.id;
}

export async function uploadLogo(_prev: FormState, formData: FormData): Promise<FormState> {
  const agentId = await requireAgentId();
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a logo image to upload." };
  }

  let stored;
  try {
    stored = await storeUpload(file, "Logo");
  } catch (e) {
    return { ok: false, message: e instanceof UploadError ? e.message : "Could not read that file." };
  }

  // storeUpload also accepts PDFs, which is right for identity documents and
  // wrong here — a PDF cannot be placed in an <img> on a letterhead.
  if (!isImage(stored.mimeType)) {
    await discardUploads([stored.storedName]);
    return { ok: false, message: "The logo must be an image — JPG, PNG or WEBP." };
  }

  const previous = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { logoStoredName: true },
  });

  await prisma.agent.update({
    where: { id: agentId },
    data: { logoStoredName: stored.storedName, logoMimeType: stored.mimeType },
  });

  // Only after the row points at the new file. Deleting first would leave the
  // agent with no logo at all if the write failed.
  if (previous?.logoStoredName) await discardUploads([previous.logoStoredName]);

  revalidatePath("/agent/branding");
  return { ok: true, message: "Logo saved. It will appear on every quote you print." };
}

export async function removeLogo(): Promise<void> {
  const agentId = await requireAgentId();
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { logoStoredName: true },
  });

  await prisma.agent.update({
    where: { id: agentId },
    data: { logoStoredName: null, logoMimeType: null },
  });
  if (agent?.logoStoredName) await discardUploads([agent.logoStoredName]);

  revalidatePath("/agent/branding");
}
