-- ---------------------------------------------------------------------------
-- REPAIRED 27 Aug 2026, after this migration failed partway in production.
--
-- What went wrong: the four rate tables gain a NOT NULL cost column with no
-- default, and the INSERT..SELECT that copies rows across cannot supply it.
-- That succeeds only against EMPTY tables. It was generated and tested against
-- a local database whose catalogue had been cleared, so nothing caught it; the
-- production tables held rows and the rebuild died on the first INSERT,
-- leaving MarkupRule created and new_HotelRate stranded.
--
-- Two changes below:
--
--   1. The partial objects are dropped and the creates made idempotent, so
--      this can run from the half-finished state without hand-repair first.
--      The container applies migrations on boot; a migration that cannot
--      recover from its own failure needs a human at exactly the wrong moment.
--
--   2. The four rate tables are EMPTIED before the rebuild. Those rows held
--      manually-entered SELL prices per tier; this migration replaces that
--      with a single COST. There is no correct automatic conversion — the old
--      Kerala price already included a margin that did not exist as data — so
--      guessing one would bake a wrong number into every future quote.
--      Confirmed with Sonet 27 Aug 2026: the four rows were that day's test
--      entries and are re-entered by hand afterwards.
--
-- This is destructive by design and runs exactly once per database.
-- Agent rate-card overrides are deliberately NOT deleted: the admin screen
-- already shows an override whose rate is gone as "Rate deleted — this
-- override does nothing", so they are visible rather than silent.
-- ---------------------------------------------------------------------------

-- Clear anything the failed attempt left behind.
DROP TABLE IF EXISTS "new_HotelRate";
DROP TABLE IF EXISTS "new_HouseboatRate";
DROP TABLE IF EXISTS "new_VehicleRate";
DROP TABLE IF EXISTS "new_ItineraryRate";

-- Rows carrying tier sell-prices cannot be converted to a cost. See above.
DELETE FROM "HotelRate";
DELETE FROM "HouseboatRate";
DELETE FROM "VehicleRate";
DELETE FROM "ItineraryRate";

