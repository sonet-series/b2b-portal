-- Catalogue photographs: up to 5 per vehicle, 10 per hotel and houseboat.
--
-- HAND-WRITTEN. Three things about the shape of this are deliberate.
--
-- 1. Creating a NEW table touches no existing one, so there is no rebuild and
--    none of the P3009 failure mode (see CLAUDE.md). The three parent tables
--    gain only Prisma back-relations, which are virtual and change no SQL.
--
-- 2. The single photograph each Vehicle could hold — added this morning, and
--    possibly already used in production — is MOVED into the new table, not
--    dropped. Losing a photograph Sonet had uploaded hours earlier because the
--    feature grew would be the worst possible way to deliver "now allow five".
--
-- 3. Only THEN are the old columns removed, and only because they are nullable
--    and nothing else reads them. DROP COLUMN is used rather than a table
--    rebuild precisely to avoid copying every Vehicle row.
--
-- Re-runnable up to the DROPs, which is where a failure would realistically
-- land: CREATE IF NOT EXISTS, and an INSERT that skips a vehicle whose
-- photograph is already carried across. Tested by running it to that point
-- twice against a populated copy — one photograph, not two.
--
-- HONESTLY, the two DROP COLUMNs are not: SQLite has no DROP COLUMN IF EXISTS,
-- so a failure BETWEEN them leaves a state a re-run cannot fix (the INSERT
-- above would reference a column that is gone). That window is two adjacent
-- metadata-only statements wide, and everything that carries data has already
-- committed by then — so a failure there loses nothing, it just needs a human
-- to drop the remaining column by hand.

CREATE TABLE IF NOT EXISTS "ProductPhoto" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "storedName"  TEXT NOT NULL,
    "mimeType"    TEXT NOT NULL,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicleId"   TEXT,
    "hotelId"     TEXT,
    "houseboatId" TEXT,
    CONSTRAINT "ProductPhoto_vehicleId_fkey"   FOREIGN KEY ("vehicleId")   REFERENCES "Vehicle" ("id")   ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductPhoto_hotelId_fkey"     FOREIGN KEY ("hotelId")     REFERENCES "Hotel" ("id")     ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductPhoto_houseboatId_fkey" FOREIGN KEY ("houseboatId") REFERENCES "Houseboat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductPhoto_vehicleId_sortOrder_idx"   ON "ProductPhoto"("vehicleId", "sortOrder");
CREATE INDEX IF NOT EXISTS "ProductPhoto_hotelId_sortOrder_idx"     ON "ProductPhoto"("hotelId", "sortOrder");
CREATE INDEX IF NOT EXISTS "ProductPhoto_houseboatId_sortOrder_idx" ON "ProductPhoto"("houseboatId", "sortOrder");

-- Carry across every single-photo Vehicle. The WHERE clause on ProductPhoto
-- makes this safe to run twice: a vehicle whose photograph is already here is
-- skipped rather than duplicated.
INSERT INTO "ProductPhoto" ("id", "storedName", "mimeType", "sortOrder", "vehicleId")
SELECT
    lower(
        hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2)
        || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2)
        || '-' || hex(randomblob(6))
    ),
    "photoStoredName",
    "photoMimeType",
    0,
    "id"
FROM "Vehicle"
WHERE "photoStoredName" IS NOT NULL
  AND "photoMimeType" IS NOT NULL
  AND "id" NOT IN (SELECT "vehicleId" FROM "ProductPhoto" WHERE "vehicleId" IS NOT NULL);

ALTER TABLE "Vehicle" DROP COLUMN "photoStoredName";
ALTER TABLE "Vehicle" DROP COLUMN "photoMimeType";
