import { Router } from "express";
import { eq, and, or, ilike, gte, lte, lt, ne, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db, listingsTable, usersTable, chatsTable, messagesTable, favoritesTable, priceHistoryTable } from "@workspace/db";
import { authMiddleware, optionalAuth } from "../lib/auth";
import { getAdminUserId, createNotification } from "../lib/dalal";
import { notifySavedSearchMatches } from "../lib/saved-search";
import { randomUUID } from "crypto";

const router = Router();

const favCountSql = sql<number>`(
  select cast(count(*) as int) from ${favoritesTable}
  where ${favoritesTable.listingId} = ${listingsTable.id}
)`;

// Average price benchmarks by category (optionally scoped to a city) so users
// can judge whether a listing is above or below the local market.
router.get("/market/stats", async (req, res) => {
  const { city, category } = req.query as Record<string, string>;
  const conditions = [eq(listingsTable.status, "active")];
  if (city) conditions.push(eq(listingsTable.city, city));
  if (category) conditions.push(eq(listingsTable.category, category));
  const [row] = await db
    .select({
      avgPrice: sql<number>`cast(coalesce(avg(${listingsTable.price}), 0) as double precision)`,
      minPrice: sql<number>`cast(coalesce(min(${listingsTable.price}), 0) as double precision)`,
      maxPrice: sql<number>`cast(coalesce(max(${listingsTable.price}), 0) as double precision)`,
      count: sql<number>`cast(count(*) as int)`,
      avgPricePerM2: sql<number>`cast(coalesce(avg(case when ${listingsTable.size} > 0 then ${listingsTable.price} / ${listingsTable.size} end), 0) as double precision)`,
    })
    .from(listingsTable)
    .where(and(...conditions));
  res.json(row);
});

// Public marketing stats for the homepage: active inventory, split by category,
// distinct cities covered, and total views accumulated.
router.get("/stats/overview", async (_req, res) => {
  const [row] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      realEstate: sql<number>`cast(count(*) filter (where ${listingsTable.category} = 'عقارات') as int)`,
      cars: sql<number>`cast(count(*) filter (where ${listingsTable.category} = 'سيارات') as int)`,
      cities: sql<number>`cast(count(distinct ${listingsTable.city}) as int)`,
      views: sql<number>`cast(coalesce(sum(${listingsTable.views}), 0) as int)`,
    })
    .from(listingsTable)
    .where(eq(listingsTable.status, "active"));
  res.json(row);
});

// Trending: most-viewed + most-favorited active listings (favorites weighted 3x).
router.get("/trending", async (req, res) => {
  const limitN = Math.min(parseInt(String(req.query.limit)) || 8, 20);
  const score = sql<number>`(${listingsTable.views} + 3 * ${favCountSql})`;
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
      bedrooms: listingsTable.bedrooms,
      bathrooms: listingsTable.bathrooms,
      carYear: listingsTable.carYear,
      mileage: listingsTable.mileage,
      dealType: listingsTable.dealType,
      pinned: listingsTable.pinned,
      verified: listingsTable.verified,
      featured: listingsTable.featured,
      video: listingsTable.video,
      images: listingsTable.images,
      views: listingsTable.views,
      createdAt: listingsTable.createdAt,
      favoritesCount: favCountSql,
    })
    .from(listingsTable)
    .where(eq(listingsTable.status, "active"))
    .orderBy(sql`${score} DESC, ${listingsTable.createdAt} DESC`)
    .limit(limitN);
  res.json({ listings });
});

