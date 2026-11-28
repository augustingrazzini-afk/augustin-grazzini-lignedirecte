-- Suivi du traitement des avis : quand et comment chaque avis a été traité (correction, réponse, rien à faire).
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "handledAt" TIMESTAMP(3);
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "handledNote" TEXT;
