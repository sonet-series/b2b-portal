-- Standard tour templates: the circuits Series Tours actually sells.
--
-- HAND-WRITTEN, and only CREATE TABLE / CREATE INDEX. Both are metadata-only
-- in SQLite: no table rebuild, no `INSERT ... SELECT`, and therefore none of
-- the P3009 half-applied failure this project has lost an evening to three
-- times. Prisma's generated version would have rebuilt nothing here, but the
-- habit is what keeps that true.
--
-- `IF NOT EXISTS` on both, so a migration interrupted between the two
-- statements can be re-run from its own half-finished state. Migrations apply
-- unattended on container start.

CREATE TABLE IF NOT EXISTS "TourTemplate" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "name"        TEXT NOT NULL,
    "startPlace"  TEXT NOT NULL,
    "nights"      INTEGER NOT NULL,
    "allowanceKm" INTEGER NOT NULL,
    "notes"       TEXT,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "TourTemplate_active_sortOrder_idx"
    ON "TourTemplate"("active", "sortOrder");

CREATE TABLE IF NOT EXISTS "TourTemplateDay" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "dayIndex"   INTEGER NOT NULL,
    "to"         TEXT NOT NULL,
    "viaCsv"     TEXT,
    CONSTRAINT "TourTemplateDay_templateId_fkey" FOREIGN KEY ("templateId")
        REFERENCES "TourTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique on the day index: a template with two "day 2" rows would generate an
-- itinerary whose length disagrees with its own night count, and the quote
-- builder derives its day rows from the hire dates — so that disagreement
-- would surface as a silently wrong plan rather than an error.
CREATE UNIQUE INDEX IF NOT EXISTS "TourTemplateDay_templateId_dayIndex_key"
    ON "TourTemplateDay"("templateId", "dayIndex");