router.get("/", optionalAuth, async (req, res) => {
  const {
    q, city, category, type, minPrice, maxPrice,
    minSize, maxSize, ownershipType, dealType,
    minBedrooms, minBathrooms, minBuildYear, maxBuildYear,
    minCarYear, maxCarYear, maxMileage,
    lat, lng, radius,
    userId, limit = "12", page = "1", status,
  } = req.query as Record<string, string>;

  const conditions = [];

  // Access control: only the owner (or admin) may see a user's non-active
  // listings or filter by an arbitrary status. Everyone else is restricted to
  // active listings to avoid exposing hidden/sold inventory.
  const isAdmin = req.user?.role === "admin";
  const isOwner = !!userId && req.user?.userId === userId;
  const privileged = isAdmin || isOwner;

  if (userId) {
    conditions.push(eq(listingsTable.userId, userId));
    if (privileged) {
      if (status) conditions.push(eq(listingsTable.status, status));
    } else {
      conditions.push(eq(listingsTable.status, "active"));
    }
  } else {
    conditions.push(eq(listingsTable.status, isAdmin && status ? status : "active"));
  }

  if (q) conditions.push(ilike(listingsTable.title, `%${q}%`));
  if (city) conditions.push(eq(listingsTable.city, city));
  if (category) conditions.push(eq(listingsTable.category, category));
  if (type) conditions.push(eq(listingsTable.type, type));
  if (minPrice) conditions.push(gte(listingsTable.price, parseFloat(minPrice)));
  if (maxPrice) conditions.push(lte(listingsTable.price, parseFloat(maxPrice)));
  if (minSize) conditions.push(gte(listingsTable.size, parseFloat(minSize)));
  if (maxSize) conditions.push(lte(listingsTable.size, parseFloat(maxSize)));
  if (ownershipType) conditions.push(eq(listingsTable.ownershipType, ownershipType));
  if (dealType) conditions.push(eq(listingsTable.dealType, dealType));
  if (minBedrooms) conditions.push(gte(listingsTable.bedrooms, parseInt(minBedrooms)));
  if (minBathrooms) conditions.push(gte(listingsTable.bathrooms, parseInt(minBathrooms)));
  if (minBuildYear) conditions.push(gte(listingsTable.buildYear, parseInt(minBuildYear)));
  if (maxBuildYear) conditions.push(lte(listingsTable.buildYear, parseInt(maxBuildYear)));
  if (minCarYear) conditions.push(gte(listingsTable.carYear, parseInt(minCarYear)));
  if (maxCarYear) conditions.push(lte(listingsTable.carYear, parseInt(maxCarYear)));
  if (maxMileage) conditions.push(lte(listingsTable.mileage, parseInt(maxMileage)));

  // Nearby search: when valid coordinates are provided, compute great-circle
  // distance (Haversine, in km) and restrict to listings within the radius.
  const latN = parseFloat(lat);
  const lngN = parseFloat(lng);
  const nearby = Number.isFinite(latN) && Number.isFinite(lngN);
  let distanceExpr: SQL<number> | null = null;
  if (nearby) {
    const radiusN = Math.min(Math.max(parseFloat(radius) || 25, 1), 500);
    distanceExpr = sql<number>`(6371 * acos(least(1, greatest(-1,
      cos(radians(${latN})) * cos(radians(${listingsTable.latitude})) *
      cos(radians(${listingsTable.longitude}) - radians(${lngN})) +
      sin(radians(${latN})) * sin(radians(${listingsTable.latitude}))
    ))))`;
    conditions.push(isNotNull(listingsTable.latitude));
    conditions.push(isNotNull(listingsTable.longitude));
    conditions.push(sql`${distanceExpr} <= ${radiusN}`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limitN = Math.min(parseInt(limit) || 12, 50);
  const offset = (parseInt(page) - 1) * limitN;

  const orderBy = distanceExpr
    ? sql`${distanceExpr} ASC`
    : sql`${listingsTable.pinned} DESC, coalesce(${listingsTable.bumpedAt}, ${listingsTable.createdAt}) DESC`;

  const [listings, [{ count }]] = await Promise.all([
    db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        price: listingsTable.price,
        previousPrice: listingsTable.previousPrice,
        category: listingsTable.category,
        type: listingsTable.type,
        city: listingsTable.city,
        size: listingsTable.size,
        bedrooms: listingsTable.bedrooms,
        bathrooms: listingsTable.bathrooms,
        carYear: listingsTable.carYear,
        mileage: listingsTable.mileage,
        latitude: listingsTable.latitude,
        longitude: listingsTable.longitude,
        ownershipType: listingsTable.ownershipType,
        dealType: listingsTable.dealType,
        pinned: listingsTable.pinned,
        verified: listingsTable.verified,
        featured: listingsTable.featured,
        video: listingsTable.video,
        images: listingsTable.images,
        views: listingsTable.views,
        status: listingsTable.status,
        createdAt: listingsTable.createdAt,
        bumpedAt: listingsTable.bumpedAt,
        favoritesCount: userId ? favCountSql : sql<number>`0`,
        distanceKm: distanceExpr ? distanceExpr : sql<number | null>`null`,
        user: {
          id: usersTable.id,
          name: usersTable.name,
        },
      })
      .from(listingsTable)
      .leftJoin(usersTable, eq(listingsTable.userId, usersTable.id))
      .where(where)
      .orderBy(orderBy)
      .limit(limitN)
      .offset(offset),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(listingsTable)
      .where(where),
  ]);

  res.json({ listings, total: count });
});

