import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ورش الصيانة المعتمدة (كهربائي، سباك، إلخ) — دليل بسيط بدون حساب دخول.
export const workshopsTable = pgTable("workshops", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
  phone: text("phone").notNull(),
  city: text("city").notNull(),
  rating: real("rating").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWorkshopSchema = createInsertSchema(workshopsTable).omit({
  createdAt: true,
});
export type InsertWorkshop = z.infer<typeof insertWorkshopSchema>;
export type Workshop = typeof workshopsTable.$inferSelect;
