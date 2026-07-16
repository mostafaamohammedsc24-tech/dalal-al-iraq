import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, dealsTable, networkPropertiesTable, paymentsLedgerTable } from "@workspace/db";
import { authMiddleware, requireRole } from "../lib/auth";

const router = Router();

// نسب العمولة الافتراضية على صفقات الشبكة — العمولة الكلية 2% من سعر البيع،
// تُقسم بين المكتب (70%) وشبكة دلال العراق (30%).
const TOTAL_COMMISSION_RATE = 0.02;
const NETWORK_SHARE = 0.3;

router.get("/mine", authMiddleware, requireRole("office"), async (req, res) => {
  const officeId = req.user!.userId;
  const deals = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.officeId, officeId))
    .orderBy(sql`${dealsTable.createdAt} DESC`);
  res.json({ deals });
});

router.post("/", authMiddleware, requireRole("office"), async (req, res) => {
  const officeId = req.user!.userId;
  const { propertyId, buyerName, buyerPhone, price } = req.body as Record<string, unknown>;
  if (!propertyId || !price || !Number.isFinite(parseFloat(String(price)))) {
    res.status(400).json({ error: "العقار والسعر مطلوبان" });
    return;
  }
  const [property] = await db.select().from(networkPropertiesTable).where(eq(networkPropertiesTable.id, String(propertyId))).limit(1);
  if (!property) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }
  const [deal] = await db
    .insert(dealsTable)
    .values({
      id: randomUUID(),
      propertyId: String(propertyId),
      officeId,
      buyerName: typeof buyerName === "string" ? buyerName.trim() || null : null,
      buyerPhone: typeof buyerPhone === "string" ? buyerPhone.trim() || null : null,
      price: parseFloat(String(price)),
      status: "negotiating",
    })
    .returning();
  res.status(201).json(deal);
});

router.patch("/:id", authMiddleware, requireRole("office"), async (req, res) => {
  const id = req.params.id as string;
  const { status, price, buyerName, buyerPhone } = req.body as Record<string, unknown>;
  const [existing] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!existing || existing.officeId !== req.user!.userId) {
    res.status(404).json({ error: "الصفقة غير موجودة" });
    return;
  }
  const updates: Partial<typeof dealsTable.$inferInsert> = {};
  if (typeof buyerName === "string") updates.buyerName = buyerName.trim() || null;
  if (typeof buyerPhone === "string") updates.buyerPhone = buyerPhone.trim() || null;
  if (price != null && Number.isFinite(parseFloat(String(price)))) updates.price = parseFloat(String(price));

  if (typeof status === "string") {
    const validStatuses = ["negotiating", "contract_signed", "transferring_ownership", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "حالة غير صالحة" });
      return;
    }
    updates.status = status;
    if (status === "completed" && existing.status !== "completed") {
      const price_ = updates.price ?? existing.price;
      const totalCommission = price_ * TOTAL_COMMISSION_RATE;
      const networkCommission = Math.round(totalCommission * NETWORK_SHARE);
      const officeNetCommission = Math.round(totalCommission - networkCommission);
      updates.commissionRate = TOTAL_COMMISSION_RATE;
      updates.networkCommission = networkCommission;
      updates.officeNetCommission = officeNetCommission;
      updates.completedAt = sql`now()` as unknown as Date;

      await db.insert(paymentsLedgerTable).values({
        id: randomUUID(),
        payeeType: "office",
        payeeId: existing.officeId,
        serviceType: "deal_commission",
        clientName: existing.buyerName,
        amount: officeNetCommission,
        status: "pending",
      });

      if (existing.propertyId) {
        await db.update(networkPropertiesTable).set({ status: "sold" }).where(eq(networkPropertiesTable.id, existing.propertyId));
      }
    }
  }

  const [deal] = await db.update(dealsTable).set(updates).where(eq(dealsTable.id, id)).returning();
  res.json(deal);
});

export default router;
