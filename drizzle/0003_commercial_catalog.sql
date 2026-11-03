CREATE TABLE "commercial_catalog_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"sector" text NOT NULL,
	"provider" text NOT NULL,
	"source_url" text NOT NULL,
	"official_host" text NOT NULL,
	"source_status" text NOT NULL,
	"parser" text NOT NULL,
	"offers" jsonb NOT NULL,
	"etag" text,
	"last_modified" text,
	"content_hash" text,
	"retrieved_at" text,
	"last_attempt_at" text,
	"last_success_at" text,
	"last_error" jsonb,
	"discovered_at" text NOT NULL,
	"approved_at" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_catalog_sector_url_unique" ON "commercial_catalog_sources" USING btree ("sector","source_url");--> statement-breakpoint
CREATE INDEX "commercial_catalog_sector_status_idx" ON "commercial_catalog_sources" USING btree ("sector","source_status");