import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// طلبات الفحص القانوني — يرسلها مكتب (أو مستخدم) لمحامٍ لفحص عقار.
export const inspectionRequestsTable = pgTable("inspection_requests", {
  id: text("id").primaryKey(),
  propertyId: text("property_id"),
  requestedByType: text("requested_by_type").notNull(), // office | user
  requestedById: text("requested_by_id").notNull(),
  lawyerId: text("lawyer_id"),
  tier: text("tier").notNull(), // silver | gold | diamond (فضي/ذهبي/ماسي)
  // new | accepted | rejected | in_progress | submitted | closed
  status: text("status").notNull().default("new"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInspectionRequestSchema = createInsertSchema(inspectionRequestsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertInspectionRequest = z.infer<typeof insertInspectionRequestSchema>;
export type InspectionRequest = typeof inspectionRequestsTable.$inferSelect;

// استمارة رفع تقرير الفحص الرقمية (الخلاصة الذهبية).
export const inspectionReportsTable = pgTable("inspection_reports", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  aurScreenshotUrl: text("aur_screenshot_url"),
  aurNotes: text("aur_notes"),
  ownershipChainText: text("ownership_chain_text"),
  ownershipDocs: text("ownership_docs").array().notNull().default([]),
  liensText: text("liens_text"),
  liensProofs: text("liens_proofs").array().notNull().default([]),
  financialDuesReceipts: text("financial_dues_receipts").array().notNull().default([]),
  easementsText: text("easements_text"),
  easementsImages: text("easements_images").array().notNull().default([]),
  // recommend_buy | not_recommend | recommend_with_reservations
  finalVerdict: text("final_verdict"),
  responsibilityAccepted: boolean("responsibility_accepted").notNull().default(false),
  isDraft: boolean("is_draft").notNull().default(true),
  pdfUrl: text("pdf_url"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInspectionReportSchema = createInsertSchema(inspectionReportsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertInspectionReport = z.infer<typeof insertInspectionReportSchema>;
export type InspectionReport = typeof inspectionReportsTable.$inferSelect;
