-- Téléphone et email du prospect sur chaque appel, chiffrés (jamais en clair dans la base).
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "contactSealed" TEXT;
