"use server";

import { redirect } from "next/navigation";
import { getAgent } from "@/lib/auth";
import { saveQuote } from "@/lib/quote-store";
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
  _prev: FormState
): Promise<FormState> {
  const agent = await getAgent();
  if (!agent) redirect("/login");

  let reference: string;
  try {
    reference = await saveQuote(agent.id, input, optionKey);
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
