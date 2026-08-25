import type { HouseboatPricingMode, ItineraryPricingMode } from "./enums";

/**
 * Mode-dependent price maths for houseboats and itineraries.
 *
 * Both `HouseboatRate.rateMinor` and `ItineraryRate.priceMinor` are single
 * required columns whose UNIT depends on the row's `pricingMode`. That keeps a
 * mode from ever pointing at a null price, but it means the meaning of the
 * number is only correct if it goes through here. Nothing else should multiply
 * a rate by a pax count.
 *
 * The agent never picks a pricing mode. The mode belongs to the catalogue row;
 * a product sold both ways has two rate rows, and the agent sees two concrete
 * priced options.
 */

export type PriceBreakdown = {
  /** Paise. What the agent is quoted. */
  totalMinor: number;
  /** Pax actually charged for — differs from the enquiry when a minimum applies. */
  chargedPax: number;
  /** Human explanation of the maths, shown on the quote line. */
  basis: string;
};

export class PricingError extends Error {}

// ---------------------------------------------------------------------------
// Houseboats
// ---------------------------------------------------------------------------

export type HouseboatRateInput = {
  pricingMode: HouseboatPricingMode;
  /** WHOLE_BOAT: whole boat per cruise. PER_PERSON: one person per cruise. */
  rateMinor: number;
  includedPax: number | null;
  extraPaxRateMinor: number | null;
  minPax: number | null;
  maxPax: number;
};

export function priceHouseboat(rate: HouseboatRateInput, pax: number): PriceBreakdown {
  if (!Number.isInteger(pax) || pax < 1) {
    throw new PricingError("Pax must be a whole number of at least 1.");
  }
  if (pax > rate.maxPax) {
    throw new PricingError(`This boat seats ${rate.maxPax}; ${pax} pax will not fit.`);
  }

  if (rate.pricingMode === "PER_PERSON") {
    // The boat will not sail below minPax, so a smaller party pays for minPax.
    // Quoting the true headcount here would undercut the cost of running it.
    const minPax = rate.minPax ?? 1;
    const chargedPax = Math.max(pax, minPax);
    const basis =
      chargedPax > pax
        ? `${chargedPax} pax minimum (${pax} travelling) × per-person rate`
        : `${chargedPax} pax × per-person rate`;

    return { totalMinor: rate.rateMinor * chargedPax, chargedPax, basis };
  }

  // WHOLE_BOAT: one price covers includedPax; anyone beyond that is billed extra.
  const includedPax = rate.includedPax ?? rate.maxPax;
  const extraPax = Math.max(0, pax - includedPax);

  if (extraPax > 0 && rate.extraPaxRateMinor == null) {
    throw new PricingError(
      `This rate covers ${includedPax} pax and has no extra-person rate set, ` +
        `so ${pax} pax cannot be quoted automatically.`
    );
  }

  const extraMinor = extraPax * (rate.extraPaxRateMinor ?? 0);
  const basis =
    extraPax > 0
      ? `Whole boat (${includedPax} pax) + ${extraPax} extra pax`
      : `Whole boat (up to ${includedPax} pax)`;

  return { totalMinor: rate.rateMinor + extraMinor, chargedPax: pax, basis };
}

// ---------------------------------------------------------------------------
// Itineraries
// ---------------------------------------------------------------------------

export type ItineraryRateInput = {
  pricingMode: ItineraryPricingMode;
  /** PER_PERSON_TWIN_SHARING: one person. PER_PACKAGE: the whole package. */
  priceMinor: number;
  singleSupplementMinor: number | null;
  maxPax: number | null;
};

export function priceItinerary(rate: ItineraryRateInput, pax: number): PriceBreakdown {
  if (!Number.isInteger(pax) || pax < 1) {
    throw new PricingError("Pax must be a whole number of at least 1.");
  }
  if (rate.maxPax != null && pax > rate.maxPax) {
    throw new PricingError(`This package covers up to ${rate.maxPax} pax; ${pax} is too many.`);
  }

  if (rate.pricingMode === "PER_PACKAGE") {
    // Flat regardless of headcount — pax only ever acts as a guardrail here.
    return {
      totalMinor: rate.priceMinor,
      chargedPax: pax,
      basis: `Flat package rate (${pax} pax)`,
    };
  }

  // PER_PERSON_TWIN_SHARING: the quoted rate assumes two to a room. A solo
  // traveller has no one to share with, so the supplement applies.
  const isSolo = pax === 1;
  if (isSolo && rate.singleSupplementMinor == null) {
    throw new PricingError(
      "This package is priced on twin sharing and has no single supplement set, " +
        "so a solo traveller cannot be quoted automatically."
    );
  }

  const supplementMinor = isSolo ? (rate.singleSupplementMinor ?? 0) : 0;
  const basis = isSolo
    ? "1 pax, twin-sharing rate + single supplement"
    : `${pax} pax × twin-sharing rate`;

  return { totalMinor: rate.priceMinor * pax + supplementMinor, chargedPax: pax, basis };
}
