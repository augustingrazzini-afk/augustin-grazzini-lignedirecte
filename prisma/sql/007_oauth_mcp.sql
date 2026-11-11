-- Connexion en un clic (OAuth + MCP) : identifiant client de Trustpipe auprès de chaque outil.
CREATE TABLE IF NOT EXISTS "OAuthClient" (
  "id" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientSecret" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthClient_issuer_redirectUri_key" ON "OAuthClient"("issuer", "redirectUri");
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cockpit_app') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON "OAuthClient" TO cockpit_app; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "OAuthClient" FROM anon, authenticated; END IF;
END $$;
