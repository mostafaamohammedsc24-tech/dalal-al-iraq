import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// عقارات شبكة المكاتب — منفصلة عن listingsTable (إعلانات الأفراد العامة).
export const networkPropertiesTable = pgTable("network_properties", {
  id: text("id").primaryKey(),
  officeId: text("office_id").notNull(),
  type: text("type").notNull(), // أرض | شقة | دار | محل
  city: text("city").notNull(),
  area: text("area"),
  price: real("price").notNull(),
  size: real("size"),
  rooms: integer("rooms"),
  description: text("description"),
  images: text("images").array().notNull().default([]),
  video: text("video"),
  // pending_audit: بانتظار رفع تقرير الفحص، لا يظهر للعامة
  status: text("status").notNull().default("pending_audit"),
  inspectionReportUrl: text("inspection_report_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNetworkPropertySchema = createInsertSchema(networkPropertiesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertNetworkProperty = z.infer<typeof insertNetworkPropertySchema>;
export type NetworkProperty = typeof networkPropertiesTable.$inferSelect;

export const mediationRequestsTable = pgTable("mediation_requests", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  requestingOfficeId: text("requesting_office_id").notNull(),
  ownerOfficeId: text("owner_office_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected | completed
  commissionAmount: real("commission_amount"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMediationRequestSchema = createInsertSchema(mediationRequestsTable).omit({
  createdAt: true,
});
export type InsertMediationRequest = z.infer<typeof insertMediationRequestSchema>;
export type MediationRequest = typeof mediationRequestsTable.$inferSelect;

export const referralsTable = pgTable("referrals", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  referringOfficeId: text("referring_office_id").notNull(),
  ownerOfficeId: text("owner_office_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // pending | completed | cancelled
  rewardAmount: real("reward_amount").notNull().default(100),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({
  createdAt: true,
});
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
