import { pgTable, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const officesTable = pgTable("offices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  area: text("area"),
  phone: text("phone").notNull(),
  address: text("address"),
  description: text("description"),
  workingHours: text("working_hours"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  // Network account fields (شبكة المكاتب العقارية) — an office directory
  // entry can optionally also be a login-enabled network account.
  password: text("password"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  status: text("status").notNull().default("active"), // active | suspended
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOfficeSchema = createInsertSchema(officesTable).omit({
  createdAt: true,
});
export type InsertOffice = z.infer<typeof insertOfficeSchema>;
export type Office = typeof officesTable.$inferSelect;
