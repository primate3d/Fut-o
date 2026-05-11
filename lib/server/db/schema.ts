import { pgTable, text, integer, boolean, jsonb, real } from "drizzle-orm/pg-core";

export const accessKeys = pgTable("access_keys", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  plan: text("plan").notNull(),
  usesRemaining: integer("uses_remaining").notNull(),
  expiresAt: text("expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: text("created_at").notNull(),
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
});

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
