-- Mise à jour « multicanal » : emails, LinkedIn, relances avec échéance, alertes.
-- À exécuter UNE fois dans Supabase > SQL Editor, après init.sql (et avant de déployer cette version).
-- Supprime la table FollowUp (remplacée par Task) : les anciennes coches « Fait » de l'onglet Relances sont perdues.

-- DropForeignKey
ALTER TABLE "FollowUp" DROP CONSTRAINT "FollowUp_orgId_fkey";

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "slackWebhook" TEXT;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "digest" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "slackWebhook" TEXT;

-- AlterTable
ALTER TABLE "ClientMember" ADD COLUMN     "digest" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "FollowUp";

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,
    "integrationId" TEXT,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "contactKey" TEXT NOT NULL DEFAULT '',
    "repName" TEXT NOT NULL DEFAULT '',
    "campaign" TEXT NOT NULL DEFAULT '',
    "step" INTEGER,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "sentiment" TEXT,
    "objections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiStatus" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,
    "contactKey" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "source" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_orgId_occurredAt_idx" ON "Activity"("orgId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_clientId_occurredAt_idx" ON "Activity"("clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_orgId_contactKey_idx" ON "Activity"("orgId", "contactKey");

-- CreateIndex
CREATE INDEX "Activity_orgId_aiStatus_idx" ON "Activity"("orgId", "aiStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_orgId_provider_externalId_key" ON "Activity"("orgId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "Task_orgId_status_dueAt_idx" ON "Task"("orgId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_clientId_status_dueAt_idx" ON "Task"("clientId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_orgId_sourceKind_sourceId_key" ON "Task"("orgId", "sourceKind", "sourceId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

