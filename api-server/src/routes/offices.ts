import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, officesTable, officeReviewsTable, usersTable, nextSequentialId } from "@workspace/db";
import { authMiddleware, requireAdmin, generateRandomPassword } from "../lib/auth";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const router = Router();

const ratingSql = sql<number>`(
  select cast(coalesce(avg(${officeReviewsTable.rating}), 0) as double precision)
  from ${officeReviewsTable} where ${officeReviewsTable.officeId} = ${officesTable.id}
)`;
const reviewCountSql = sql<number>`(
  select cast(count(*) as int)
  from ${officeReviewsTable} where ${officeReviewsTable.officeId} = ${officesTable.id}
)`;

router.get("/", async (req, res) => {
  const { city } = req.query as Record<string, string>;
  const offices = await db
    .select({
      id: officesTable.id,
      name: officesTable.name,
      city: officesTable.city,
      area: officesTable.area,
      phone: officesTable.phone,
      address: officesTable.address,
      description: officesTable.description,
      workingHours: officesTable.workingHours,
      latitude: officesTable.latitude,
      longitude: officesTable.longitude,
      createdAt: officesTable.createdAt,
      rating: ratingSql,
      reviewCount: reviewCountSql,
    })
    .from(officesTable)
    .where(city ? eq(officesTable.city, city) : undefined)
    .orderBy(sql`${officesTable.createdAt} DESC`);
  res.json({ offices });
});

router.get("/:id", async (req, res) => {
  const id = req.params.id as string;
  const [office] = await db
    .select({
      id: officesTable.id,
      name: officesTable.name,
      city: officesTable.city,
      area: officesTable.area,
      phone: officesTable.phone,
      address: officesTable.address,
      description: officesTable.description,
      workingHours: officesTable.workingHours,
      latitude: officesTable.latitude,
      longitude: officesTable.longitude,
      createdAt: officesTable.createdAt,
      rating: ratingSql,
      reviewCount: reviewCountSql,
    })
    .from(officesTable)
    .where(eq(officesTable.id, id))
    .limit(1);
  if (!office) {
    res.status(404).json({ error: "المكتب غير موجود" });
    return;
  }
  const reviews = await db
    .select({
      id: officeReviewsTable.id,
      rating: officeReviewsTable.rating,
      comment: officeReviewsTable.comment,
      createdAt: officeReviewsTable.createdAt,
      userName: usersTable.name,
    })
    .from(officeReviewsTable)
    .leftJoin(usersTable, eq(officeReviewsTable.userId, usersTable.id))
    .where(eq(officeReviewsTable.officeId, id))
    .orderBy(sql`${officeReviewsTable.createdAt} DESC`)
    .limit(100);
  res.json({ office, reviews });
});

router.post("/:id/reviews", authMiddleware, async (req, res) => {
  const officeId = req.params.id as string;
  const { rating, comment } = req.body as { rating?: number; comment?: string };
  const r = parseInt(String(rating));
  if (!Number.isFinite(r) || r < 1 || r > 5) {
    res.status(400).json({ error: "التقييم يجب أن يكون من 1 إلى 5" });
    return;
  }
  const [office] = await db.select({ id: officesTable.id }).from(officesTable).where(eq(officesTable.id, officeId)).limit(1);
  if (!office) {
    res.status(404).json({ error: "المكتب غير موجود" });
    return;
  }
  await db
    .insert(officeReviewsTable)
    .values({
      id: randomUUID(),
      officeId,
      userId: req.user!.userId,
      rating: r,
      comment: typeof comment === "string" ? comment.trim().slice(0, 500) || null : null,
    })
    .onConflictDoUpdate({
      target: [officeReviewsTable.officeId, officeReviewsTable.userId],
      set: { rating: r, comment: typeof comment === "string" ? comment.trim().slice(0, 500) || null : null },
    });
  res.status(201).json({ ok: true });
});

router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  const { name, city, area, phone, address, description, workingHours, latitude, longitude } = req.body;
  if (!name || !city || !phone) {
    res.status(400).json({ error: "الاسم والمحافظة والهاتف مطلوبة" });
    return;
  }
  const latNum =
    latitude != null && Number.isFinite(parseFloat(latitude)) &&
    parseFloat(latitude) >= -90 && parseFloat(latitude) <= 90
      ? parseFloat(latitude)
      : null;
  const lngNum =
    longitude != null && Number.isFinite(parseFloat(longitude)) &&
    parseFloat(longitude) >= -180 && parseFloat(longitude) <= 180
      ? parseFloat(longitude)
      : null;
  const hasCoords = latNum != null && lngNum != null;

  // Every office created from the admin panel is also a network login
  // account: a sequential ID (OF-001, ...) and a random password are
  // generated so the admin can hand them to the office owner (WhatsApp/email).
  const id = await nextSequentialId("OF");
  const plainPassword = generateRandomPassword();
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const [office] = await db
    .insert(officesTable)
    .values({
      id,
      name: name.trim(),
      city,
      area: area?.trim() || null,
      phone: phone.trim(),
      address: address?.trim() || null,
      description: typeof description === "string" ? description.trim().slice(0, 1000) || null : null,
      workingHours: typeof workingHours === "string" ? workingHours.trim().slice(0, 200) || null : null,
      latitude: hasCoords ? latNum : null,
      longitude: hasCoords ? lngNum : null,
      password: hashedPassword,
      mustChangePassword: true,
      status: "active",
    })
    .returning();

  // plainPassword is only ever returned here, once, at creation time.
  const { password: _password, ...officeSafe } = office!;
  res.status(201).json({ ...officeSafe, credentials: { id, password: plainPassword } });
});

router.patch("/:id/status", authMiddleware, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body as { status?: string };
  if (!status || !["active", "suspended"].includes(status)) {
    res.status(400).json({ error: "حالة غير صالحة" });
    return;
  }
  const [office] = await db.update(officesTable).set({ status }).where(eq(officesTable.id, id)).returning();
  if (!office) {
    res.status(404).json({ error: "المكتب غير موجود" });
    return;
  }
  const { password: _password, ...officeSafe } = office;
  res.json(officeSafe);
});

router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  await db.delete(officeReviewsTable).where(eq(officeReviewsTable.officeId, id));
  await db.delete(officesTable).where(eq(officesTable.id, id));
  res.json({ ok: true });
});

export default router;
