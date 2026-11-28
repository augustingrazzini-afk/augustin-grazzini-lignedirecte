-- Brief rédigé en arrière-plan : il se termine même si la page est fermée.
ALTER TABLE "Brief" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'done';
ALTER TABLE "Brief" ADD COLUMN IF NOT EXISTS "error" TEXT NOT NULL DEFAULT '';
