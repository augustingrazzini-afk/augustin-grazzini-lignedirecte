-- Index sur les liens entre tables signalés par l'audit de la base (synchronisation, connexions, attribution).
CREATE INDEX IF NOT EXISTS "Call_integrationId_idx" ON "Call" ("integrationId");
CREATE INDEX IF NOT EXISTS "Activity_integrationId_idx" ON "Activity" ("integrationId");
CREATE INDEX IF NOT EXISTS "Membership_userId_idx" ON "Membership" ("userId");
CREATE INDEX IF NOT EXISTS "ClientMember_userId_idx" ON "ClientMember" ("userId");
CREATE INDEX IF NOT EXISTS "Integration_clientId_idx" ON "Integration" ("clientId");
CREATE INDEX IF NOT EXISTS "ClientRule_clientId_idx" ON "ClientRule" ("clientId");