router.get("/:id", optionalAuth, async (req, res) => {
  const id = req.params.id as string;
  const [listing] = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      description: listingsTable.description,
      price: listingsTable.price,
      previousPrice: listingsTable.previousPrice,
      category: listingsTable.category,
      type: listingsTable.type,
      city: listingsTable.city,
      area: listingsTable.area,
      size: listingsTable.size,
      bedrooms: listingsTable.bedrooms,
      bathrooms: listingsTable.bathrooms,
      buildYear: listingsTable.buildYear,
      carYear: listingsTable.carYear,
      mileage: listingsTable.mileage,
      latitude: listingsTable.latitude,
      longitude: listingsTable.longitude,
      ownershipType: listingsTable.ownershipType,
      dealType: listingsTable.dealType,
      pinned: listingsTable.pinned,
      verified: listingsTable.verified,
      featured: listingsTable.featured,
      video: listingsTable.video,
      images: listingsTable.images,
      views: listingsTable.views,
      status: listingsTable.status,
      createdAt: listingsTable.createdAt,
      favoritesCount: favCountSql,
      user: {
        id: usersTable.id,
        name: usersTable.name,
      },
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.userId, usersTable.id))
    .where(eq(listingsTable.id, id))
    .limit(1);

  if (!listing) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }

  // Non-active listings (hidden/sold) are only visible to their owner or an admin.
  const isAdmin = req.user?.role === "admin";
  const isOwner = !!req.user && req.user.userId === listing.user?.id;
  if (listing.status !== "active" && !isAdmin && !isOwner) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }

  await db.update(listingsTable)
    .set({ views: listing.views + 1 })
    .where(eq(listingsTable.id, id));

  res.json({ ...listing, views: listing.views + 1 });
});

// "You may also like" — same category, prefer same city/type, exclude self.
router.get("/:id/similar", async (req, res) => {
  const id = req.params.id as string;
  const [base] = await db
    .select({ category: listingsTable.category, city: listingsTable.city, type: listingsTable.type })
    .from(listingsTable)
    .where(eq(listingsTable.id, id))
    .limit(1);
  if (!base) {
    res.json({ listings: [] });
    return;
  }
  const relevance = sql<number>`(
    (case when ${listingsTable.city} = ${base.city} then 2 else 0 end) +
    (case when ${listingsTable.type} = ${base.type} then 1 else 0 end)
  )`;
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
      dealType: listingsTable.dealType,
      pinned: listingsTable.pinned,
      video: listingsTable.video,
      images: listingsTable.images,
      views: listingsTable.views,
      createdAt: listingsTable.createdAt,
    })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.status, "active"),
      eq(listingsTable.category, base.category),
      ne(listingsTable.id, id),
    ))
    .orderBy(sql`${relevance} DESC, ${listingsTable.createdAt} DESC`)
    .limit(6);
  res.json({ listings });
});

// Price history (public) — chronological record of price changes.
router.get("/:id/price-history", async (req, res) => {
  const id = req.params.id as string;
  const rows = await db
    .select({
      id: priceHistoryTable.id,
      oldPrice: priceHistoryTable.oldPrice,
      newPrice: priceHistoryTable.newPrice,
      createdAt: priceHistoryTable.createdAt,
    })
    .from(priceHistoryTable)
    .where(eq(priceHistoryTable.listingId, id))
    .orderBy(sql`${priceHistoryTable.createdAt} ASC`)
    .limit(50);
  res.json({ history: rows });
});

