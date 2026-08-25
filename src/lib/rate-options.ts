import "server-only";
import { prisma } from "./db";
import { formatDateOnly } from "./dates";
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

export type RateOption = {
  productType: ProductType;
  referenceId: string;
  label: string;
  defaultMinor: number;
};

/**
 * Every priced row an agent override can point at, flattened into one list.
 *
 * The four product types live in four tables with different price columns, so
 * this is where that difference is collapsed. Labels carry enough context —
 * property, variant, season — that Sonet can tell two rates apart in a dropdown.
 */
export async function listRateOptions(): Promise<RateOption[]> {
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
    `${label} ${formatDateOnly(from)}→${formatDateOnly(to)}`;

  return [
    ...hotelRates.map((r) => ({
      productType: "hotel" as const,
      referenceId: r.id,
      label: `${r.hotel.name} (${r.hotel.location}) · ${r.roomType} ${r.mealPlan} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: r.ratePerNightMinor,
    })),
    ...houseboatRates.map((r) => ({
      productType: "houseboat" as const,
      referenceId: r.id,
      label: `${r.houseboat.name} (${r.houseboat.location}) · ${CRUISE_PACKAGE_LABEL[r.cruisePackage as CruisePackage] ?? r.cruisePackage} · ${HOUSEBOAT_PRICING_MODE_LABEL[r.pricingMode as HouseboatPricingMode] ?? r.pricingMode} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: r.rateMinor,
    })),
    ...vehicleRates.map((r) => ({
      productType: "vehicle" as const,
      referenceId: r.id,
      label: `${r.vehicle.type} · ${VEHICLE_RATE_TYPE_LABEL[r.rateType as VehicleRateType] ?? r.rateType} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: r.rateMinor,
    })),
    ...itineraryRates.map((r) => ({
      productType: "itinerary" as const,
      referenceId: r.id,
      label: `${r.itinerary.name} · ${ITINERARY_PRICING_MODE_LABEL[r.pricingMode as ItineraryPricingMode] ?? r.pricingMode} · ${season(r.validFrom, r.validTo, r.seasonLabel)}`,
      defaultMinor: r.priceMinor,
    })),
  ];
}
