"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAgent } from "@/lib/auth";
import { deleteQuote } from "@/lib/quote-store";

/**
 * Deletes a quote the agent owns.
 *
 * A server action is its own entry point — the portal layout does not run for
 * it — so the session is re-checked, and the agent id used for the delete
 * comes from that session rather than from the form.
 */
export async function deleteQuoteAction(reference: string): Promise<void> {
  const agent = await getAgent();
  if (!agent) throw new Error("Not signed in.");

  await deleteQuote(agent.id, reference);

  revalidatePath("/agent/quotes");
  revalidatePath("/agent");
  redirect("/agent/quotes?deleted=1");
}