// Owner/admin analytics for a single listing (seller performance dashboard).
router.get("/:id/analytics", authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const [listing] = await db
    .select({ userId: listingsTable.userId, views: listingsTable.views, createdAt: listingsTable.createdAt })
    .from(listingsTable)
    .where(eq(listingsTable.id, id))
    .limit(1);
  if (!listing) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }
  if (listing.userId !== req.user!.userId && req.user!.role !== "admin") {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const [[{ favorites }], [{ inquiries }]] = await Promise.all([
    db
      .select({ favorites: sql<number>`cast(count(*) as int)` })
      .from(favoritesTable)
      .where(eq(favoritesTable.listingId, id)),
    db
      .select({ inquiries: sql<number>`cast(count(*) as int)` })
      .from(chatsTable)
      .where(and(eq(chatsTable.listingId, id), ne(chatsTable.senderId, listing.userId))),
  ]);
  const daysOnMarket = Math.max(
    0,
    Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
  );
  res.json({ views: listing.views, favorites, inquiries, daysOnMarket });
});

// Book a viewing — broker model: routes the request to admin via chat.
router.post("/:id/viewing", authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const { date, note } = req.body as { date?: string; note?: string };
  const [listing] = await db
    .select({ id: listingsTable.id, title: listingsTable.title, userId: listingsTable.userId })
    .from(listingsTable)
    .where(eq(listingsTable.id, id))
    .limit(1);
  if (!listing) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }
  const adminId = await getAdminUserId();
  if (!adminId) {
    res.status(503).json({ error: "خدمة الحجز غير متاحة حالياً" });
    return;
  }
  const senderId = req.user!.userId;
  // Get-or-create the user↔admin chat for this listing.
  const [existing] = await db
    .select({ id: chatsTable.id })
    .from(chatsTable)
    .where(and(
      eq(chatsTable.listingId, id),
      eq(chatsTable.senderId, senderId),
      eq(chatsTable.receiverId, adminId),
    ))
    .limit(1);
  let chatId = existing?.id;
  if (!chatId) {
    chatId = randomUUID();
    await db.insert(chatsTable).values({ id: chatId, listingId: id, senderId, receiverId: adminId });
  }
  const cleanDate = typeof date === "string" ? date.trim().slice(0, 60) : "";
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 300) : "";
  const text =
    `طلب حجز معاينة للإعلان: «${listing.title}».` +
    (cleanDate ? `\nالموعد المقترح: ${cleanDate}` : "") +
    (cleanNote ? `\nملاحظات: ${cleanNote}` : "") +
    `\nيرجى ترتيب المعاينة معي. شكراً.`;
  await db.insert(messagesTable).values({ id: randomUUID(), chatId, userId: senderId, text });
  try {
    await createNotification({
      userId: adminId,
      type: "viewing_request",
      title: "طلب حجز معاينة جديد",
      body: `${req.user!.name || "مستخدم"} طلب معاينة: ${listing.title}`,
      link: `/chat?id=${chatId}`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to notify admin about viewing request");
  }
  res.status(201).json({ ok: true, chatId });
});

