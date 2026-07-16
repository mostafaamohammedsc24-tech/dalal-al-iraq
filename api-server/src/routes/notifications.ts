import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { authMiddleware } from "../lib/auth";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const userId = req.user!.userId;
  const items = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(sql`${notificationsTable.createdAt} DESC`)
    .limit(50);
  res.json(items);
});

router.get("/unread-count", async (req, res) => {
  const userId = req.user!.userId;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const conditions = [eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)];
  if (type) conditions.push(eq(notificationsTable.type, type));
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(notificationsTable)
    .where(and(...conditions));
  res.json({ count });
});

router.post("/read-all", async (req, res) => {
  const userId = req.user!.userId;
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.userId, userId));
  res.json({ ok: true });
});

router.patch("/:id/read", async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.userId;
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.json({ ok: true });
});

export default router;
