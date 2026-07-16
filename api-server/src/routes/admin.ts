import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  listingsTable,
  usersTable,
  officesTable,
  lawyersTable,
  payoutRequestsTable,
  paymentsLedgerTable,
  inspectionRequestsTable,
} from "@workspace/db";
import { authMiddleware, requireAdmin } from "../lib/auth";
import { createNotification, notifyNetwork } from "../lib/dalal";

const router = Router();
router.use(authMiddleware, requireAdmin);

router.get("/stats", async (req, res) => {
  const [usersCount] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(usersTable);
  const [listingsCount] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(listingsTable);
  const [totalViewsRow] = await db.select({ total: sql<number>`cast(sum(views) as int)` }).from(listingsTable);

  const listings = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      price: listingsTable.price,
      category: listingsTable.category,
      type: listingsTable.type,
      city: listingsTable.city,
      size: listingsTable.size,
      ownershipType: listingsTable.ownershipType,
      dealType: listingsTable.dealType,
      pinned: listingsTable.pinned,
      video: listingsTable.video,
      images: listingsTable.images,
      views: listingsTable.views,
      status: listingsTable.status,
      userId: listingsTable.userId,
      createdAt: listingsTable.createdAt,
      user: {
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
      },
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.userId, usersTable.id))
    .orderBy(sql`${listingsTable.pinned} DESC, ${listingsTable.createdAt} DESC`)
    .limit(100);

  res.json({
    usersCount: usersCount.count,
    listingsCount: listingsCount.count,
    totalViews: totalViewsRow.total || 0,
    listings,
  });
});

router.patch("/listings/:id", async (req, res) => {
  const id = req.params.id as string;
  const { status, dealType, pinned, price } = req.body;

  const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }

  const updates: Partial<typeof listingsTable.$inferInsert> = {};

  if (price !== undefined) {
    const p = parseFloat(price);
    if (!Number.isFinite(p) || p < 0) {
      res.status(400).json({ error: "سعر غير صالح" });
      return;
    }
    if (p !== existing.price) {
      // Track the drop so the UI can show a "price reduced" badge.
      updates.price = p;
      updates.previousPrice = p < existing.price ? existing.price : null;
    }
  }

  if (status !== undefined) {
    if (!["active", "hidden"].includes(status)) {
      res.status(400).json({ error: "حالة غير صالحة" });
      return;
    }
    updates.status = status;
  }

  if (dealType !== undefined) {
    if (!["للبيع", "للايجار", "مباع"].includes(dealType)) {
      res.status(400).json({ error: "تصنيف غير صالح" });
      return;
    }
    updates.dealType = dealType;
  }

  if (pinned !== undefined) {
    updates.pinned = Boolean(pinned);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا يوجد تغيير" });
    return;
  }

  await db.update(listingsTable).set(updates).where(eq(listingsTable.id, id));

  // Notify the owner when their listing's classification changes.
  try {
    if (updates.dealType && updates.dealType !== existing.dealType) {
      await createNotification({
        userId: existing.userId,
        type: "deal_type",
        title: "تم تحديث تصنيف إعلانك",
        body: `صنّفت إدارة شبكة دلال العراق إعلانك "${existing.title}" كـ ${updates.dealType}.`,
        link: `/listings/${id}`,
      });
    }
    if (updates.pinned === true && existing.pinned !== true) {
      await createNotification({
        userId: existing.userId,
        type: "pinned",
        title: "تم تثبيت إعلانك ⭐",
        body: `ثبّتت الإدارة إعلانك "${existing.title}" ليظهر في المقدمة.`,
        link: `/listings/${id}`,
      });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to notify owner about listing update");
  }

  res.json({ ok: true });
});