// Edit a listing (owner or admin). Records price changes and alerts favoriters
// when the price drops.
router.patch("/:id", authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!listing) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }
  const isOwner = listing.userId === req.user!.userId;
  const isAdmin = req.user!.role === "admin";
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const intOrNull = (v: unknown, min: number, max: number): number | null => {
    if (v == null || v === "") return null;
    const n = parseInt(String(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };

  if (typeof body.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (typeof body.description === "string" && body.description.trim()) updates.description = body.description.trim();
  if (typeof body.area === "string") updates.area = body.area.trim() || null;
  if (typeof body.city === "string" && body.city.trim()) updates.city = body.city.trim();
  if (typeof body.type === "string" && body.type.trim()) updates.type = body.type.trim();
  if (typeof body.dealType === "string" && ["للبيع", "للايجار", "مباع"].includes(body.dealType)) updates.dealType = body.dealType;
  if (typeof body.status === "string" && ["active", "hidden", "sold"].includes(body.status)) updates.status = body.status;
  if ("size" in body) updates.size = body.size != null && body.size !== "" && !Number.isNaN(parseFloat(String(body.size))) ? parseFloat(String(body.size)) : null;
  if ("bedrooms" in body) updates.bedrooms = intOrNull(body.bedrooms, 0, 50);
  if ("bathrooms" in body) updates.bathrooms = intOrNull(body.bathrooms, 0, 50);
  if ("buildYear" in body) updates.buildYear = intOrNull(body.buildYear, 1900, 2100);
  if ("carYear" in body) updates.carYear = intOrNull(body.carYear, 1950, 2100);
  if ("mileage" in body) updates.mileage = intOrNull(body.mileage, 0, 2_000_000);

  // Admin-only moderation flags.
  if (isAdmin) {
    if (typeof body.verified === "boolean") updates.verified = body.verified;
    if (typeof body.featured === "boolean") updates.featured = body.featured;
    if (typeof body.pinned === "boolean") updates.pinned = body.pinned;
  }

  // Price change handling.
  let newPrice: number | null = null;
  if (body.price != null && body.price !== "" && !Number.isNaN(parseFloat(String(body.price)))) {
    const p = parseFloat(String(body.price));
    if (p > 0 && p !== listing.price) {
      newPrice = p;
      updates.price = p;
      updates.previousPrice = listing.price;
    }
  }

  const [updated] = await db.update(listingsTable).set(updates).where(eq(listingsTable.id, id)).returning();

  if (newPrice != null) {
    await db.insert(priceHistoryTable).values({
      id: randomUUID(),
      listingId: id,
      oldPrice: listing.price,
      newPrice,
    });
    // Alert users who favorited this listing when the price drops.
    if (newPrice < listing.price) {
      try {
        const favs = await db
          .select({ userId: favoritesTable.userId })
          .from(favoritesTable)
          .where(eq(favoritesTable.listingId, id));
        const pct = Math.round(((listing.price - newPrice) / listing.price) * 100);
        await Promise.all(
          favs
            .filter((f) => f.userId !== req.user!.userId)
            .map((f) =>
              createNotification({
                userId: f.userId,
                type: "price_drop",
                title: "انخفض سعر إعلان في مفضلتك",
                body: `«${updated.title}» انخفض سعره ${pct}%`,
                link: `/listings/${id}`,
              }),
            ),
        );
      } catch (err) {
        req.log.error({ err }, "Failed to dispatch price-drop alerts");
      }
    }
  }

  res.json(updated);
});

// Self-service "bump": the owner can re-float their active listing to the top of
// the feed once every 24 hours. Sorting uses coalesce(bumpedAt, createdAt) DESC.
const BUMP_COOLDOWN_MS = 24 * 60 * 60 * 1000;
router.post("/:id/bump", authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!listing) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }
  if (listing.userId !== req.user!.userId && req.user!.role !== "admin") {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  if (listing.status !== "active") {
    res.status(400).json({ error: "يمكن رفع الإعلانات النشطة فقط" });
    return;
  }
  const now = new Date();
  const cutoff = new Date(now.getTime() - BUMP_COOLDOWN_MS);
  // Atomic conditional update: admins bypass the cooldown; for owners the row is
  // only updated when the previous bump is older than the cutoff, preventing a
  // concurrent double-bump race.
  const cooldownGuard =
    req.user!.role === "admin"
      ? undefined
      : or(isNull(listingsTable.bumpedAt), lt(listingsTable.bumpedAt, cutoff));
  const updated = await db
    .update(listingsTable)
    .set({ bumpedAt: now })
    .where(cooldownGuard ? and(eq(listingsTable.id, id), cooldownGuard) : eq(listingsTable.id, id))
    .returning({ id: listingsTable.id });
  if (updated.length === 0) {
    const last = listing.bumpedAt ? listing.bumpedAt.getTime() : 0;
    const nextAt = new Date(last + BUMP_COOLDOWN_MS).toISOString();
    res.status(429).json({ error: "تم رفع الإعلان مؤخراً، حاول لاحقاً", nextAt });
    return;
  }
  res.json({ ok: true, bumpedAt: now.toISOString(), nextAt: new Date(now.getTime() + BUMP_COOLDOWN_MS).toISOString() });
});

