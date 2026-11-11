-- Lien de suivi en direct : un client peut suivre ses appels sans compte, via un lien secret.
-- À exécuter UNE fois dans Supabase > SQL Editor, après 002_multicanal.sql (et avant de déployer cette version).

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Client_shareToken_key" ON "Client"("shareToken");
