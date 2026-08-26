import "server-only";
import { prisma } from "./db";
import { formatDateDisplay } from "./dates";
import type { AgentTier, RateCharge } from "./enums";
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
  const forTier = (kerala: number, outsideKerala: number) =>
    tier === "KERALA" ? kerala : outsideKerala;

  /** Ancillary charges are optional; validation guarantees the pair is set together. */
  const optionalForTier = (kerala: number | null, outsideKerala: number | null) => {
    const value = tier === "KERALA" ? kerala : outsideKerala;
    return value ?? null;
  };

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
      defaultMinor: forTier(r.ratePerNightKeralaMinor, r.ratePerNightOutsideKeralaMinor),
      charges: [
        charge("MAIN", forTier(r.ratePerNightKeralaMinor, r.ratePerNightOutsideKeralaMinor)),
        charge("EXTRA_BED", optionalForTier(r.extraBedKeralaMinor, r.extraBedOutsideKeralaMinor)),
      ],
    })),
    ...houseboatRates.map((r) => ({
      productType: "houseboat" as const,
      referenceId: r.id,
      label: `${r.houseboat.name} (${r.houseboat.location}) · ${CRUISE_PACKAGE_LABEL[r.cruisePackage as CruisePackage] ?? r.cruisePackage} · ${HOUSEBOAT_PRICING_MODE_LABEL[r.pricingMode as HouseboatPricingMode] ?? r.pricingMode} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: forTier(r.rateKeralaMinor, r.rateOutsideKeralaMinor),
      charges: [
        charge("MAIN", forTier(r.rateKeralaMinor, r.rateOutsideKeralaMinor)),
        charge("EXTRA_PAX", optionalForTier(r.extraPaxKeralaMinor, r.extraPaxOutsideKeralaMinor)),
      ],
    })),
    ...vehicleRates.map((r) => ({
      productType: "vehicle" as const,
      referenceId: r.id,
      label: `${r.vehicle.type} · ${VEHICLE_RATE_TYPE_LABEL[r.rateType as VehicleRateType] ?? r.rateType} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: forTier(r.rateKeralaMinor, r.rateOutsideKeralaMinor),
      charges: [
        charge("MAIN", forTier(r.rateKeralaMinor, r.rateOutsideKeralaMinor)),
        charge("EXTRA_KM", optionalForTier(r.extraKmKeralaMinor, r.extraKmOutsideKeralaMinor)),
        charge(
          "DRIVER_ALLOWANCE",
          optionalForTier(r.driverAllowanceKeralaMinor, r.driverAllowanceOutsideKeralaMinor)
        ),
      ],
    })),
    ...itineraryRates.map((r) => ({
      productType: "itinerary" as const,
      referenceId: r.id,
      label: `${r.itinerary.name} · ${ITINERARY_PRICING_MODE_LABEL[r.pricingMode as ItineraryPricingMode] ?? r.pricingMode} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: forTier(r.priceKeralaMinor, r.priceOutsideKeralaMinor),
      charges: [
        charge("MAIN", forTier(r.priceKeralaMinor, r.priceOutsideKeralaMinor)),
        charge(
          "SINGLE_SUPPLEMENT",
          optionalForTier(
            r.singleSupplementKeralaMinor,
            r.singleSupplementOutsideKeralaMinor
          )
        ),
      ],
    })),
  ];
}
