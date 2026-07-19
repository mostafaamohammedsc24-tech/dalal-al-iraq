#!/usr/bin/env bash
#
# dalal-fix-2.sh — التصحيح الثاني لتطبيق دلال العراق
#
# يطبّق خمسة إصلاحات:
#   1) ليبل المصدر: منشورات الشبكة تظهر «من طرف شبكة دلال العراق»،
#      ومنشورات المكاتب المعتمدة تظهر «إعلان المكتب: <الاسم>» (بدل «إعلان فرد»).
#   2) المحادثة مع المكتب تظهر باسم المكتب (لا «مستخدم»)، ونص المكتب لا يقول
#      «مهتم بالشراء» بل تنسيق/توفير صفقة، مع زر «إنشاء صفقة» في المنشور،
#      وتسجيل إحالة تلقائياً عند استخدام باركود المكتب (تُصنّف لاحقاً).
#   3) حقل «رقم البائع» إجباري عند نشر المكتب، لا يُنشر للعامة بل يُرسل
#      لشبكة دلال العراق في المحادثة مع العرض.
#   4) حقل الرهن يصبح حقلين: مبلغ الرهن + الإيجار الشهري.
#   5) إصلاحات تجاوب: لوحة الإدارة (الجدول/التبويبات) وشاشة الموقع/الخريطة
#      («وضع الدبوس») لتناسب جميع الأجهزة تلقائياً.
#
# آمن للتشغيل المتكرر: ينشئ نسخة احتياطية بامتداد .bak-dalal-fix-2 لكل ملف
# (مرة واحدة فقط) قبل استبداله. يعمل من جذر المستودع أو من أي مجلد فرعي.
#
# بعد التشغيل:
#   pnpm install
#   pnpm --filter @workspace/db run push      # لإضافة الأعمدة الجديدة لقاعدة البيانات
#   pnpm run typecheck
#   pnpm --filter @workspace/dalal-app run build
#   pnpm --filter @workspace/api-server run build
#
set -euo pipefail

