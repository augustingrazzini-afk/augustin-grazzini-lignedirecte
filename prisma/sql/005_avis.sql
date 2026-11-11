-- Avis des utilisateurs (case « Votre avis »).
CREATE TABLE IF NOT EXISTS "Feedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT,
  "orgId" TEXT,
  "clientId" TEXT,
  "rating" INTEGER,
  "message" TEXT NOT NULL,
  "page" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Feedback_createdAt_idx" ON "Feedback"("createdAt");
CREATE INDEX IF NOT EXISTS "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cockpit_app') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON "Feedback" TO cockpit_app; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "Feedback" FROM anon, authenticated; END IF;
END $$;
