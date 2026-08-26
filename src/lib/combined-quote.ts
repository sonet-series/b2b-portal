import "server-only";
import { quoteHotel, quoteHouseboat, quoteVehicle, quoteItinerary } from "./quote";
import { PricingError } from "./pricing";
import { parseDateOnly, formatDateOnly, MS_PER_DAY, startOfUtcDay } from "./dates";
import type {
  AnyQuoteInput,
  CombinedItem,
  PricedCart,
  PricedItem,
  QuotingAgent,
} from "./quote-types";

/**
 * Pricing a whole trip: one vehicle, several hotel stays, maybe a package.
 *
 * Every item is priced through the EXACT same engine as a single-product
 * quote — same tier resolution, same overrides, same season splitting. This
 * module only assembles; it never prices anything itself. If a combined quote
 * and a single quote for the same thing ever disagreed, that would be a bug in
 * here, not two pricing paths to reconcile.
 */

async function priceOne(agent: QuotingAgent, input: AnyQuoteInput) {
  switch (input.productType) {
    case "hotel":
      return quoteHotel(agent, input);
    case "houseboat":
      return quoteHouseboat(agent, input);
    case "vehicle":
      return quoteVehicle(agent, input);
    case "itinerary":
      return quoteItinerary(agent, input);
  }
}

/** The travel window one item covers, so the cart can span them all. */
function itemWindow(input: AnyQuoteInput): { start: Date; end: Date } {
  switch (input.productType) {
    case "hotel":
      return { start: parseDateOnly(input.checkIn), end: parseDateOnly(input.checkOut) };
    case "houseboat": {
      const d = parseDateOnly(input.travelDate);
      return { start: d, end: d };
    }
    case "vehicle":
      return { start: parseDateOnly(input.startDate), end: parseDateOnly(input.endDate) };
    case "itinerary": {
      const d = parseDateOnly(input.startDate);
      return { start: d, end: d };
    }
  }
}

/**
 * Prices every item in the cart.
 *
 * A single item failing does NOT fail the cart — it is reported against that
 * item so the agent can fix or drop it while keeping the rest. Losing a whole
 * trip because one hotel ran out of season would be its own defect.
 */
export async function priceCart(
  agent: QuotingAgent,
  items: readonly CombinedItem[]
): Promise<{ cart: PricedCart; problems: { index: number; reason: string }[] }> {
  const priced: PricedItem[] = [];
  const problems: { index: number; reason: string }[] = [];

  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const [index, item] of items.entries()) {
    try {
      const result = await priceOne(agent, item.input);
      const option = result.options.find((o) => o.key === item.optionKey);

      if (!option) {
        problems.push({
          index,
          reason:
            "That option is no longer available at this price — remove this item and add it again.",
        });
        continue;
      }

      priced.push({
        index,
        productType: item.input.productType,
        label: option.title,
        detail: option.detail,
        lines: option.lines,
        subtotalMinor: option.totalMinor,
        usedOverride: option.usedOverride,
      });

      const window = itemWindow(item.input);
      if (!earliest || window.start < earliest) earliest = window.start;
      if (!latest || window.end > latest) latest = window.end;
    } catch (e) {
      problems.push({
        index,
        reason: e instanceof PricingError ? e.message : "This item could not be priced.",
      });
    }
  }

  const today = startOfUtcDay(new Date());
  return {
    cart: {
      items: priced,
      totalMinor: priced.reduce((sum, i) => sum + i.subtotalMinor, 0),
      travelStart: formatDateOnly(earliest ?? today),
      travelEnd: formatDateOnly(latest ?? earliest ?? today),
    },
    problems,
  };
}

/** Short human summary of one item, frozen onto its lines when saved. */
export function itemLabel(item: PricedItem): string {
  return `${item.label} · ${item.detail}`;
}

export { MS_PER_DAY };
