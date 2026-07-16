import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// المحفظة المالية والمستحقات — مشتركة بين المكاتب والمحامين.
export const paymentsLedgerTable = pgTable("payments_ledger", {
  id: text("id").primaryKey(),
  payeeType: text("payee_type").notNull(), // office | lawyer
  payeeId: text("payee_id").notNull(),
  serviceType: text("service_type").notNull(),
  clientName: text("client_name"),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"), // paid | pending
  date: timestamp("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentsLedgerSchema = createInsertSchema(paymentsLedgerTable).omit({
  createdAt: true,
});
export type InsertPaymentsLedger = z.infer<typeof insertPaymentsLedgerSchema>;
export type PaymentsLedger = typeof paymentsLedgerTable.$inferSelect;

export const payoutRequestsTable = pgTable("payout_requests", {
  id: text("id").primaryKey(),
  payeeType: text("payee_type").notNull(), // office | lawyer
  payeeId: text("payee_id").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | paid
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertPayoutRequestSchema = createInsertSchema(payoutRequestsTable).omit({
  requestedAt: true,
  resolvedAt: true,
});
export type InsertPayoutRequest = z.infer<typeof insertPayoutRequestSchema>;
export type PayoutRequest = typeof payoutRequestsTable.$inferSelect;
