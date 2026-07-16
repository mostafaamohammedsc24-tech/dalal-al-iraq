import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, paymentsLedgerTable, payoutRequestsTable } from "@workspace/db";
import { authMiddleware, requireRole } from "../lib/auth";
import { notifyNetwork } from "../lib/dalal";

const router = Router();

router.get("/ledger", authMiddleware, requireRole("office", "lawyer"), async (req, res) => {
  const payeeType = req.user!.role as "office" | "lawyer";
  const payeeId = req.user!.userId;
  const entries = await db
    .select()
    .from(paymentsLedgerTable)
    .where(and(eq(paymentsLedgerTable.payeeType, payeeType), eq(paymentsLedgerTable.payeeId, payeeId)))
    .orderBy(sql`${paymentsLedgerTable.date} DESC`);
  const pending = entries.filter((e) => e.status === "pending").reduce((s, e) => s + e.amount, 0);
  const paid = entries.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount, 0);
  res.json({ entries, pending, paid });
});

router.get("/payout-requests", authMiddleware, requireRole("office", "lawyer"), async (req, res) => {
  const payeeType = req.user!.role as "office" | "lawyer";
  const payeeId = req.user!.userId;
  const requests = await db
    .select()
    .from(payoutRequestsTable)
    .where(and(eq(payoutRequestsTable.payeeType, payeeType), eq(payoutRequestsTable.payeeId, payeeId)))
    .orderBy(sql`${payoutRequestsTable.requestedAt} DESC`);
  res.json({ requests });
});

router.post("/payout-requests", authMiddleware, requireRole("office", "lawyer"), async (req, res) => {
  const payeeType = req.user!.role as "office" | "lawyer";
  const payeeId = req.user!.userId;

  const [existingPending] = await db
    .select()
    .from(payoutRequestsTable)
    .where(and(eq(payoutRequestsTable.payeeType, payeeType), eq(payoutRequestsTable.payeeId, payeeId), eq(payoutRequestsTable.status, "pending")))
    .limit(1);
  if (existingPending) {
    res.status(400).json({ error: "لديك طلب سحب قيد المعالجة بالفعل" });
    return;
  }

  const pendingEntries = await db
    .select()
    .from(paymentsLedgerTable)
    .where(and(eq(paymentsLedgerTable.payeeType, payeeType), eq(paymentsLedgerTable.payeeId, payeeId), eq(paymentsLedgerTable.status, "pending")));
  const amount = pendingEntries.reduce((s, e) => s + e.amount, 0);
  if (amount <= 0) {
    res.status(400).json({ error: "لا يوجد رصيد مستحق للسحب" });
    return;
  }

  const [request] = await db
    .insert(payoutRequestsTable)
    .values({ id: randomUUID(), payeeType, payeeId, amount, status: "pending" })
    .returning();
  await notifyNetwork({
    recipientType: "admin",
    recipientId: "admin",
    type: "payout_request",
    title: "طلب سحب مستحقات جديد",
    body: `طلب ${payeeType === "office" ? "مكتب" : "محامٍ"} (${payeeId}) سحب مبلغ ${amount.toLocaleString("ar-IQ")} د.ع.`,
  });
  res.status(201).json(request);
});

export default router;
