-- Formule Équipe facturée par commercial : nombre de places payées (quantité de l'abonnement Stripe).
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "seats" INTEGER NOT NULL DEFAULT 1;
