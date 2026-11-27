-- Virage « boîte » : chaque Client devient un commercial suivi (interne, freelance ou agence).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'interne';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "agency" TEXT NOT NULL DEFAULT '';
