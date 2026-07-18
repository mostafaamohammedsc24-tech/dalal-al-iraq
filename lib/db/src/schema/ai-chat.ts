import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Local AI assistant conversation. Kept separate from the human broker chat
// (chats/messages tables) so the user has two distinct threads: one with
// شبكة دلال العراق and one with the AI assistant.
export const aiMessagesTable = pgTable("ai_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AiMessage = typeof aiMessagesTable.$inferSelect;
