-- Résiliation en un clic (paiement par liens Stripe) : date de la demande.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "cancelRequestedAt" TIMESTAMP(3);
