-- Historique des conversations de l'assistant.
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "clientId" TEXT,
  "title" TEXT NOT NULL,
  "messages" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Conversation_owner_orgId_clientId_updatedAt_idx" ON "Conversation"("owner", "orgId", "clientId", "updatedAt");
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cockpit_app') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON "Conversation" TO cockpit_app; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "Conversation" FROM anon, authenticated; END IF;
END $$;
