/*
  Warnings:

  - You are about to drop the column `ratePerNightMinor` on the `HotelRate` table. All the data in the column will be lost.
  - You are about to drop the column `rateMinor` on the `HouseboatRate` table. All the data in the column will be lost.
  - You are about to drop the column `priceMinor` on the `ItineraryRate` table. All the data in the column will be lost.
  - You are about to drop the column `rateMinor` on the `VehicleRate` table. All the data in the column will be lost.
  - Added the required column `ratePerNightKeralaMinor` to the `HotelRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ratePerNightOutsideKeralaMinor` to the `HotelRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rateKeralaMinor` to the `HouseboatRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rateOutsideKeralaMinor` to the `HouseboatRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `priceKeralaMinor` to the `ItineraryRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `priceOutsideKeralaMinor` to the `ItineraryRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rateKeralaMinor` to the `VehicleRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rateOutsideKeralaMinor` to the `VehicleRate` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "altPhone" TEXT,
    "altEmail" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "derivedTier" TEXT NOT NULL DEFAULT 'KERALA',
    "tierOverride" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "adminNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "approvedAt" DATETIME,
    "lastLoginAt" DATETIME
);
INSERT INTO "new_Agent" ("address", "adminNotes", "agencyName", "altEmail", "altPhone", "approvedAt", "contactName", "createdAt", "email", "id", "lastLoginAt", "mustChangePassword", "passwordHash", "phone", "status", "updatedAt") SELECT "address", "adminNotes", "agencyName", "altEmail", "altPhone", "approvedAt", "contactName", "createdAt", "email", "id", "lastLoginAt", "mustChangePassword", "passwordHash", "phone", "status", "updatedAt" FROM "Agent";
DROP TABLE "Agent";
ALTER TABLE "new_Agent" RENAME TO "Agent";
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");
CREATE INDEX "Agent_status_createdAt_idx" ON "Agent"("status", "createdAt");
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
    "extraBedRateMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HotelRate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HotelRate" ("active", "createdAt", "extraBedRateMinor", "hotelId", "id", "mealPlan", "roomType", "seasonLabel", "updatedAt", "validFrom", "validTo") SELECT "active", "createdAt", "extraBedRateMinor", "hotelId", "id", "mealPlan", "roomType", "seasonLabel", "updatedAt", "validFrom", "validTo" FROM "HotelRate";
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
    "extraPaxRateMinor" INTEGER,
    "minPax" INTEGER,
    "maxPax" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HouseboatRate_houseboatId_fkey" FOREIGN KEY ("houseboatId") REFERENCES "Houseboat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HouseboatRate" ("active", "createdAt", "cruisePackage", "extraPaxRateMinor", "houseboatId", "id", "includedPax", "maxPax", "mealPlan", "minPax", "pricingMode", "seasonLabel", "updatedAt", "validFrom", "validTo") SELECT "active", "createdAt", "cruisePackage", "extraPaxRateMinor", "houseboatId", "id", "includedPax", "maxPax", "mealPlan", "minPax", "pricingMode", "seasonLabel", "updatedAt", "validFrom", "validTo" FROM "HouseboatRate";
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
    "singleSupplementMinor" INTEGER,
    "maxPax" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItineraryRate_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "Itinerary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ItineraryRate" ("active", "createdAt", "id", "itineraryId", "maxPax", "pricingMode", "seasonLabel", "singleSupplementMinor", "updatedAt", "validFrom", "validTo") SELECT "active", "createdAt", "id", "itineraryId", "maxPax", "pricingMode", "seasonLabel", "singleSupplementMinor", "updatedAt", "validFrom", "validTo" FROM "ItineraryRate";
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
    "extraKmRateMinor" INTEGER,
    "driverAllowanceMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleRate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VehicleRate" ("active", "createdAt", "driverAllowanceMinor", "extraKmRateMinor", "id", "includedKmPerDay", "rateType", "seasonLabel", "updatedAt", "validFrom", "validTo", "vehicleId") SELECT "active", "createdAt", "driverAllowanceMinor", "extraKmRateMinor", "id", "includedKmPerDay", "rateType", "seasonLabel", "updatedAt", "validFrom", "validTo", "vehicleId" FROM "VehicleRate";
DROP TABLE "VehicleRate";
ALTER TABLE "new_VehicleRate" RENAME TO "VehicleRate";
CREATE INDEX "VehicleRate_vehicleId_active_idx" ON "VehicleRate"("vehicleId", "active");
CREATE INDEX "VehicleRate_validFrom_validTo_idx" ON "VehicleRate"("validFrom", "validTo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
