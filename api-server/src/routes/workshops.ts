import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, workshopsTable } from "@workspace/db";
import { authMiddleware, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", async (req, res) => {
  const { city, specialty } = req.query as Record<string, string>;
  const conditions = [];
  if (city) conditions.push(eq(workshopsTable.city, city));
  if (specialty) conditions.push(eq(workshopsTable.specialty, specialty));
  const workshops = await db
    .select()
    .from(workshopsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${workshopsTable.rating} DESC`);
  res.json({ workshops });
});

router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  const { name, specialty, phone, city } = req.body as Record<string, string>;
  if (!name?.trim() || !specialty?.trim() || !phone?.trim() || !city?.trim()) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" });
    return;
  }
  const [workshop] = await db
    .insert(workshopsTable)
    .values({ id: randomUUID(), name: name.trim(), specialty: specialty.trim(), phone: phone.trim(), city: city.trim() })
    .returning();
  res.status(201).json(workshop);
});

router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  await db.delete(workshopsTable).where(eq(workshopsTable.id, req.params.id as string));
  res.json({ ok: true });
});

export default router;
