CREATE TABLE "mobile_catalog_sources" (
	"provider" text PRIMARY KEY NOT NULL,
	"source_url" text NOT NULL,
	"offers" jsonb NOT NULL,
	"retrieved_at" text NOT NULL,
	"last_attempt_at" text NOT NULL,
	"last_success_at" text,
	"last_error" jsonb,
	"updated_at" text NOT NULL
);