/*
  Warnings:

  - You are about to drop the column `extraBedKeralaMinor` on the `HotelRate` table. All the data in the column will be lost.
  - You are about to drop the column `extraBedOutsideKeralaMinor` on the `HotelRate` table. All the data in the column will be lost.
  - You are about to drop the column `ratePerNightKeralaMinor` on the `HotelRate` table. All the data in the column will be lost.
  - You are about to drop the column `ratePerNightOutsideKeralaMinor` on the `HotelRate` table. All the data in the column will be lost.
  - You are about to drop the column `extraPaxKeralaMinor` on the `HouseboatRate` table. All the data in the column will be lost.
  - You are about to drop the column `extraPaxOutsideKeralaMinor` on the `HouseboatRate` table. All the data in the column will be lost.
  - You are about to drop the column `rateKeralaMinor` on the `HouseboatRate` table. All the data in the column will be lost.
  - You are about to drop the column `rateOutsideKeralaMinor` on the `HouseboatRate` table. All the data in the column will be lost.
  - You are about to drop the column `priceKeralaMinor` on the `ItineraryRate` table. All the data in the column will be lost.
  - You are about to drop the column `priceOutsideKeralaMinor` on the `ItineraryRate` table. All the data in the column will be lost.
  - You are about to drop the column `singleSupplementKeralaMinor` on the `ItineraryRate` table. All the data in the column will be lost.
  - You are about to drop the column `singleSupplementOutsideKeralaMinor` on the `ItineraryRate` table. All the data in the column will be lost.
  - You are about to drop the column `driverAllowanceKeralaMinor` on the `VehicleRate` table. All the data in the column will be lost.
  - You are about to drop the column `driverAllowanceOutsideKeralaMinor` on the `VehicleRate` table. All the data in the column will be lost.
  - You are about to drop the column `extraKmKeralaMinor` on the `VehicleRate` table. All the data in the column will be lost.
  - You are about to drop the column `extraKmOutsideKeralaMinor` on the `VehicleRate` table. All the data in the column will be lost.
  - You are about to drop the column `rateKeralaMinor` on the `VehicleRate` table. All the data in the column will be lost.
  - You are about to drop the column `rateOutsideKeralaMinor` on the `VehicleRate` table. All the data in the column will be lost.
  - Added the required column `costPerNightMinor` to the `HotelRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `costMinor` to the `HouseboatRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `costMinor` to the `ItineraryRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `costMinor` to the `VehicleRate` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE IF NOT EXISTS "MarkupRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productType" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HotelRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hotelId" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "costPerNightMinor" INTEGER NOT NULL,
    "extraBedCostMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HotelRate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HotelRate" ("active", "createdAt", "hotelId", "id", "mealPlan", "roomType", "seasonLabel", "updatedAt", "validFrom", "validTo") SELECT "active", "createdAt", "hotelId", "id", "mealPlan", "roomType", "seasonLabel", "updatedAt", "validFrom", "validTo" FROM "HotelRate";
DROP TABLE "HotelRate";
ALTER TABLE "new_HotelRate" RENAME TO "HotelRate";
CREATE INDEX "HotelRate_hotelId_active_idx" ON "HotelRate"("hotelId", "active");
CREATE INDEX "HotelRate_validFrom_validTo_idx" ON "HotelRate"("validFrom", "validTo");
CREATE TABLE "new_HouseboatRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "houseboatId" TEXT NOT NULL,
    "cruisePackage" TEXT NOT NULL,
    "pricingMode" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "costMinor" INTEGER NOT NULL,
    "includedPax" INTEGER,
    "extraPaxCostMinor" INTEGER,
    "minPax" INTEGER,
    "maxPax" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HouseboatRate_houseboatId_fkey" FOREIGN KEY ("houseboatId") REFERENCES "Houseboat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HouseboatRate" ("active", "createdAt", "cruisePackage", "houseboatId", "id", "includedPax", "maxPax", "mealPlan", "minPax", "pricingMode", "seasonLabel", "updatedAt", "validFrom", "validTo") SELECT "active", "createdAt", "cruisePackage", "houseboatId", "id", "includedPax", "maxPax", "mealPlan", "minPax", "pricingMode", "seasonLabel", "updatedAt", "validFrom", "validTo" FROM "HouseboatRate";
DROP TABLE "HouseboatRate";
ALTER TABLE "new_HouseboatRate" RENAME TO "HouseboatRate";
CREATE INDEX "HouseboatRate_houseboatId_active_idx" ON "HouseboatRate"("houseboatId", "active");
CREATE INDEX "HouseboatRate_validFrom_validTo_idx" ON "HouseboatRate"("validFrom", "validTo");
CREATE TABLE "new_ItineraryRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itineraryId" TEXT NOT NULL,
    "pricingMode" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "costMinor" INTEGER NOT NULL,
    "singleSupplementCostMinor" INTEGER,
    "maxPax" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItineraryRate_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "Itinerary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ItineraryRate" ("active", "createdAt", "id", "itineraryId", "maxPax", "pricingMode", "seasonLabel", "updatedAt", "validFrom", "validTo") SELECT "active", "createdAt", "id", "itineraryId", "maxPax", "pricingMode", "seasonLabel", "updatedAt", "validFrom", "validTo" FROM "ItineraryRate";
DROP TABLE "ItineraryRate";
ALTER TABLE "new_ItineraryRate" RENAME TO "ItineraryRate";
CREATE INDEX "ItineraryRate_itineraryId_active_idx" ON "ItineraryRate"("itineraryId", "active");
CREATE INDEX "ItineraryRate_validFrom_validTo_idx" ON "ItineraryRate"("validFrom", "validTo");
CREATE TABLE "new_VehicleRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "rateType" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "costMinor" INTEGER NOT NULL,
    "includedKmPerDay" INTEGER,
    "extraKmCostMinor" INTEGER,
    "driverAllowanceCostMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleRate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VehicleRate" ("active", "createdAt", "id", "includedKmPerDay", "rateType", "seasonLabel", "updatedAt", "validFrom", "validTo", "vehicleId") SELECT "active", "createdAt", "id", "includedKmPerDay", "rateType", "seasonLabel", "updatedAt", "validFrom", "validTo", "vehicleId" FROM "VehicleRate";
DROP TABLE "VehicleRate";
ALTER TABLE "new_VehicleRate" RENAME TO "VehicleRate";
CREATE INDEX "VehicleRate_vehicleId_active_idx" ON "VehicleRate"("vehicleId", "active");
CREATE INDEX "VehicleRate_validFrom_validTo_idx" ON "VehicleRate"("validFrom", "validTo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MarkupRule_productType_tier_key" ON "MarkupRule"("productType", "tier");
