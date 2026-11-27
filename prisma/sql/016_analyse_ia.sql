-- Analyse IA de Trustpipe conservée à part du résumé fourni par l'outil d'appel.
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "aiAnalyzedAt" TIMESTAMP(3);
