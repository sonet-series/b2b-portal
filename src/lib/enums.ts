/**
 * SQLite has no native enum type, so the enum-ish columns in schema.prisma are
 * plain String. These constants are the single source of truth for what is
 * allowed in them — validate here, at every write boundary, or the database
 * will happily store nonsense.
 */

export const AGENT_STATUS = ["pending", "approved", "rejected"] as const;
export type AgentStatus = (typeof AGENT_STATUS)[number];

export const PRODUCT_TYPE = ["hotel", "houseboat", "vehicle", "itinerary"] as const;
export type ProductType = (typeof PRODUCT_TYPE)[number];

/** EP room only · CP + breakfast · MAP + one main meal · AP full board */
export const MEAL_PLAN = ["EP", "CP", "MAP", "AP"] as const;
export type MealPlan = (typeof MEAL_PLAN)[number];

export const MEAL_PLAN_LABEL: Record<MealPlan, string> = {
  EP: "EP — room only",
  CP: "CP — breakfast",
  MAP: "MAP — breakfast + one main meal",
  AP: "AP — all meals",
};

export const HOUSEBOAT_CATEGORY = ["Deluxe", "Premium", "Luxury", "Super Luxury"] as const;
export type HouseboatCategory = (typeof HOUSEBOAT_CATEGORY)[number];

export const CRUISE_PACKAGE = ["DAY_CRUISE", "OVERNIGHT_22HR", "TWO_NIGHT"] as const;
export type CruisePackage = (typeof CRUISE_PACKAGE)[number];

export const CRUISE_PACKAGE_LABEL: Record<CruisePackage, string> = {
  DAY_CRUISE: "Day cruise (approx. 11am–5pm)",
  OVERNIGHT_22HR: "Overnight, 22hr (12pm check-in → 9am check-out)",
  TWO_NIGHT: "Two nights",
};

/** Nights a cruise package occupies, for date maths on the quote screen. */
export const CRUISE_PACKAGE_NIGHTS: Record<CruisePackage, number> = {
  DAY_CRUISE: 0,
  OVERNIGHT_22HR: 1,
  TWO_NIGHT: 2,
};

export const HOUSEBOAT_PRICING_MODE = ["WHOLE_BOAT", "PER_PERSON"] as const;
export type HouseboatPricingMode = (typeof HOUSEBOAT_PRICING_MODE)[number];

export const HOUSEBOAT_PRICING_MODE_LABEL: Record<HouseboatPricingMode, string> = {
  WHOLE_BOAT: "Whole boat (one price for the cruise)",
  PER_PERSON: "Per person (sharing basis)",
};

export const ITINERARY_PRICING_MODE = ["PER_PERSON_TWIN_SHARING", "PER_PACKAGE"] as const;
export type ItineraryPricingMode = (typeof ITINERARY_PRICING_MODE)[number];

export const ITINERARY_PRICING_MODE_LABEL: Record<ItineraryPricingMode, string> = {
  PER_PERSON_TWIN_SHARING: "Per person, twin sharing",
  PER_PACKAGE: "Flat package rate (whole group)",
};

export const VEHICLE_RATE_TYPE = ["PER_KM", "PER_DAY", "TRANSFER"] as const;
export type VehicleRateType = (typeof VEHICLE_RATE_TYPE)[number];

export const VEHICLE_RATE_TYPE_LABEL: Record<VehicleRateType, string> = {
  PER_KM: "Per km",
  PER_DAY: "Per day (with km allowance)",
  TRANSFER: "Point-to-point transfer (flat)",
};

/**
 * What an agency is charged as. Kerala agencies and agencies outside Kerala get
 * different default rates on every catalogue row.
 */
export const AGENT_TIER = ["KERALA", "OUTSIDE_KERALA"] as const;
export type AgentTier = (typeof AGENT_TIER)[number];

export const AGENT_TIER_LABEL: Record<AgentTier, string> = {
  KERALA: "Kerala",
  OUTSIDE_KERALA: "Outside Kerala",
};

/**
 * Which charge on a rate row a price applies to.
 *
 * MAIN is the headline rate; the rest are the ancillary charges. An agent
 * rate-card override targets exactly one of these, so an agency can have a
 * special room rate without also inheriting a special extra-bed rate.
 */
export const RATE_CHARGE = [
  "MAIN",
  "EXTRA_BED",
  "EXTRA_PAX",
  "EXTRA_KM",
  "DRIVER_ALLOWANCE",
  "SINGLE_SUPPLEMENT",
] as const;
export type RateCharge = (typeof RATE_CHARGE)[number];

export const RATE_CHARGE_LABEL: Record<RateCharge, string> = {
  MAIN: "Main rate",
  EXTRA_BED: "Extra bed",
  EXTRA_PAX: "Extra pax",
  EXTRA_KM: "Extra km",
  DRIVER_ALLOWANCE: "Driver allowance",
  SINGLE_SUPPLEMENT: "Single supplement",
};

/** Which charges each product type can carry at all. */
export const CHARGES_BY_PRODUCT: Record<ProductType, readonly RateCharge[]> = {
  hotel: ["MAIN", "EXTRA_BED"],
  houseboat: ["MAIN", "EXTRA_PAX"],
  vehicle: ["MAIN", "EXTRA_KM", "DRIVER_ALLOWANCE"],
  itinerary: ["MAIN", "SINGLE_SUPPLEMENT"],
};

/**
 * How a markup turns a cost into a sell price.
 *
 * One required `value` column carries both, with the meaning set by the kind —
 * the same shape as pricingMode / rateMinor elsewhere, so a rule can never
 * point at a null number.
 */
export const MARKUP_KIND = ["FLAT", "PERCENT"] as const;
export type MarkupKind = (typeof MARKUP_KIND)[number];

export const MARKUP_KIND_LABEL: Record<MarkupKind, string> = {
  FLAT: "Flat amount (₹)",
  PERCENT: "Percentage (%)",
};

/** The three documents every agent uploads at registration. */
export const DOCUMENT_KIND = ["PAN_CARD", "BUSINESS_PROOF", "VISITING_CARD"] as const;
export type DocumentKind = (typeof DOCUMENT_KIND)[number];

function makeGuard<T extends readonly string[]>(values: T) {
  const set = new Set<string>(values);
  return (v: unknown): v is T[number] => typeof v === "string" && set.has(v);
}

export const isAgentStatus = makeGuard(AGENT_STATUS);
export const isProductType = makeGuard(PRODUCT_TYPE);
export const isMealPlan = makeGuard(MEAL_PLAN);
export const isHouseboatCategory = makeGuard(HOUSEBOAT_CATEGORY);
export const isCruisePackage = makeGuard(CRUISE_PACKAGE);
export const isVehicleRateType = makeGuard(VEHICLE_RATE_TYPE);
export const isDocumentKind = makeGuard(DOCUMENT_KIND);
export const isAgentTier = makeGuard(AGENT_TIER);
export const isRateCharge = makeGuard(RATE_CHARGE);
export const isMarkupKind = makeGuard(MARKUP_KIND);
export const isHouseboatPricingMode = makeGuard(HOUSEBOAT_PRICING_MODE);
export const isItineraryPricingMode = makeGuard(ITINERARY_PRICING_MODE);
