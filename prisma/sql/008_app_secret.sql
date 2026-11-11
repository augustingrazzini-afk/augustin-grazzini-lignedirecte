-- Secrets techniques créés automatiquement (secret du webhook Stripe par compte/mode).
CREATE TABLE IF NOT EXISTS "AppSecret" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSecret_pkey" PRIMARY KEY ("key")
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cockpit_app') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON "AppSecret" TO cockpit_app; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "AppSecret" FROM anon, authenticated; END IF;
END $$;
