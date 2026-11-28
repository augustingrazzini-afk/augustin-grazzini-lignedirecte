-- Rendez-vous compté une seule fois par prospect : décision prise à la main sur un appel (compter / ne pas compter).
-- Réversible : ALTER TABLE "Call" DROP COLUMN IF EXISTS "meetingManual";
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "meetingManual" BOOLEAN;
