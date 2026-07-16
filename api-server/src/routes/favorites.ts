import { Router } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db, favoritesTable, listingsTable, usersTable } from "@workspace/db";
import { authMiddleware } from "../lib/auth";
import { randomUUID } from "crypto";

const router = Router();
router.use(authMiddleware);

// IDs of the current user's favorites (lightweight, for heart toggles).
router.get("/ids", async (req, res) => {
  const rows = await db
    .select({ listingId: favoritesTable.listingId })
    .from(favoritesTable)
    .where(eq(favoritesTable.userId, req.user!.userId));
  res.json({ ids: rows.map((r) => r.listingId) });
});

// Full favorited listings (active only) for the favorites view.
router.get("/", async (req, res) => {
  const favs = await db
    .select({ listingId: favoritesTable.listingId })
    .from(favoritesTable)
    .where(eq(favoritesTable.userId, req.user!.userId))
    .orderBy(sql`${favoritesTable.createdAt} DESC`);
  const ids = favs.map((f) => f.listingId);
  if (ids.length === 0) {
    res.json({ listings: [] });
    return;
  }
  const listings = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      price: listingsTable.price,
      previousPrice: listingsTable.previousPrice,
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
      createdAt: listingsTable.createdAt,
      user: { id: usersTable.id, name: usersTable.name },
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.userId, usersTable.id))
    .where(and(inArray(listingsTable.id, ids), eq(listingsTable.status, "active")));
  // Preserve favorite recency order.
  const order = new Map(ids.map((id, i) => [id, i]));
  listings.sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
  res.json({ listings });
});

router.post("/:listingId", async (req, res) => {
  const listingId = req.params.listingId as string;
  const [listing] = await db
    .select({ id: listingsTable.id })
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId))
    .limit(1);
  if (!listing) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }
  await db
    .insert(favoritesTable)
    .values({ id: randomUUID(), userId: req.user!.userId, listingId })
    .onConflictDoNothing();
  res.status(201).json({ ok: true });
});

router.delete("/:listingId", async (req, res) => {
  const listingId = req.params.listingId as string;
  await db
    .delete(favoritesTable)
    .where(and(eq(favoritesTable.userId, req.user!.userId), eq(favoritesTable.listingId, listingId)));
  res.json({ ok: true });
});

export default router;
