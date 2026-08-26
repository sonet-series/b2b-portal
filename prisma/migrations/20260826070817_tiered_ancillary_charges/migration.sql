/*
  Warnings:

  - You are about to drop the column `extraBedRateMinor` on the `HotelRate` table. All the data in the column will be lost.
  - You are about to drop the column `extraPaxRateMinor` on the `HouseboatRate` table. All the data in the column will be lost.
  - You are about to drop the column `singleSupplementMinor` on the `ItineraryRate` table. All the data in the column will be lost.
  - You are about to drop the column `driverAllowanceMinor` on the `VehicleRate` table. All the data in the column will be lost.
  - You are about to drop the column `extraKmRateMinor` on the `VehicleRate` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentRateCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "charge" TEXT NOT NULL DEFAULT 'MAIN',
    "overridePriceMinor" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentRateCard_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AgentRateCard" ("agentId", "createdAt", "id", "notes", "overridePriceMinor", "productType", "referenceId", "updatedAt") SELECT "agentId", "createdAt", "id", "notes", "overridePriceMinor", "productType", "referenceId", "updatedAt" FROM "AgentRateCard";
DROP TABLE "AgentRateCard";
ALTER TABLE "new_AgentRateCard" RENAME TO "AgentRateCard";
CREATE INDEX "AgentRateCard_agentId_productType_idx" ON "AgentRateCard"("agentId", "productType");
CREATE UNIQUE INDEX "AgentRateCard_agentId_productType_referenceId_charge_key" ON "AgentRateCard"("agentId", "productType", "referenceId", "charge");
CREATE TABLE "new_HotelRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hotelId" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "ratePerNightKeralaMinor" INTEGER NOT NULL,
    "ratePerNightOutsideKeralaMinor" INTEGER NOT NULL,
    "extraBedKeralaMinor" INTEGER,
    "extraBedOutsideKeralaMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HotelRate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HotelRate" ("active", "createdAt", "hotelId", "id", "mealPlan", "ratePerNightKeralaMinor", "ratePerNightOutsideKeralaMinor", "roomType", "seasonLabel", "updatedAt", "validFrom", "validTo") SELECT "active", "createdAt", "hotelId", "id", "mealPlan", "ratePerNightKeralaMinor", "ratePerNightOutsideKeralaMinor", "roomType", "seasonLabel", "updatedAt", "validFrom", "validTo" FROM "HotelRate";
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
    "rateKeralaMinor" INTEGER NOT NULL,
    "rateOutsideKeralaMinor" INTEGER NOT NULL,
    "includedPax" INTEGER,
    "extraPaxKeralaMinor" INTEGER,
    "extraPaxOutsideKeralaMinor" INTEGER,
    "minPax" INTEGER,
    "maxPax" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HouseboatRate_houseboatId_fkey" FOREIGN KEY ("houseboatId") REFERENCES "Houseboat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HouseboatRate" ("active", "createdAt", "cruisePackage", "houseboatId", "id", "includedPax", "maxPax", "mealPlan", "minPax", "pricingMode", "rateKeralaMinor", "rateOutsideKeralaMinor", "seasonLabel", "updatedAt", "validFrom", "validTo") SELECT "active", "createdAt", "cruisePackage", "houseboatId", "id", "includedPax", "maxPax", "mealPlan", "minPax", "pricingMode", "rateKeralaMinor", "rateOutsideKeralaMinor", "seasonLabel", "updatedAt", "validFrom", "validTo" FROM "HouseboatRate";
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
    "priceKeralaMinor" INTEGER NOT NULL,
    "priceOutsideKeralaMinor" INTEGER NOT NULL,
    "singleSupplementKeralaMinor" INTEGER,
    "singleSupplementOutsideKeralaMinor" INTEGER,
    "maxPax" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItineraryRate_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "Itinerary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ItineraryRate" ("active", "createdAt", "id", "itineraryId", "maxPax", "priceKeralaMinor", "priceOutsideKeralaMinor", "pricingMode", "seasonLabel", "updatedAt", "validFrom", "validTo") SELECT "active", "createdAt", "id", "itineraryId", "maxPax", "priceKeralaMinor", "priceOutsideKeralaMinor", "pricingMode", "seasonLabel", "updatedAt", "validFrom", "validTo" FROM "ItineraryRate";
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
    "rateKeralaMinor" INTEGER NOT NULL,
    "rateOutsideKeralaMinor" INTEGER NOT NULL,
    "includedKmPerDay" INTEGER,
    "extraKmKeralaMinor" INTEGER,
    "extraKmOutsideKeralaMinor" INTEGER,
    "driverAllowanceKeralaMinor" INTEGER,
    "driverAllowanceOutsideKeralaMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleRate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VehicleRate" ("active", "createdAt", "id", "includedKmPerDay", "rateKeralaMinor", "rateOutsideKeralaMinor", "rateType", "seasonLabel", "updatedAt", "validFrom", "validTo", "vehicleId") SELECT "active", "createdAt", "id", "includedKmPerDay", "rateKeralaMinor", "rateOutsideKeralaMinor", "rateType", "seasonLabel", "updatedAt", "validFrom", "validTo", "vehicleId" FROM "VehicleRate";
DROP TABLE "VehicleRate";
ALTER TABLE "new_VehicleRate" RENAME TO "VehicleRate";
CREATE INDEX "VehicleRate_vehicleId_active_idx" ON "VehicleRate"("vehicleId", "active");
CREATE INDEX "VehicleRate_validFrom_validTo_idx" ON "VehicleRate"("validFrom", "validTo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
