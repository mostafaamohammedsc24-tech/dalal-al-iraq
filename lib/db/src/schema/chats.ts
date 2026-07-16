import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const chatsTable = pgTable("chats", {
  id: text("id").primaryKey(),
  listingId: text("listing_id"),
  senderId: text("sender_id").notNull(),
  receiverId: text("receiver_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  userId: text("user_id").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Chat = typeof chatsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
