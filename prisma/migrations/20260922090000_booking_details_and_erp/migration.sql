-- Guest, arrival/departure and nightly accommodation details on a booking,
-- plus the columns that record an ERP push.
--
-- HAND-WRITTEN and purely ADDITIVE. Every new Booking column is nullable or
-- carries a default, and the two new tables are new — so this is metadata-only
-- in SQLite: no table rebuild, no INSERT ... SELECT, none of the P3009 failure
-- mode. Prisma's generated version would have rebuilt Booking and re-copied
-- every row to achieve the same thing.
--
-- Re-runnable from its own half-finished state for the tables and indexes.
-- ADD COLUMN is not (SQLite has no IF NOT EXISTS for columns), but nothing
-- here carries data, so a failure part-way loses nothing and only needs the
-- remaining statements run by hand.

ALTER TABLE "Booking" ADD COLUMN "leadGuestName"   TEXT;
ALTER TABLE "Booking" ADD COLUMN "leadGuestPhone"  TEXT;
ALTER TABLE "Booking" ADD COLUMN "leadGuestEmail"  TEXT;

ALTER TABLE "Booking" ADD COLUMN "arrivalDate"     DATETIME;
ALTER TABLE "Booking" ADD COLUMN "arrivalTime"     TEXT;
ALTER TABLE "Booking" ADD COLUMN "arrivalFlight"   TEXT;
ALTER TABLE "Booking" ADD COLUMN "arrivalFrom"     TEXT;

ALTER TABLE "Booking" ADD COLUMN "departureDate"   DATETIME;
ALTER TABLE "Booking" ADD COLUMN "departureTime"   TEXT;
ALTER TABLE "Booking" ADD COLUMN "departureFlight" TEXT;
ALTER TABLE "Booking" ADD COLUMN "departureTo"     TEXT;

ALTER TABLE "Booking" ADD COLUMN "erpReference"    TEXT;
ALTER TABLE "Booking" ADD COLUMN "erpPushedAt"     DATETIME;
ALTER TABLE "Booking" ADD COLUMN "erpError"        TEXT;
ALTER TABLE "Booking" ADD COLUMN "erpAttempts"     INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "BookingGuest" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "age"       INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BookingGuest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "BookingGuest_bookingId_sortOrder_idx" ON "BookingGuest"("bookingId", "sortOrder");

CREATE TABLE IF NOT EXISTS "BookingStay" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "bookingId"       TEXT NOT NULL,
    "dayIndex"        INTEGER NOT NULL,
    "date"            DATETIME NOT NULL,
    "place"           TEXT NOT NULL,
    "property"        TEXT,
    "confirmationRef" TEXT,
    "notes"           TEXT,
    CONSTRAINT "BookingStay_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Unique, not merely indexed: seeding one row per night from the day plan must
-- be safe to run again without doubling the list.
CREATE UNIQUE INDEX IF NOT EXISTS "BookingStay_bookingId_dayIndex_key" ON "BookingStay"("bookingId", "dayIndex");
