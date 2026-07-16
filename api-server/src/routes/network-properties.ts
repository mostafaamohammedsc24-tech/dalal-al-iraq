import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  networkPropertiesTable,
  mediationRequestsTable,
  referralsTable,
  officesTable,
} from "@workspace/db";
import { authMiddleware, requireRole } from "../lib/auth";
import { notifyNetwork } from "../lib/dalal";

const router = Router();

const PROPERTY_TYPES = ["أرض", "شقة", "دار", "محل"];

function officeSelect() {
  return {
    id: officesTable.id,
    name: officesTable.name,
    phone: officesTable.phone,
    city: officesTable.city,
  };
}

// عقارات الشبكة المتاحة للتصفح (فقط ما اكتمل فحصه القانوني وأصبح متاحاً).
router.get("/", authMiddleware, requireRole("office"), async (req, res) => {
  const { city, type } = req.query as Record<string, string>;
  const conditions = [eq(networkPropertiesTable.status, "available")];
  if (city) conditions.push(eq(networkPropertiesTable.city, city));
  if (type) conditions.push(eq(networkPropertiesTable.type, type));
  const properties = await db
    .select({ property: networkPropertiesTable, office: officeSelect() })
    .from(networkPropertiesTable)
    .leftJoin(officesTable, eq(networkPropertiesTable.officeId, officesTable.id))
    .where(and(...conditions))
    .orderBy(sql`${networkPropertiesTable.createdAt} DESC`)
    .limit(200);
  res.json({ properties });
});

router.get("/mine", authMiddleware, requireRole("office"), async (req, res) => {
  const officeId = req.user!.userId;
  const properties = await db
    .select()
    .from(networkPropertiesTable)
    .where(eq(networkPropertiesTable.officeId, officeId))
    .orderBy(sql`${networkPropertiesTable.createdAt} DESC`);
  res.json({ properties });
});

router.get("/:id", authMiddleware, requireRole("office"), async (req, res) => {
  const id = req.params.id as string;
  const [row] = await db
    .select({ property: networkPropertiesTable, office: officeSelect() })
    .from(networkPropertiesTable)
    .leftJoin(officesTable, eq(networkPropertiesTable.officeId, officesTable.id))
    .where(eq(networkPropertiesTable.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }
  res.json(row);
});

router.post("/", authMiddleware, requireRole("office"), async (req, res) => {
  const { type, city, area, price, size, rooms, description, images, video } = req.body as Record<string, unknown>;
  if (!type || !PROPERTY_TYPES.includes(String(type))) {
    res.status(400).json({ error: "نوع العقار غير صالح" });
    return;
  }
  if (!city || !price || !Number.isFinite(parseFloat(String(price)))) {
    res.status(400).json({ error: "المحافظة والسعر مطلوبان" });
    return;
  }
  const [property] = await db
    .insert(networkPropertiesTable)
    .values({
      id: randomUUID(),
      officeId: req.user!.userId,
      type: String(type),
      city: String(city),
      area: typeof area === "string" ? area.trim() || null : null,
      price: parseFloat(String(price)),
      size: size != null && Number.isFinite(parseFloat(String(size))) ? parseFloat(String(size)) : null,
      rooms: rooms != null && Number.isFinite(parseInt(String(rooms))) ? parseInt(String(rooms)) : null,
      description: typeof description === "string" ? description.trim().slice(0, 2000) || null : null,
      images: Array.isArray(images) ? images.slice(0, 15).map(String) : [],
      video: typeof video === "string" ? video.trim() || null : null,
      status: "pending_audit",
    })
    .returning();
  res.status(201).json(property);
});

router.patch("/:id", authMiddleware, requireRole("office"), async (req, res) => {
  const id = req.params.id as string;
  const [existing] = await db.select().from(networkPropertiesTable).where(eq(networkPropertiesTable.id, id)).limit(1);
  if (!existing || existing.officeId !== req.user!.userId) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }
  const { type, city, area, price, size, rooms, description, images, video, status } = req.body as Record<string, unknown>;
  const updates: Partial<typeof networkPropertiesTable.$inferInsert> = { updatedAt: sql`now()` as unknown as Date };
  if (typeof type === "string" && PROPERTY_TYPES.includes(type)) updates.type = type;
  if (typeof city === "string") updates.city = city;
  if (typeof area === "string") updates.area = area.trim() || null;
  if (price != null && Number.isFinite(parseFloat(String(price)))) updates.price = parseFloat(String(price));
  if (size != null && Number.isFinite(parseFloat(String(size)))) updates.size = parseFloat(String(size));
  if (rooms != null && Number.isFinite(parseInt(String(rooms)))) updates.rooms = parseInt(String(rooms));
  if (typeof description === "string") updates.description = description.trim().slice(0, 2000) || null;
  if (Array.isArray(images)) updates.images = images.slice(0, 15).map(String);
  if (typeof video === "string") updates.video = video.trim() || null;
  if (typeof status === "string") {
    if (!["pending_audit", "available", "pending", "sold"].includes(status)) {
      res.status(400).json({ error: "حالة غير صالحة" });
      return;
    }
    // لا يمكن نشر العقار كـ "متاح" قبل استكمال الفحص القانوني ورفع التقرير.
    if (status === "available" && !existing.inspectionReportUrl) {
      res.status(400).json({ error: "لا يمكن نشر العقار كمتاح قبل رفع تقرير الفحص القانوني" });
      return;
    }
    updates.status = status;
  }
  const [property] = await db.update(networkPropertiesTable).set(updates).where(eq(networkPropertiesTable.id, id)).returning();
  res.json(property);
});

