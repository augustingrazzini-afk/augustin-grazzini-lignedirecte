-- Rendez-vous détecté par l'IA : simple signal à confirmer, jamais compté tel quel dans les statistiques.
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "aiMeeting" BOOLEAN NOT NULL DEFAULT false;
