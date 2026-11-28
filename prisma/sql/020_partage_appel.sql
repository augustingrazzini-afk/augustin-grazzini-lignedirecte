-- Partage d'un appel avec un autre commercial (il le voit dans son espace, l'attribution ne change pas).
CREATE TABLE IF NOT EXISTS "CallShare" (
  "id" TEXT PRIMARY KEY,
  "callId" TEXT NOT NULL REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "clientId" TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "fromName" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CallShare_callId_clientId_key" ON "CallShare" ("callId", "clientId");
CREATE INDEX IF NOT EXISTS "CallShare_clientId_createdAt_idx" ON "CallShare" ("clientId", "createdAt");
