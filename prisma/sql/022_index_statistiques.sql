-- Statistiques du tableau de bord comptées par la base : index qui évitent de relire chaque appel en entier.
CREATE INDEX IF NOT EXISTS "Call_stats_idx" ON "Call" ("orgId", "startedAt") INCLUDE ("clientId", "repName", "connected", "durationSec", "meetingBooked", "kind");
CREATE INDEX IF NOT EXISTS "Call_objections_idx" ON "Call" ("orgId", "startedAt") WHERE cardinality("objections") > 0;
