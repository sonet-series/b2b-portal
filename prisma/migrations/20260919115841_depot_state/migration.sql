-- Give each depot its home state.
--
-- Prisma generated a full table REBUILD for this: create new_Garage, copy,
-- drop, rename. That rebuild would have worked — the new column has a default,
-- so the INSERT ... SELECT omitting it is fine — but Garage is referenced by
-- GarageVehicle, and rebuilding a table other rows point at is a risk taken
-- for no reason when SQLite can add the column in place.
--
-- One statement, atomic, no rebuild, nothing pointing at Garage disturbed.
-- Existing depots become Kerala, which is correct: Kochi is the only one.

ALTER TABLE "Garage" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'Kerala';
