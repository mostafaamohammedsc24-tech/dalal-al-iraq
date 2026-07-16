import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedSearchesTable = pgTable("saved_searches", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull(),
  params: text("params").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSavedSearchSchema = createInsertSchema(savedSearchesTable).omit({
  createdAt: true,
});
export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;
export type SavedSearch = typeof savedSearchesTable.$inferSelect;
