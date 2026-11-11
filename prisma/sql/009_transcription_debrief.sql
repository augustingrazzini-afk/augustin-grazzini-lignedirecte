-- Transcription automatique des enregistrements et débrief IA des rendez-vous.
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "transcriptStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "transcriptJob" TEXT;
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "debrief" JSONB;
CREATE INDEX IF NOT EXISTS "Call_transcriptStatus_idx" ON "Call"("transcriptStatus");