router.delete("/:id", authMiddleware, requireRole("office"), async (req, res) => {
  const id = req.params.id as string;
  const [existing] = await db.select().from(networkPropertiesTable).where(eq(networkPropertiesTable.id, id)).limit(1);
  if (!existing || existing.officeId !== req.user!.userId) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }
  await db.delete(networkPropertiesTable).where(eq(networkPropertiesTable.id, id));
  res.json({ ok: true });
});

// ---------- طلبات الوساطة ----------

router.get("/mediation/mine", authMiddleware, requireRole("office"), async (req, res) => {
  const officeId = req.user!.userId;
  const requests = await db
    .select()
    .from(mediationRequestsTable)
    .where(sql`${mediationRequestsTable.requestingOfficeId} = ${officeId} or ${mediationRequestsTable.ownerOfficeId} = ${officeId}`)
    .orderBy(sql`${mediationRequestsTable.createdAt} DESC`);
  res.json({ requests });
});

router.post("/:id/mediation-requests", authMiddleware, requireRole("office"), async (req, res) => {
  const propertyId = req.params.id as string;
  const requestingOfficeId = req.user!.userId;
  const [property] = await db.select().from(networkPropertiesTable).where(eq(networkPropertiesTable.id, propertyId)).limit(1);
  if (!property) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }
  if (property.officeId === requestingOfficeId) {
    res.status(400).json({ error: "لا يمكنك طلب وساطة على عقار مكتبك" });
    return;
  }
  const [request] = await db
    .insert(mediationRequestsTable)
    .values({
      id: randomUUID(),
      propertyId,
      requestingOfficeId,
      ownerOfficeId: property.officeId,
    })
    .returning();
  await notifyNetwork({
    recipientType: "office",
    recipientId: property.officeId,
    type: "mediation_request",
    title: "طلب وساطة جديد",
    body: "مكتب آخر طلب الوساطة على أحد عقاراتك في الشبكة.",
    link: "/office/network",
  });
  res.status(201).json(request);
});

