import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Hierarchical area classification: each row is a neighborhood/area that
// belongs to a governorate (city). Seeded with a broad Iraq dataset and
// extendable by the admin from the dashboard.
export const areasTable = pgTable(
  "areas",
  {
    id: text("id").primaryKey(),
    city: text("city").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    cityNameUnique: unique("areas_city_name_unique").on(t.city, t.name),
  }),
);

export const insertAreaSchema = createInsertSchema(areasTable).omit({ createdAt: true });
export type InsertArea = z.infer<typeof insertAreaSchema>;
export type Area = typeof areasTable.$inferSelect;
