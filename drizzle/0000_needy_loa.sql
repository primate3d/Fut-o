ALTER TABLE "access_keys" ADD COLUMN IF NOT EXISTS "allowed_names" jsonb;
--> statement-breakpoint
ALTER TABLE "access_keys" ADD COLUMN IF NOT EXISTS "profile_postal_address" text;
--> statement-breakpoint
ALTER TABLE "access_keys" ADD COLUMN IF NOT EXISTS "profile_locked_at" text;
