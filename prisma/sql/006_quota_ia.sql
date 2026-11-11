-- Quota journalier du chatbot sur les liens de suivi (clients des clients, sans compte).
CREATE TABLE IF NOT EXISTS "AiUsage" (
  "key" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("key", "day")
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cockpit_app') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON "AiUsage" TO cockpit_app; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "AiUsage" FROM anon, authenticated; END IF;
END $$;
