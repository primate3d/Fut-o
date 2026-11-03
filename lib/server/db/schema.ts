import { pgTable, text, integer, boolean, jsonb, real, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const accessKeys = pgTable("access_keys", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  plan: text("plan").notNull(),
  usesRemaining: integer("uses_remaining").notNull(),
  expiresAt: text("expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: text("created_at").notNull(),
  activatedAt: text("activated_at"),
  allowedNames: jsonb("allowed_names").$type<string[]>(),
  profilePostalAddress: text("profile_postal_address"),
  profileLockedAt: text("profile_locked_at"),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(), // sessionId
  planId: text("plan_id"),
  planName: text("plan_name"),
  status: text("status"),
  generatedKey: text("generated_key"),
  completedAt: text("completed_at"),
  customerEmail: text("customer_email"),
  emailSent: boolean("email_sent"),
  emailSentAt: text("email_sent_at"),
  createdAt: text("created_at"),
});

export const freeTrials = pgTable("free_trials", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  scope: text("scope").notNull().default("decouverte"),
  emailSentAt: text("email_sent_at"),
  keyCode: text("key_code").notNull(),
  usedAt: text("used_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("free_trials_scope_email_unique").on(table.scope, sql`lower(btrim(${table.email}))`)
]);

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  keyCode: text("key_code").notNull(),
  fileName: text("file_name").notNull(),
  physicalFileName: text("physical_file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  documentType: text("document_type").notNull(),
  detectedCategory: text("detected_category"),
  provider: text("provider"),
  status: text("status").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
}, (table) => [index("documents_key_code_idx").on(table.keyCode)]);

export const analyses = pgTable("analyses", {
  id: text("id").primaryKey(),
  keyCode: text("key_code").notNull().unique(),
  generatedAt: text("generated_at").notNull(),
  documentsData: jsonb("documents_data").notNull(),
  detectedParties: jsonb("detected_parties"),
  expenses: jsonb("expenses").notNull(),
  recommendations: jsonb("recommendations").notNull(),
  anomalies: jsonb("anomalies").notNull(),
  totalMonthlyAmount: real("total_monthly_amount").notNull(),
  totalYearlyAmount: real("total_yearly_amount").notNull(),
  yearlyPotentialSavings: real("yearly_potential_savings").notNull(),
});

export const mobileCatalogSources = pgTable("mobile_catalog_sources", {
  provider: text("provider").primaryKey(),
  sourceUrl: text("source_url").notNull(),
  offers: jsonb("offers").$type<unknown[]>().notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  lastAttemptAt: text("last_attempt_at").notNull(),
  lastSuccessAt: text("last_success_at"),
  lastError: jsonb("last_error").$type<unknown[] | null>(),
  updatedAt: text("updated_at").notNull(),
});

export const commercialCatalogSources = pgTable("commercial_catalog_sources", {
  id: text("id").primaryKey(),
  sector: text("sector").notNull(),
  provider: text("provider").notNull(),
  sourceUrl: text("source_url").notNull(),
  officialHost: text("official_host").notNull(),
  sourceStatus: text("source_status").notNull(),
  parser: text("parser").notNull(),
  offers: jsonb("offers").$type<unknown[]>().notNull(),
  etag: text("etag"),
  lastModified: text("last_modified"),
  contentHash: text("content_hash"),
  retrievedAt: text("retrieved_at"),
  lastAttemptAt: text("last_attempt_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: jsonb("last_error").$type<unknown[] | null>(),
  discoveredAt: text("discovered_at").notNull(),
  approvedAt: text("approved_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("commercial_catalog_sector_url_unique").on(table.sector, table.sourceUrl),
  index("commercial_catalog_sector_status_idx").on(table.sector, table.sourceStatus),
]);
