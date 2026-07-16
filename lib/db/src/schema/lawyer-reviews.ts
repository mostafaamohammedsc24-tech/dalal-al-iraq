import { pgTable, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lawyerReviewsTable = pgTable(
  "lawyer_reviews",
  {
    id: text("id").primaryKey(),
    lawyerId: text("lawyer_id").notNull(),
    // raters can be a regular user or an office account
    raterType: text("rater_type").notNull().default("user"), // user | office
    raterId: text("rater_id").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("lawyer_reviews_lawyer_rater_unique").on(t.lawyerId, t.raterType, t.raterId)]
);

export const insertLawyerReviewSchema = createInsertSchema(lawyerReviewsTable).omit({
  createdAt: true,
});
export type InsertLawyerReview = z.infer<typeof insertLawyerReviewSchema>;
export type LawyerReview = typeof lawyerReviewsTable.$inferSelect;
