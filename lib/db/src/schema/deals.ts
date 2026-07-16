import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// صفقاتي — سجل الصفقات المكتملة عبر مكتب على عقار من عقارات الشبكة.
export const dealsTable = pgTable("deals", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  officeId: text("office_id").notNull(),
  buyerName: text("buyer_name"),
  buyerPhone: text("buyer_phone"),
  price: real("price").notNull(),
  // negotiating | contract_signed | transferring_ownership | completed | cancelled
  status: text("status").notNull().default("negotiating"),
  commissionRate: real("commission_rate"),
  networkCommission: real("network_commission"),
  officeNetCommission: real("office_net_commission"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDealSchema = createInsertSchema(dealsTable).omit({
  createdAt: true,
});
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof dealsTable.$inferSelect;
