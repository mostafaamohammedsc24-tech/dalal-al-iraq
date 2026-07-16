import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, lawyersTable, lawyerReviewsTable, lawyerServicesTable, nextSequentialId } from "@workspace/db";
import { authMiddleware, requireAdmin, requireRole, generateRandomPassword } from "../lib/auth";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const router = Router();

const ratingSql = sql<number>`(
  select cast(coalesce(avg(${lawyerReviewsTable.rating}), 0) as double precision)
  from ${lawyerReviewsTable} where ${lawyerReviewsTable.lawyerId} = ${lawyersTable.id}
)`;
const reviewCountSql = sql<number>`(
  select cast(count(*) as int)
  from ${lawyerReviewsTable} where ${lawyerReviewsTable.lawyerId} = ${lawyersTable.id}
)`;

const publicColumns = {
  id: lawyersTable.id,
  name: lawyersTable.name,
  phone: lawyersTable.phone,
  email: lawyersTable.email,
  specialization: lawyersTable.specialization,
  city: lawyersTable.city,
  availability: lawyersTable.availability,
  bio: lawyersTable.bio,
  yearsExperience: lawyersTable.yearsExperience,
  licenseNumber: lawyersTable.licenseNumber,
  syndicateNumber: lawyersTable.syndicateNumber,
  officeAddress: lawyersTable.officeAddress,
  avatarUrl: lawyersTable.avatarUrl,
  status: lawyersTable.status,
  createdAt: lawyersTable.createdAt,
  rating: ratingSql,
  reviewCount: reviewCountSql,
};

// قائمة المحامين المعتمدين (تظهر للمكاتب والزوار).
router.get("/", async (req, res) => {
  const { city, specialization } = req.query as Record<string, string>;
  const conditions = [eq(lawyersTable.status, "active")];
  if (city) conditions.push(eq(lawyersTable.city, city));
  if (specialization) conditions.push(eq(lawyersTable.specialization, specialization));
  const lawyers = await db
    .select(publicColumns)
    .from(lawyersTable)
    .where(sql.join(conditions, sql` and `))
    .orderBy(sql`${lawyersTable.createdAt} DESC`);
  res.json({ lawyers });
});

router.get("/:id", async (req, res) => {
  const id = req.params.id as string;
  const [lawyer] = await db.select(publicColumns).from(lawyersTable).where(eq(lawyersTable.id, id)).limit(1);
  if (!lawyer) {
    res.status(404).json({ error: "المحامي غير موجود" });
    return;
  }
  const services = await db.select().from(lawyerServicesTable).where(eq(lawyerServicesTable.lawyerId, id));
  const reviews = await db
    .select()
    .from(lawyerReviewsTable)
    .where(eq(lawyerReviewsTable.lawyerId, id))
    .orderBy(sql`${lawyerReviewsTable.createdAt} DESC`)
    .limit(100);
  res.json({ lawyer, services, reviews });
});

router.post("/:id/reviews", authMiddleware, async (req, res) => {
  const lawyerId = req.params.id as string;
  const { rating, comment } = req.body as { rating?: number; comment?: string };
  const r = parseInt(String(rating));
  if (!Number.isFinite(r) || r < 1 || r > 5) {
    res.status(400).json({ error: "التقييم يجب أن يكون من 1 إلى 5" });
    return;
  }
  const [lawyer] = await db.select({ id: lawyersTable.id }).from(lawyersTable).where(eq(lawyersTable.id, lawyerId)).limit(1);
  if (!lawyer) {
    res.status(404).json({ error: "المحامي غير موجود" });
    return;
  }
  const raterType = req.user!.role === "office" ? "office" : "user";
  await db
    .insert(lawyerReviewsTable)
    .values({
      id: randomUUID(),
      lawyerId,
      raterType,
      raterId: req.user!.userId,
      rating: r,
      comment: typeof comment === "string" ? comment.trim().slice(0, 500) || null : null,
    })
    .onConflictDoUpdate({
      target: [lawyerReviewsTable.lawyerId, lawyerReviewsTable.raterType, lawyerReviewsTable.raterId],
      set: { rating: r, comment: typeof comment === "string" ? comment.trim().slice(0, 500) || null : null },
    });
  res.status(201).json({ ok: true });
});

// تعديل الحالة (متاح/مشغول) والملف الشخصي — للمحامي نفسه بعد الدخول.
router.patch("/me", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const { availability, bio, yearsExperience, licenseNumber, syndicateNumber, officeAddress, avatarUrl, email } =
    req.body as Record<string, unknown>;
  const updates: Partial<typeof lawyersTable.$inferInsert> = {};
  if (availability === "available" || availability === "busy") updates.availability = availability;
  if (typeof bio === "string") updates.bio = bio.trim().slice(0, 2000) || null;
  if (typeof email === "string") updates.email = email.trim() || null;
  if (typeof officeAddress === "string") updates.officeAddress = officeAddress.trim() || null;
  if (typeof avatarUrl === "string") updates.avatarUrl = avatarUrl.trim() || null;
  if (typeof licenseNumber === "string") updates.licenseNumber = licenseNumber.trim() || null;
  if (typeof syndicateNumber === "string") updates.syndicateNumber = syndicateNumber.trim() || null;
  if (yearsExperience != null && Number.isFinite(parseInt(String(yearsExperience)))) {
    updates.yearsExperience = parseInt(String(yearsExperience));
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات لتحديثها" });
    return;
  }
  const [lawyer] = await db
    .update(lawyersTable)
    .set(updates)
    .where(eq(lawyersTable.id, req.user!.userId))
    .returning();
  const { password: _password, ...safe } = lawyer!;
  res.json(safe);
});

// تسجيل محامٍ جديد — عبر لوحة الأدمن فقط.
router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  const { name, phone, email, specialization, city } = req.body as Record<string, string>;
  if (!name?.trim() || !phone?.trim() || !specialization?.trim() || !city?.trim()) {
    res.status(400).json({ error: "الاسم والهاتف والتخصص والمحافظة مطلوبة" });
    return;
  }

  const id = await nextSequentialId("LW");
  const plainPassword = generateRandomPassword();
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const [lawyer] = await db
    .insert(lawyersTable)
    .values({
      id,
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      specialization: specialization.trim(),
      city: city.trim(),
      password: hashedPassword,
      mustChangePassword: true,
      status: "active",
    })
    .returning();

  const { password: _password, ...lawyerSafe } = lawyer!;
  res.status(201).json({ ...lawyerSafe, credentials: { id, password: plainPassword } });
});

router.patch("/:id/status", authMiddleware, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body as { status?: string };
  if (!status || !["active", "suspended"].includes(status)) {
    res.status(400).json({ error: "حالة غير صالحة" });
    return;
  }
  const [lawyer] = await db.update(lawyersTable).set({ status }).where(eq(lawyersTable.id, id)).returning();
  if (!lawyer) {
    res.status(404).json({ error: "المحامي غير موجود" });
    return;
  }
  const { password: _password, ...lawyerSafe } = lawyer;
  res.json(lawyerSafe);
});

router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  await db.delete(lawyerReviewsTable).where(eq(lawyerReviewsTable.lawyerId, id));
  await db.delete(lawyerServicesTable).where(eq(lawyerServicesTable.lawyerId, id));
  await db.delete(lawyersTable).where(eq(lawyersTable.id, id));
  res.json({ ok: true });
});

export default router;
