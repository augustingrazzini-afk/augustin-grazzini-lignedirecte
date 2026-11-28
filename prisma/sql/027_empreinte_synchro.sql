-- Empreinte de la dernière version reçue de l'outil d'appel : la synchro ne réécrit plus un appel inchangé.
-- Réversible : ALTER TABLE "Call" DROP COLUMN IF EXISTS "syncHash";
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "syncHash" TEXT;
