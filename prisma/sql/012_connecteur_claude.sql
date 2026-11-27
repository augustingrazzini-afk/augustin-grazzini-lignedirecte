-- Connecteur Claude (MCP) : OAuth (enregistrement dynamique + PKCE) et jetons d'accès hachés.
CREATE TABLE IF NOT EXISTS "McpClient" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL DEFAULT '',
  "redirectUris" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "McpCode" (
  "codeHash" TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "McpToken" (
  "id" TEXT PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "refreshHash" TEXT NOT NULL UNIQUE,
  "clientId" TEXT NOT NULL,
  "clientName" TEXT NOT NULL DEFAULT '',
  "userId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "McpToken_orgId_idx" ON "McpToken"("orgId");
-- Accès réservé au serveur (aucun accès public via l'API Supabase).
ALTER TABLE "McpClient" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "McpCode" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "McpToken" DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON "McpClient", "McpCode", "McpToken" FROM anon, authenticated;
