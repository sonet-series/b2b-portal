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

export const VEHICLE_RATE_TYPE = ["PER_KM", "PER_DAY", "TRANSFER"] as const;
export type VehicleRateType = (typeof VEHICLE_RATE_TYPE)[number];

export const VEHICLE_RATE_TYPE_LABEL: Record<VehicleRateType, string> = {
  PER_KM: "Per km",
  PER_DAY: "Per day (with km allowance)",
  TRANSFER: "Point-to-point transfer (flat)",
};

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
