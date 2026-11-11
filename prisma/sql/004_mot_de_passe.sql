-- Connexion par email + mot de passe, confirmation de l'adresse, mot de passe oublié.
-- À exécuter UNE fois dans Supabase > SQL Editor, après 003_lien_de_suivi.sql (et avant de déployer cette version).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- Les utilisateurs existants se sont connectés par lien email : leur adresse est confirmée.
UPDATE "User" SET "emailVerifiedAt" = "createdAt";

-- AlterTable
ALTER TABLE "LoginToken" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'login',
ADD COLUMN "payload" TEXT;
