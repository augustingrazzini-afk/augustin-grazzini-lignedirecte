-- Opposition d'un prospect (ne plus contacter) et journal des erreurs serveur.
ALTER TABLE "Call" ADD COLUMN IF NOT EXISTS "optOut" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "ErrorLog" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "path" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT '',
  "message" TEXT NOT NULL,
  "digest" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "ErrorLog_createdAt_idx" ON "ErrorLog" ("createdAt");
REVOKE ALL ON "ErrorLog" FROM anon, authenticated;
