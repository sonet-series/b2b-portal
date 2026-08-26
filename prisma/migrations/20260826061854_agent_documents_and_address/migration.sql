/*
  Warnings:

  - You are about to drop the column `gstOrLicenseNumber` on the `Agent` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "AgentDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentDocument_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "altPhone" TEXT,
    "altEmail" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "adminNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "approvedAt" DATETIME,
    "lastLoginAt" DATETIME
);
INSERT INTO "new_Agent" ("adminNotes", "agencyName", "approvedAt", "contactName", "createdAt", "email", "id", "lastLoginAt", "mustChangePassword", "passwordHash", "phone", "status", "updatedAt") SELECT "adminNotes", "agencyName", "approvedAt", "contactName", "createdAt", "email", "id", "lastLoginAt", "mustChangePassword", "passwordHash", "phone", "status", "updatedAt" FROM "Agent";
DROP TABLE "Agent";
ALTER TABLE "new_Agent" RENAME TO "Agent";
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");
CREATE INDEX "Agent_status_createdAt_idx" ON "Agent"("status", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AgentDocument_agentId_idx" ON "AgentDocument"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDocument_agentId_kind_key" ON "AgentDocument"("agentId", "kind");
