import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";

export const priceHistoryTable = pgTable("price_history", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").notNull(),
  oldPrice: real("old_price"),
  newPrice: real("new_price").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PriceHistory = typeof priceHistoryTable.$inferSelect;
