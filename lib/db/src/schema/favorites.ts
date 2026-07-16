import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const favoritesTable = pgTable(
  "favorites",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    listingId: text("listing_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("favorites_user_listing_unique").on(t.userId, t.listingId)]
);

export const insertFavoriteSchema = createInsertSchema(favoritesTable).omit({
  createdAt: true,
});
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type Favorite = typeof favoritesTable.$inferSelect;