router.get("/network-overview", async (req, res) => {
  const [officesCount] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(officesTable);
  const [lawyersCount] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(lawyersTable);
  const [pendingPayouts] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(payoutRequestsTable)
    .where(eq(payoutRequestsTable.status, "pending"));
  const [pendingInspections] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(inspectionRequestsTable)
    .where(eq(inspectionRequestsTable.status, "new"));
  res.json({
    officesCount: officesCount.count,
    lawyersCount: lawyersCount.count,
    pendingPayouts: pendingPayouts.count,
    pendingInspections: pendingInspections.count,
  });
});

router.get("/payout-requests", async (req, res) => {
  const requests = await db
    .select({
      request: payoutRequestsTable,
      officeName: officesTable.name,
      lawyerName: lawyersTable.name,
    })
    .from(payoutRequestsTable)
    .leftJoin(officesTable, eq(payoutRequestsTable.payeeId, officesTable.id))
    .leftJoin(lawyersTable, eq(payoutRequestsTable.payeeId, lawyersTable.id))
    .orderBy(sql`${payoutRequestsTable.requestedAt} DESC`);
  res.json({
    requests: requests.map((r) => ({
      ...r.request,
      payeeName: r.officeName || r.lawyerName || r.request.payeeId,
    })),
  });
});

router.patch("/payout-requests/:id", async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body as { status?: string };
  if (!status || !["approved", "paid"].includes(status)) {
    res.status(400).json({ error: "حالة غير صالحة" });
    return;
  }
  const [existing] = await db.select().from(payoutRequestsTable).where(eq(payoutRequestsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  const [updated] = await db
    .update(payoutRequestsTable)
    .set({ status, resolvedAt: status === "paid" ? (sql`now()` as unknown as Date) : existing.resolvedAt })
    .where(eq(payoutRequestsTable.id, id))
    .returning();

  if (status === "paid") {
    // يُسدَّد المبلغ بالكامل، فتُعلَّم كل مستحقات هذا المكتب/المحامي المعلّقة كمدفوعة.
    await db
      .update(paymentsLedgerTable)
      .set({ status: "paid" })
      .where(
        sql`${paymentsLedgerTable.payeeType} = ${existing.payeeType} and ${paymentsLedgerTable.payeeId} = ${existing.payeeId} and ${paymentsLedgerTable.status} = 'pending'`,
      );
  }

  await notifyNetwork({
    recipientType: existing.payeeType as "office" | "lawyer",
    recipientId: existing.payeeId,
    type: "payout_status",
    title: status === "approved" ? "تمت الموافقة على طلب السحب" : "تم صرف مستحقاتك",
    body:
      status === "approved"
        ? "وافقت الإدارة على طلب سحب مستحقاتك وسيتم الصرف قريباً."
        : `تم صرف مبلغ ${existing.amount.toLocaleString("ar-IQ")} د.ع إلى حسابك.`,
  });

  res.json(updated);
});

router.post("/offices/:id/reset-password", async (req, res) => {
  const id = req.params.id as string;
  const bcrypt = await import("bcryptjs");
  const { generateRandomPassword } = await import("../lib/auth");
  const plainPassword = generateRandomPassword();
  const hashed = await bcrypt.default.hash(plainPassword, 10);
  const [office] = await db
    .update(officesTable)
    .set({ password: hashed, mustChangePassword: true })
    .where(eq(officesTable.id, id))
    .returning();
  if (!office) {
    res.status(404).json({ error: "المكتب غير موجود" });
    return;
  }
  res.json({ id, password: plainPassword });
});

router.post("/lawyers/:id/reset-password", async (req, res) => {
  const id = req.params.id as string;
  const bcrypt = await import("bcryptjs");
  const { generateRandomPassword } = await import("../lib/auth");
  const plainPassword = generateRandomPassword();
  const hashed = await bcrypt.default.hash(plainPassword, 10);
  const [lawyer] = await db
    .update(lawyersTable)
    .set({ password: hashed, mustChangePassword: true })
    .where(eq(lawyersTable.id, id))
    .returning();
  if (!lawyer) {
    res.status(404).json({ error: "المحامي غير موجود" });
    return;
  }
  res.json({ id, password: plainPassword });
});

export default router;
