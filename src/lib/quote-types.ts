import type { ProductType } from "./enums";

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

export type VehicleQuoteInput = {
  vehicleId: string;
  startDate: string;
  endDate: string;
  /** Estimated total km. Required for per-km rates, optional elsewhere. */
  km: number | null;
};

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
