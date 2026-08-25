/*
  Warnings:

  - You are about to drop the column `ratePerCruiseMinor` on the `HouseboatRate` table. All the data in the column will be lost.
  - You are about to drop the column `basePricePerPaxMinor` on the `Itinerary` table. All the data in the column will be lost.
  - You are about to drop the column `singleSupplementMinor` on the `Itinerary` table. All the data in the column will be lost.
  - Added the required column `pricingMode` to the `HouseboatRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rateMinor` to the `HouseboatRate` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "ItineraryRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itineraryId" TEXT NOT NULL,
    "pricingMode" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "singleSupplementMinor" INTEGER,
    "maxPax" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItineraryRate_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "Itinerary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HouseboatRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "houseboatId" TEXT NOT NULL,
    "cruisePackage" TEXT NOT NULL,
    "pricingMode" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "rateMinor" INTEGER NOT NULL,
    "includedPax" INTEGER,
    "extraPaxRateMinor" INTEGER,
    "minPax" INTEGER,
    "maxPax" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HouseboatRate_houseboatId_fkey" FOREIGN KEY ("houseboatId") REFERENCES "Houseboat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HouseboatRate" ("active", "createdAt", "cruisePackage", "extraPaxRateMinor", "houseboatId", "id", "includedPax", "maxPax", "mealPlan", "seasonLabel", "updatedAt", "validFrom", "validTo") SELECT "active", "createdAt", "cruisePackage", "extraPaxRateMinor", "houseboatId", "id", "includedPax", "maxPax", "mealPlan", "seasonLabel", "updatedAt", "validFrom", "validTo" FROM "HouseboatRate";
DROP TABLE "HouseboatRate";
ALTER TABLE "new_HouseboatRate" RENAME TO "HouseboatRate";
CREATE INDEX "HouseboatRate_houseboatId_active_idx" ON "HouseboatRate"("houseboatId", "active");
CREATE INDEX "HouseboatRate_validFrom_validTo_idx" ON "HouseboatRate"("validFrom", "validTo");
CREATE TABLE "new_Itinerary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "durationNights" INTEGER NOT NULL,
    "routeSummary" TEXT,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Itinerary" ("active", "createdAt", "durationNights", "exclusions", "id", "inclusions", "name", "routeSummary", "updatedAt") SELECT "active", "createdAt", "durationNights", "exclusions", "id", "inclusions", "name", "routeSummary", "updatedAt" FROM "Itinerary";
DROP TABLE "Itinerary";
ALTER TABLE "new_Itinerary" RENAME TO "Itinerary";
CREATE INDEX "Itinerary_active_idx" ON "Itinerary"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ItineraryRate_itineraryId_active_idx" ON "ItineraryRate"("itineraryId", "active");

-- CreateIndex
CREATE INDEX "ItineraryRate_validFrom_validTo_idx" ON "ItineraryRate"("validFrom", "validTo");
