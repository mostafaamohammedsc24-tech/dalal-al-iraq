import { pgTable, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const officeReviewsTable = pgTable(
  "office_reviews",
  {
    id: text("id").primaryKey(),
    officeId: text("office_id").notNull(),
    userId: text("user_id").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("office_reviews_office_user_unique").on(t.officeId, t.userId)]
);

export const insertOfficeReviewSchema = createInsertSchema(officeReviewsTable).omit({
  createdAt: true,
});
export type InsertOfficeReview = z.infer<typeof insertOfficeReviewSchema>;
export type OfficeReview = typeof officeReviewsTable.$inferSelect;
