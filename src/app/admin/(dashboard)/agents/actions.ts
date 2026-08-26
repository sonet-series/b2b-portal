"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { generateTempPassword } from "@/lib/temp-password";
import { tempPasswordMessage } from "@/lib/handover";
import {
  agentApprovalSchema,
  agentRejectionSchema,
  agentTierSchema,
  rateCardEntrySchema,
  formObject,
  toFormState,
  type FormState,
} from "@/lib/validation";
import { assertReferenceExists, parseProductType } from "@/lib/rate-card";

async function requireAdmin() {
  if (!(await getAdminSession())) throw new Error("Not signed in.");
}

/** Carries the copy-ready handover text back to the UI after an approval. */
export type HandoverState = FormState & {
  handover?: { message: string; email: string; tempPassword?: string };
};

/**
 * Approve a signup and assign its rate card in one action, as the blueprint
 * requires. `copyRateCardFromAgentId` clones another agent's overrides — the
 * fastest path when a new agency gets the same deal as an existing one.
 *
 * Leaving it unset is a real choice, not a gap: the fallback rule means an
 * agent with no overrides is quoted catalogue defaults and can trade
 * immediately.
 *
 * Sends nothing — the handover message is rendered on the agent's page.
 */
export async function approveAgent(
  agentId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const parsed = agentApprovalSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, message: "Agent not found." };
  if (agent.status === "approved") return { ok: false, message: "This agent is already approved." };

  const sourceId = parsed.data.copyRateCardFromAgentId;

  await prisma.$transaction(async (tx) => {
    await tx.agent.update({
      where: { id: agentId },
      data: {
        status: "approved",
        approvedAt: new Date(),
        adminNotes: parsed.data.adminNotes,
      },
    });

    if (sourceId) {
      const source = await tx.agentRateCard.findMany({
        where: { agentId: sourceId },
        select: {
          productType: true,
          referenceId: true,
          overridePriceMinor: true,
          notes: true,
        },
      });
      if (source.length > 0) {
        await tx.agentRateCard.createMany({
          data: source.map((row) => ({ ...row, agentId })),
        });
      }
    }
  });

  revalidatePath("/admin/agents");
  revalidatePath(`/admin/agents/${agentId}`);
  revalidatePath("/admin");

  // The handover message is NOT returned through client state. Approval flips
  // the page to its approved layout, which unmounts whatever rendered it — and
  // Sonet would lose the one thing he needs. It is server-rendered on the
  // approved agent's page instead, where he can come back to it any time.
  return { ok: true, message: "Agent approved." };
}

/**
 * Sonet's manual tier choice. Setting it wins over the derived guess from then
 * on; choosing "auto" clears it back to the guess. The derived value is never
 * overwritten, so the two stay distinguishable.
 */
export async function setAgentTier(
  agentId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const parsed = agentTierSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.agent.update({
    where: { id: agentId },
    data: { tierOverride: parsed.data.tierOverride },
  });

  revalidatePath("/admin/agents");
  revalidatePath(`/admin/agents/${agentId}`);
  return {
    ok: true,
    message: parsed.data.tierOverride
      ? "Tier set. This overrides the address-derived guess."
      : "Override cleared — back to the address-derived tier.",
  };
}

export async function rejectAgent(
  agentId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const parsed = agentRejectionSchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  await prisma.agent.update({
    where: { id: agentId },
    data: { status: "rejected", adminNotes: parsed.data.adminNotes },
  });

  revalidatePath("/admin/agents");
  revalidatePath(`/admin/agents/${agentId}`);
  revalidatePath("/admin");
  return { ok: true, message: "Registration rejected." };
}

/**
 * Issues a temporary password and returns it ONCE, for Sonet to hand over.
 * It is stored only as a hash, so it cannot be retrieved again — reissuing
 * generates a new one.
 */
export async function issueTempPassword(
  agentId: string,
  _prev: HandoverState
): Promise<HandoverState> {
  await requireAdmin();

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, message: "Agent not found." };

  const tempPassword = generateTempPassword();
  await prisma.agent.update({
    where: { id: agentId },
    data: {
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
    },
  });

  revalidatePath(`/admin/agents/${agentId}`);

  return {
    ok: true,
    message: "Temporary password issued. Copy it now — it cannot be shown again.",
    handover: {
      email: agent.email,
      tempPassword,
      message: tempPasswordMessage({
        contactName: agent.contactName,
        email: agent.email,
        tempPassword,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Rate card overrides
// ---------------------------------------------------------------------------

export async function addRateCardEntry(
  agentId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();

  const parsed = rateCardEntrySchema.safeParse(formObject(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const productType = parseProductType(parsed.data.productType);

  // referenceId is polymorphic across four tables, so Prisma cannot check it.
  // Without this, a stale id creates an override that silently never applies.
  try {
    await assertReferenceExists(productType, parsed.data.referenceId);
  } catch {
    return { ok: false, errors: { referenceId: "That rate no longer exists." } };
  }

  await prisma.agentRateCard.upsert({
    where: {
      agentId_productType_referenceId_charge: {
        agentId,
        productType,
        referenceId: parsed.data.referenceId,
        charge: parsed.data.charge,
      },
    },
    update: {
      overridePriceMinor: parsed.data.overridePriceMinor,
      notes: parsed.data.notes,
    },
    create: {
      agentId,
      productType,
      referenceId: parsed.data.referenceId,
      charge: parsed.data.charge,
      overridePriceMinor: parsed.data.overridePriceMinor,
      notes: parsed.data.notes,
    },
  });

  revalidatePath(`/admin/agents/${agentId}`);
  return { ok: true, message: "Override saved." };
}

export async function removeRateCardEntry(entryId: string, agentId: string) {
  await requireAdmin();
  await prisma.agentRateCard.delete({ where: { id: entryId } });
  revalidatePath(`/admin/agents/${agentId}`);
}
