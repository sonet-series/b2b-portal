-- Vehicle photographs, shown to agents inside the portal.
--
-- HAND-WRITTEN, and deliberately two ALTER TABLE statements rather than
-- Prisma's generated table rebuild.
--
-- Adding a NULLABLE column to SQLite is a metadata-only change: no new table,
-- no INSERT ... SELECT, and so none of the P3009 failure mode that has bitten
-- this project three times (see CLAUDE.md). A rebuild here would copy every
-- Vehicle row for no reason at all.
--
-- Nullable as a pair: a vehicle with no photograph quotes exactly as it did
-- before. The files themselves live on disk under UPLOAD_DIR, not in here.

ALTER TABLE "Vehicle" ADD COLUMN "photoStoredName" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "photoMimeType" TEXT;
