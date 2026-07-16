import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lawyersTable = pgTable("lawyers", {
  id: text("id").primaryKey(), // LW-XXX
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email"),
  specialization: text("specialization").notNull(), // عقاري | إداري | تجاري
  city: text("city").notNull(), // المحافظة
  password: text("password").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  availability: text("availability").notNull().default("available"), // available | busy
  bio: text("bio"),
  yearsExperience: integer("years_experience"),
  licenseNumber: text("license_number"),
  syndicateNumber: text("syndicate_number"),
  officeAddress: text("office_address"),
  avatarUrl: text("avatar_url"),
  status: text("status").notNull().default("active"), // active | suspended
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLawyerSchema = createInsertSchema(lawyersTable).omit({
  createdAt: true,
});
export type InsertLawyer = z.infer<typeof insertLawyerSchema>;
export type Lawyer = typeof lawyersTable.$inferSelect;
