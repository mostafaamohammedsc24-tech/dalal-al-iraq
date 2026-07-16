import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// إشعارات المكاتب/المحامين/الأدمن — منفصلة عن notificationsTable (إشعارات
// المستخدمين العاديين على الإعلانات) لاختلاف نوع المستقبل.
export const networkNotificationsTable = pgTable("network_notifications", {
  id: text("id").primaryKey(),
  recipientType: text("recipient_type").notNull(), // office | lawyer | admin
  recipientId: text("recipient_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNetworkNotificationSchema = createInsertSchema(networkNotificationsTable).omit({
  createdAt: true,
});
export type InsertNetworkNotification = z.infer<typeof insertNetworkNotificationSchema>;
export type NetworkNotification = typeof networkNotificationsTable.$inferSelect;
