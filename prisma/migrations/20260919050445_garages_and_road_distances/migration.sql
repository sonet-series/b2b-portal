-- CreateTable
CREATE TABLE "Garage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GarageVehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "garageId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GarageVehicle_garageId_fkey" FOREIGN KEY ("garageId") REFERENCES "Garage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GarageVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoadDistance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "meters" INTEGER NOT NULL,
    "seconds" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Garage_name_key" ON "Garage"("name");

-- CreateIndex
CREATE INDEX "Garage_active_idx" ON "Garage"("active");

-- CreateIndex
CREATE INDEX "GarageVehicle_garageId_active_idx" ON "GarageVehicle"("garageId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "GarageVehicle_garageId_vehicleId_key" ON "GarageVehicle"("garageId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "RoadDistance_origin_destination_key" ON "RoadDistance"("origin", "destination");
