-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "starCategory" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HotelRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hotelId" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "ratePerNightMinor" INTEGER NOT NULL,
    "extraBedRateMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HotelRate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Houseboat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "operator" TEXT,
    "category" TEXT NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "amenities" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HouseboatRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "houseboatId" TEXT NOT NULL,
    "cruisePackage" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "ratePerCruiseMinor" INTEGER NOT NULL,
    "includedPax" INTEGER NOT NULL,
    "maxPax" INTEGER NOT NULL,
    "extraPaxRateMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HouseboatRate_houseboatId_fkey" FOREIGN KEY ("houseboatId") REFERENCES "Houseboat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VehicleRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "rateType" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "rateMinor" INTEGER NOT NULL,
    "includedKmPerDay" INTEGER,
    "extraKmRateMinor" INTEGER,
    "driverAllowanceMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleRate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Itinerary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "durationNights" INTEGER NOT NULL,
    "routeSummary" TEXT,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "basePricePerPaxMinor" INTEGER NOT NULL,
    "singleSupplementMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "gstOrLicenseNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "passwordHash" TEXT NOT NULL,
    "adminNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "approvedAt" DATETIME,
    "lastLoginAt" DATETIME
);

-- CreateTable
CREATE TABLE "AgentRateCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "overridePriceMinor" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentRateCard_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "travelStart" DATETIME NOT NULL,
    "travelEnd" DATETIME NOT NULL,
    "pax" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "usedOverride" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "Hotel_active_location_idx" ON "Hotel"("active", "location");

-- CreateIndex
CREATE INDEX "HotelRate_hotelId_active_idx" ON "HotelRate"("hotelId", "active");

-- CreateIndex
CREATE INDEX "HotelRate_validFrom_validTo_idx" ON "HotelRate"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "Houseboat_active_location_category_idx" ON "Houseboat"("active", "location", "category");

-- CreateIndex
CREATE INDEX "HouseboatRate_houseboatId_active_idx" ON "HouseboatRate"("houseboatId", "active");

-- CreateIndex
CREATE INDEX "HouseboatRate_validFrom_validTo_idx" ON "HouseboatRate"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "Vehicle_active_idx" ON "Vehicle"("active");

-- CreateIndex
CREATE INDEX "VehicleRate_vehicleId_active_idx" ON "VehicleRate"("vehicleId", "active");

-- CreateIndex
CREATE INDEX "VehicleRate_validFrom_validTo_idx" ON "VehicleRate"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "Itinerary_active_idx" ON "Itinerary"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");

-- CreateIndex
CREATE INDEX "Agent_status_createdAt_idx" ON "Agent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRateCard_agentId_productType_idx" ON "AgentRateCard"("agentId", "productType");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRateCard_agentId_productType_referenceId_key" ON "AgentRateCard"("agentId", "productType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_reference_key" ON "Quote"("reference");

-- CreateIndex
CREATE INDEX "Quote_agentId_createdAt_idx" ON "Quote"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_idx" ON "QuoteLine"("quoteId");