# --- إيجاد جذر المستودع (يصعد للأعلى بحثاً عن pnpm-workspace.yaml) ---
find_root() {
  local d="${1:-$PWD}"
  while [ "$d" != "/" ]; do
    if [ -f "$d/pnpm-workspace.yaml" ] || { [ -d "$d/api-server" ] && [ -d "$d/dalal-app" ] && [ -d "$d/lib/db" ]; }; then
      printf '%s\n' "$d"
      return 0
    fi
    d="$(dirname "$d")"
  done
  return 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(find_root "$PWD" || true)"
if [ -z "${ROOT:-}" ]; then
  ROOT="$(find_root "$SCRIPT_DIR" || true)"
fi
if [ -z "${ROOT:-}" ]; then
  echo "خطأ: لم يُعثر على جذر مشروع دلال العراق. شغّل السكربت داخل مجلد المشروع." >&2
  exit 1
fi
echo "جذر المشروع: $ROOT"

BACKUP_EXT=".bak-dalal-fix-2"

apply_file() {
  local rel="$1"
  local dest="$ROOT/$rel"
  mkdir -p "$(dirname "$dest")"
  if [ -f "$dest" ] && [ ! -f "$dest$BACKUP_EXT" ]; then
    cp "$dest" "$dest$BACKUP_EXT"
    echo "  نسخة احتياطية: $rel$BACKUP_EXT"
  fi
  cat > "$dest"
  echo "  كُتب: $rel"
}

echo "تطبيق الإصلاحات..."

apply_file lib/db/src/schema/listings.ts <<'DALAL_FIX2_EOF_9f3a'
import { pgTable, text, real, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const listingsTable = pgTable("listings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: real("price").notNull(),
  category: text("category").notNull(),
  type: text("type").notNull(),
  city: text("city").notNull(),
  area: text("area"),
  size: real("size"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  buildYear: integer("build_year"),
  carYear: integer("car_year"),
  mileage: integer("mileage"),
  previousPrice: real("previous_price"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  ownershipType: text("ownership_type"),
  dealType: text("deal_type").notNull().default("للبيع"),
  // للعروض من نوع "رهن": المبلغ في price يمثل سعر الرهن، وهذا الحقل يمثل
  // الإيجار الشهري. يبقى null لبقية أنواع العروض وللبيانات القديمة.
  monthlyRent: real("monthly_rent"),
  // Attribution: when a listing belongs to a certified office, this holds the
  // office id (OF-xxx). Null means it is presented under شبكة دلال العراق.
  officeId: text("office_id"),
  pinned: boolean("pinned").notNull().default(false),
  verified: boolean("verified").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  video: text("video"),
  images: text("images").array().notNull().default([]),
  views: integer("views").notNull().default(0),
  status: text("status").notNull().default("active"),
  bumpedAt: timestamp("bumped_at"),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({
  views: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;
DALAL_FIX2_EOF_9f3a

apply_file lib/db/src/schema/network-properties.ts <<'DALAL_FIX2_EOF_9f3a'
import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// عقارات شبكة المكاتب — منفصلة عن listingsTable (إعلانات الأفراد العامة).
export const networkPropertiesTable = pgTable("network_properties", {
  id: text("id").primaryKey(),
  officeId: text("office_id").notNull(),
  type: text("type").notNull(), // أرض | شقة | دار | محل
  city: text("city").notNull(),
  area: text("area"),
  price: real("price").notNull(),
  size: real("size"),
  rooms: integer("rooms"),
  // رقم البائع — خاص، لا يُعرض للعامة أبداً؛ يُرسل لشبكة دلال العراق في المحادثة.
  sellerPhone: text("seller_phone"),
  description: text("description"),
  images: text("images").array().notNull().default([]),
  video: text("video"),
  // pending_audit: بانتظار رفع تقرير الفحص، لا يظهر للعامة
  status: text("status").notNull().default("pending_audit"),
  inspectionReportUrl: text("inspection_report_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNetworkPropertySchema = createInsertSchema(networkPropertiesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertNetworkProperty = z.infer<typeof insertNetworkPropertySchema>;
export type NetworkProperty = typeof networkPropertiesTable.$inferSelect;

export const mediationRequestsTable = pgTable("mediation_requests", {
  id: text("id").primaryKey(),
  propertyId: text("property_id").notNull(),
  requestingOfficeId: text("requesting_office_id").notNull(),
  ownerOfficeId: text("owner_office_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected | completed
  commissionAmount: real("commission_amount"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMediationRequestSchema = createInsertSchema(mediationRequestsTable).omit({
  createdAt: true,
});
export type InsertMediationRequest = z.infer<typeof insertMediationRequestSchema>;
export type MediationRequest = typeof mediationRequestsTable.$inferSelect;

export const referralsTable = pgTable("referrals", {
  id: text("id").primaryKey(),
  // اختياري: إحالات باركود المكتب لا ترتبط بعقار محدد.
  propertyId: text("property_id"),
  referringOfficeId: text("referring_office_id").notNull(),
  ownerOfficeId: text("owner_office_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // pending | completed | cancelled
  rewardAmount: real("reward_amount").notNull().default(100),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({
  createdAt: true,
});
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
DALAL_FIX2_EOF_9f3a

apply_file api-server/src/routes/chats.ts <<'DALAL_FIX2_EOF_9f3a'
import { Router } from "express";
import { eq, or, and, sql, isNull, inArray } from "drizzle-orm";
import { db, chatsTable, messagesTable, listingsTable, usersTable, officesTable, referralsTable } from "@workspace/db";
import { authMiddleware } from "../lib/auth";
import { getAdminUserId, createNotification } from "../lib/dalal";
import { randomUUID } from "crypto";

const MESSAGE_TYPES = ["text", "image", "voice"];

const DALAL_NAME = "شبكة دلال العراق";
const LISTING_CARD_TAG = "[[listing:";

// أطراف المحادثة قد تكون مستخدمين عاديين أو مكاتب معتمدة (OF-xxx). المكاتب ليست
// في usersTable، لذا نبحث عنها في officesTable حتى يظهر اسم المكتب بدل "مستخدم".
async function resolveParty(id: string): Promise<{ id: string; name: string; phone: string } | null> {
  const [u] = await db
    .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (u) return u;
  const [o] = await db
    .select({ id: officesTable.id, name: officesTable.name, phone: officesTable.phone })
    .from(officesTable)
    .where(eq(officesTable.id, id))
    .limit(1);
  if (o) return { id: o.id, name: o.name, phone: o.phone };
  return null;
}

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res) => {
  const userId = req.user!.userId;

  const chats = await db
    .select({
      id: chatsTable.id,
      listingId: chatsTable.listingId,
      senderId: chatsTable.senderId,
      receiverId: chatsTable.receiverId,
      createdAt: chatsTable.createdAt,
    })
    .from(chatsTable)
    .where(or(eq(chatsTable.senderId, userId), eq(chatsTable.receiverId, userId)))
    .orderBy(sql`${chatsTable.createdAt} DESC`);

  // Only the broker (admin) may see participant phone numbers; redact for everyone else.
  const isAdmin = req.user!.role === "admin";

  const enriched = await Promise.all(chats.map(async (chat) => {
    const [listing] = chat.listingId
      ? await db.select({ id: listingsTable.id, title: listingsTable.title })
          .from(listingsTable).where(eq(listingsTable.id, chat.listingId)).limit(1)
      : [];
    const sender = await resolveParty(chat.senderId);
    const receiver = await resolveParty(chat.receiverId);
    const messages = await db.select({ text: messagesTable.text, type: messagesTable.type, createdAt: messagesTable.createdAt })
      .from(messagesTable).where(eq(messagesTable.chatId, chat.id))
      .orderBy(sql`${messagesTable.createdAt} DESC`).limit(1);

    const redact = (u: { id: string; name: string; phone: string } | null, fallbackId?: string) => {
      const base = u || { id: fallbackId!, name: "مستخدم", phone: "" };
      return { id: base.id, name: base.name, phone: isAdmin ? base.phone : "" };
    };

    return {
      ...chat,
      listing: chat.listingId
        ? (listing || { id: chat.listingId, title: "إعلان محذوف" })
        : { id: null, title: "استشارة عامة" },
      sender: redact(sender, chat.senderId),
      receiver: redact(receiver, chat.receiverId),
      messages,
    };
  }));

  res.json(enriched);
});

// Broker model: every chat is between a user and Dalal Iraq (admin).
// Get-or-create the chat for an optional listing (general consultation when omitted).
router.post("/", async (req, res) => {
  const { listingId, officeId } = req.body;
  const senderId = req.user!.userId;

  const adminId = await getAdminUserId();
  if (!adminId) {
    res.status(503).json({ error: "خدمة الدردشة غير متاحة حالياً" });
    return;
  }
  if (senderId === adminId) {
    res.status(400).json({ error: "الإدارة ترد على المحادثات القائمة فقط" });
    return;
  }

  // Office QR flow: scanning a certified office's barcode opens a general chat
  // and seeds it with a server-verified attribution message. The office name is
  // read from the DB (not the client) so it cannot be spoofed.
  if (!listingId && typeof officeId === "string" && officeId.trim()) {
    const [office] = await db
      .select({ id: officesTable.id, name: officesTable.name })
      .from(officesTable)
      .where(eq(officesTable.id, officeId.trim()))
      .limit(1);
    if (!office) {
      res.status(404).json({ error: "المكتب غير موجود" });
      return;
    }
    const [existingGeneral] = await db.select().from(chatsTable).where(
      and(isNull(chatsTable.listingId), eq(chatsTable.senderId, senderId), eq(chatsTable.receiverId, adminId)),
    ).limit(1);
    let chatId = existingGeneral?.id;
    if (!chatId) {
      chatId = randomUUID();
      await db.insert(chatsTable).values({ id: chatId, listingId: null, senderId, receiverId: adminId });
      await db.insert(messagesTable).values({
        id: randomUUID(), chatId, userId: adminId,
        text: `أهلاً بك في ${DALAL_NAME} 👋 الاستشارة مجانية. كيف نخدمك اليوم؟`,
      });
    }
    await db.insert(messagesTable).values({
      id: randomUUID(), chatId, userId: senderId,
      text: `من طرف المكتب المعتمد: ${office.name} (${office.id})\nمرحباً، وصلت إليكم عبر باركود المكتب وأرغب بالاستفسار.`,
    });
    // تسجيل الإحالة: يُنسب العميل للمكتب صاحب الباركود، وتُصنّف لاحقاً (ناجحة/غير ناجحة).
    try {
      const customer = await resolveParty(senderId);
      const [existingRef] = await db
        .select({ id: referralsTable.id })
        .from(referralsTable)
        .where(and(
          eq(referralsTable.referringOfficeId, office.id),
          eq(referralsTable.ownerOfficeId, adminId),
          eq(referralsTable.customerPhone, customer?.phone || senderId),
        ))
        .limit(1);
      if (!existingRef) {
        await db.insert(referralsTable).values({
          id: randomUUID(),
          propertyId: null,
          referringOfficeId: office.id,
          ownerOfficeId: adminId,
          customerName: customer?.name || "زبون",
          customerPhone: customer?.phone || senderId,
          notes: "إحالة عبر باركود المكتب",
        });
      }
    } catch (err) {
      req.log.error({ err }, "Failed to record office QR referral");
    }
    try {
      await createNotification({
        userId: adminId, type: "message",
        title: `استفسار عبر المكتب المعتمد: ${office.name}`,
        body: `وصل عميل عبر باركود المكتب ${office.id}`,
        link: `/chat?id=${chatId}`,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to notify admin of office QR inquiry");
    }
    res.status(201).json({ id: chatId, listingId: null, senderId, receiverId: adminId });
    return;
  }

  const listingCond = listingId
    ? eq(chatsTable.listingId, listingId)
    : isNull(chatsTable.listingId);

  const existing = await db.select().from(chatsTable).where(
    and(
      listingCond,
      eq(chatsTable.senderId, senderId),
      eq(chatsTable.receiverId, adminId),
    )
  ).limit(1);

  if (existing.length > 0) {
    res.json(existing[0]);
    return;
  }

  const id = randomUUID();
  const [chat] = await db.insert(chatsTable).values({
    id, listingId: listingId || null, senderId, receiverId: adminId,
  }).returning();

  // For a listing chat, send the user's inquiry (carrying the listing card) first.
  if (listingId) {
    const [listing] = await db
      .select({ title: listingsTable.title })
      .from(listingsTable).where(eq(listingsTable.id, listingId)).limit(1);
    const isOffice = req.user!.role === "office";
    const inquiryText = isOffice
      ? `${LISTING_CARD_TAG}${listingId}]]\nمرحباً، أنا مكتب معتمد وأرغب بالتنسيق حول هذا العرض: «${listing?.title || "إعلان"}» (توفير مشترٍ/صفقة أو وساطة). أرجو التواصل.`
      : `${LISTING_CARD_TAG}${listingId}]]\nمرحباً، أنا مهتم بهذا الإعلان: «${listing?.title || "إعلان"}». أرجو تزويدي بالتفاصيل والتواصل معي.`;
    await db.insert(messagesTable).values({
      id: randomUUID(), chatId: id, userId: senderId, text: inquiryText,
    });
    // Let the admin know a new inquiry arrived.
    try {
      const [sender] = await db.select({ name: usersTable.name })
        .from(usersTable).where(eq(usersTable.id, senderId)).limit(1);
      await createNotification({
        userId: adminId,
        type: "message",
        title: `استفسار جديد من ${sender?.name || "مستخدم"}`,
        body: `بخصوص: ${listing?.title || "إعلان"}`,
        link: `/chat?id=${id}`,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to notify admin of new inquiry");
    }
  }

  const welcome = listingId
    ? `أهلاً بك في ${DALAL_NAME}. نحن وسيطك للتواصل بشأن هذا الإعلان. الاستشارة مجانية، اكتب استفسارك وسنرد عليك فوراً. 🤝`
    : `أهلاً بك في ${DALAL_NAME} 👋 نحن وسيطك العقاري الموثوق في العراق. كل تواصلك يكون معنا مباشرة، والاستشارة مجانية تماماً. كيف نخدمك اليوم؟`;
  await db.insert(messagesTable).values({
    id: randomUUID(), chatId: id, userId: adminId, text: welcome,
  });

  res.status(201).json(chat);
});

router.get("/:chatId/messages", async (req, res) => {
  const chatId = req.params.chatId as string;
  const userId = req.user!.userId;

  const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1);
  if (!chat || (chat.senderId !== userId && chat.receiverId !== userId)) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const messages = await db
    .select({
      id: messagesTable.id,
      text: messagesTable.text,
      type: messagesTable.type,
      mediaUrl: messagesTable.mediaUrl,
      userId: messagesTable.userId,
      chatId: messagesTable.chatId,
      createdAt: messagesTable.createdAt,
      user: { id: usersTable.id, name: usersTable.name },
    })
    .from(messagesTable)
    .leftJoin(usersTable, eq(messagesTable.userId, usersTable.id))
    .where(eq(messagesTable.chatId, chatId))
    .orderBy(sql`${messagesTable.createdAt} ASC`);

  // رسائل المكاتب لا تُطابق usersTable — نكمل أسماءها من officesTable.
  const officeIds = messages.filter((m) => !m.user?.id).map((m) => m.userId);
  const officeMap = new Map<string, string>();
  if (officeIds.length > 0) {
    const offices = await db
      .select({ id: officesTable.id, name: officesTable.name })
      .from(officesTable)
      .where(inArray(officesTable.id, officeIds));
    for (const o of offices) officeMap.set(o.id, o.name);
  }
  const out = messages.map((m) =>
    m.user?.id ? m : { ...m, user: { id: m.userId, name: officeMap.get(m.userId) ?? "مستخدم" } },
  );

  res.json(out);
});

router.post("/:chatId/messages", async (req, res) => {
  const chatId = req.params.chatId as string;
  const { text, mediaUrl } = req.body as { text?: string; mediaUrl?: string; type?: string };
  const userId = req.user!.userId;

  const type = MESSAGE_TYPES.includes(String(req.body?.type)) ? String(req.body.type) : "text";
  const cleanText = typeof text === "string" ? text.trim() : "";
  const cleanMedia =
    typeof mediaUrl === "string" && mediaUrl.startsWith("/objects/") ? mediaUrl : null;

  if (type === "text" && !cleanText) {
    res.status(400).json({ error: "الرسالة فارغة" });
    return;
  }
  if ((type === "image" || type === "voice") && !cleanMedia) {
    res.status(400).json({ error: "الملف المرفق غير صالح" });
    return;
  }

  const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1);
  if (!chat || (chat.senderId !== userId && chat.receiverId !== userId)) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const id = randomUUID();
  const [msg] = await db.insert(messagesTable).values({
    id, chatId, userId, type, text: cleanText, mediaUrl: cleanMedia,
  }).returning();

  const party = await resolveParty(userId);
  const user = party ? { id: party.id, name: party.name } : null;

  // Notify the other participant about the new message.
  try {
    const recipientId = chat.senderId === userId ? chat.receiverId : chat.senderId;
    const adminId = await getAdminUserId();
    const fromAdmin = userId === adminId;
    const link = `/chat?id=${chatId}`;
    const preview = type === "image" ? "📷 صورة" : type === "voice" ? "🎤 رسالة صوتية" : cleanText.slice(0, 120);
    await createNotification({
      userId: recipientId,
      type: "message",
      title: fromAdmin ? `رسالة من ${DALAL_NAME}` : `رسالة جديدة من ${user?.name || "مستخدم"}`,
      body: preview,
      link,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create message notification");
  }

  res.status(201).json({ ...msg, user });
});

export default router;
DALAL_FIX2_EOF_9f3a

apply_file api-server/src/routes/deals.ts <<'DALAL_FIX2_EOF_9f3a'
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, dealsTable, networkPropertiesTable, listingsTable, paymentsLedgerTable } from "@workspace/db";
import { authMiddleware, requireRole } from "../lib/auth";

const router = Router();

// نسب العمولة الافتراضية على صفقات الشبكة — العمولة الكلية 2% من سعر البيع،
// تُقسم بين المكتب (70%) وشبكة دلال العراق (30%).
const TOTAL_COMMISSION_RATE = 0.02;
const NETWORK_SHARE = 0.3;

router.get("/mine", authMiddleware, requireRole("office"), async (req, res) => {
  const officeId = req.user!.userId;
  const deals = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.officeId, officeId))
    .orderBy(sql`${dealsTable.createdAt} DESC`);
  res.json({ deals });
});

router.post("/", authMiddleware, requireRole("office"), async (req, res) => {
  const officeId = req.user!.userId;
  const { propertyId, buyerName, buyerPhone, price } = req.body as Record<string, unknown>;
  if (!propertyId || !price || !Number.isFinite(parseFloat(String(price)))) {
    res.status(400).json({ error: "العقار والسعر مطلوبان" });
    return;
  }
  // الصفقة قد تكون على عقار من شبكة المكاتب أو على إعلان عام (listing).
  const propId = String(propertyId);
  const [networkProp] = await db.select({ id: networkPropertiesTable.id }).from(networkPropertiesTable).where(eq(networkPropertiesTable.id, propId)).limit(1);
  let exists = !!networkProp;
  if (!exists) {
    const [listing] = await db.select({ id: listingsTable.id }).from(listingsTable).where(eq(listingsTable.id, propId)).limit(1);
    exists = !!listing;
  }
  if (!exists) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }
  const [deal] = await db
    .insert(dealsTable)
    .values({
      id: randomUUID(),
      propertyId: String(propertyId),
      officeId,
      buyerName: typeof buyerName === "string" ? buyerName.trim() || null : null,
      buyerPhone: typeof buyerPhone === "string" ? buyerPhone.trim() || null : null,
      price: parseFloat(String(price)),
      status: "negotiating",
    })
    .returning();
  res.status(201).json(deal);
});

router.patch("/:id", authMiddleware, requireRole("office"), async (req, res) => {
  const id = req.params.id as string;
  const { status, price, buyerName, buyerPhone } = req.body as Record<string, unknown>;
  const [existing] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!existing || existing.officeId !== req.user!.userId) {
    res.status(404).json({ error: "الصفقة غير موجودة" });
    return;
  }
  const updates: Partial<typeof dealsTable.$inferInsert> = {};
  if (typeof buyerName === "string") updates.buyerName = buyerName.trim() || null;
  if (typeof buyerPhone === "string") updates.buyerPhone = buyerPhone.trim() || null;
  if (price != null && Number.isFinite(parseFloat(String(price)))) updates.price = parseFloat(String(price));

  if (typeof status === "string") {
    const validStatuses = ["negotiating", "contract_signed", "transferring_ownership", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "حالة غير صالحة" });
      return;
    }
    updates.status = status;
    if (status === "completed" && existing.status !== "completed") {
      const price_ = updates.price ?? existing.price;
      const totalCommission = price_ * TOTAL_COMMISSION_RATE;
      const networkCommission = Math.round(totalCommission * NETWORK_SHARE);
      const officeNetCommission = Math.round(totalCommission - networkCommission);
      updates.commissionRate = TOTAL_COMMISSION_RATE;
      updates.networkCommission = networkCommission;
      updates.officeNetCommission = officeNetCommission;
      updates.completedAt = sql`now()` as unknown as Date;

      await db.insert(paymentsLedgerTable).values({
        id: randomUUID(),
        payeeType: "office",
        payeeId: existing.officeId,
        serviceType: "deal_commission",
        clientName: existing.buyerName,
        amount: officeNetCommission,
        status: "pending",
      });

      if (existing.propertyId) {
        await db.update(networkPropertiesTable).set({ status: "sold" }).where(eq(networkPropertiesTable.id, existing.propertyId));
      }
    }
  }

  const [deal] = await db.update(dealsTable).set(updates).where(eq(dealsTable.id, id)).returning();
  res.json(deal);
});

export default router;
DALAL_FIX2_EOF_9f3a

apply_file api-server/src/routes/listings.ts <<'DALAL_FIX2_EOF_9f3a'
import { Router } from "express";
import { eq, and, or, ilike, gte, lte, lt, ne, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db, listingsTable, usersTable, officesTable, chatsTable, messagesTable, favoritesTable, priceHistoryTable } from "@workspace/db";
import { authMiddleware, optionalAuth } from "../lib/auth";
import { getAdminUserId, createNotification } from "../lib/dalal";
import { notifySavedSearchMatches } from "../lib/saved-search";
import { randomUUID } from "crypto";

const router = Router();

// Allowed deal types. "رهن" (mortgage/pledge) added alongside sale/rent/sold.
export const DEAL_TYPES = ["للبيع", "للايجار", "مباع", "رهن"];

const favCountSql = sql<number>`(
  select cast(count(*) as int) from ${favoritesTable}
  where ${favoritesTable.listingId} = ${listingsTable.id}
)`;

// Price benchmarks so users can judge whether a listing is above/below market.
// Scopes by category, city, area (neighborhood) and type when provided. The
// key metric for real estate is price-per-m² within the same area, which is a
// far fairer comparison than total price across differently-sized properties.
// Falls back to a broader scope (city, then category) when the narrow area
// scope has too few data points to be meaningful.
router.get("/market/stats", async (req, res) => {
  const { city, category, area, type } = req.query as Record<string, string>;

  const MIN_SAMPLE = 3;
  async function statsFor(conds: SQL[]) {
    const [row] = await db
      .select({
        avgPrice: sql<number>`cast(coalesce(avg(${listingsTable.price}), 0) as double precision)`,
        minPrice: sql<number>`cast(coalesce(min(${listingsTable.price}), 0) as double precision)`,
        maxPrice: sql<number>`cast(coalesce(max(${listingsTable.price}), 0) as double precision)`,
        count: sql<number>`cast(count(*) as int)`,
        avgPricePerM2: sql<number>`cast(coalesce(avg(case when ${listingsTable.size} > 0 then ${listingsTable.price} / ${listingsTable.size} end), 0) as double precision)`,
        minPricePerM2: sql<number>`cast(coalesce(min(case when ${listingsTable.size} > 0 then ${listingsTable.price} / ${listingsTable.size} end), 0) as double precision)`,
        maxPricePerM2: sql<number>`cast(coalesce(max(case when ${listingsTable.size} > 0 then ${listingsTable.price} / ${listingsTable.size} end), 0) as double precision)`,
        sampleWithSize: sql<number>`cast(count(*) filter (where ${listingsTable.size} > 0) as int)`,
      })
      .from(listingsTable)
      .where(and(...conds));
    return row;
  }

  const base = [eq(listingsTable.status, "active")];
  if (category) base.push(eq(listingsTable.category, category));

  // Narrowest scope first (city + area + type), widening on insufficient data.
  const scopes: { level: string; conds: SQL[] }[] = [];
  if (city && area) {
    const c = [...base, eq(listingsTable.city, city), eq(listingsTable.area, area)];
    if (type) c.push(eq(listingsTable.type, type));
    scopes.push({ level: "area", conds: c });
  }
  if (city) {
    const c = [...base, eq(listingsTable.city, city)];
    if (type) c.push(eq(listingsTable.type, type));
    scopes.push({ level: "city", conds: c });
  }
  scopes.push({ level: "category", conds: base });

  let chosen = await statsFor(scopes[0]!.conds);
  let scope = scopes[0]!.level;
  for (let i = 1; i < scopes.length && chosen.count < MIN_SAMPLE; i++) {
    chosen = await statsFor(scopes[i]!.conds);
    scope = scopes[i]!.level;
  }

  res.json({ ...chosen, scope, area: scope === "area" ? area : null, city: scope === "category" ? null : city });
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
    q, city, area, category, type, minPrice, maxPrice,
    minSize, maxSize, ownershipType, dealType,
    minBedrooms, minBathrooms, minBuildYear, maxBuildYear,
    minCarYear, maxCarYear, maxMileage,
    lat, lng, radius,
    userId, officeId, limit = "12", page = "1", status,
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

  // Full-text-ish search across both the title AND the description so results
  // are found by content, not just the headline.
  if (q) {
    conditions.push(
      or(ilike(listingsTable.title, `%${q}%`), ilike(listingsTable.description, `%${q}%`))!,
    );
  }
  if (city) conditions.push(eq(listingsTable.city, city));
  if (area) conditions.push(ilike(listingsTable.area, `%${area}%`));
  if (officeId) conditions.push(eq(listingsTable.officeId, officeId));
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
        area: listingsTable.area,
        size: listingsTable.size,
        bedrooms: listingsTable.bedrooms,
        bathrooms: listingsTable.bathrooms,
        carYear: listingsTable.carYear,
        mileage: listingsTable.mileage,
        latitude: listingsTable.latitude,
        longitude: listingsTable.longitude,
        ownershipType: listingsTable.ownershipType,
        dealType: listingsTable.dealType,
        monthlyRent: listingsTable.monthlyRent,
        pinned: listingsTable.pinned,
        verified: listingsTable.verified,
        featured: listingsTable.featured,
        video: listingsTable.video,
        images: listingsTable.images,
        views: listingsTable.views,
        status: listingsTable.status,
        createdAt: listingsTable.createdAt,
        bumpedAt: listingsTable.bumpedAt,
        officeId: listingsTable.officeId,
        officeName: officesTable.name,
        publisherRole: usersTable.role,
        favoritesCount: userId ? favCountSql : sql<number>`0`,
        distanceKm: distanceExpr ? distanceExpr : sql<number | null>`null`,
        user: {
          id: usersTable.id,
          name: usersTable.name,
        },
      })
      .from(listingsTable)
      .leftJoin(usersTable, eq(listingsTable.userId, usersTable.id))
      .leftJoin(officesTable, eq(listingsTable.officeId, officesTable.id))
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
      monthlyRent: listingsTable.monthlyRent,
      pinned: listingsTable.pinned,
      verified: listingsTable.verified,
      featured: listingsTable.featured,
      video: listingsTable.video,
      images: listingsTable.images,
      views: listingsTable.views,
      status: listingsTable.status,
      createdAt: listingsTable.createdAt,
      favoritesCount: favCountSql,
      officeId: listingsTable.officeId,
      officeName: officesTable.name,
      publisherRole: usersTable.role,
      user: {
        id: usersTable.id,
        name: usersTable.name,
      },
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.userId, usersTable.id))
    .leftJoin(officesTable, eq(listingsTable.officeId, officesTable.id))
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
  if (typeof body.dealType === "string" && DEAL_TYPES.includes(body.dealType)) updates.dealType = body.dealType;
  // الإيجار الشهري (لعروض الرهن). يُمسح تلقائياً إذا لم يعد نوع العرض "رهن".
  const effectiveDealType = typeof updates.dealType === "string" ? updates.dealType : listing.dealType;
  if ("monthlyRent" in body || (typeof updates.dealType === "string" && updates.dealType !== "رهن")) {
    updates.monthlyRent =
      effectiveDealType === "رهن" && body.monthlyRent != null && body.monthlyRent !== "" && !Number.isNaN(parseFloat(String(body.monthlyRent)))
        ? parseFloat(String(body.monthlyRent))
        : null;
  }
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
    // Attribute (or clear) a listing to a certified office for the source label.
    if ("officeId" in body) {
      const oid = typeof body.officeId === "string" ? body.officeId.trim() : "";
      if (!oid) {
        updates.officeId = null;
      } else {
        const [office] = await db.select({ id: officesTable.id }).from(officesTable).where(eq(officesTable.id, oid)).limit(1);
        updates.officeId = office ? oid : null;
      }
    }
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
    bedrooms, bathrooms, buildYear, carYear, mileage, officeId, monthlyRent,
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
  const cleanDealType = DEAL_TYPES.includes(dealType) ? dealType : "للبيع";
  // الإيجار الشهري يُحفظ فقط لعروض الرهن (price = سعر الرهن).
  const monthlyRentNum =
    cleanDealType === "رهن" && monthlyRent != null && monthlyRent !== "" && Number.isFinite(parseFloat(String(monthlyRent)))
      ? parseFloat(String(monthlyRent))
      : null;
  // Only an admin may attribute a listing to a certified office at creation.
  let cleanOfficeId: string | null = null;
  if (req.user!.role === "admin" && typeof officeId === "string" && officeId.trim()) {
    const [office] = await db.select({ id: officesTable.id }).from(officesTable).where(eq(officesTable.id, officeId.trim())).limit(1);
    cleanOfficeId = office ? officeId.trim() : null;
  }
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
    monthlyRent: monthlyRentNum,
    officeId: cleanOfficeId,
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
DALAL_FIX2_EOF_9f3a

apply_file api-server/src/routes/network-properties.ts <<'DALAL_FIX2_EOF_9f3a'
import { Router } from "express";
import { eq, and, ne, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  networkPropertiesTable,
  mediationRequestsTable,
  referralsTable,
  officesTable,
  listingsTable,
  usersTable,
  chatsTable,
  messagesTable,
} from "@workspace/db";
import { authMiddleware, requireRole } from "../lib/auth";
import { notifyNetwork, getAdminUserId, createNotification } from "../lib/dalal";

// يفتح (أو يعيد استخدام) محادثة عامة بين المكتب وشبكة دلال العراق (الأدمن)،
// ويُرسل فيها بيانات المنشور مع رقم البائع الخاص — لا يُعرض هذا الرقم للعامة.
async function sendSellerPhoneToDalal(opts: {
  officeId: string;
  officeName: string;
  sellerPhone: string;
  summary: string;
}): Promise<void> {
  const adminId = await getAdminUserId();
  if (!adminId || adminId === opts.officeId) return;
  const [existing] = await db
    .select({ id: chatsTable.id })
    .from(chatsTable)
    .where(and(isNull(chatsTable.listingId), eq(chatsTable.senderId, opts.officeId), eq(chatsTable.receiverId, adminId)))
    .limit(1);
  let chatId = existing?.id;
  if (!chatId) {
    chatId = randomUUID();
    await db.insert(chatsTable).values({ id: chatId, listingId: null, senderId: opts.officeId, receiverId: adminId });
  }
  await db.insert(messagesTable).values({
    id: randomUUID(),
    chatId,
    userId: opts.officeId,
    text: `عرض جديد من مكتب ${opts.officeName}:\n${opts.summary}\nرقم البائع (خاص — لا يُنشر للعامة): ${opts.sellerPhone}`,
  });
  await createNotification({
    userId: adminId,
    type: "network_property",
    title: `عرض جديد من المكتب ${opts.officeName}`,
    body: opts.summary,
    link: `/chat?id=${chatId}`,
  });
}

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

// خانة البحث للشبكة: تعرض كل العروض للمكاتب — عقارات الشبكة (من الشبكة ومن
// المكاتب الأخرى) بالإضافة إلى إعلانات الأفراد العامة (من الناس أنفسهم ومن
// المكاتب). كل عنصر يحمل حقل source للتمييز بين المصدرين في الواجهة.
router.get("/", authMiddleware, requireRole("office"), async (req, res) => {
  const { city, type } = req.query as Record<string, string>;

  // 1) عقارات شبكة المكاتب — تُعرض جميعها عدا المباعة (بما فيها قيد التدقيق).
  const npConditions = [ne(networkPropertiesTable.status, "sold")];
  if (city) npConditions.push(eq(networkPropertiesTable.city, city));
  if (type) npConditions.push(eq(networkPropertiesTable.type, type));
  const networkRows = await db
    .select({ property: networkPropertiesTable, office: officeSelect() })
    .from(networkPropertiesTable)
    .leftJoin(officesTable, eq(networkPropertiesTable.officeId, officesTable.id))
    .where(and(...npConditions))
    .orderBy(sql`${networkPropertiesTable.createdAt} DESC`)
    .limit(200);

  // 2) إعلانات الأفراد العامة (عقارات نشطة) — من الناس أنفسهم ومن المكاتب.
  const listingConditions = [
    eq(listingsTable.status, "active"),
    eq(listingsTable.category, "عقارات"),
  ];
  if (city) listingConditions.push(eq(listingsTable.city, city));
  if (type) listingConditions.push(eq(listingsTable.type, type));
  const listingRows = await db
    .select({ listing: listingsTable, office: officeSelect(), ownerName: usersTable.name })
    .from(listingsTable)
    .leftJoin(officesTable, eq(listingsTable.officeId, officesTable.id))
    .leftJoin(usersTable, eq(listingsTable.userId, usersTable.id))
    .where(and(...listingConditions))
    .orderBy(sql`${listingsTable.createdAt} DESC`)
    .limit(200);

  type UnifiedProperty = {
    id: string;
    source: "network" | "listing";
    officeId: string | null;
    type: string;
    city: string;
    area: string | null;
    price: number;
    size: number | null;
    rooms: number | null;
    images: string[];
    status: string;
    title: string | null;
    ownerName: string | null;
    officeName: string | null;
    createdAt: Date;
  };

  const networkProps: { property: UnifiedProperty; office: typeof networkRows[number]["office"] }[] =
    networkRows.map((r) => ({
      property: {
        id: r.property.id,
        source: "network",
        officeId: r.property.officeId,
        type: r.property.type,
        city: r.property.city,
        area: r.property.area,
        price: r.property.price,
        size: r.property.size,
        rooms: r.property.rooms,
        images: r.property.images,
        status: r.property.status,
        title: null,
        ownerName: r.office?.name ?? null,
        officeName: r.office?.name ?? null,
        createdAt: r.property.createdAt,
      },
      office: r.office,
    }));

  const listingProps: { property: UnifiedProperty; office: typeof listingRows[number]["office"] }[] =
    listingRows.map((r) => ({
      property: {
        id: r.listing.id,
        source: "listing",
        officeId: r.listing.officeId,
        type: r.listing.type,
        city: r.listing.city,
        area: r.listing.area,
        price: r.listing.price,
        size: r.listing.size,
        rooms: r.listing.bedrooms,
        images: r.listing.images,
        status: r.listing.status,
        title: r.listing.title,
        ownerName: r.office?.name ?? r.ownerName ?? null,
        officeName: r.office?.name ?? null,
        createdAt: r.listing.createdAt,
      },
      office: r.office,
    }));

  const properties = [...networkProps, ...listingProps].sort(
    (a, b) => new Date(b.property.createdAt).getTime() - new Date(a.property.createdAt).getTime(),
  );
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
  // رقم البائع خاص بالشبكة والمكتب المالك فقط — لا يُعاد لبقية المكاتب.
  const isOwner = row.property.officeId === req.user!.userId;
  const { sellerPhone: _sellerPhone, ...propertySafe } = row.property;
  res.json({ ...row, property: isOwner ? row.property : propertySafe });
});

router.post("/", authMiddleware, requireRole("office"), async (req, res) => {
  const { type, city, area, price, size, rooms, description, images, video, sellerPhone } = req.body as Record<string, unknown>;
  if (!type || !PROPERTY_TYPES.includes(String(type))) {
    res.status(400).json({ error: "نوع العقار غير صالح" });
    return;
  }
  if (!city || !price || !Number.isFinite(parseFloat(String(price)))) {
    res.status(400).json({ error: "المحافظة والسعر مطلوبان" });
    return;
  }
  const cleanSellerPhone = typeof sellerPhone === "string" ? sellerPhone.trim() : "";
  if (!cleanSellerPhone) {
    res.status(400).json({ error: "رقم البائع مطلوب" });
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
      sellerPhone: cleanSellerPhone.slice(0, 40),
      description: typeof description === "string" ? description.trim().slice(0, 2000) || null : null,
      images: Array.isArray(images) ? images.slice(0, 15).map(String) : [],
      video: typeof video === "string" ? video.trim() || null : null,
      status: "pending_audit",
    })
    .returning();

  // رقم البائع لا يُنشر للعامة؛ يُرسل لشبكة دلال العراق في محادثة خاصة مع المنشور.
  try {
    const summary = `${property!.type} في ${property!.city}${property!.area ? " - " + property!.area : ""} بسعر ${property!.price}`;
    await sendSellerPhoneToDalal({
      officeId: req.user!.userId,
      officeName: req.user!.name || "مكتب",
      sellerPhone: cleanSellerPhone,
      summary,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to send seller phone to Dalal");
  }

  // لا يُعاد رقم البائع في استجابة الإنشاء العامة.
  const { sellerPhone: _sellerPhone, ...safe } = property!;
  res.status(201).json(safe);
});

router.patch("/:id", authMiddleware, requireRole("office"), async (req, res) => {
  const id = req.params.id as string;
  const [existing] = await db.select().from(networkPropertiesTable).where(eq(networkPropertiesTable.id, id)).limit(1);
  if (!existing || existing.officeId !== req.user!.userId) {
    res.status(404).json({ error: "العقار غير موجود" });
    return;
  }
  const { type, city, area, price, size, rooms, description, images, video, status, sellerPhone } = req.body as Record<string, unknown>;
  const updates: Partial<typeof networkPropertiesTable.$inferInsert> = { updatedAt: sql`now()` as unknown as Date };
  if (typeof type === "string" && PROPERTY_TYPES.includes(type)) updates.type = type;
  if (typeof city === "string") updates.city = city;
  if (typeof area === "string") updates.area = area.trim() || null;
  if (typeof sellerPhone === "string" && sellerPhone.trim()) updates.sellerPhone = sellerPhone.trim().slice(0, 40);
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

router.patch("/referrals/:id", authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body as { status?: string };
  const [referral] = await db.select().from(referralsTable).where(eq(referralsTable.id, id)).limit(1);
  // يصنّف الإحالة صاحبُها (المكتب) أو الإدارة (لإحالات الباركود المملوكة لدلال العراق).
  const canClassify = !!referral && (referral.ownerOfficeId === req.user!.userId || req.user!.role === "admin");
  if (!canClassify) {
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
DALAL_FIX2_EOF_9f3a

apply_file dalal-app/src/components/listing-card.tsx <<'DALAL_FIX2_EOF_9f3a'
import { Link } from "wouter";
import { MapPin, Eye, Clock, Pin, Ruler, GitCompareArrows, BedDouble, Bath, Gauge, BadgeCheck, Star, Building2, ShieldCheck } from "lucide-react";
import {
  formatPrice,
  timeAgo,
  formatSize,
  dealTypeStyle,
  isNewListing,
  formatMileage,
  isInCompare,
  toggleCompare,
  listingSource,
  listingPath,
  cn,
} from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { MediaCarousel } from "@/components/media-carousel";
import { FavoriteButton } from "@/components/favorite-button";
import { useEffect, useState } from "react";

export interface ListingItem {
  id: string;
  title: string;
  price: number;
  previousPrice?: number | null;
  category: string;
  type: string;
  city: string;
  size?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  carYear?: number | null;
  mileage?: number | null;
  ownershipType?: string | null;
  dealType?: string | null;
  monthlyRent?: number | null;
  status?: string | null;
  pinned?: boolean;
  verified?: boolean;
  featured?: boolean;
  video?: string | null;
  images: string[];
  views: number;
  createdAt: string;
  bumpedAt?: string | null;
  officeId?: string | null;
  officeName?: string | null;
  user?: { name: string };
}

function CompareToggle({ id }: { id: string }) {
  const [active, setActive] = useState(isInCompare(id));
  useEffect(() => {
    const sync = () => setActive(isInCompare(id));
    window.addEventListener("compare-change", sync);
    return () => window.removeEventListener("compare-change", sync);
  }, [id]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = toggleCompare(id);
        if (r.full) {
          alert("يمكن مقارنة 4 إعلانات كحد أقصى");
          return;
        }
        setActive(r.inCompare);
      }}
      aria-label="إضافة للمقارنة"
      className={cn(
        "flex items-center justify-center rounded-full backdrop-blur shadow-sm hover:scale-110 transition p-2",
        active ? "bg-orange-500" : "bg-white/90 dark:bg-gray-900/90",
      )}
    >
      <GitCompareArrows
        className={cn("w-4 h-4", active ? "text-white" : "text-gray-500 dark:text-gray-300")}
      />
    </button>
  );
}

export function ListingCard({ listing }: { listing: ListingItem }) {
  const t = useT();
  const sold = listing.status === "sold";
  const reduced =
    listing.previousPrice != null && listing.previousPrice > listing.price;

  return (
    <div className="block bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-800 hover:border-orange-100 dark:hover:border-orange-900">
      <div className="relative">
        <MediaCarousel
          images={listing.images}
          video={listing.video}
          category={listing.category}
          linkHref={listingPath(listing.id, listing.title)}
          heightClass="h-40"
        />
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end z-10 pointer-events-none">
          <span className={`text-xs font-bold px-2 py-1 rounded-full shadow-sm ${dealTypeStyle(listing.dealType)}`}>
            {listing.dealType || "للبيع"}
          </span>
          {listing.verified && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-sky-500 text-white flex items-center gap-1">
              <BadgeCheck className="w-3 h-3 fill-white text-sky-500" />
              {t("detail.verified")}
            </span>
          )}
          {listing.featured && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-amber-500 text-white flex items-center gap-1">
              <Star className="w-3 h-3 fill-white" />
              {t("detail.featured")}
            </span>
          )}
          {listing.pinned && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-orange-500 text-white flex items-center gap-1">
              <Pin className="w-3 h-3 fill-white" />
              {t("home.featured")}
            </span>
          )}
          {isNewListing(listing.createdAt) && !sold && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-emerald-500 text-white">
              {t("common.new")}
            </span>
          )}
          {reduced && !sold && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-red-500 text-white">
              {t("priceHistory.dropped")}
            </span>
          )}
        </div>

        <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
          <FavoriteButton listingId={listing.id} size="sm" />
          <CompareToggle id={listing.id} />
        </div>

        {sold && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center z-10 pointer-events-none">
            <span className="bg-gray-900 text-white text-sm font-bold px-4 py-1.5 rounded-full -rotate-6">
              تم البيع
            </span>
          </div>
        )}
      </div>

      <Link href={listingPath(listing.id, listing.title)} className="block p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
            listing.category === "عقارات"
              ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
              : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
          }`}>
            {listing.type}
          </span>
        </div>
        <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm line-clamp-2 mb-2 text-right leading-snug">{listing.title}</h3>
        {(() => {
          const src = listingSource(listing);
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full mb-2",
                src.kind === "office"
                  ? "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                  : "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
              )}
            >
              {src.kind === "office" ? <Building2 className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
              <span className="line-clamp-1">{src.label}</span>
            </span>
          );
        })()}
        <div className="text-right">
          <p className="text-orange-500 font-bold text-base">{formatPrice(listing.price)}</p>
          {listing.dealType === "رهن" && listing.monthlyRent != null && (
            <p className="text-xs text-gray-500 dark:text-gray-400">إيجار شهري: {formatPrice(listing.monthlyRent)}</p>
          )}
          {reduced && (
            <p className="text-xs text-gray-400 line-through">{formatPrice(listing.previousPrice!)}</p>
          )}
        </div>

        {(listing.bedrooms != null || listing.bathrooms != null || listing.carYear != null || listing.mileage != null) && (
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            {listing.bedrooms != null && (
              <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" />{listing.bedrooms}</span>
            )}
            {listing.bathrooms != null && (
              <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{listing.bathrooms}</span>
            )}
            {listing.carYear != null && <span>{listing.carYear}</span>}
            {listing.mileage != null && (
              <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{formatMileage(listing.mileage)}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
          <div className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            <span>{listing.views}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span>{listing.city}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1 text-xs text-gray-400 dark:text-gray-500">
          {listing.size ? (
            <div className="flex items-center gap-1">
              <Ruler className="w-3 h-3" />
              <span>{formatSize(listing.size)}</span>
            </div>
          ) : <span />}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{timeAgo(listing.createdAt)}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}
DALAL_FIX2_EOF_9f3a

apply_file dalal-app/src/components/location-picker.tsx <<'DALAL_FIX2_EOF_9f3a'
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, LocateFixed, Loader2, MapPin, X, Check } from "lucide-react";
import { getCurrentLocation, formatCoords, type Coords } from "@/lib/utils";

const IRAQ_CENTER: [number, number] = [33.3152, 44.3661];

const pinIcon = L.divIcon({
  className: "dalal-pin",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 24 24" fill="#f97316" stroke="#ffffff" stroke-width="1.5" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#ffffff" stroke="none"/></svg>`,
  iconSize: [34, 42],
  iconAnchor: [17, 42],
});

interface Props {
  value: Coords | null;
  onChange: (c: Coords | null) => void;
}

export function LocationPicker({ value, onChange }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  // Coordinates are STAGED here first; they are only shared with the parent form
  // when the user presses "موافق" (confirm). This prevents the picker from
  // resetting the surrounding flow and makes selection explicit.
  const [pending, setPending] = useState<Coords | null>(value);
  const [latInput, setLatInput] = useState(value ? String(value.lat) : "");
  const [lngInput, setLngInput] = useState(value ? String(value.lng) : "");

  const confirmed = value != null;
  const dirty =
    pending != null &&
    (!value || Math.abs(value.lat - pending.lat) > 1e-9 || Math.abs(value.lng - pending.lng) > 1e-9);

  function stage(lat: number, lng: number, fly = true) {
    setPending({ lat, lng });
    setLatInput(String(lat));
    setLngInput(String(lng));
    setError("");
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const m = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        setPending({ lat: p.lat, lng: p.lng });
        setLatInput(String(p.lat));
        setLngInput(String(p.lng));
      });
      markerRef.current = m;
    }
    if (fly) map.flyTo([lat, lng], Math.max(map.getZoom(), 16));
  }

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const hasValue = value != null;
    const start: [number, number] = hasValue ? [value!.lat, value!.lng] : IRAQ_CENTER;
    const map = L.map(mapEl.current, { attributionControl: true }).setView(start, hasValue ? 16 : 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      stage(e.latlng.lat, e.latlng.lng, false);
    });
    mapRef.current = map;
    if (hasValue) {
      const m = L.marker(start, { icon: pinIcon, draggable: true }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        setPending({ lat: p.lat, lng: p.lng });
        setLatInput(String(p.lat));
        setLngInput(String(p.lng));
      });
      markerRef.current = m;
    }
    setTimeout(() => map.invalidateSize(), 120);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value == null && markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
      setPending(null);
      setLatInput("");
      setLngInput("");
    }
  }, [value]);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError("");
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
        `&accept-language=ar&countrycodes=iq&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        setError(res.status === 429 ? "كثرة الطلبات، انتظر قليلاً ثم حاول" : "تعذر البحث، حاول مجدداً");
        return;
      }
      const data: Array<{ lat: string; lon: string }> = await res.json();
      if (!data.length) {
        setError("لم يتم العثور على المكان، جرّب اسماً أوضح");
        return;
      }
      stage(parseFloat(data[0]!.lat), parseFloat(data[0]!.lon));
    } catch {
      setError("تعذر البحث، حاول مجدداً");
    } finally {
      setSearching(false);
    }
  }

  async function useMyLocation() {
    setLocating(true);
    setError("");
    try {
      const c = await getCurrentLocation();
      stage(c.lat, c.lng);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديد الموقع");
    } finally {
      setLocating(false);
    }
  }

  function applyManualCoords() {
    const lat = parseFloat(latInput.replace(/[^\d.\-]/g, ""));
    const lng = parseFloat(lngInput.replace(/[^\d.\-]/g, ""));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError("إحداثيات غير صالحة (خط العرض -90..90، خط الطول -180..180)");
      return;
    }
    stage(lat, lng);
  }

  function confirmLocation() {
    if (!pending) return;
    onChange({ lat: pending.lat, lng: pending.lng });
    setError("");
  }

  function onKeyDownNoSubmit(e: React.KeyboardEvent, fn: () => void) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      fn();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => onKeyDownNoSubmit(e, runSearch)}
            placeholder="ابحث عن نقطة دالة (مثال: جامع، ساحة، مول)"
            className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searching}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-500 disabled:opacity-50"
            title="بحث"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="flex items-center gap-1.5 px-3 rounded-xl border-2 border-orange-300 bg-orange-50 text-orange-600 text-sm font-medium hover:bg-orange-100 transition disabled:opacity-60 whitespace-nowrap"
          title="موقعي الحالي"
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
        </button>
      </div>

      {/* Manual coordinate entry with an explicit confirm — no page reset. */}
      <div className="flex flex-wrap gap-2">
        <input
          value={latInput}
          onChange={(e) => setLatInput(e.target.value)}
          onKeyDown={(e) => onKeyDownNoSubmit(e, applyManualCoords)}
          inputMode="decimal"
          placeholder="خط العرض (lat)"
          dir="ltr"
          className="flex-1 min-w-0 basis-[40%] border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <input
          value={lngInput}
          onChange={(e) => setLngInput(e.target.value)}
          onKeyDown={(e) => onKeyDownNoSubmit(e, applyManualCoords)}
          inputMode="decimal"
          placeholder="خط الطول (lng)"
          dir="ltr"
          className="flex-1 min-w-0 basis-[40%] border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <button
          type="button"
          onClick={applyManualCoords}
          className="w-full sm:w-auto px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition whitespace-nowrap"
        >
          وضع الدبوس
        </button>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <div
        ref={mapEl}
        className="w-full h-60 rounded-xl overflow-hidden border border-gray-200 z-0"
        style={{ direction: "ltr" }}
      />

      <p className="text-gray-400 text-xs">انقر على الخريطة أو اسحب الدبوس أو أدخل الإحداثيات، ثم اضغط «موافق» لتثبيت الموقع</p>

      {pending && (
        <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          <p className="flex items-center gap-1.5 text-emerald-700 text-xs font-medium" dir="ltr">
            <MapPin className="w-3.5 h-3.5" /> {formatCoords(pending.lat, pending.lng)}
            {confirmed && !dirty && <Check className="w-3.5 h-3.5" />}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirmLocation}
              disabled={confirmed && !dirty}
              className="flex items-center gap-1 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-emerald-600 transition disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" /> {confirmed && !dirty ? "تم التثبيت" : "موافق"}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-emerald-500 hover:text-red-500 transition"
              title="إزالة الموقع"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
DALAL_FIX2_EOF_9f3a

apply_file dalal-app/src/pages/add-listing.tsx <<'DALAL_FIX2_EOF_9f3a'
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Building2, Car, X, Upload, MapPin, Phone, Handshake, Loader2, ImagePlus, Video as VideoIcon, Film } from "lucide-react";
import { CITIES, REAL_ESTATE_TYPES, CAR_BRANDS, SIZE_OPTIONS, OWNERSHIP_TYPES, BEDROOM_OPTIONS, BATHROOM_OPTIONS, CAR_YEARS, formatPrice, fileToCompressedDataUrl } from "@/lib/utils";
import { api, getUser, uploadFile, mediaUrl } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { LocationPicker } from "@/components/location-picker";

// Deal types offered when publishing. "مباع" is a status set later by admin.
const LISTING_DEAL_TYPES = ["للبيع", "للايجار", "رهن"];

interface MarketStats {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  count: number;
  avgPricePerM2: number;
  minPricePerM2?: number;
  maxPricePerM2?: number;
  sampleWithSize?: number;
  scope?: string;
  area?: string | null;
}

interface Office {
  id: string;
  name: string;
  city: string;
  area: string | null;
  phone: string;
  address: string | null;
}

export default function AddListingPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [size, setSize] = useState("");
  const [ownershipType, setOwnershipType] = useState("");
  const [dealType, setDealType] = useState("للبيع");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [buildYear, setBuildYear] = useState("");
  const [carYear, setCarYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [video, setVideo] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [offices, setOffices] = useState<Office[]>([]);
  const [officesLoading, setOfficesLoading] = useState(false);
  const [market, setMarket] = useState<MarketStats | null>(null);
  const [areaOptions, setAreaOptions] = useState<string[]>([]);

  const t = useT();
  const types = category === "عقارات" ? REAL_ESTATE_TYPES : CAR_BRANDS;

  const inputCls = "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500";
  const selectCls = "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100";
  const labelCls = "block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5";

  useEffect(() => {
    if (!category) { setMarket(null); return; }
    const p = new URLSearchParams({ category });
    if (city) p.set("city", city);
    if (area) p.set("area", area);
    if (type) p.set("type", type);
    api.get<MarketStats>(`/listings/market/stats?${p.toString()}`)
      .then((d) => setMarket(d.count > 0 ? d : null))
      .catch(() => setMarket(null));
  }, [category, city, area, type]);

  // Load the area classifications for the selected governorate (feature 3).
  useEffect(() => {
    if (!city) { setAreaOptions([]); return; }
    api.get<{ areas: { name: string }[] }>(`/areas?city=${encodeURIComponent(city)}`)
      .then((d) => setAreaOptions(d.areas.map((a) => a.name)))
      .catch(() => setAreaOptions([]));
  }, [city]);

  useEffect(() => {
    if (!city) { setOffices([]); return; }
    setOfficesLoading(true);
    api.get<{ offices: Office[] }>(`/offices?city=${encodeURIComponent(city)}`)
      .then((d) => setOffices(d.offices))
      .catch(() => setOffices([]))
      .finally(() => setOfficesLoading(false));
  }, [city]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError("");
    setUploading(true);
    try {
      const remaining = 6 - images.length;
      const toProcess = files.slice(0, remaining);
      const processed = await Promise.all(toProcess.map((f) => fileToCompressedDataUrl(f)));
      setImages((prev) => [...prev, ...processed]);
    } catch {
      setError("تعذر تحميل بعض الصور");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removeImage(i: number) {
    setImages((prev) => prev.filter((_, j) => j !== i));
  }

  async function handleVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("الرجاء اختيار ملف فيديو"); return; }
    if (file.size > 80 * 1024 * 1024) { setError("حجم الفيديو يجب أن يكون أقل من 80 ميغابايت"); return; }
    setError("");
    setVideoUploading(true);
    try {
      const path = await uploadFile(file);
      setVideo(path);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "تعذر رفع الفيديو");
    } finally {
      setVideoUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!getUser()) { navigate("/login"); return; }
    setError(""); setLoading(true);
    try {
      const listing = await api.post<{ id: string }>("/listings", {
        title, description,
        price: parseFloat(price),
        category, type, city,
        area: area || null,
        size: category === "عقارات" && size ? parseFloat(size) : null,
        ownershipType: category === "عقارات" && ownershipType ? ownershipType : null,
        dealType,
        monthlyRent: dealType === "رهن" && monthlyRent ? parseFloat(monthlyRent) : null,
        bedrooms: category === "عقارات" && bedrooms ? parseInt(bedrooms) : null,
        bathrooms: category === "عقارات" && bathrooms ? parseInt(bathrooms) : null,
        buildYear: category === "عقارات" && buildYear ? parseInt(buildYear) : null,
        carYear: category === "سيارات" && carYear ? parseInt(carYear) : null,
        mileage: category === "سيارات" && mileage ? parseInt(mileage) : null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        images,
        video,
      });
      navigate(`/listings/${listing.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">إضافة إعلان جديد</h1>
      <p className="text-gray-400 text-sm mb-5">انشر إعلانك مجاناً وصل لآلاف المشترين</p>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-7">
        {["الفئة", "التفاصيل", "الموقع والصور"].map((label, i) => {
          const s = i + 1;
          return (
            <div key={label} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${s <= step ? "bg-orange-500" : "bg-gray-200 dark:bg-gray-700"}`} />
              <p className={`text-[11px] mt-1.5 text-center font-medium ${s <= step ? "text-orange-500" : "text-gray-400"}`}>{label}</p>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">{error}</div>
      )}

      {/* Step 1: Category */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-4">اختر نوع الإعلان</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { val: "عقارات", Icon: Building2, color: "blue", sub: "شقق، بيوت، أراضي" },
              { val: "سيارات", Icon: Car, color: "emerald", sub: "جديدة ومستعملة" },
            ].map(({ val, Icon, color, sub }) => (
              <button key={val}
                onClick={() => { setCategory(val); setType(""); setStep(2); }}
                className={`p-6 rounded-2xl border-2 text-center transition ${
                  category === val
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                    : "border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700 bg-white dark:bg-gray-900"
                }`}>
                <Icon className={`w-10 h-10 text-${color}-500 mx-auto mb-2`} />
                <p className="font-bold text-gray-800 dark:text-gray-100">{val}</p>
                <p className="text-gray-400 text-sm">{sub}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-2">تفاصيل {category === "عقارات" ? "العقار" : "السيارة"}</h2>

          <div>
            <label className={labelCls}>
              {category === "عقارات" ? "نوع العقار" : "ماركة السيارة"}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {types.map((tp) => (
                <button key={tp} onClick={() => setType(tp)}
                  className={`py-2 px-2 rounded-xl text-xs border-2 transition font-medium ${
                    type === tp
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-600"
                      : "border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700 text-gray-600 dark:text-gray-300"
                  }`}>
                  {tp}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("add.titleField")}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={category === "عقارات" ? "مثال: شقة 3 غرف في حي الجامعة" : "مثال: تويوتا كامري 2022 بحالة ممتازة"}
              className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>وصف تفصيلي</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="اذكر كل التفاصيل المهمة: المساحة، الحالة، المميزات..." rows={4}
              className={`${inputCls} resize-none`} />
          </div>

          <div>
            <label className={labelCls}>{dealType === "رهن" ? "مبلغ الرهن (دينار عراقي)" : "السعر (دينار عراقي)"}</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" placeholder="0" min="0"
              className={inputCls} />

            {market && (() => {
              // Per-m² valuation (feature 2): when the market sample has sizes and
              // the user entered an area, estimate a fair price for THIS property.
              const perM2 = market.avgPricePerM2 > 0 ? market.avgPricePerM2 : 0;
              const sizeNum = parseFloat(size);
              const estimate = perM2 > 0 && Number.isFinite(sizeNum) && sizeNum > 0 ? perM2 * sizeNum : 0;
              const scopeLabel =
                market.scope === "area" && market.area
                  ? `منطقة ${market.area}`
                  : market.scope === "city" && city
                    ? `محافظة ${city}`
                    : "السوق";
              const priceNum = parseFloat(price);
              // Compare against the size-based estimate when available, else the average.
              const baseline = estimate > 0 ? estimate : market.avgPrice;
              return (
                <div className="mt-2 rounded-xl border border-orange-100 dark:border-orange-900 bg-orange-50/60 dark:bg-orange-950/40 p-3">
                  <p className="text-xs font-bold text-orange-600 dark:text-orange-400 mb-1">
                    {t("add.valuationTitle")} <span className="font-normal text-gray-500">({scopeLabel})</span>
                  </p>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                    {t("add.valuationAvg")}: <span className="font-bold text-gray-800 dark:text-gray-200">{formatPrice(market.avgPrice)}</span>
                    {" · "}{t("add.valuationRange")}: {formatPrice(market.minPrice)} — {formatPrice(market.maxPrice)}
                  </p>
                  {perM2 > 0 && (
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed mt-0.5">
                      متوسط سعر المتر: <span className="font-bold text-gray-800 dark:text-gray-200">{formatPrice(Math.round(perM2))}</span> / م²
                    </p>
                  )}
                  {estimate > 0 && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed mt-0.5">
                      التقدير حسب مساحتك ({sizeNum} م²): <span className="font-bold">{formatPrice(Math.round(estimate))}</span>
                    </p>
                  )}
                  {price && priceNum > 0 && baseline > 0 && (
                    <p className="text-[11px] mt-1 font-medium">
                      {priceNum > baseline * 1.15 ? (
                        <span className="text-amber-600">{t("add.valuationHigh")}</span>
                      ) : priceNum < baseline * 0.85 ? (
                        <span className="text-emerald-600">{t("add.valuationLow")}</span>
                      ) : (
                        <span className="text-emerald-600">{t("add.valuationFair")}</span>
                      )}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {dealType === "رهن" && (
            <div>
              <label className={labelCls}>الإيجار الشهري (دينار عراقي)</label>
              <input value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} type="number" placeholder="0" min="0"
                className={inputCls} />
            </div>
          )}

          <div>
            <label className={labelCls}>نوع العرض</label>
            <div className="grid grid-cols-3 gap-2">
              {LISTING_DEAL_TYPES.map((d) => (
                <button key={d} type="button" onClick={() => setDealType(d)}
                  className={`py-2.5 rounded-xl text-sm border-2 transition font-medium ${
                    dealType === d
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-600"
                      : "border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700 text-gray-600 dark:text-gray-300"
                  }`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {category === "عقارات" && (
            <>
              <div>
                <label className={labelCls}>المساحة (م²) <span className="text-gray-400">({t("common.optional")})</span></label>
                <input
                  value={size}
                  onChange={(e) => setSize(e.target.value.replace(/[^\d.]/g, ""))}
                  type="text"
                  inputMode="decimal"
                  list="size-suggestions"
                  placeholder="اكتب المساحة، مثال: 187"
                  className={inputCls}
                />
                <datalist id="size-suggestions">
                  {SIZE_OPTIONS.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t("listings.bedrooms")}</label>
                  <select value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className={selectCls}>
                    <option value="">{t("common.optional")}</option>
                    {BEDROOM_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t("listings.bathrooms")}</label>
                  <select value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} className={selectCls}>
                    <option value="">{t("common.optional")}</option>
                    {BATHROOM_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>{t("detail.buildYear")} <span className="text-gray-400">({t("common.optional")})</span></label>
                <select value={buildYear} onChange={(e) => setBuildYear(e.target.value)} className={selectCls}>
                  <option value="">اختر السنة</option>
                  {CAR_YEARS.filter((y) => y <= new Date().getFullYear()).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>{t("detail.ownership")}</label>
                <div className="grid grid-cols-2 gap-2">
                  {OWNERSHIP_TYPES.map((o) => (
                    <button key={o} type="button" onClick={() => setOwnershipType(ownershipType === o ? "" : o)}
                      className={`py-2.5 rounded-xl text-sm border-2 transition font-medium ${
                        ownershipType === o
                          ? "border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-600"
                          : "border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700 text-gray-600 dark:text-gray-300"
                      }`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {category === "سيارات" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t("detail.carYear")}</label>
                <select value={carYear} onChange={(e) => setCarYear(e.target.value)} className={selectCls}>
                  <option value="">{t("common.optional")}</option>
                  {CAR_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>المسافة (كم)</label>
                <input value={mileage} onChange={(e) => setMileage(e.target.value)} type="number" min="0" placeholder="اختياري"
                  className={inputCls} />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep(1)}
              className="flex-1 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition text-gray-600 dark:text-gray-300">
              {t("common.previous")}
            </button>
            <button onClick={() => {
              if (!type || !title.trim() || !description.trim() || !price) {
                setError("يرجى تعبئة جميع الحقول"); return;
              }
              setError(""); setStep(3);
            }} className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition text-sm">
              {t("common.next")}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Location + Images */}
      {step === 3 && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200">الموقع والصور</h2>

          <div>
            <label className={labelCls}>{t("common.city")}</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} required className={selectCls}>
              <option value="">اختر المحافظة</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>المنطقة / الحي <span className="text-gray-400">({t("common.optional")})</span></label>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="اختر أو اكتب المنطقة، مثال: الغزالية"
              list="area-suggestions" className={inputCls} disabled={!city} />
            <datalist id="area-suggestions">
              {areaOptions.map((a) => <option key={a} value={a} />)}
            </datalist>
            {!city && <p className="text-gray-400 text-[11px] mt-1">اختر المحافظة أولاً لعرض المناطق</p>}
          </div>

          <div>
            <label className={labelCls}>
              الموقع على الخريطة <span className="text-gray-400">(اختياري — ابحث عن معلم أو اضغط على الخريطة)</span>
            </label>
            <LocationPicker value={coords} onChange={setCoords} />
          </div>

          {/* Nearest brokerage office notice */}
          {city && (
            <div className="rounded-2xl border border-orange-100 dark:border-orange-900 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/50 dark:to-amber-950/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Handshake className="w-5 h-5 text-orange-500" />
                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm">الدلال المعتمد لمنطقتك</h3>
              </div>
              {officesLoading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> جاري البحث عن أقرب مكتب...
                </div>
              ) : offices.length > 0 ? (
                <>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-orange-100 dark:border-orange-900 mb-3">
                    <p className="font-bold text-gray-800 dark:text-gray-100 text-sm mb-1">{offices[0].name}</p>
                    <p className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs mb-0.5">
                      <MapPin className="w-3.5 h-3.5 text-orange-400" />
                      {offices[0].city}{offices[0].area ? ` - ${offices[0].area}` : ""}
                      {offices[0].address ? ` · ${offices[0].address}` : ""}
                    </p>
                    <p className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs">
                      <Phone className="w-3.5 h-3.5 text-orange-400" />
                      {offices[0].phone}
                    </p>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed">
                    عند العثور على مشترٍ لإعلانك، تتم عملية المكاتبة وإتمام الصفقة بشكل آمن وموثوق
                    في هذا المكتب الأقرب إليك ضمن شبكة دلال العراق.
                  </p>
                </>
              ) : (
                <p className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed">
                  لا يوجد مكتب دلالية معتمد في <span className="font-bold">{city}</span> حالياً.
                  سيتواصل معك فريق شبكة دلال العراق لترتيب أقرب مكتب لإتمام الصفقة بأمان عند العثور على مشترٍ.
                </p>
              )}
            </div>
          )}

          {/* Image upload */}
          <div>
            <label className={labelCls}>
              صور الإعلان <span className="text-gray-400">(حتى 6 صور من جهازك)</span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 group">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImage(i)}
                    className="absolute top-1 left-1 bg-black/50 text-white rounded-full p-1 hover:bg-red-500 transition">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {images.length < 6 && (
                <label className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition ${
                  uploading
                    ? "border-orange-200 bg-orange-50 dark:bg-orange-950"
                    : "border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50/50 dark:hover:bg-orange-950/30 text-gray-400"
                }`}>
                  {uploading ? (
                    <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="w-6 h-6 mb-1" />
                      <span className="text-[11px] font-medium">أضف صورة</span>
                    </>
                  )}
                  <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={uploading} className="hidden" />
                </label>
              )}
            </div>

            {images.length === 0 && !uploading && (
              <p className="flex items-center gap-1.5 text-gray-400 text-xs mt-2">
                <Upload className="w-3.5 h-3.5" /> اختر صوراً واضحة لزيادة فرص البيع
              </p>
            )}
          </div>

          {/* Video upload */}
          <div>
            <label className={labelCls}>
              فيديو الإعلان <span className="text-gray-400">(اختياري — مقطع واحد حتى 80 ميغابايت)</span>
            </label>

            {video ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <video src={mediaUrl(video)} controls playsInline preload="metadata" className="w-full h-48 object-cover bg-black" />
                <button type="button" onClick={() => setVideo(null)}
                  className="absolute top-2 left-2 bg-black/55 text-white rounded-full p-1.5 hover:bg-red-500 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-7 cursor-pointer transition ${
                videoUploading
                  ? "border-orange-200 bg-orange-50 dark:bg-orange-950"
                  : "border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50/50 dark:hover:bg-orange-950/30 text-gray-400"
              }`}>
                {videoUploading ? (
                  <>
                    <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
                    <span className="text-xs font-medium text-orange-500">جاري رفع الفيديو...</span>
                  </>
                ) : (
                  <>
                    <Film className="w-7 h-7" />
                    <span className="text-xs font-medium">أضف فيديو للإعلان</span>
                  </>
                )}
                <input type="file" accept="video/*" onChange={handleVideo} disabled={videoUploading} className="hidden" />
              </label>
            )}
            <p className="flex items-center gap-1.5 text-gray-400 text-xs mt-2">
              <VideoIcon className="w-3.5 h-3.5" /> الفيديو يظهر أولاً في معرض الإعلان ويزيد ثقة المشتري
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep(2)}
              className="flex-1 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition text-gray-600 dark:text-gray-300">
              {t("common.previous")}
            </button>
            <button type="submit" disabled={loading || uploading || videoUploading || !city}
              className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm">
              {loading ? t("add.publishing") : t("add.publish")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
DALAL_FIX2_EOF_9f3a

apply_file dalal-app/src/pages/admin.tsx <<'DALAL_FIX2_EOF_9f3a'
import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Building2, Users, Eye, Trash2, CheckCircle, XCircle, Handshake, Plus, MapPin, Phone, Loader2, Pin, Flag, Scale, Wallet, KeyRound, Ban, PlayCircle, QrCode, X, Download, Map } from "lucide-react";
import { formatPrice, timeAgo, CITIES, DEAL_TYPES } from "@/lib/utils";
import { api, getUser } from "@/lib/api";
import { ListingItem } from "@/components/listing-card";
import { LocationPicker } from "@/components/location-picker";

const SPECIALIZATIONS = ["عقاري", "تجاري", "إرث وتوزيع تركات", "عام"];

interface Lawyer {
  id: string; name: string; phone: string; specialization: string; city: string; status: string; availability: string;
}
interface PayoutRequest {
  id: string; payeeType: string; payeeId: string; payeeName: string; amount: number; status: string; requestedAt: string;
}
interface NetworkOverview {
  officesCount: number; lawyersCount: number; pendingPayouts: number; pendingInspections: number;
}

interface AdminData {
  listings: (ListingItem & { status: string; user: { name: string; phone: string } })[];
  usersCount: number;
  listingsCount: number;
  totalViews: number;
}

interface Office {
  id: string;
  name: string;
  city: string;
  area: string | null;
  phone: string;
  address: string | null;
  description?: string | null;
  workingHours?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface Report {
  id: string;
  listingId: string;
  reason: string;
  note: string | null;
  status: string;
  createdAt: string;
  listingTitle: string | null;
  listingStatus: string | null;
  reporterName: string | null;
}

export default function AdminPage() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"listings" | "offices" | "lawyers" | "payouts" | "reports" | "areas">("listings");

  const [qr, setQr] = useState<{ officeName: string; url: string; qr: string } | null>(null);
  const [qrLoading, setQrLoading] = useState<string | null>(null);

  const [areas, setAreas] = useState<{ id: string; city: string; name: string }[]>([]);
  const [areaCity, setAreaCity] = useState(CITIES[0]);
  const [areaName, setAreaName] = useState("");
  const [areaSaving, setAreaSaving] = useState(false);
  const [areaError, setAreaError] = useState("");

  const [offices, setOffices] = useState<Office[]>([]);
  const [officeStatuses, setOfficeStatuses] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Report[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [form, setForm] = useState({ name: "", city: "", area: "", phone: "", address: "", description: "", workingHours: "" });
  const [saving, setSaving] = useState(false);
  const [officeError, setOfficeError] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [lawyerForm, setLawyerForm] = useState({ name: "", phone: "", email: "", specialization: SPECIALIZATIONS[0], city: CITIES[0] });
  const [lawyerSaving, setLawyerSaving] = useState(false);
  const [lawyerError, setLawyerError] = useState("");
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [newCredentials, setNewCredentials] = useState<{ id: string; password: string } | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "admin") { navigate("/"); return; }
    Promise.all([
      api.get<AdminData>("/admin/stats").then(setData),
      api.get<{ offices: Office[] }>("/offices").then((d) => setOffices(d.offices)),
      api.get<{ reports: Report[]; openCount: number }>("/reports").then((d) => { setReports(d.reports); setOpenCount(d.openCount); }),
      api.get<{ lawyers: Lawyer[] }>("/lawyers").then((d) => setLawyers(d.lawyers)).catch(() => {}),
      api.get<{ requests: PayoutRequest[] }>("/admin/payout-requests").then((d) => setPayouts(d.requests)).catch(() => {}),
      api.get<NetworkOverview>("/admin/network-overview").then(setOverview).catch(() => {}),
    ])
      .catch(() => navigate("/"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadAreas(city: string) {
    api.get<{ areas: { id: string; city: string; name: string }[] }>(`/areas?city=${encodeURIComponent(city)}`)
      .then((d) => setAreas(d.areas))
      .catch(() => setAreas([]));
  }

  useEffect(() => {
    if (tab === "areas") loadAreas(areaCity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, areaCity]);

  async function addArea(e: React.FormEvent) {
    e.preventDefault();
    if (!areaName.trim()) { setAreaError("اسم المنطقة مطلوب"); return; }
    setAreaError(""); setAreaSaving(true);
    try {
      const created = await api.post<{ id: string; city: string; name: string }>("/areas", { city: areaCity, name: areaName.trim() });
      setAreas((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "ar")));
      setAreaName("");
    } catch (err: unknown) {
      setAreaError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setAreaSaving(false);
    }
  }

  async function deleteArea(id: string) {
    if (!confirm("حذف هذه المنطقة؟")) return;
    await api.delete(`/areas/${id}`);
    setAreas((prev) => prev.filter((a) => a.id !== id));
  }

  async function showOfficeQr(id: string) {
    setQrLoading(id);
    try {
      const d = await api.get<{ officeName: string; url: string; qr: string }>(`/offices/${id}/qr`);
      setQr(d);
    } catch {
      /* ignore */
    } finally {
      setQrLoading(null);
    }
  }

  async function addLawyer(e: React.FormEvent) {
    e.preventDefault();
    if (!lawyerForm.name.trim() || !lawyerForm.phone.trim()) { setLawyerError("الاسم والهاتف مطلوبان"); return; }
    setLawyerError(""); setLawyerSaving(true);
    try {
      const lawyer = await api.post<Lawyer & { credentials: { id: string; password: string } }>("/lawyers", lawyerForm);
      setLawyers((prev) => [lawyer, ...prev]);
      setNewCredentials(lawyer.credentials);
      setLawyerForm({ name: "", phone: "", email: "", specialization: SPECIALIZATIONS[0], city: CITIES[0] });
    } catch (err: unknown) {
      setLawyerError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLawyerSaving(false);
    }
  }

  async function toggleLawyerStatus(id: string, status: string) {
    const next = status === "active" ? "suspended" : "active";
    const updated = await api.patch<Lawyer>(`/lawyers/${id}/status`, { status: next });
    setLawyers((prev) => prev.map((l) => (l.id === id ? { ...l, status: updated.status } : l)));
  }

  async function resetLawyerPassword(id: string) {
    if (!confirm("سيتم إنشاء كلمة مرور جديدة لهذا المحامي. تأكيد؟")) return;
    const d = await api.post<{ id: string; password: string }>(`/admin/lawyers/${id}/reset-password`, {});
    setNewCredentials(d);
  }

  async function deleteLawyer(id: string) {
    if (!confirm("حذف هذا المحامي؟")) return;
    await api.delete(`/lawyers/${id}`);
    setLawyers((prev) => prev.filter((l) => l.id !== id));
  }

  async function toggleOfficeStatus(id: string) {
    const current = officeStatuses[id] || "active";
    const next = current === "active" ? "suspended" : "active";
    await api.patch(`/offices/${id}/status`, { status: next });
    setOfficeStatuses((prev) => ({ ...prev, [id]: next }));
  }

  async function resetOfficePassword(id: string) {
    if (!confirm("سيتم إنشاء كلمة مرور جديدة لهذا المكتب. تأكيد؟")) return;
    const d = await api.post<{ id: string; password: string }>(`/admin/offices/${id}/reset-password`, {});
    setNewCredentials(d);
  }

  async function updatePayoutStatus(id: string, status: string) {
    if (status === "paid" && !confirm("سيتم تعليم كل مستحقات هذا الحساب المعلقة كمدفوعة. تأكيد؟")) return;
    const updated = await api.patch<PayoutRequest>(`/admin/payout-requests/${id}`, { status });
    setPayouts((prev) => prev.map((p) => (p.id === id ? { ...p, status: updated.status } : p)));
  }

  async function resolveReport(id: string) {
    await api.patch(`/reports/${id}`, { status: "resolved" });
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: "resolved" } : r)));
    setOpenCount((c) => Math.max(0, c - 1));
  }

  async function updateStatus(id: string, status: string) {
    await api.patch(`/admin/listings/${id}`, { status });
    setData((prev) => prev ? {
      ...prev,
      listings: prev.listings.map((l) => l.id === id ? { ...l, status } : l),
    } : null);
  }

  async function updateDealType(id: string, dealType: string) {
    await api.patch(`/admin/listings/${id}`, { dealType });
    setData((prev) => prev ? {
      ...prev,
      listings: prev.listings.map((l) => l.id === id ? { ...l, dealType } : l),
    } : null);
  }

  async function togglePin(id: string, pinned: boolean) {
    await api.patch(`/admin/listings/${id}`, { pinned });
    setData((prev) => prev ? {
      ...prev,
      listings: prev.listings.map((l) => l.id === id ? { ...l, pinned } : l),
    } : null);
  }

  async function deleteListing(id: string) {
    if (!confirm("حذف الإعلان؟")) return;
    await api.delete(`/listings/${id}`);
    setData((prev) => prev ? {
      ...prev,
      listings: prev.listings.filter((l) => l.id !== id),
      listingsCount: prev.listingsCount - 1,
    } : null);
  }

  async function addOffice(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.city || !form.phone.trim()) {
      setOfficeError("الاسم والمحافظة والهاتف مطلوبة"); return;
    }
    setOfficeError(""); setSaving(true);
    try {
      const office = await api.post<Office>("/offices", {
        ...form,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });
      setOffices((prev) => [office, ...prev]);
      setForm({ name: "", city: "", area: "", phone: "", address: "", description: "", workingHours: "" });
      setCoords(null);
    } catch (err: unknown) {
      setOfficeError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOffice(id: string) {
    if (!confirm("حذف المكتب الدلالية؟")) return;
    await api.delete(`/offices/${id}`);
    setOffices((prev) => prev.filter((o) => o.id !== id));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );
  if (!data) return null;

  const inputCls = "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500";
  const labelCls = "block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">لوحة الإدارة</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
        {[
          { icon: Building2, val: data.listingsCount, label: "الإعلانات", color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950" },
          { icon: Users, val: data.usersCount, label: "المستخدمون", color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950" },
          { icon: Eye, val: data.totalViews, label: "المشاهدات", color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950" },
          { icon: Handshake, val: offices.length, label: "المكاتب", color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950" },
        ].map(({ icon: Icon, val, label, color, bg }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm text-center">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mx-auto mb-2`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{val.toLocaleString("ar-IQ")}</p>
            <p className="text-gray-400 text-xs">{label}</p>
          </div>
        ))}
      </div>

      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {[
            { icon: Scale, val: overview.lawyersCount, label: "المحامون", color: "text-teal-500", bg: "bg-teal-50 dark:bg-teal-950" },
            { icon: Wallet, val: overview.pendingPayouts, label: "طلبات سحب معلقة", color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950" },
            { icon: CheckCircle, val: overview.pendingInspections, label: "فحوصات بانتظار محامٍ", color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950" },
          ].map(({ icon: Icon, val, label, color, bg }) => (
            <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm text-center">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mx-auto mb-2`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{val.toLocaleString("ar-IQ")}</p>
              <p className="text-gray-400 text-xs">{label}</p>
            </div>
          ))}
        </div>
      )}

      {newCredentials && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-2xl p-4 mb-6 flex items-center justify-between">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            بيانات الدخول الجديدة — المعرّف: <b>{newCredentials.id}</b> · كلمة المرور: <b>{newCredentials.password}</b> (احفظها الآن، لن تظهر مرة أخرى)
          </p>
          <button onClick={() => setNewCredentials(null)} className="text-emerald-600 hover:text-emerald-800 text-xs font-bold">إغلاق</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl max-w-full overflow-x-auto">
        <button onClick={() => setTab("listings")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${tab === "listings" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          إدارة الإعلانات
        </button>
        <button onClick={() => setTab("offices")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${tab === "offices" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          المكاتب الدلالية
        </button>
        <button onClick={() => setTab("lawyers")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${tab === "lawyers" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          المحامون
        </button>
        <button onClick={() => setTab("payouts")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap flex items-center gap-1.5 ${tab === "payouts" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          طلبات السحب
          {payouts.filter((p) => p.status === "pending").length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{payouts.filter((p) => p.status === "pending").length}</span>
          )}
        </button>
        <button onClick={() => setTab("reports")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap flex items-center gap-1.5 ${tab === "reports" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          البلاغات
          {openCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{openCount}</span>
          )}
        </button>
        <button onClick={() => setTab("areas")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${tab === "areas" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          المناطق
        </button>
      </div>

      {/* Listings table */}
      {tab === "listings" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">الإعلان</th>
                  <th className="px-4 py-3 font-medium">المعلن</th>
                  <th className="px-4 py-3 font-medium">السعر</th>
                  <th className="px-4 py-3 font-medium">التصنيف</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {data.listings.map((listing) => (
                  <tr key={listing.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <Link href={`/listings/${listing.id}`} className="font-medium text-gray-800 dark:text-gray-100 hover:text-orange-500 line-clamp-1 flex items-center gap-1">
                        {listing.pinned && <Pin className="w-3.5 h-3.5 text-orange-500 fill-orange-500 flex-shrink-0" />}
                        {listing.title}
                      </Link>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {listing.city} · {listing.category} · <Eye className="w-3 h-3 inline" /> {listing.views}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700 dark:text-gray-300 text-xs">{listing.user.name}</p>
                      <p className="text-gray-400 text-xs">{listing.user.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-orange-500 font-bold text-xs whitespace-nowrap">
                      {formatPrice(listing.price)}
                    </td>
                    <td className="px-4 py-3">
                      <select value={listing.dealType || "للبيع"} onChange={(e) => updateDealType(listing.id, e.target.value)}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
                        {DEAL_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        listing.status === "active" ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400"
                      }`}>
                        {listing.status === "active" ? "نشط" : "مخفي"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => togglePin(listing.id, !listing.pinned)}
                          className={`transition ${listing.pinned ? "text-orange-500 hover:text-orange-600" : "text-gray-300 dark:text-gray-600 hover:text-orange-400"}`}
                          title={listing.pinned ? "إلغاء التثبيت" : "تثبيت في المقدمة"}>
                          <Pin className={`w-4 h-4 ${listing.pinned ? "fill-orange-500" : ""}`} />
                        </button>
                        {listing.status === "active" ? (
                          <button onClick={() => updateStatus(listing.id, "hidden")}
                            className="text-yellow-400 hover:text-yellow-600 transition" title="إخفاء">
                            <XCircle className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => updateStatus(listing.id, "active")}
                            className="text-green-400 hover:text-green-600 transition" title="تفعيل">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => deleteListing(listing.id)}
                          className="text-red-300 hover:text-red-500 transition" title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Offices management */}
      {tab === "offices" && (
        <div className="grid md:grid-cols-2 gap-5">
          {/* Add office form */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 h-fit">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-orange-500" /> إضافة مكتب دلالية
            </h2>
            {officeError && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">{officeError}</div>
            )}
            <form onSubmit={addOffice} className="space-y-3">
              <div>
                <label className={labelCls}>اسم المكتب</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: مكتب الأمانة للعقارات"
                  className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>المحافظة</label>
                  <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className={inputCls}>
                    <option value="">اختر</option>
                    {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>المنطقة</label>
                  <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}
                    placeholder="اختياري"
                    className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>رقم الهاتف</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="07XXXXXXXXX"
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>العنوان التفصيلي <span className="text-gray-400">(اختياري)</span></label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="مثال: شارع الرئيسي، قرب الجامع"
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>ساعات العمل <span className="text-gray-400">(اختياري)</span></label>
                <input value={form.workingHours} onChange={(e) => setForm({ ...form, workingHours: e.target.value })}
                  placeholder="مثال: السبت - الخميس، 9 صباحاً - 6 مساءً"
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>نبذة عن المكتب <span className="text-gray-400">(اختياري)</span></label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="نبذة قصيرة عن المكتب وخدماته"
                  rows={3}
                  className={`${inputCls} resize-none`} />
              </div>
              <div>
                <label className={labelCls}>موقع المكتب على الخريطة <span className="text-gray-400">(اختياري)</span></label>
                <LocationPicker value={coords} onChange={setCoords} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? "جاري الحفظ..." : "إضافة المكتب"}
              </button>
            </form>
          </div>

          {/* Offices list */}
          <div className="space-y-3">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Handshake className="w-5 h-5 text-orange-500" /> المكاتب المعتمدة ({offices.length})
            </h2>
            {offices.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-8 text-center text-gray-400">
                <Handshake className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">لا توجد مكاتب معتمدة بعد</p>
                <p className="text-xs mt-1">أضف أول مكتب دلالية من النموذج</p>
              </div>
            ) : (
              offices.map((office) => {
                const status = officeStatuses[office.id] || "active";
                return (
                  <div key={office.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{office.name}</p>
                        <span className="text-xs text-gray-400">{office.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                          {status === "active" ? "نشط" : "معلّق"}
                        </span>
                      </div>
                      <p className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs mb-0.5">
                        <MapPin className="w-3.5 h-3.5 text-orange-400" />
                        {office.city}{office.area ? ` - ${office.area}` : ""}
                        {office.address ? ` · ${office.address}` : ""}
                      </p>
                      <p className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs">
                        <Phone className="w-3.5 h-3.5 text-orange-400" /> {office.phone}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => showOfficeQr(office.id)} disabled={qrLoading === office.id} className="text-purple-400 hover:text-purple-600 transition p-1 disabled:opacity-50" title="باركود المكتب">
                        {qrLoading === office.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                      </button>
                      <button onClick={() => resetOfficePassword(office.id)} className="text-blue-300 hover:text-blue-500 transition p-1" title="إعادة تعيين كلمة المرور">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleOfficeStatus(office.id)} className={`transition p-1 ${status === "active" ? "text-amber-400 hover:text-amber-600" : "text-emerald-400 hover:text-emerald-600"}`} title={status === "active" ? "تعليق" : "تفعيل"}>
                        {status === "active" ? <Ban className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                      </button>
                      <button onClick={() => deleteOffice(office.id)}
                        className="text-red-300 hover:text-red-500 transition p-1" title="حذف">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Lawyers management */}
      {tab === "lawyers" && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 h-fit">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-orange-500" /> إضافة محامٍ معتمد
            </h2>
            {lawyerError && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">{lawyerError}</div>
            )}
            <form onSubmit={addLawyer} className="space-y-3">
              <div>
                <label className={labelCls}>اسم المحامي</label>
                <input value={lawyerForm.name} onChange={(e) => setLawyerForm({ ...lawyerForm, name: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>رقم الهاتف</label>
                  <input value={lawyerForm.phone} onChange={(e) => setLawyerForm({ ...lawyerForm, phone: e.target.value })} placeholder="07XXXXXXXXX" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>البريد الإلكتروني <span className="text-gray-400">(اختياري)</span></label>
                  <input value={lawyerForm.email} onChange={(e) => setLawyerForm({ ...lawyerForm, email: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>التخصص</label>
                  <select value={lawyerForm.specialization} onChange={(e) => setLawyerForm({ ...lawyerForm, specialization: e.target.value })} className={inputCls}>
                    {SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>المحافظة</label>
                  <select value={lawyerForm.city} onChange={(e) => setLawyerForm({ ...lawyerForm, city: e.target.value })} className={inputCls}>
                    {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={lawyerSaving}
                className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {lawyerSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {lawyerSaving ? "جاري الحفظ..." : "إضافة المحامي"}
              </button>
            </form>
          </div>

          <div className="space-y-3">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Scale className="w-5 h-5 text-orange-500" /> المحامون المعتمدون ({lawyers.length})
            </h2>
            {lawyers.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-8 text-center text-gray-400">
                <Scale className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">لا يوجد محامون معتمدون بعد</p>
              </div>
            ) : (
              lawyers.map((l) => (
                <div key={l.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{l.name}</p>
                      <span className="text-xs text-gray-400">{l.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                        {l.status === "active" ? "نشط" : "معلّق"}
                      </span>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">{l.specialization} · {l.city} · {l.phone}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => resetLawyerPassword(l.id)} className="text-blue-300 hover:text-blue-500 transition p-1" title="إعادة تعيين كلمة المرور">
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleLawyerStatus(l.id, l.status)} className={`transition p-1 ${l.status === "active" ? "text-amber-400 hover:text-amber-600" : "text-emerald-400 hover:text-emerald-600"}`} title={l.status === "active" ? "تعليق" : "تفعيل"}>
                      {l.status === "active" ? <Ban className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                    </button>
                    <button onClick={() => deleteLawyer(l.id)} className="text-red-300 hover:text-red-500 transition p-1" title="حذف">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Payout requests */}
      {tab === "payouts" && (
        payouts.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-10 text-center text-gray-400">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">لا توجد طلبات سحب</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payouts.map((p) => (
              <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{p.payeeName} <span className="text-gray-400 text-xs">({p.payeeType === "office" ? "مكتب" : "محامٍ"})</span></p>
                  <p className="text-orange-500 font-bold text-sm mt-0.5">{p.amount.toLocaleString("ar-IQ")} د.ع</p>
                  <p className="text-gray-400 text-xs mt-0.5">{timeAgo(p.requestedAt)}</p>
                </div>
                {p.status === "pending" ? (
                  <div className="flex gap-2">
                    <button onClick={() => updatePayoutStatus(p.id, "approved")} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium">موافقة</button>
                    <button onClick={() => updatePayoutStatus(p.id, "paid")} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">تم الدفع</button>
                  </div>
                ) : p.status === "approved" ? (
                  <button onClick={() => updatePayoutStatus(p.id, "paid")} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">تم الدفع</button>
                ) : (
                  <span className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">تم الدفع</span>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Reports panel */}
      {tab === "reports" && (
        reports.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-10 text-center text-gray-400">
            <Flag className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">لا توجد بلاغات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.id} className={`bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 border ${r.status === "open" ? "border-red-100 dark:border-red-900" : "border-gray-100 dark:border-gray-800 opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === "open" ? "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400"}`}>
                        {r.status === "open" ? "جديد" : "تمت المعالجة"}
                      </span>
                      <span className="text-orange-600 dark:text-orange-400 text-sm font-medium">{r.reason}</span>
                    </div>
                    {r.listingId ? (
                      <Link href={`/listings/${r.listingId}`} className="font-bold text-gray-800 dark:text-gray-100 text-sm hover:text-orange-500 line-clamp-1 block">
                        {r.listingTitle || "إعلان محذوف"}
                      </Link>
                    ) : (
                      <p className="font-bold text-gray-400 text-sm">إعلان محذوف</p>
                    )}
                    {r.note && <p className="text-gray-500 dark:text-gray-400 text-xs mt-1 leading-relaxed">{r.note}</p>}
                    <p className="text-gray-400 text-xs mt-1">
                      بلاغ من {r.reporterName || "مستخدم"} · {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  {r.status === "open" && (
                    <button onClick={() => resolveReport(r.id)}
                      className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900 transition rounded-xl px-3 py-2 text-xs font-medium flex-shrink-0">
                      <CheckCircle className="w-4 h-4" /> معالجة
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Areas management */}
      {tab === "areas" && (
        <div className="grid md:grid-cols-2 gap-5">
          {/* Add area form */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 h-fit">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Map className="w-5 h-5 text-orange-500" /> إضافة منطقة / حي جديد
            </h2>
            {areaError && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">{areaError}</div>
            )}
            <form onSubmit={addArea} className="space-y-3">
              <div>
                <label className={labelCls}>المحافظة</label>
                <select value={areaCity} onChange={(e) => setAreaCity(e.target.value)} className={inputCls}>
                  {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>اسم المنطقة / الحي</label>
                <input value={areaName} onChange={(e) => setAreaName(e.target.value)}
                  placeholder="مثال: الغزالية" className={inputCls} />
              </div>
              <button type="submit" disabled={areaSaving}
                className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {areaSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {areaSaving ? "جاري الحفظ..." : "إضافة المنطقة"}
              </button>
            </form>
          </div>

          {/* Areas list */}
          <div className="space-y-3">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-orange-500" /> مناطق {areaCity} ({areas.length})
            </h2>
            {areas.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-8 text-center text-gray-400">
                <Map className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">لا توجد مناطق لهذه المحافظة بعد</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-3 flex flex-wrap gap-2">
                {areas.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-full pr-3 pl-1.5 py-1 text-sm text-gray-700 dark:text-gray-200">
                    {a.name}
                    <button onClick={() => deleteArea(a.id)} className="text-gray-300 hover:text-red-500 transition" title="حذف">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Office QR modal */}
      {qr && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setQr(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 dark:text-gray-100">باركود المكتب</h3>
              <button onClick={() => setQr(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{qr.officeName}</p>
            <img src={qr.qr} alt="QR" className="w-56 h-56 mx-auto rounded-xl border border-gray-100 dark:border-gray-800" />
            <p className="text-xs text-gray-400 mt-3 break-all" dir="ltr">{qr.url}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">عند المسح تُفتح محادثة مع دلال العراق منسوبة لهذا المكتب.</p>
            <a href={qr.qr} download={`qr-${qr.officeName}.png`}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-orange-500 text-white py-2.5 rounded-xl font-bold hover:bg-orange-600 transition text-sm">
              <Download className="w-4 h-4" /> تنزيل الباركود
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
DALAL_FIX2_EOF_9f3a

apply_file dalal-app/src/pages/edit-listing.tsx <<'DALAL_FIX2_EOF_9f3a'
import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2, Save } from "lucide-react";
import { CITIES, SIZE_OPTIONS, BEDROOM_OPTIONS, BATHROOM_OPTIONS, CAR_YEARS } from "@/lib/utils";
import { api, getUser } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface FullListing {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  type: string;
  city: string;
  area: string | null;
  size: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  buildYear: number | null;
  carYear: number | null;
  mileage: number | null;
  dealType: string | null;
  monthlyRent: number | null;
  status: string;
  user: { id: string };
}

export default function EditListingPage() {
  const [, params] = useRoute("/edit-listing/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  const t = useT();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [size, setSize] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [buildYear, setBuildYear] = useState("");
  const [carYear, setCarYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [dealType, setDealType] = useState("للبيع");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [status, setStatus] = useState("active");

  useEffect(() => {
    if (!id) return;
    const u = getUser();
    if (!u) { navigate("/login"); return; }
    api.get<FullListing>(`/listings/${id}`)
      .then((l) => {
        if (l.user.id !== u.userId && u.role !== "admin") { setDenied(true); return; }
        setCategory(l.category);
        setTitle(l.title);
        setDescription(l.description);
        setPrice(String(l.price));
        setCity(l.city);
        setArea(l.area ?? "");
        setSize(l.size != null ? String(l.size) : "");
        setBedrooms(l.bedrooms != null ? String(l.bedrooms) : "");
        setBathrooms(l.bathrooms != null ? String(l.bathrooms) : "");
        setBuildYear(l.buildYear != null ? String(l.buildYear) : "");
        setCarYear(l.carYear != null ? String(l.carYear) : "");
        setMileage(l.mileage != null ? String(l.mileage) : "");
        setDealType(l.dealType ?? "للبيع");
        setMonthlyRent(l.monthlyRent != null ? String(l.monthlyRent) : "");
        setStatus(l.status);
      })
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(""); setSaving(true);
    try {
      await api.patch(`/listings/${id}`, {
        title, description,
        price: parseFloat(price),
        city, area: area || null,
        dealType, status,
        monthlyRent: dealType === "رهن" && monthlyRent ? parseFloat(monthlyRent) : null,
        size: category === "عقارات" && size ? parseFloat(size) : null,
        bedrooms: category === "عقارات" && bedrooms ? parseInt(bedrooms) : null,
        bathrooms: category === "عقارات" && bathrooms ? parseInt(bathrooms) : null,
        buildYear: category === "عقارات" && buildYear ? parseInt(buildYear) : null,
        carYear: category === "سيارات" && carYear ? parseInt(carYear) : null,
        mileage: category === "سيارات" && mileage ? parseInt(mileage) : null,
      });
      navigate(`/listings/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.error"));
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
    </div>
  );

  if (denied) return (
    <div className="text-center py-20 text-gray-400">
      <p className="text-lg font-bold mb-2">{t("common.error")}</p>
      <button onClick={() => navigate("/listings")} className="text-orange-500 hover:underline text-sm">
        {t("common.back")}
      </button>
    </div>
  );

  const inputCls = "w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-5">{t("common.edit")}</h1>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-3 mb-4 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("add.titleField")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("add.descField")}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} required className={`${inputCls} resize-none`} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{dealType === "رهن" ? "مبلغ الرهن" : t("add.priceField")}</label>
          <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" required className={inputCls} />
        </div>

        {dealType === "رهن" && (
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">الإيجار الشهري</label>
            <input value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} type="number" min="0" className={inputCls} />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">{t("common.type")}</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "للبيع", l: t("common.forSale") },
              { v: "للايجار", l: t("common.forRent") },
              { v: "رهن", l: "رهن" },
              { v: "مباع", l: t("common.sold") },
            ].map(({ v, l }) => (
              <button key={v} type="button" onClick={() => setDealType(v)}
                className={`py-2.5 rounded-xl text-sm border-2 transition font-medium ${
                  dealType === v ? "border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("common.city")}</label>
          <select value={city} onChange={(e) => setCity(e.target.value)} required className={inputCls}>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {category === "عقارات" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.size")}</label>
              <select value={size} onChange={(e) => setSize(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s} م²</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.bedrooms")}</label>
                <select value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {BEDROOM_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.bathrooms")}</label>
                <select value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {BATHROOM_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.buildYear")}</label>
              <select value={buildYear} onChange={(e) => setBuildYear(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {CAR_YEARS.filter((y) => y <= new Date().getFullYear()).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </>
        )}

        {category === "سيارات" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.carYear")}</label>
              <select value={carYear} onChange={(e) => setCarYear(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {CAR_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.mileage")}</label>
              <input value={mileage} onChange={(e) => setMileage(e.target.value)} type="number" min="0" className={inputCls} />
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => navigate(`/listings/${id}`)}
            className="flex-1 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition text-sm disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
DALAL_FIX2_EOF_9f3a

apply_file dalal-app/src/pages/listing-detail.tsx <<'DALAL_FIX2_EOF_9f3a'
import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  MapPin, Eye, Clock, MessageCircle, Trash2, Ruler, ShieldCheck, BadgeCheck,
  Navigation, BedDouble, Bath, Calendar, Gauge, Flag, TrendingDown, HandCoins,
  Star, Pencil, Building2,
} from "lucide-react";
import {
  formatPrice, timeAgo, formatSize, dealTypeStyle, formatCoords, mapsLink,
  formatMileage, marketPosition, addRecentlyViewed, listingSource,
  listingPath, listingShareUrl,
} from "@/lib/utils";
import { api, getUser } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { ListingCard, ListingItem } from "@/components/listing-card";
import { MediaCarousel } from "@/components/media-carousel";
import { FavoriteButton } from "@/components/favorite-button";
import { ShareButton } from "@/components/share-button";
import { ReportModal } from "@/components/report-modal";
import { MortgageCalculator } from "@/components/mortgage-calculator";
import { PriceHistory } from "@/components/price-history";
import { BookViewing } from "@/components/book-viewing";

interface FullListing extends ListingItem {
  description: string;
  area: string | null;
  buildYear: number | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  user: { id: string; name: string };
}

interface MarketStats {
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  count: number;
  avgPricePerM2: number | null;
  scope?: string;
  area?: string | null;
}

export default function ListingDetailPage() {
  const [, params] = useRoute("/listings/:id/:slug?");
  const [, navigate] = useLocation();
  const id = params?.id;

  const [listing, setListing] = useState<FullListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [similar, setSimilar] = useState<ListingItem[]>([]);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offer, setOffer] = useState("");
  const [offerSending, setOfferSending] = useState(false);

  const t = useT();
  const currentUser = getUser();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<FullListing>(`/listings/${id}`)
      .then((l) => {
        setListing(l);
        addRecentlyViewed(l.id);
        // Normalize the address bar to the readable, post-titled URL.
        if (!params?.slug) {
          const base = import.meta.env.BASE_URL.replace(/\/$/, "");
          window.history.replaceState(null, "", base + listingPath(l.id, l.title));
        }
        const p = new URLSearchParams({ category: l.category });
        if (l.city) p.set("city", l.city);
        if (l.area) p.set("area", l.area);
        if (l.type) p.set("type", l.type);
        api.get<MarketStats>(`/listings/market/stats?${p}`).then(setStats).catch(() => {});
      })
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
    api.get<{ listings: ListingItem[] }>(`/listings/${id}/similar`)
      .then((d) => setSimilar(d.listings))
      .catch(() => setSimilar([]));
  }, [id]);

  async function contactUs() {
    if (!currentUser) { navigate("/login"); return; }
    if (!listing) return;
    setChatLoading(true);
    try {
      const chat = await api.post<{ id: string }>("/chats", { listingId: listing.id });
      navigate(`/chat?id=${chat.id}`);
    } catch {
      setChatLoading(false);
    }
  }

  async function submitOffer() {
    if (!currentUser) { navigate("/login"); return; }
    if (!listing) return;
    const amount = parseInt(offer.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return;
    setOfferSending(true);
    try {
      const chat = await api.post<{ id: string }>("/chats", { listingId: listing.id });
      await api.post(`/chats/${chat.id}/messages`, {
        text: `💰 عرض سعر: ${formatPrice(amount)} على إعلان "${listing.title}"`,
      });
      navigate(`/chat?id=${chat.id}`);
    } catch {
      setOfferSending(false);
    }
  }

  async function deleteListing() {
    if (!confirm(t("detail.confirmDelete"))) return;
    setDeleting(true);
    await api.delete(`/listings/${id}`);
    navigate("/listings");
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto animate-pulse p-4 pt-6">
      <div className="bg-gray-200 dark:bg-gray-800 h-72 rounded-2xl mb-4" />
      <div className="bg-gray-200 dark:bg-gray-800 h-8 rounded-xl mb-3 w-3/4" />
      <div className="bg-gray-200 dark:bg-gray-800 h-6 rounded-xl w-1/3" />
    </div>
  );

  if (!listing) return (
    <div className="text-center py-20 text-gray-400">
      <p className="text-xl font-bold mb-2">{t("detail.notFound")}</p>
      <button onClick={() => navigate("/listings")} className="text-orange-500 hover:underline text-sm">
        {t("detail.backToListings")}
      </button>
    </div>
  );

  const isOwner = currentUser?.userId === listing.user.id;
  const isAdmin = currentUser?.role === "admin";
  const isSold = listing.dealType === "مباع" || listing.status === "sold";
  const reduced = listing.previousPrice != null && listing.previousPrice > listing.price;
  const market = stats?.avgPrice ? marketPosition(listing.price, stats.avgPrice) : null;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Media */}
      <div className="relative">
        <MediaCarousel
          images={listing.images}
          video={listing.video}
          category={listing.category}
          heightClass="h-72 sm:h-80"
        />
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end z-10">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full shadow ${dealTypeStyle(listing.dealType)}`}>
            {listing.dealType || "للبيع"}
          </span>
          <span className="text-xs font-bold px-2 py-1 rounded-full text-white shadow bg-gray-800/80">
            {listing.type}
          </span>
          {listing.verified && (
            <span className="text-xs font-bold px-2 py-1 rounded-full text-white shadow bg-sky-500 flex items-center gap-1">
              <BadgeCheck className="w-3.5 h-3.5" />{t("detail.verified")}
            </span>
          )}
          {listing.featured && (
            <span className="text-xs font-bold px-2 py-1 rounded-full text-white shadow bg-amber-500 flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-white" />{t("detail.featured")}
            </span>
          )}
        </div>
        <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
          <FavoriteButton listingId={listing.id} />
          <ShareButton
            title={listing.title}
            text={`${listing.title} — ${formatPrice(listing.price)}`}
            url={listingShareUrl(listing.id, listing.title)}
          />
        </div>
      </div>

      <div className="px-4 py-5">
        {/* Title + price */}
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">{listing.title}</h1>
            {(() => {
              const src = listingSource(listing);
              return (
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full mb-2 ${
                  src.kind === "office"
                    ? "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                    : "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                }`}>
                  {src.kind === "office" ? <Building2 className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  {src.label}
                </span>
              );
            })()}
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-3xl font-bold text-orange-500">{formatPrice(listing.price)}</p>
              {listing.dealType === "رهن" && (
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">مبلغ الرهن</span>
              )}
              {reduced && (
                <span className="text-base text-gray-400 line-through">{formatPrice(listing.previousPrice!)}</span>
              )}
            </div>
            {listing.dealType === "رهن" && listing.monthlyRent != null && (
              <p className="text-base font-bold text-gray-700 dark:text-gray-200 mt-1">
                الإيجار الشهري: <span className="text-orange-500">{formatPrice(listing.monthlyRent)}</span>
              </p>
            )}
            {reduced && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 px-2 py-1 rounded-full mt-1">
                <TrendingDown className="w-3 h-3" /> {t("detail.priceDropped")}
              </span>
            )}
          </div>
          {(isOwner || isAdmin) && (
            <div className="flex items-center gap-1 mt-1">
              <button onClick={() => navigate(`/edit-listing/${listing.id}`)}
                className="text-gray-300 hover:text-orange-500 transition p-1" aria-label={t("common.edit")}>
                <Pencil className="w-5 h-5" />
              </button>
              <button onClick={deleteListing} disabled={deleting}
                className="text-gray-300 hover:text-red-500 transition p-1" aria-label={t("common.delete")}>
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Market indicator */}
        {market && (
          <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full mb-3 ${market.tone}`}>
            <TrendingDown className="w-3.5 h-3.5" />
            {market.label}
            {stats?.count ? <span className="opacity-70">· {t("market.basedOn", { count: stats.count })}</span> : null}
          </div>
        )}

        {/* Per-m² market context (feature 2) */}
        {stats?.avgPricePerM2 ? (
          <div className="mb-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
            متوسط سعر المتر
            {stats.scope === "area" && stats.area ? ` في ${stats.area}` : stats.scope === "city" && listing.city ? ` في ${listing.city}` : ""}:
            {" "}<span className="font-bold text-gray-800 dark:text-gray-200">{formatPrice(Math.round(stats.avgPricePerM2))}</span> / م²
            {listing.size ? (
              <> · تقدير حسب المساحة ({formatSize(listing.size)}): <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatPrice(Math.round(stats.avgPricePerM2 * listing.size))}</span></>
            ) : null}
          </div>
        ) : null}

        {/* Meta */}
        <div className="flex flex-wrap gap-3 mb-4 mt-1">
          <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
            <MapPin className="w-4 h-4" />
            {listing.city}{listing.area ? ` - ${listing.area}` : ""}
          </span>
          {listing.size ? (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <Ruler className="w-4 h-4" />{formatSize(listing.size)}
            </span>
          ) : null}
          {listing.bedrooms != null && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <BedDouble className="w-4 h-4" />{t("detail.bedroomsCount", { n: listing.bedrooms })}
            </span>
          )}
          {listing.bathrooms != null && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <Bath className="w-4 h-4" />{t("detail.bathroomsCount", { n: listing.bathrooms })}
            </span>
          )}
          {listing.buildYear != null && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <Calendar className="w-4 h-4" />{t("detail.builtIn", { year: listing.buildYear })}
            </span>
          )}
          {listing.carYear != null && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <Calendar className="w-4 h-4" />{t("detail.modelYearVal", { year: listing.carYear })}
            </span>
          )}
          {listing.mileage != null && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <Gauge className="w-4 h-4" />{formatMileage(listing.mileage)}
            </span>
          )}
          {listing.ownershipType ? (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <BadgeCheck className="w-4 h-4" />{listing.ownershipType}
            </span>
          ) : null}
          <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
            <Eye className="w-4 h-4" />{listing.views} {t("detail.views")}
          </span>
          <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
            <Clock className="w-4 h-4" />{timeAgo(listing.createdAt)}
          </span>
          {listing.latitude != null && listing.longitude != null && (
            <a href={mapsLink(listing.latitude, listing.longitude)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-emerald-600 text-sm font-medium hover:text-emerald-700 transition" dir="ltr">
              <Navigation className="w-4 h-4" />{formatCoords(listing.latitude, listing.longitude)}
            </a>
          )}
        </div>

        {/* Description */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4 shadow-sm border border-gray-50 dark:border-gray-800">
          <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-2">{t("detail.details")}</h3>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line text-sm">{listing.description}</p>
        </div>

        {/* Price history */}
        <PriceHistory listingId={listing.id} />

        {/* Mortgage calculator (real estate, for-sale only) */}
        {listing.category === "عقارات" && !isSold && <MortgageCalculator price={listing.price} />}

        {/* Contact us (broker model) */}
        {!isOwner && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-50 dark:border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-800 dark:text-gray-100">{t("brand.full")}</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs">{t("detail.brokerTagline")}</p>
              </div>
            </div>

            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-3">
              {t("detail.brokerDesc")}
            </p>

            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900 rounded-xl px-3 py-2 mb-4">
              <BadgeCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-emerald-700 dark:text-emerald-300 text-xs font-medium">{t("detail.freeConsult")}</p>
            </div>

            <button onClick={contactUs} disabled={chatLoading || isSold}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition text-sm disabled:opacity-60 mb-2">
              <MessageCircle className="w-5 h-5" />
              {isSold ? t("common.sold") : chatLoading ? t("common.loading") : t("detail.contactUs")}
            </button>

            {/* Book a viewing (broker model) */}
            {!isSold && <BookViewing listingId={listing.id} />}

            {/* Offer / bid box */}
            {!isSold && (
              <>
                {!offerOpen ? (
                  <button onClick={() => setOfferOpen(true)}
                    className="w-full flex items-center justify-center gap-2 border-2 border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 py-2.5 rounded-xl font-bold hover:bg-orange-50 dark:hover:bg-orange-950 transition text-sm">
                    <HandCoins className="w-5 h-5" />
                    {t("detail.makeOfferBtn")}
                  </button>
                ) : (
                  <div className="border-2 border-orange-200 dark:border-orange-900 rounded-xl p-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{t("detail.offerLabel")}</p>
                    <div className="flex gap-2">
                      <input
                        value={offer}
                        onChange={(e) => setOffer(e.target.value)}
                        type="number"
                        placeholder={t("detail.offerPlaceholder", { amount: Math.round(listing.price * 0.9) })}
                        className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-3 py-2 text-right text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                      <button onClick={submitOffer} disabled={offerSending || !offer}
                        className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white px-4 rounded-xl text-sm font-bold transition">
                        {offerSending ? "..." : t("common.send")}
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{t("detail.offerHint")}</p>
                  </div>
                )}
              </>
            )}

            {/* Report */}
            <button onClick={() => setShowReport(true)}
              className="w-full flex items-center justify-center gap-1.5 text-gray-400 hover:text-red-500 transition text-xs mt-3">
              <Flag className="w-3.5 h-3.5" />
              {t("detail.reportListing")}
            </button>
          </div>
        )}

        {isOwner && (
          <div className="bg-orange-50 dark:bg-orange-950 border border-orange-100 dark:border-orange-900 rounded-2xl p-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {t("detail.ownerNotice")}
          </div>
        )}

        {/* Similar listings */}
        {similar.length > 0 && (
          <div className="mt-8">
            <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-3">{t("detail.similar")}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {similar.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
          </div>
        )}
      </div>

      {showReport && <ReportModal listingId={listing.id} onClose={() => setShowReport(false)} />}
    </div>
  );
}
DALAL_FIX2_EOF_9f3a

apply_file dalal-app/src/pages/office-dashboard.tsx <<'DALAL_FIX2_EOF_9f3a'
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Plus, Trash2, Pencil, X, Home, ShieldCheck, Clock, CheckCircle2, QrCode, Download } from "lucide-react";
import { api, getUser, uploadFile, mediaUrl } from "@/lib/api";
import { CITIES, formatPrice, formatSize } from "@/lib/utils";

const PROPERTY_TYPES = ["أرض", "شقة", "دار", "محل"];

interface NetworkProperty {
  id: string;
  type: string;
  city: string;
  area?: string | null;
  price: number;
  size?: number | null;
  rooms?: number | null;
  description?: string | null;
  sellerPhone?: string | null;
  images: string[];
  status: string;
  inspectionReportUrl?: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
  pending_audit: { label: "بانتظار الفحص القانوني", tone: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400", icon: Clock },
  available: { label: "متاح في الشبكة", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400", icon: ShieldCheck },
  pending: { label: "قيد التفاوض", tone: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400", icon: Clock },
  sold: { label: "مباع", tone: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400", icon: CheckCircle2 },
};

const emptyForm = { type: "دار", city: CITIES[0], area: "", price: "", size: "", rooms: "", description: "", sellerPhone: "" };

export default function OfficeDashboardPage() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [properties, setProperties] = useState<NetworkProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NetworkProperty | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requestingInspection, setRequestingInspection] = useState<NetworkProperty | null>(null);
  const [qr, setQr] = useState<{ officeName: string; url: string; qr: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  async function showMyQr() {
    const u = getUser();
    if (!u) return;
    setQrLoading(true);
    try {
      const d = await api.get<{ officeName: string; url: string; qr: string }>(`/offices/${u.userId}/qr`);
      setQr(d);
    } catch {
      alert("تعذّر جلب الباركود");
    } finally {
      setQrLoading(false);
    }
  }

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "office") { navigate("/office/login"); return; }
    setReady(true);
    load();
  }, [navigate]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ properties: NetworkProperty[] }>("/network-properties/mine");
      setProperties(data.properties);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setImages([]);
    setError("");
    setShowForm(true);
  }

  function openEdit(p: NetworkProperty) {
    setEditing(p);
    setForm({
      type: p.type, city: p.city, area: p.area || "",
      price: String(p.price), size: p.size ? String(p.size) : "",
      rooms: p.rooms ? String(p.rooms) : "", description: p.description || "",
      sellerPhone: p.sellerPhone || "",
    });
    setImages(p.images || []);
    setError("");
    setShowForm(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(Array.from(files).slice(0, 10).map((f) => uploadFile(f)));
      setImages((prev) => [...prev, ...uploaded].slice(0, 15));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "تعذر رفع الصور");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.price || Number(form.price) <= 0) { setError("السعر مطلوب"); return; }
    if (!form.sellerPhone.trim()) { setError("رقم البائع مطلوب"); return; }
    setSaving(true);
    try {
      const payload = { ...form, price: Number(form.price), size: form.size ? Number(form.size) : null, rooms: form.rooms ? Number(form.rooms) : null, images };
      if (editing) await api.patch(`/network-properties/${editing.id}`, payload);
      else await api.post("/network-properties", payload);
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("هل تريد حذف هذا العقار من الشبكة؟")) return;
    await api.delete(`/network-properties/${id}`);
    load();
  }

  async function submitInspectionRequest(tier: string) {
    if (!requestingInspection) return;
    try {
      await api.post("/inspections/requests", { propertyId: requestingInspection.id, tier });
      setRequestingInspection(null);
      alert("تم إرسال طلب الفحص القانوني، سيتم إشعارك عند القبول");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال الطلب");
    }
  }

  if (!ready) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">عقاراتي في الشبكة</h1>
          <p className="text-gray-400 text-sm mt-0.5">أضف عقاراً واطلب فحصاً قانونياً لنشره للمكاتب الأخرى</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={showMyQr} disabled={qrLoading}
            className="flex-1 sm:flex-none justify-center border border-purple-300 dark:border-purple-800 text-purple-600 dark:text-purple-400 rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 hover:bg-purple-50 dark:hover:bg-purple-950 transition disabled:opacity-50">
            <QrCode className="w-4 h-4" /> باركود المكتب
          </button>
          <button onClick={openCreate} className="flex-1 sm:flex-none justify-center bg-orange-500 text-white rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 hover:bg-orange-600 transition">
            <Plus className="w-4 h-4" /> إضافة عقار
          </button>
        </div>
      </div>

      {qr && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setQr(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 dark:text-gray-100">باركود المكتب</h3>
              <button onClick={() => setQr(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{qr.officeName}</p>
            <img src={qr.qr} alt="QR" className="w-56 h-56 mx-auto rounded-xl border border-gray-100 dark:border-gray-800" />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">اطبع الباركود وضعه في مكتبك — عند مسحه تُفتح محادثة مع دلال العراق منسوبة لمكتبك.</p>
            <a href={qr.qr} download={`qr-${qr.officeName}.png`}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-orange-500 text-white py-2.5 rounded-xl font-bold hover:bg-orange-600 transition text-sm">
              <Download className="w-4 h-4" /> تنزيل الباركود
            </a>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري التحميل...</div>
      ) : properties.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <Home className="w-10 h-10 mx-auto mb-3 opacity-30" />
          لم تُضف أي عقار بعد
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {properties.map((p) => {
            const status = STATUS_LABELS[p.status] || STATUS_LABELS.pending_audit;
            const StatusIcon = status.icon;
            return (
              <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
                <div className="h-36 bg-gray-100 dark:bg-gray-800">
                  {p.images[0] && <img src={mediaUrl(p.images[0])} alt={p.type} className="w-full h-full object-cover" />}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${status.tone}`}>
                      <StatusIcon className="w-3 h-3" /> {status.label}
                    </span>
                    <span className="text-xs text-gray-300">{p.type}</span>
                  </div>
                  <p className="font-bold text-gray-800 dark:text-gray-100">{formatPrice(p.price)}</p>
                  <p className="text-sm text-gray-400">{p.city}{p.size ? ` · ${formatSize(p.size)}` : ""}</p>
                  <div className="flex items-center gap-2 mt-3">
                    {p.status === "pending_audit" && !p.inspectionReportUrl && (
                      <button onClick={() => setRequestingInspection(p)} className="text-xs bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 px-3 py-1.5 rounded-lg font-medium hover:bg-orange-100 transition">
                        طلب فحص قانوني
                      </button>
                    )}
                    {p.inspectionReportUrl && p.status === "pending_audit" && (
                      <button onClick={() => api.patch(`/network-properties/${p.id}`, { status: "available" }).then(load)} className="text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-100 transition">
                        نشر في الشبكة
                      </button>
                    )}
                    <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-orange-500 p-1.5"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-red-500 p-1.5"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {requestingInspection && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setRequestingInspection(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-1">طلب فحص قانوني</h2>
            <p className="text-sm text-gray-400 mb-4">اختر درجة الفحص المطلوبة</p>
            <div className="space-y-2">
              {[{ id: "silver", label: "فضية - فحص أساسي" }, { id: "gold", label: "ذهبية - فحص شامل" }, { id: "diamond", label: "ماسية - فحص متقدم مع متابعة" }].map((t) => (
                <button key={t.id} onClick={() => submitInspectionRequest(t.id)} className="w-full text-right p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition text-sm">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">{editing ? "تعديل العقار" : "إضافة عقار"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 mb-3">{error}</div>}
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm">
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm">
                  {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="المنطقة" className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <div className="grid grid-cols-3 gap-3">
                <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="السعر" required className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
                <input type="number" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="المساحة م²" className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
                <input type="number" value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} placeholder="الغرف" className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف العقار" rows={3} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <div>
                <input type="tel" value={form.sellerPhone} onChange={(e) => setForm({ ...form, sellerPhone: e.target.value })} placeholder="رقم البائع (إلزامي)" required className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
                <p className="text-[11px] text-gray-400 mt-1">لا يُنشر رقم البائع للعامة، يُرسل فقط لشبكة دلال العراق مع العرض.</p>
              </div>
              <div>
                <label className="text-sm text-gray-500 mb-1.5 block">الصور</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden">
                      <img src={mediaUrl(img)} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setImages(images.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">×</button>
                    </div>
                  ))}
                </div>
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} disabled={uploading} className="text-sm" />
              </div>
              <button type="submit" disabled={saving} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm">
                {saving ? "جاري الحفظ..." : "حفظ"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
DALAL_FIX2_EOF_9f3a

apply_file dalal-app/src/pages/office-network.tsx <<'DALAL_FIX2_EOF_9f3a'
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Search, Handshake, UserPlus, Scale, Wrench, X, FileText } from "lucide-react";
import { api, getUser, mediaUrl } from "@/lib/api";
import { CITIES, formatPrice, formatSize, timeAgo } from "@/lib/utils";

const CONTRACT_TYPE_AR: Record<string, string> = { sale: "بيع", rent_to_own: "إيجار تمليكي", inheritance: "إرث" };

const TABS = [
  { id: "browse", label: "عقارات الشبكة", icon: Search },
  { id: "mediation", label: "الوساطة", icon: Handshake },
  { id: "referrals", label: "الإحالات", icon: UserPlus },
  { id: "lawyers", label: "المحامون", icon: Scale },
  { id: "workshops", label: "الورش", icon: Wrench },
];

interface Property {
  id: string; type: string; city: string; area?: string | null; price: number; size?: number | null; rooms?: number | null; images: string[];
  source?: "network" | "listing"; officeId?: string | null; status?: string; title?: string | null; ownerName?: string | null; officeName?: string | null;
}

const NP_STATUS_AR: Record<string, string> = { pending_audit: "قيد التدقيق", available: "متاح", pending: "قيد التفاوض", sold: "مباع" };
interface MediationRequest {
  id: string; propertyId: string; requestingOfficeId: string; ownerOfficeId: string; status: string; commissionAmount?: number | null; createdAt: string;
}
interface Referral {
  id: string; propertyId?: string | null; referringOfficeId: string; ownerOfficeId: string; customerName: string; customerPhone: string; status: string; rewardAmount: number; createdAt: string;
}
interface Lawyer {
  id: string; name: string; phone: string; specialization: string; city: string; availability: string; rating: number; reviewCount: number;
}
interface Workshop {
  id: string; name: string; specialty: string; phone: string; city: string; rating: number;
}

export default function OfficeNetworkPage() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("browse");
  const [officeId, setOfficeId] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [mediations, setMediations] = useState<MediationRequest[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState("");
  const [referralTarget, setReferralTarget] = useState<Property | null>(null);
  const [referralForm, setReferralForm] = useState({ customerName: "", customerPhone: "", notes: "" });
  const [dealTarget, setDealTarget] = useState<Property | null>(null);
  const [dealForm, setDealForm] = useState({ buyerName: "", buyerPhone: "", price: "" });
  const [contractTarget, setContractTarget] = useState<Lawyer | null>(null);
  const [contractForm, setContractForm] = useState({ contractType: "sale", parties: "", details: "" });
  const [officeName, setOfficeName] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "office") { navigate("/office/login"); return; }
    setOfficeId(u.userId);
    setOfficeName(u.name || "");
    setReady(true);
  }, [navigate]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, tab, cityFilter]);

  async function load() {
    setLoading(true);
    try {
      if (tab === "browse") {
        const q = cityFilter ? `?city=${encodeURIComponent(cityFilter)}` : "";
        const d = await api.get<{ properties: { property: Property }[] }>(`/network-properties${q}`);
        setProperties(d.properties.map((r) => r.property));
      } else if (tab === "mediation") {
        const d = await api.get<{ requests: MediationRequest[] }>("/network-properties/mediation/mine");
        setMediations(d.requests);
      } else if (tab === "referrals") {
        const d = await api.get<{ referrals: Referral[] }>("/network-properties/referrals/mine");
        setReferrals(d.referrals);
      } else if (tab === "lawyers") {
        const d = await api.get<{ lawyers: Lawyer[] }>("/lawyers");
        setLawyers(d.lawyers);
      } else if (tab === "workshops") {
        const d = await api.get<{ workshops: Workshop[] }>("/workshops");
        setWorkshops(d.workshops);
      }
    } finally {
      setLoading(false);
    }
  }

  async function requestMediation(propertyId: string) {
    try {
      await api.post(`/network-properties/${propertyId}/mediation-requests`, {});
      alert("تم إرسال طلب الوساطة");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال الطلب");
    }
  }

  async function submitReferral(e: React.FormEvent) {
    e.preventDefault();
    if (!referralTarget) return;
    try {
      await api.post(`/network-properties/${referralTarget.id}/referrals`, referralForm);
      setReferralTarget(null);
      setReferralForm({ customerName: "", customerPhone: "", notes: "" });
      alert("تم إرسال الإحالة، ستحصل على مكافأة عند إتمام الصفقة");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال الإحالة");
    }
  }

  async function submitDeal(e: React.FormEvent) {
    e.preventDefault();
    if (!dealTarget) return;
    try {
      await api.post("/deals", {
        propertyId: dealTarget.id,
        buyerName: dealForm.buyerName,
        buyerPhone: dealForm.buyerPhone,
        price: Number(dealForm.price),
      });
      setDealTarget(null);
      setDealForm({ buyerName: "", buyerPhone: "", price: "" });
      alert("تم إنشاء الصفقة، يمكنك متابعتها من صفحة الصفقات");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إنشاء الصفقة");
    }
  }

  async function submitContractRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!contractTarget) return;
    try {
      await api.post("/contracts/requests", { ...contractForm, requesterName: officeName, lawyerId: contractTarget.id });
      setContractTarget(null);
      setContractForm({ contractType: "sale", parties: "", details: "" });
      alert("تم إرسال طلب صياغة العقد للمحامي");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال الطلب");
    }
  }

  async function respondMediation(id: string, status: string) {
    await api.patch(`/network-properties/mediation-requests/${id}`, { status });
    load();
  }

  async function respondReferral(id: string, status: string) {
    await api.patch(`/network-properties/referrals/${id}`, { status });
    load();
  }

  const STATUS_AR: Record<string, string> = { pending: "قيد الانتظار", accepted: "مقبول", rejected: "مرفوض", completed: "مكتمل", cancelled: "ملغى" };

  if (!ready) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">شبكة المكاتب</h1>

      <div className="flex gap-1 overflow-x-auto mb-5 pb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${tab === id ? "bg-orange-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري التحميل...</div>
      ) : tab === "browse" ? (
        <>
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm mb-4">
            <option value="">كل المحافظات</option>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {properties.length === 0 ? (
            <div className="text-center text-gray-400 py-16">لا توجد عروض متاحة حالياً</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {properties.map((p) => {
                const isListing = p.source === "listing";
                const hasOffice = !!p.officeName;
                const isMine = !!p.officeId && p.officeId === officeId;
                const sourceLabel = isMine
                  ? "عقار مكتبك"
                  : hasOffice
                    ? `إعلان المكتب: ${p.officeName}`
                    : "من طرف شبكة دلال العراق";
                return (
                <div key={`${p.source}-${p.id}`} className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
                  <div className="h-32 bg-gray-100 dark:bg-gray-800 relative">
                    {p.images[0] && <img src={mediaUrl(p.images[0])} className="w-full h-full object-cover" />}
                    <span className={`absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full font-medium ${hasOffice ? "bg-purple-500/90 text-white" : "bg-orange-500/90 text-white"}`}>{hasOffice ? "إعلان المكتب" : "من طرف الشبكة"}</span>
                    {!isListing && p.status && p.status !== "available" && (
                      <span className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full font-medium bg-gray-800/80 text-white">{NP_STATUS_AR[p.status] || p.status}</span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-bold text-gray-800 dark:text-gray-100">{formatPrice(p.price)}</p>
                    <p className="text-sm text-gray-400">{p.type} · {p.city}{p.size ? ` · ${formatSize(p.size)}` : ""}</p>
                    <p className="text-xs text-gray-400 mt-1">{sourceLabel}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {isMine ? (
                        <span className="flex-1 text-center text-xs text-gray-400 py-2">عقار مكتبك</span>
                      ) : (
                        <>
                          {isListing ? (
                            <button onClick={() => navigate(`/listings/${p.id}`)} className="flex-1 min-w-[45%] text-xs bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 py-2 rounded-lg font-medium hover:bg-orange-100 transition">عرض التفاصيل</button>
                          ) : (
                            <>
                              <button onClick={() => requestMediation(p.id)} className="flex-1 min-w-[45%] text-xs bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 py-2 rounded-lg font-medium hover:bg-orange-100 transition">طلب وساطة</button>
                              <button onClick={() => setReferralTarget(p)} className="flex-1 min-w-[45%] text-xs bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 py-2 rounded-lg font-medium hover:bg-blue-100 transition">إحالة زبون</button>
                            </>
                          )}
                          <button onClick={() => { setDealTarget(p); setDealForm({ buyerName: "", buyerPhone: "", price: String(p.price || "") }); }} className="flex-1 min-w-[45%] text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 py-2 rounded-lg font-medium hover:bg-emerald-100 transition">إنشاء صفقة</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </>
      ) : tab === "mediation" ? (
        mediations.length === 0 ? <div className="text-center text-gray-400 py-16">لا توجد طلبات وساطة</div> : (
          <div className="space-y-3">
            {mediations.map((m) => {
              const isOwner = m.ownerOfficeId === officeId;
              return (
                <div key={m.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{isOwner ? "طلب وارد من مكتب آخر" : "طلبك على عقار مكتب آخر"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{STATUS_AR[m.status]} · {timeAgo(m.createdAt)}</p>
                  </div>
                  {isOwner && m.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => respondMediation(m.id, "accepted")} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">قبول</button>
                      <button onClick={() => respondMediation(m.id, "rejected")} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-medium">رفض</button>
                    </div>
                  )}
                  {isOwner && m.status === "accepted" && (
                    <button onClick={() => respondMediation(m.id, "completed")} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium">إتمام</button>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : tab === "referrals" ? (
        referrals.length === 0 ? <div className="text-center text-gray-400 py-16">لا توجد إحالات</div> : (
          <div className="space-y-3">
            {referrals.map((r) => {
              const isOwner = r.ownerOfficeId === officeId;
              return (
                <div key={r.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{r.customerName} · {r.customerPhone}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{STATUS_AR[r.status]} · مكافأة {r.rewardAmount.toLocaleString("ar-IQ")} د.ع · {timeAgo(r.createdAt)}</p>
                  </div>
                  {isOwner && r.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => respondReferral(r.id, "completed")} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">إتمام</button>
                      <button onClick={() => respondReferral(r.id, "cancelled")} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-medium">إلغاء</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : tab === "lawyers" ? (
        lawyers.length === 0 ? <div className="text-center text-gray-400 py-16">لا يوجد محامون معتمدون بعد</div> : (
          <div className="grid sm:grid-cols-2 gap-4">
            {lawyers.map((l) => (
              <div key={l.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-800 dark:text-gray-100">{l.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${l.availability === "available" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>{l.availability === "available" ? "متاح" : "مشغول"}</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{l.specialization} · {l.city}</p>
                <p className="text-xs text-gray-300 mt-1">تقييم {l.rating.toFixed(1)} ({l.reviewCount})</p>
                <div className="flex gap-2 mt-3">
                  <a href={`tel:${l.phone}`} className="flex-1 text-center text-xs bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 py-2 rounded-lg font-medium">{l.phone}</a>
                  <button onClick={() => setContractTarget(l)} className="flex-1 flex items-center justify-center gap-1 text-xs bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 py-2 rounded-lg font-medium hover:bg-blue-100 transition">
                    <FileText className="w-3.5 h-3.5" /> طلب عقد
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        workshops.length === 0 ? <div className="text-center text-gray-400 py-16">لا توجد ورش مسجلة بعد</div> : (
          <div className="grid sm:grid-cols-2 gap-4">
            {workshops.map((w) => (
              <div key={w.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                <p className="font-bold text-gray-800 dark:text-gray-100">{w.name}</p>
                <p className="text-sm text-gray-400 mt-1">{w.specialty} · {w.city}</p>
                <a href={`tel:${w.phone}`} className="block text-center mt-3 text-xs bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 py-2 rounded-lg font-medium">{w.phone}</a>
              </div>
            ))}
          </div>
        )
      )}

      {referralTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setReferralTarget(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">إحالة زبون</h2>
              <button onClick={() => setReferralTarget(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={submitReferral} className="space-y-3">
              <input value={referralForm.customerName} onChange={(e) => setReferralForm({ ...referralForm, customerName: e.target.value })} placeholder="اسم الزبون" required className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <input value={referralForm.customerPhone} onChange={(e) => setReferralForm({ ...referralForm, customerPhone: e.target.value })} placeholder="هاتف الزبون" required className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <textarea value={referralForm.notes} onChange={(e) => setReferralForm({ ...referralForm, notes: e.target.value })} placeholder="ملاحظات" rows={2} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <button type="submit" className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition text-sm">إرسال الإحالة</button>
            </form>
          </div>
        </div>
      )}

      {dealTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDealTarget(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">إنشاء صفقة</h2>
              <button onClick={() => setDealTarget(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-xs text-gray-400 mb-3">{dealTarget.type} · {dealTarget.city}{dealTarget.area ? ` · ${dealTarget.area}` : ""}</p>
            <form onSubmit={submitDeal} className="space-y-3">
              <input value={dealForm.buyerName} onChange={(e) => setDealForm({ ...dealForm, buyerName: e.target.value })} placeholder="اسم المشتري" className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <input value={dealForm.buyerPhone} onChange={(e) => setDealForm({ ...dealForm, buyerPhone: e.target.value })} placeholder="هاتف المشتري" className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <input value={dealForm.price} onChange={(e) => setDealForm({ ...dealForm, price: e.target.value })} type="number" min="0" placeholder="سعر البيع" required className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <button type="submit" className="w-full bg-emerald-500 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 transition text-sm">إنشاء الصفقة</button>
            </form>
          </div>
        </div>
      )}

      {contractTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setContractTarget(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">طلب صياغة عقد — {contractTarget.name}</h2>
              <button onClick={() => setContractTarget(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={submitContractRequest} className="space-y-3">
              <select value={contractForm.contractType} onChange={(e) => setContractForm({ ...contractForm, contractType: e.target.value })} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm">
                {Object.entries(CONTRACT_TYPE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={contractForm.parties} onChange={(e) => setContractForm({ ...contractForm, parties: e.target.value })} placeholder="أطراف العقد" className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <textarea value={contractForm.details} onChange={(e) => setContractForm({ ...contractForm, details: e.target.value })} placeholder="تفاصيل إضافية" rows={2} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <button type="submit" className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition text-sm">إرسال الطلب</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
DALAL_FIX2_EOF_9f3a

echo ""
echo "تم تطبيق جميع الإصلاحات بنجاح ✅"
echo ""
echo "الخطوات التالية:"
echo "  1) pnpm install"
echo "  2) pnpm --filter @workspace/db run push   # يضيف الأعمدة: listings.monthly_rent و network_properties.seller_phone (وجعل referrals.property_id اختيارياً)"
echo "  3) pnpm run typecheck"
echo "  4) pnpm --filter @workspace/dalal-app run build && pnpm --filter @workspace/api-server run build"
