import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, networkNotificationsTable } from "@workspace/db";
import { authMiddleware, requireRole } from "../lib/auth";

const router = Router();
router.use(authMiddleware, requireRole("office", "lawyer", "admin"));

router.get("/", async (req, res) => {
  const recipientType = req.user!.role;
  const recipientId = req.user!.userId;
  const items = await db
    .select()
    .from(networkNotificationsTable)
    .where(and(eq(networkNotificationsTable.recipientType, recipientType), eq(networkNotificationsTable.recipientId, recipientId)))
    .orderBy(sql`${networkNotificationsTable.createdAt} DESC`)
    .limit(50);
  res.json(items);
});

router.get("/unread-count", async (req, res) => {
  const recipientType = req.user!.role;
  const recipientId = req.user!.userId;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(networkNotificationsTable)
    .where(
      and(
        eq(networkNotificationsTable.recipientType, recipientType),
        eq(networkNotificationsTable.recipientId, recipientId),
        eq(networkNotificationsTable.isRead, false),
      ),
    );
  res.json({ count });
});

router.post("/read-all", async (req, res) => {
  const recipientType = req.user!.role;
  const recipientId = req.user!.userId;
  await db
    .update(networkNotificationsTable)
    .set({ isRead: true })
    .where(and(eq(networkNotificationsTable.recipientType, recipientType), eq(networkNotificationsTable.recipientId, recipientId)));
  res.json({ ok: true });
});

router.patch("/:id/read", async (req, res) => {
  const id = req.params.id as string;
  const recipientType = req.user!.role;
  const recipientId = req.user!.userId;
  await db
    .update(networkNotificationsTable)
    .set({ isRead: true })
    .where(
      and(
        eq(networkNotificationsTable.id, id),
        eq(networkNotificationsTable.recipientType, recipientType),
        eq(networkNotificationsTable.recipientId, recipientId),
      ),
    );
  res.json({ ok: true });
});

export default router;
