import { Router } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, reportsTable, listingsTable, usersTable } from "@workspace/db";
import { authMiddleware, requireAdmin } from "../lib/auth";
import { getAdminUserId, createNotification } from "../lib/dalal";
import { randomUUID } from "crypto";

const router = Router();

const REASONS = ["محتوى مكرر", "احتيال أو نصب", "تم البيع", "معلومات خاطئة", "محتوى غير لائق", "أخرى"];

router.post("/", authMiddleware, async (req, res) => {
  const { listingId, reason, note } = req.body as { listingId?: string; reason?: string; note?: string };
  if (!listingId || !reason || !REASONS.includes(reason)) {
    res.status(400).json({ error: "يرجى اختيار سبب صحيح للتبليغ" });
    return;
  }
  const [listing] = await db
    .select({ id: listingsTable.id, title: listingsTable.title })
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId))
    .limit(1);
  if (!listing) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }
  await db.insert(reportsTable).values({
    id: randomUUID(),
    listingId,
    userId: req.user!.userId,
    reason,
    note: typeof note === "string" ? note.trim().slice(0, 500) || null : null,
  });
  try {
    const adminId = await getAdminUserId();
    if (adminId) {
      await createNotification({
        userId: adminId,
        type: "report",
        title: "بلاغ جديد عن إعلان",
        body: `تم التبليغ عن "${listing.title}" — السبب: ${reason}`,
        link: `/listings/${listingId}`,
      });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to notify admin about report");
  }
  res.status(201).json({ ok: true });
});

router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  const { status } = req.query as Record<string, string>;
  const reports = await db
    .select({
      id: reportsTable.id,
      listingId: reportsTable.listingId,
      reason: reportsTable.reason,
      note: reportsTable.note,
      status: reportsTable.status,
      createdAt: reportsTable.createdAt,
      listingTitle: listingsTable.title,
      listingStatus: listingsTable.status,
      reporterName: usersTable.name,
    })
    .from(reportsTable)
    .leftJoin(listingsTable, eq(reportsTable.listingId, listingsTable.id))
    .leftJoin(usersTable, eq(reportsTable.userId, usersTable.id))
    .where(status ? eq(reportsTable.status, status) : undefined)
    .orderBy(sql`${reportsTable.createdAt} DESC`)
    .limit(200);
  const [{ open }] = await db
    .select({ open: sql<number>`cast(count(*) as int)` })
    .from(reportsTable)
    .where(eq(reportsTable.status, "open"));
  res.json({ reports, openCount: open });
});

router.patch("/:id", authMiddleware, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body as { status?: string };
  if (!status || !["open", "resolved"].includes(status)) {
    res.status(400).json({ error: "حالة غير صالحة" });
    return;
  }
  await db.update(reportsTable).set({ status }).where(eq(reportsTable.id, id));
  res.json({ ok: true });
});

export default router;
