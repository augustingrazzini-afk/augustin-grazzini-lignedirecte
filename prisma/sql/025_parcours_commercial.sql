-- Parcours de première connexion du commercial : première visite de son espace, guide terminé.
ALTER TABLE "ClientMember" ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3);
ALTER TABLE "ClientMember" ADD COLUMN IF NOT EXISTS "onboardedAt" TIMESTAMP(3);
