-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "gstOrLicenseNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "adminNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "approvedAt" DATETIME,
    "lastLoginAt" DATETIME
);
INSERT INTO "new_Agent" ("adminNotes", "agencyName", "approvedAt", "contactName", "createdAt", "email", "gstOrLicenseNumber", "id", "lastLoginAt", "passwordHash", "phone", "status", "updatedAt") SELECT "adminNotes", "agencyName", "approvedAt", "contactName", "createdAt", "email", "gstOrLicenseNumber", "id", "lastLoginAt", "passwordHash", "phone", "status", "updatedAt" FROM "Agent";
DROP TABLE "Agent";
ALTER TABLE "new_Agent" RENAME TO "Agent";
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");
CREATE INDEX "Agent_status_createdAt_idx" ON "Agent"("status", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
