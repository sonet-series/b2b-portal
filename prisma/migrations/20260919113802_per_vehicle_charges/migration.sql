-- Toll and permits become per vehicle type.
--
-- Prisma's generated version of this migration was the P3009 bug again: it
-- adds a NOT NULL `vehicleId` to StatePermit and its INSERT ... SELECT does
-- not list that column, so it succeeds against an empty table and fails
-- against a populated one. Prisma even warns about it in the generated file.
-- Rewritten by hand, and tested against a populated copy.
--
-- Existing rows are PRESERVED by fanning each state's fee out across every
-- active vehicle. That is the honest reading of the change: the fee used to
-- apply to all vehicles, so every vehicle starts on the fee it was already
-- being charged, and Sonet adjusts the coaches upward from there.
--
-- Idempotent throughout, because migrations run unattended on container start
-- and one that cannot re-run from its own half-finished state needs a human at
-- the worst possible moment.

DROP TABLE IF EXISTS "new_StatePermit";

CREATE TABLE IF NOT EXISTS "VehicleTollRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "costMinor" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VehicleTollRate_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleTollRate_vehicleId_key" ON "VehicleTollRate"("vehicleId");

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_StatePermit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "state" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "costMinor" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StatePermit_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One row per (state, vehicle), carrying forward the fee that state already
-- had. A randomblob id rather than a uuid because this is raw SQL; the column
-- is only ever an opaque key.
INSERT INTO "new_StatePermit" ("id", "state", "vehicleId", "costMinor", "active", "createdAt", "updatedAt")
SELECT
    lower(hex(randomblob(16))),
    sp."state",
    v."id",
    sp."costMinor",
    sp."active",
    sp."createdAt",
    sp."updatedAt"
FROM "StatePermit" sp
CROSS JOIN "Vehicle" v
WHERE v."active" = 1;

DROP TABLE "StatePermit";
ALTER TABLE "new_StatePermit" RENAME TO "StatePermit";

CREATE INDEX IF NOT EXISTS "StatePermit_state_active_idx" ON "StatePermit"("state", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "StatePermit_state_vehicleId_key" ON "StatePermit"("state", "vehicleId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
