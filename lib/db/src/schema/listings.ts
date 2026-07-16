import { pgTable, text, real, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const listingsTable = pgTable("listings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: real("price").notNull(),
  category: text("category").notNull(),
  type: text("type").notNull(),
  city: text("city").notNull(),
  area: text("area"),
  size: real("size"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  buildYear: integer("build_year"),
  carYear: integer("car_year"),
  mileage: integer("mileage"),
  previousPrice: real("previous_price"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  ownershipType: text("ownership_type"),
  dealType: text("deal_type").notNull().default("للبيع"),
  pinned: boolean("pinned").notNull().default(false),
  verified: boolean("verified").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  video: text("video"),
  images: text("images").array().notNull().default([]),
  views: integer("views").notNull().default(0),
  status: text("status").notNull().default("active"),
  bumpedAt: timestamp("bumped_at"),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({
  views: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;
