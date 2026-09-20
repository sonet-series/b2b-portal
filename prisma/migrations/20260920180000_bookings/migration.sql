-- Booking requests, and the payments recorded against them.
--
-- HAND-WRITTEN and purely ADDITIVE: two new tables and their indexes. No
-- existing table is touched — Quote and Agent gain only Prisma back-relations,
-- which are virtual and change no SQL — so there is no rebuild and none of the
-- P3009 failure mode. Safe to re-run from its own half-finished state.
--
-- NOTE ON SCOPE: BookingPayment records money that moved SOMEWHERE ELSE. The
-- agent pays Series Tours by their usual means and then files the proof here;
-- Sonet verifies it. No money moves through the portal, and nothing in this
-- migration is a payment rail. See the model comments in schema.prisma.

CREATE TABLE IF NOT EXISTS "Booking" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "reference"        TEXT NOT NULL,
    "quoteId"          TEXT NOT NULL,
    "agentId"          TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'REQUESTED',
    "agreedTotalMinor" INTEGER NOT NULL,
    "gstBps"           INTEGER NOT NULL,
    "depositBps"       INTEGER NOT NULL,
    "agentNote"        TEXT,
    "adminNote"        TEXT,
    "requestedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt"        DATETIME,
    CONSTRAINT "Booking_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique, not merely indexed: the reference is what people read down a phone
-- line, and one booking per quote is the rule two promises about one trip
-- would break.
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_reference_key" ON "Booking"("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_quoteId_key"   ON "Booking"("quoteId");
CREATE INDEX IF NOT EXISTS "Booking_status_requestedAt_idx"  ON "Booking"("status", "requestedAt");
CREATE INDEX IF NOT EXISTS "Booking_agentId_requestedAt_idx" ON "Booking"("agentId", "requestedAt");

CREATE TABLE IF NOT EXISTS "BookingPayment" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "bookingId"   TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reference"   TEXT,
    "paidOn"      DATETIME,
    "note"        TEXT,
    "storedName"  TEXT NOT NULL,
    "mimeType"    TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'SUBMITTED',
    "adminNote"   TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt"   DATETIME,
    CONSTRAINT "BookingPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BookingPayment_bookingId_submittedAt_idx" ON "BookingPayment"("bookingId", "submittedAt");
CREATE INDEX IF NOT EXISTS "BookingPayment_status_submittedAt_idx"    ON "BookingPayment"("status", "submittedAt");