router.post("/", authMiddleware, async (req, res) => {
  const {
    title, description, price, category, type, city, area, images, size,
    ownershipType, video, dealType, latitude, longitude,
    bedrooms, bathrooms, buildYear, carYear, mileage,
  } = req.body;

  if (!title || !description || !price || !category || !type || !city) {
    res.status(400).json({ error: "يرجى تعبئة جميع الحقول المطلوبة" });
    return;
  }

  const MAX_IMAGES = 6;
  const MAX_IMAGE_LENGTH = 3_000_000;
  const cleanImages = Array.isArray(images)
    ? images
        .filter(
          (u: string) =>
            typeof u === "string" &&
            (u.startsWith("http") || u.startsWith("data:image/") || u.startsWith("/objects/")) &&
            u.length <= MAX_IMAGE_LENGTH
        )
        .slice(0, MAX_IMAGES)
    : [];

  const cleanVideo =
    typeof video === "string" && video.startsWith("/objects/") ? video : null;
  const cleanDealType = ["للبيع", "للايجار", "مباع"].includes(dealType) ? dealType : "للبيع";
  const cleanOwnership =
    typeof ownershipType === "string" && ["طابو صرف", "زراعي"].includes(ownershipType)
      ? ownershipType
      : null;
  const sizeNum = size != null && !Number.isNaN(parseFloat(size)) ? parseFloat(size) : null;
  const intOrNull = (v: unknown, min: number, max: number): number | null => {
    if (v == null || v === "") return null;
    const n = parseInt(String(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
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

  const userId = req.user!.userId;
  const id = randomUUID();
  const [listing] = await db.insert(listingsTable).values({
    id,
    title: title.trim(),
    description: description.trim(),
    price: parseFloat(price),
    category,
    type,
    city,
    area: area || null,
    size: sizeNum,
    bedrooms: intOrNull(bedrooms, 0, 50),
    bathrooms: intOrNull(bathrooms, 0, 50),
    buildYear: intOrNull(buildYear, 1900, 2100),
    carYear: intOrNull(carYear, 1950, 2100),
    mileage: intOrNull(mileage, 0, 2_000_000),
    latitude: hasCoords ? latNum : null,
    longitude: hasCoords ? lngNum : null,
    ownershipType: cleanOwnership,
    dealType: cleanDealType,
    video: cleanVideo,
    images: cleanImages,
    userId,
    status: "active",
  }).returning();

  // Broker model: open a chat between the publisher and Dalal Iraq (admin),
  // seed it with a welcome message, and notify the admin of the new listing.
  try {
    const adminId = await getAdminUserId();
    if (adminId && adminId !== userId) {
      const chatId = randomUUID();
      await db.insert(chatsTable).values({
        id: chatId,
        listingId: id,
        senderId: userId,
        receiverId: adminId,
      });
      await db.insert(messagesTable).values({
        id: randomUUID(),
        chatId,
        userId: adminId,
        text: `مرحباً، شكراً لنشر إعلانك "${title.trim()}" عبر شبكة دلال العراق. فريقنا سيتواصل معك لمتابعة عرضه وتسويقه. الاستشارة مجانية ونحن وسيطك الموثوق. 🤝`,
      });
      await createNotification({
        userId: adminId,
        type: "new_listing",
        title: "إعلان جديد بانتظار التصنيف",
        body: `${req.user!.name || "مستخدم"} نشر إعلاناً: ${title.trim()}`,
        link: `/listings/${id}`,
      });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to open broker chat for new listing");
  }

  // Saved-search alerts: notify users whose saved filters match this listing.
  try {
    await notifySavedSearchMatches(listing);
  } catch (err) {
    req.log.error({ err }, "Failed to dispatch saved-search alerts");
  }

  res.status(201).json(listing);
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);

  if (!listing) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }

  const isOwner = listing.userId === req.user!.userId;
  const isAdmin = req.user!.role === "admin";

  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  await db.delete(listingsTable).where(eq(listingsTable.id, id));
  res.json({ ok: true });
});

export default router;