router.patch("/mediation-requests/:id", authMiddleware, requireRole("office"), async (req, res) => {
  const id = req.params.id as string;
  const { status, commissionAmount } = req.body as { status?: string; commissionAmount?: number };
  const [request] = await db.select().from(mediationRequestsTable).where(eq(mediationRequestsTable.id, id)).limit(1);
  if (!request || request.ownerOfficeId !== req.user!.userId) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  if (!status || !["accepted", "rejected", "completed"].includes(status)) {
    res.status(400).json({ error: "حالة غير صالحة" });
    return;
  }
  const [updated] = await db
    .update(mediationRequestsTable)
    .set({ status, commissionAmount: commissionAmount != null ? Number(commissionAmount) : request.commissionAmount })
    .where(eq(mediationRequestsTable.id, id))
    .returning();
  await notifyNetwork({
    recipientType: "office",
    recipientId: request.requestingOfficeId,
    type: "mediation_update",
    title: status === "accepted" ? "تم قبول طلب الوساطة" : status === "rejected" ? "تم رفض طلب الوساطة" : "اكتملت الوساطة",
    body: "تحقق من حالة طلب الوساطة الخاص بك.",
    link: "/office/network",
  });
  res.json(updated);
});

// ---------- الإحالات ----------

router.get("/referrals/mine", authMiddleware, requireRole("office"), async (req, res) => {
  const officeId = req.user!.userId;
  const referrals = await db
    .select()
    .from(referralsTable)
    .where(sql`${referralsTable.referringOfficeId} = ${officeId} or ${referralsTable.ownerOfficeId} = ${officeId}`)
    .orderBy(sql`${referralsTable.createdAt} DESC`);
  res.json({ referrals });
});

router.post("/:id/referrals", authMiddleware, requireRole("office"), async (req, res) => {
  const propertyId = req.params.id as string;
  const referringOfficeId = req.user!.userId;
  const { customerName, customerPhone, notes } = req.body as Record<string, string>;
  if (!customerName?.trim() || !customerPhone?.trim()) {
    res.status(400).json({ error: "اسم وهاتف الزبون مطلوبان" });
    return;
  }
  const [property] = await db.select().from(networkPropertiesTable).where(eq(networkPropertiesTable.id, propertyId)).limit(1);
  if (!property) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }
  const [referral] = await db
    .insert(referralsTable)
    .values({
      id: randomUUID(),
      propertyId,
      referringOfficeId,
      ownerOfficeId: property.officeId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      notes: typeof notes === "string" ? notes.trim().slice(0, 500) || null : null,
    })
    .returning();
  await notifyNetwork({
    recipientType: "office",
    recipientId: property.officeId,
    type: "referral",
    title: "إحالة زبون جديدة",
    body: `أحال مكتب آخر زبوناً (${customerName.trim()}) مهتماً بأحد عقاراتك.`,
    link: "/office/network",
  });
  res.status(201).json(referral);
});

router.patch("/referrals/:id", authMiddleware, requireRole("office"), async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body as { status?: string };
  const [referral] = await db.select().from(referralsTable).where(eq(referralsTable.id, id)).limit(1);
  if (!referral || referral.ownerOfficeId !== req.user!.userId) {
    res.status(404).json({ error: "الإحالة غير موجودة" });
    return;
  }
  if (!status || !["completed", "cancelled"].includes(status)) {
    res.status(400).json({ error: "حالة غير صالحة" });
    return;
  }
  const [updated] = await db.update(referralsTable).set({ status }).where(eq(referralsTable.id, id)).returning();
  if (status === "completed") {
    await notifyNetwork({
      recipientType: "office",
      recipientId: referral.referringOfficeId,
      type: "referral_completed",
      title: "تم إتمام صفقة عبر إحالتك 🎉",
      body: `مكافأتك ${referral.rewardAmount.toLocaleString("ar-IQ")} د.ع مقابل إحالة الزبون ${referral.customerName}.`,
      link: "/office/network",
    });
  }
  res.json(updated);
});

export default router;
