-- Rythme de paiement de l'abonnement : mensuel, trimestriel ou annuel.
-- Réversible : ALTER TABLE "Organization" DROP COLUMN IF EXISTS "billingPeriod";
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "billingPeriod" TEXT NOT NULL DEFAULT 'month';
