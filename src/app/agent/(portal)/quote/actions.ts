"use server";

import { redirect } from "next/navigation";
import { getAgent } from "@/lib/auth";
import { saveQuote, replaceQuote } from "@/lib/quote-store";
import { PricingError } from "@/lib/pricing";
import type { AnyQuoteInput } from "@/lib/quote-types";
import type { FormState } from "@/lib/validation";

/**
 * Saves the option the agent picked.
 *
 * The inputs travel back through hidden fields and the price is RECOMPUTED
 * server-side — the total rendered in the browser is never trusted, since a
 * form post is trivially editable.
 */
export async function saveQuoteAction(
  input: AnyQuoteInput,
  optionKey: string,
  /**
   * Set when the agent is editing an existing quote. Replacing keeps the
   * reference, which is the whole point — one they may already have given to
   * a customer must not change because they fixed a date.
   */
  editingReference: string | null,
  _prev: FormState
): Promise<FormState> {
  const agent = await getAgent();
  if (!agent) redirect("/login");

  let reference: string;
  try {
    const who = { id: agent.id, tier: agent.tier };
    reference = editingReference
      ? await replaceQuote(who, editingReference, input, optionKey)
      : await saveQuote(who, input, optionKey);
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof PricingError
          ? e.message
          : "Could not save this quote. Please try again.",
    };
  }

  redirect(`/agent/quotes/${reference}`);
}
