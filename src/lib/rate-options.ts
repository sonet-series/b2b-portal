import "server-only";
import { prisma } from "./db";
import { formatDateDisplay } from "./dates";
import type { AgentTier, RateCharge } from "./enums";
import { loadMarkupTable } from "./markup-store";
import { sellPrice, sellPriceOptional } from "./markup";
import { RATE_CHARGE_LABEL } from "./enums";
import {
  CRUISE_PACKAGE_LABEL,
  VEHICLE_RATE_TYPE_LABEL,
  HOUSEBOAT_PRICING_MODE_LABEL,
  ITINERARY_PRICING_MODE_LABEL,
  type CruisePackage,
  type VehicleRateType,
  type HouseboatPricingMode,
  type ItineraryPricingMode,
  type ProductType,
} from "./enums";

/** One overridable charge on a rate row, already priced for the agent's tier. */
export type ChargeOption = {
  charge: RateCharge;
  label: string;
  /** Null when the row does not offer this charge at all. */
  defaultMinor: number | null;
};

export type RateOption = {
  productType: ProductType;
  referenceId: string;
  label: string;
  /** The MAIN charge default for the tier this list was built for. */
  defaultMinor: number;
  /** Every charge this row carries, so the admin can override any one of them. */
  charges: ChargeOption[];
};

/**
 * Every priced row an agent override can point at, flattened into one list.
 *
 * The four product types live in four tables with different price columns, so
 * this is where that difference is collapsed. Labels carry enough context —
 * property, variant, season — that Sonet can tell two rates apart in a dropdown.
 */
export async function listRateOptions(tier: AgentTier): Promise<RateOption[]> {
  // Defaults shown to the admin are SELL prices for this agent's tier, derived
  // from cost — the same number the agent would be quoted without an override.
  const markup = await loadMarkupTable();

  const forTier = (productType: ProductType, costMinor: number) =>
    sellPrice(markup, productType, tier, costMinor);

  /** Ancillary charges are optional and inherit the parent product's markup. */
  const optionalForTier = (productType: ProductType, costMinor: number | null) =>
    sellPriceOptional(markup, productType, tier, costMinor);

  const charge = (c: RateCharge, defaultMinor: number | null): ChargeOption => ({
    charge: c,
    label: RATE_CHARGE_LABEL[c],
    defaultMinor,
  });

  const [hotelRates, houseboatRates, vehicleRates, itineraryRates] = await Promise.all([
    prisma.hotelRate.findMany({
      where: { active: true, hotel: { active: true } },
      include: { hotel: { select: { name: true, location: true } } },
      orderBy: [{ hotel: { name: "asc" } }, { roomType: "asc" }],
    }),
    prisma.houseboatRate.findMany({
      where: { active: true, houseboat: { active: true } },
      include: { houseboat: { select: { name: true, location: true } } },
      orderBy: [{ houseboat: { name: "asc" } }, { cruisePackage: "asc" }],
    }),
    prisma.vehicleRate.findMany({
      where: { active: true, vehicle: { active: true } },
      include: { vehicle: { select: { type: true } } },
      orderBy: [{ vehicle: { type: "asc" } }, { rateType: "asc" }],
    }),
    prisma.itineraryRate.findMany({
      where: { active: true, itinerary: { active: true } },
      include: { itinerary: { select: { name: true } } },
      orderBy: [{ itinerary: { name: "asc" } }, { pricingMode: "asc" }],
    }),
  ]);

  const season = (from: Date, to: Date, label: string) =>
    `${label} ${formatDateDisplay(from)}→${formatDateDisplay(to)}`;

  return [
    ...hotelRates.map((r) => ({
      productType: "hotel" as const,
      referenceId: r.id,
      label: `${r.hotel.name} (${r.hotel.location}) · ${r.roomType} ${r.mealPlan} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: forTier("hotel", r.costPerNightMinor),
      charges: [
        charge("MAIN", forTier("hotel", r.costPerNightMinor)),
        charge("EXTRA_BED", optionalForTier("hotel", r.extraBedCostMinor)),
      ],
    })),
    ...houseboatRates.map((r) => ({
      productType: "houseboat" as const,
      referenceId: r.id,
      label: `${r.houseboat.name} (${r.houseboat.location}) · ${CRUISE_PACKAGE_LABEL[r.cruisePackage as CruisePackage] ?? r.cruisePackage} · ${HOUSEBOAT_PRICING_MODE_LABEL[r.pricingMode as HouseboatPricingMode] ?? r.pricingMode} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: forTier("houseboat", r.costMinor),
      charges: [
        charge("MAIN", forTier("houseboat", r.costMinor)),
        charge("EXTRA_PAX", optionalForTier("houseboat", r.extraPaxCostMinor)),
      ],
    })),
    ...vehicleRates.map((r) => ({
      productType: "vehicle" as const,
      referenceId: r.id,
      label: `${r.vehicle.type} · ${VEHICLE_RATE_TYPE_LABEL[r.rateType as VehicleRateType] ?? r.rateType} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: forTier("vehicle", r.costMinor),
      charges: [
        charge("MAIN", forTier("vehicle", r.costMinor)),
        charge("EXTRA_KM", optionalForTier("vehicle", r.extraKmCostMinor)),
        charge(
          "DRIVER_ALLOWANCE",
          optionalForTier("vehicle", r.driverAllowanceCostMinor)
        ),
      ],
    })),
    ...itineraryRates.map((r) => ({
      productType: "itinerary" as const,
      referenceId: r.id,
      label: `${r.itinerary.name} · ${ITINERARY_PRICING_MODE_LABEL[r.pricingMode as ItineraryPricingMode] ?? r.pricingMode} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: forTier("itinerary", r.costMinor),
      charges: [
        charge("MAIN", forTier("itinerary", r.costMinor)),
        charge(
          "SINGLE_SUPPLEMENT",
          optionalForTier("itinerary", r.singleSupplementCostMinor)
        ),
      ],
    })),
  ];
}
