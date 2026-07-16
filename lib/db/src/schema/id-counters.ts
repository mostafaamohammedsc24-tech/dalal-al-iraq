import { pgTable, text, integer } from "drizzle-orm/pg-core";

// Backs sequential human-readable IDs like OF-001, LW-001 (see nextSequentialId
// in ../index.ts). One row per prefix, atomically incremented.
export const idCountersTable = pgTable("id_counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

export type IdCounter = typeof idCountersTable.$inferSelect;
