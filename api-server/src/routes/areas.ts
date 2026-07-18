import { Router } from "express";
import { eq, and, asc, sql } from "drizzle-orm";
import { db, areasTable } from "@workspace/db";
import { authMiddleware, requireAdmin } from "../lib/auth";
import { randomUUID } from "crypto";

const router = Router();

// Public: list areas, optionally filtered by governorate (city).
router.get("/", async (req, res) => {
  const { city } = req.query as Record<string, string>;
  const rows = await db
    .select({ id: areasTable.id, city: areasTable.city, name: areasTable.name })
    .from(areasTable)
    .where(city ? eq(areasTable.city, city) : undefined)
    .orderBy(asc(areasTable.city), asc(areasTable.name));
  res.json({ areas: rows });
});

// Public: list distinct governorates that have at least one area.
router.get("/cities", async (_req, res) => {
  const rows = await db
    .select({ city: areasTable.city })
    .from(areasTable)
    .groupBy(areasTable.city)
    .orderBy(asc(areasTable.city));
  res.json({ cities: rows.map((r) => r.city) });
});

// Admin: add a new area classification.
router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  const { city, name } = req.body as { city?: string; name?: string };
  const cleanCity = typeof city === "string" ? city.trim() : "";
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanCity || !cleanName) {
    res.status(400).json({ error: "المحافظة واسم المنطقة مطلوبان" });
    return;
  }
  const [existing] = await db
    .select({ id: areasTable.id })
    .from(areasTable)
    .where(and(eq(areasTable.city, cleanCity), eq(sql`lower(${areasTable.name})`, cleanName.toLowerCase())))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "هذه المنطقة موجودة مسبقاً" });
    return;
  }
  const [area] = await db
    .insert(areasTable)
    .values({ id: randomUUID(), city: cleanCity, name: cleanName })
    .onConflictDoNothing({ target: [areasTable.city, areasTable.name] })
    .returning();
  if (!area) {
    res.status(409).json({ error: "هذه المنطقة موجودة مسبقاً" });
    return;
  }
  res.status(201).json(area);
});

// Admin: delete an area classification.
router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  await db.delete(areasTable).where(eq(areasTable.id, id));
  res.json({ ok: true });
});

export default router;
