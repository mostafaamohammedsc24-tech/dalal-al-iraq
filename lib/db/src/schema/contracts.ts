import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// قائمة العقود المطلوبة — طلبات صياغة عقود (بيع، إيجار تمليكي، إرث).
export const contractRequestsTable = pgTable("contract_requests", {
  id: text("id").primaryKey(),
  requestedByType: text("requested_by_type").notNull().default("user"), // user | office
  requestedById: text("requested_by_id").notNull(),
  requesterName: text("requester_name").notNull(),
  requesterPhone: text("requester_phone"),
  contractType: text("contract_type").notNull(), // sale | rent_to_own | inheritance
  lawyerId: text("lawyer_id"),
  parties: text("parties"),
  details: text("details"),
  status: text("status").notNull().default("new"), // new | in_progress | completed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContractRequestSchema = createInsertSchema(contractRequestsTable).omit({
  createdAt: true,
});
export type InsertContractRequest = z.infer<typeof insertContractRequestSchema>;
export type ContractRequest = typeof contractRequestsTable.$inferSelect;

// محرر العقود + رفع الملف النهائي.
export const contractsTable = pgTable("contracts", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  content: text("content"),
  finalFileUrl: text("final_file_url"),
  format: text("format"), // pdf | docx
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertContractSchema = createInsertSchema(contractsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;

// خدمات إضافية يعرضها المحامي (استشارة، تمثيل قضائي، إنهاء معاملات طابو...).
export const lawyerServicesTable = pgTable("lawyer_services", {
  id: text("id").primaryKey(),
  lawyerId: text("lawyer_id").notNull(),
  name: text("name").notNull(),
  price: real("price"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLawyerServiceSchema = createInsertSchema(lawyerServicesTable).omit({
  createdAt: true,
});
export type InsertLawyerService = z.infer<typeof insertLawyerServiceSchema>;
export type LawyerService = typeof lawyerServicesTable.$inferSelect;
