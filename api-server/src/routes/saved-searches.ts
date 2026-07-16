import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, savedSearchesTable } from "@workspace/db";
import { authMiddleware } from "../lib/auth";
import { randomUUID } from "crypto";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const searches = await db
    .select()
    .from(savedSearchesTable)
    .where(eq(savedSearchesTable.userId, req.user!.userId))
    .orderBy(sql`${savedSearchesTable.createdAt} DESC`);
  res.json({ searches });
});

router.post("/", async (req, res) => {
  const { label, params } = req.body as { label?: string; params?: Record<string, unknown> };
  if (!params || typeof params !== "object") {
    res.status(400).json({ error: "معايير البحث مطلوبة" });
    return;
  }
  // Keep only known, primitive filter keys.
  const allowed = ["q", "city", "category", "type", "minPrice", "maxPrice", "minSize", "maxSize", "ownershipType", "dealType"];
  const clean: Record<string, string> = {};
  for (const k of allowed) {
    const v = (params as Record<string, unknown>)[k];
    if (v != null && v !== "" && (typeof v === "string" || typeof v === "number")) {
      clean[k] = String(v);
    }
  }
  if (Object.keys(clean).length === 0) {
    res.status(400).json({ error: "أضف معياراً واحداً على الأقل لحفظ البحث" });
    return;
  }
  const [search] = await db
    .insert(savedSearchesTable)
    .values({
      id: randomUUID(),
      userId: req.user!.userId,
      label: (label?.trim() || "بحث محفوظ").slice(0, 80),
      params: JSON.stringify(clean),
    })
    .returning();
  res.status(201).json(search);
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id as string;
  await db
    .delete(savedSearchesTable)
    .where(and(eq(savedSearchesTable.id, id), eq(savedSearchesTable.userId, req.user!.userId)));
  res.json({ ok: true });
});

export default router;
