-- The order vehicles appear in, chosen by Sonet rather than derived.
--
-- HAND-WRITTEN, and additive only: adding a column WITH a default is
-- metadata-only in SQLite, so there is no table rebuild and none of the P3009
-- failure mode. Prisma's generated version would have copied every Vehicle row
-- to achieve the same thing.
--
-- The UPDATE seeds the existing capacity ordering, so the first view after
-- deploying is exactly what was on screen before — nobody logs in to find
-- their fleet shuffled. It ranks each row by counting the rows that sort
-- before it, which needs no window function and no temporary table.
--
-- Re-runnable: ADD COLUMN fails on a second run (SQLite has no IF NOT EXISTS
-- for columns), but nothing has been destroyed by then and the UPDATE is
-- idempotent anyway — it recomputes the same ranks from the same data.

ALTER TABLE "Vehicle" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "Vehicle" SET "sortOrder" = (
    SELECT COUNT(*) FROM "Vehicle" AS other
    WHERE other."capacity" < "Vehicle"."capacity"
       OR (other."capacity" = "Vehicle"."capacity" AND other."id" < "Vehicle"."id")
);
