-- Fin de contrat et suppression des données 30 jours après ; preuve d'acceptation des conditions générales.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
-- Les espaces déjà résiliés : le délai de 30 jours part d'aujourd'hui.
UPDATE "Organization" SET "endedAt" = now() WHERE "subscriptionStatus" = 'canceled' AND "endedAt" IS NULL;
