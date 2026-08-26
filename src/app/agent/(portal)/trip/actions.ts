"use server";

import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { priceCart } from "@/lib/combined-quote";
import { saveCombinedQuote } from "@/lib/quote-store";
import { PricingError } from "@/lib/pricing";
import type { CombinedItem, PricedCart } from "@/lib/quote-types";

/**
 * Prices the cart the browser is holding.
 *
 * The client stores inputs only, so this is where prices come from — every
 * render, freshly, using current catalogue rates and markup. Nothing the
 * browser sends is treated as a price.
 */
export async function priceTripAction(
  items: CombinedItem[]
): Promise<{ cart: PricedCart; problems: { index: number; reason: string }[] }> {
  const agent = await requireAgent();
  return priceCart({ id: agent.id, tier: agent.tier }, items);
}

/** Writes the trip as one Quote. Re-prices again before persisting. */
export async function saveTripAction(items: CombinedItem[]): Promise<{ error: string } | never> {
  const agent = await requireAgent();

  let reference: string;
  try {
    reference = await saveCombinedQuote({ id: agent.id, tier: agent.tier }, items);
  } catch (e) {
    return {
      error: e instanceof PricingError ? e.message : "Could not save this trip. Please try again.",
    };
  }
  redirect(`/agent/quotes/${reference}`);
}
