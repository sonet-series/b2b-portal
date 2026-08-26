import type { AgentTier, ProductType } from "./enums";

/**
 * Who is being quoted. Carries the tier alongside the id so the engine never
 * has to re-derive it — and so a caller cannot accidentally price without one.
 */
export type QuotingAgent = {
  id: string;
  tier: AgentTier;
};

/**
 * Shared shapes for the quote engine. Kept in their own module (no "server-only"
 * import) so client components can use the types without dragging the engine
 * into the browser bundle.
 */

export type QuoteLineDraft = {
  description: string;
  /** Nights, days, km, or pax depending on the product. */
  quantity: number;
  unitMinor: number;
  totalMinor: number;
  /** True when an agent rate-card override supplied unitMinor. */
  usedOverride: boolean;
};

/**
 * One priced way to buy the thing the agent asked about.
 *
 * A product sold two ways produces two options — this is where "the agent sees
 * concrete priced options rather than a pricing-mode toggle" actually happens.
 */
export type QuoteOption = {
  /** Identifies this option when the agent picks it. Recomputed server-side on save. */
  key: string;
  productType: ProductType;
  title: string;
  detail: string;
  lines: QuoteLineDraft[];
  totalMinor: number;
  /** True if any line used an override — surfaced as "your rate" in the UI. */
  usedOverride: boolean;
};

/** Why a product could not be quoted, shown instead of silently vanishing. */
export type QuoteUnavailable = {
  title: string;
  reason: string;
};

export type QuoteResult = {
  options: QuoteOption[];
  unavailable: QuoteUnavailable[];
};

export type HotelQuoteInput = {
  hotelId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  extraBeds: number;
};

export type HouseboatQuoteInput = {
  houseboatId: string;
  travelDate: string;
  pax: number;
};

/**
 * One hop of a multi-stop itinerary — e.g. "Cochin → Munnar", 130 km, plus a
 * 60 km sightseeing buffer for a day out at Munnar.
 *
 * Agents book one vehicle for a whole trip but build the distance up leg by
 * leg, so a single "estimated distance" box lost the reasoning behind the
 * number. The legs are what the agent actually knows; the total is derived.
 */
export type VehicleLeg = {
  /** Free text, the agent's own reference. Never parsed. */
  label: string;
  /** Point-to-point distance for this leg, km. */
  km: number;
  /** Local sightseeing km added on top of the transfer, km. */
  bufferKm: number;
};

export type VehicleQuoteInput = {
  vehicleId: string;
  startDate: string;
  endDate: string;
  /**
   * The itinerary. Total km is the sum of every leg's distance and buffer, and
   * that total feeds the existing per-day / per-km pricing unchanged.
   * Empty is allowed: a point-to-point transfer needs no distance.
   */
  legs: VehicleLeg[];
};

/** Total km for an itinerary. The single number the pricing logic consumes. */
export function totalLegKm(legs: readonly VehicleLeg[]): number | null {
  if (legs.length === 0) return null;
  return legs.reduce((sum, l) => sum + l.km + l.bufferKm, 0);
}

export type ItineraryQuoteInput = {
  itineraryId: string;
  startDate: string;
  pax: number;
};

export type AnyQuoteInput =
  | ({ productType: "hotel" } & HotelQuoteInput)
  | ({ productType: "houseboat" } & HouseboatQuoteInput)
  | ({ productType: "vehicle" } & VehicleQuoteInput)
  | ({ productType: "itinerary" } & ItineraryQuoteInput);


// ---------------------------------------------------------------------------
// Combined quotes
// ---------------------------------------------------------------------------

/**
 * One thing the agent added to a combined quote: the inputs they chose plus
 * which priced option they picked.
 *
 * Only the INPUTS are carried, never a price. The whole cart is re-priced
 * server-side when it is saved, so a total that arrives from the browser is
 * never trusted — the same rule single-product saving already follows.
 */
export type CombinedItem = {
  input: AnyQuoteInput;
  /** Identifies the chosen option within that product's result. */
  optionKey: string;
};

/** A priced cart item, ready to render. */
export type PricedItem = {
  index: number;
  productType: AnyQuoteInput["productType"];
  /** What the agent chose, e.g. "Demo Hill Resort · Deluxe · CP". */
  label: string;
  detail: string;
  lines: QuoteLineDraft[];
  subtotalMinor: number;
  usedOverride: boolean;
};

export type PricedCart = {
  items: PricedItem[];
  totalMinor: number;
  /** Earliest and latest travel dates across every item, ISO. */
  travelStart: string;
  travelEnd: string;
};
