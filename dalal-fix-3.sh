#!/usr/bin/env bash
#
# dalal-fix-3.sh — التصحيح الثالث لتطبيق دلال العراق
#
# يطبّق ما يلي:
#   1) قائمة «قيد التدقيق» في لوحة الإدارة: تُجمع فيها جميع المنشورات (إعلانات
#      الأفراد العقارية وعقارات المكاتب) التي لم تُنشر للعامة بعد. إعلانات الأفراد
#      العقارية الجديدة تُنشأ تلقائياً بحالة «قيد التدقيق» ولا تظهر للعامة.
#   2) من القائمة يمكن للإدارة «طلب فحص + محادثة»: تختار محامياً فيُسند إليه
#      الفحص وتُفتح محادثة معه للتنسيق حول موعد ومكان المعاينة. وعند إتمام
#      المحامي للتقرير النهائي (الفحص + الوصف + القبول) يُنشر المنشور للعامة
#      تلقائياً ويُعلَم الناشر.
#   3) الناشر (فرد/مكتب) يرى أن منشوره «قيد التدقيق» في صفحة الإعلان وبطاقته.
#   4) خيار «طلب صياغة عقد» في لوحة الإدارة: تختار محامياً ونوع العقد فتُفتح
#      محادثة مباشرة بينك وبينه للتنسيق حول الموعد والمكان.
#   5) المحامون أصبحوا أطرافاً في المحادثات (تظهر أسماؤهم، ولهم رابط «المحادثات»
#      وتصلهم إشعارات الشبكة عند وصول رسائل الإدارة).
#
# آمن للتشغيل المتكرر: ينشئ نسخة احتياطية بامتداد .bak-dalal-fix-3 لكل ملف
# (مرة واحدة فقط) قبل استبداله. يعمل من جذر المستودع أو من أي مجلد فرعي.
#
# بعد التشغيل:
#   pnpm install
#   pnpm --filter @workspace/db run push      # يضيف العمود الجديد listings.audit_note
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

BACKUP_EXT=".bak-dalal-fix-3"

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

apply_file lib/db/src/schema/listings.ts <<'DALAL_FIX3_EOF_7c1e'
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
  // pending_audit: بانتظار تدقيق المحامي، لا يظهر للعامة. active: منشور. hidden/sold.
  status: text("status").notNull().default("active"),
  // وصف/خلاصة التدقيق التي يكتبها المحامي أو الإدارة عند قبول المنشور ونشره.
  auditNote: text("audit_note"),
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
DALAL_FIX3_EOF_7c1e

apply_file api-server/src/routes/admin.ts <<'DALAL_FIX3_EOF_7c1e'
import { Router } from "express";
import { eq, sql, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  listingsTable,
  usersTable,
  officesTable,
  lawyersTable,
  payoutRequestsTable,
  paymentsLedgerTable,
  inspectionRequestsTable,
  networkPropertiesTable,
  contractRequestsTable,
  chatsTable,
  messagesTable,
} from "@workspace/db";
import { authMiddleware, requireAdmin } from "../lib/auth";
import { createNotification, notifyNetwork, getAdminUserId } from "../lib/dalal";

const CONTRACT_TYPES = ["sale", "rent_to_own", "inheritance"];
const CONTRACT_TYPE_AR: Record<string, string> = {
  sale: "بيع",
  rent_to_own: "إيجار تمليكي",
  inheritance: "إرث",
};

// إنشاء (أو استرجاع) محادثة مباشرة بين الإدارة والمحامي وبثّ رسالة افتتاحية.
async function openAdminLawyerChat(adminId: string, lawyerId: string, text: string): Promise<string> {
  const [existing] = await db
    .select({ id: chatsTable.id })
    .from(chatsTable)
    .where(
      and(
        eq(chatsTable.senderId, adminId),
        eq(chatsTable.receiverId, lawyerId),
        sql`${chatsTable.listingId} is null`,
      ),
    )
    .limit(1);

  const chatId = existing?.id ?? randomUUID();
  if (!existing) {
    await db.insert(chatsTable).values({ id: chatId, listingId: null, senderId: adminId, receiverId: lawyerId });
  }
  await db.insert(messagesTable).values({ id: randomUUID(), chatId, userId: adminId, text });
  return chatId;
}

const router = Router();
router.use(authMiddleware, requireAdmin);

router.get("/stats", async (req, res) => {
  const [usersCount] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(usersTable);
  const [listingsCount] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(listingsTable);
  const [totalViewsRow] = await db.select({ total: sql<number>`cast(sum(views) as int)` }).from(listingsTable);

  const listings = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      price: listingsTable.price,
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
      userId: listingsTable.userId,
      createdAt: listingsTable.createdAt,
      user: {
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
      },
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.userId, usersTable.id))
    .orderBy(sql`${listingsTable.pinned} DESC, ${listingsTable.createdAt} DESC`)
    .limit(100);

  res.json({
    usersCount: usersCount.count,
    listingsCount: listingsCount.count,
    totalViews: totalViewsRow.total || 0,
    listings,
  });
});

router.patch("/listings/:id", async (req, res) => {
  const id = req.params.id as string;
  const { status, dealType, pinned, price, auditNote } = req.body;

  const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "الإعلان غير موجود" });
    return;
  }

  const updates: Partial<typeof listingsTable.$inferInsert> = {};

  if (auditNote !== undefined) {
    updates.auditNote = typeof auditNote === "string" ? auditNote.slice(0, 2000) : null;
  }

  if (price !== undefined) {
    const p = parseFloat(price);
    if (!Number.isFinite(p) || p < 0) {
      res.status(400).json({ error: "سعر غير صالح" });
      return;
    }
    if (p !== existing.price) {
      // Track the drop so the UI can show a "price reduced" badge.
      updates.price = p;
      updates.previousPrice = p < existing.price ? existing.price : null;
    }
  }

  if (status !== undefined) {
    if (!["active", "hidden", "pending_audit"].includes(status)) {
      res.status(400).json({ error: "حالة غير صالحة" });
      return;
    }
    updates.status = status;
  }

  if (dealType !== undefined) {
    if (!["للبيع", "للايجار", "مباع"].includes(dealType)) {
      res.status(400).json({ error: "تصنيف غير صالح" });
      return;
    }
    updates.dealType = dealType;
  }

  if (pinned !== undefined) {
    updates.pinned = Boolean(pinned);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا يوجد تغيير" });
    return;
  }

  await db.update(listingsTable).set(updates).where(eq(listingsTable.id, id));

  // Notify the owner when their listing's classification changes.
  try {
    if (updates.dealType && updates.dealType !== existing.dealType) {
      await createNotification({
        userId: existing.userId,
        type: "deal_type",
        title: "تم تحديث تصنيف إعلانك",
        body: `صنّفت إدارة شبكة دلال العراق إعلانك "${existing.title}" كـ ${updates.dealType}.`,
        link: `/listings/${id}`,
      });
    }
    if (updates.pinned === true && existing.pinned !== true) {
      await createNotification({
        userId: existing.userId,
        type: "pinned",
        title: "تم تثبيت إعلانك ⭐",
        body: `ثبّتت الإدارة إعلانك "${existing.title}" ليظهر في المقدمة.`,
        link: `/listings/${id}`,
      });
    }
    if (updates.status === "active" && existing.status === "pending_audit") {
      await createNotification({
        userId: existing.userId,
        type: "listing_approved",
        title: "تمت الموافقة على إعلانك",
        body: `اكتمل تدقيق إعلانك "${existing.title}" وأصبح منشوراً للعامة.`,
        link: `/listings/${id}`,
      });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to notify owner about listing update");
  }

  res.json({ ok: true });
});

// قائمة "قيد التدقيق" — جميع المنشورات (إعلانات الأفراد وعقارات المكاتب) التي لم
// تُنشر للعامة بعد، مع حالة الفحص القانوني والمحامي المُسند إن وُجد.
router.get("/pending-audit", async (req, res) => {
  const listings = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      price: listingsTable.price,
      category: listingsTable.category,
      type: listingsTable.type,
      city: listingsTable.city,
      images: listingsTable.images,
      createdAt: listingsTable.createdAt,
      ownerName: usersTable.name,
      ownerPhone: usersTable.phone,
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.userId, usersTable.id))
    .where(eq(listingsTable.status, "pending_audit"))
    .orderBy(sql`${listingsTable.createdAt} DESC`);

  const networkProps = await db
    .select({
      id: networkPropertiesTable.id,
      type: networkPropertiesTable.type,
      price: networkPropertiesTable.price,
      city: networkPropertiesTable.city,
      images: networkPropertiesTable.images,
      createdAt: networkPropertiesTable.createdAt,
      inspectionReportUrl: networkPropertiesTable.inspectionReportUrl,
      officeName: officesTable.name,
      officePhone: officesTable.phone,
    })
    .from(networkPropertiesTable)
    .leftJoin(officesTable, eq(networkPropertiesTable.officeId, officesTable.id))
    .where(eq(networkPropertiesTable.status, "pending_audit"))
    .orderBy(sql`${networkPropertiesTable.createdAt} DESC`);

  const ids = [...listings.map((l) => l.id), ...networkProps.map((n) => n.id)];
  const requests = ids.length
    ? await db
        .select({
          propertyId: inspectionRequestsTable.propertyId,
          status: inspectionRequestsTable.status,
          lawyerId: inspectionRequestsTable.lawyerId,
          lawyerName: lawyersTable.name,
        })
        .from(inspectionRequestsTable)
        .leftJoin(lawyersTable, eq(inspectionRequestsTable.lawyerId, lawyersTable.id))
        .where(inArray(inspectionRequestsTable.propertyId, ids))
    : [];

  const byProp = new Map<string, { status: string; lawyerId: string | null; lawyerName: string | null }>();
  for (const r of requests) {
    if (r.propertyId) byProp.set(r.propertyId, { status: r.status, lawyerId: r.lawyerId, lawyerName: r.lawyerName });
  }

  res.json({
    items: [
      ...listings.map((l) => ({
        kind: "listing" as const,
        id: l.id,
        title: l.title,
        price: l.price,
        category: l.category,
        type: l.type,
        city: l.city,
        images: l.images,
        createdAt: l.createdAt,
        publisherName: l.ownerName,
        publisherPhone: l.ownerPhone,
        inspection: byProp.get(l.id) ?? null,
      })),
      ...networkProps.map((n) => ({
        kind: "network" as const,
        id: n.id,
        title: `${n.type} - ${n.city}`,
        price: n.price,
        category: "عقارات",
        type: n.type,
        city: n.city,
        images: n.images,
        createdAt: n.createdAt,
        publisherName: n.officeName,
        publisherPhone: n.officePhone,
        inspectionReportUrl: n.inspectionReportUrl,
        inspection: byProp.get(n.id) ?? null,
      })),
    ],
  });
});

// طلب فحص قانوني — تُسند الإدارة منشوراً قيد التدقيق إلى محامٍ وتفتح محادثة معه.
router.post("/audit/assign-lawyer", async (req, res) => {
  const { targetType, targetId, lawyerId, tier, note } = req.body as {
    targetType?: string;
    targetId?: string;
    lawyerId?: string;
    tier?: string;
    note?: string;
  };

  if (!targetId || (targetType !== "listing" && targetType !== "network")) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }
  if (!lawyerId) {
    res.status(400).json({ error: "اختر محامياً" });
    return;
  }

  const [lawyer] = await db
    .select({ id: lawyersTable.id, name: lawyersTable.name })
    .from(lawyersTable)
    .where(eq(lawyersTable.id, lawyerId))
    .limit(1);
  if (!lawyer) {
    res.status(404).json({ error: "المحامي غير موجود" });
    return;
  }

  const adminId = await getAdminUserId();
  if (!adminId) {
    res.status(500).json({ error: "تعذر تحديد حساب الإدارة" });
    return;
  }

  const cleanTier = tier && ["silver", "gold", "diamond"].includes(tier) ? tier : "gold";

  const [request] = await db
    .insert(inspectionRequestsTable)
    .values({
      id: randomUUID(),
      propertyId: targetId,
      requestedByType: "admin",
      requestedById: adminId,
      lawyerId,
      tier: cleanTier,
      status: "accepted",
    })
    .returning();

  const chatId = await openAdminLawyerChat(
    adminId,
    lawyerId,
    note?.trim() ||
      `مرحباً أستاذ ${lawyer.name}، نرجو فحص المنشور المطلوب قانونياً وكتابة الوصف، ثم قبوله لنشره للعامة. للتنسيق حول موعد ومكان المعاينة يمكننا التواصل هنا.`,
  );

  await notifyNetwork({
    recipientType: "lawyer",
    recipientId: lawyerId,
    type: "inspection_request",
    title: "طلب فحص قانوني جديد",
    body: "أسندت إليك إدارة شبكة دلال العراق فحص منشور جديد.",
    link: "/lawyer/inspections",
  });

  res.status(201).json({ request, chatId });
});

// طلب صياغة عقد — تختار الإدارة محامياً وتفتح محادثة معه للتنسيق حول الموعد والمكان.
router.post("/contract-requests", async (req, res) => {
  const { lawyerId, contractType, requesterName, requesterPhone, details, note } = req.body as Record<string, string>;

  const type = contractType && CONTRACT_TYPES.includes(contractType) ? contractType : "sale";
  if (!lawyerId) {
    res.status(400).json({ error: "اختر محامياً" });
    return;
  }

  const [lawyer] = await db
    .select({ id: lawyersTable.id, name: lawyersTable.name })
    .from(lawyersTable)
    .where(eq(lawyersTable.id, lawyerId))
    .limit(1);
  if (!lawyer) {
    res.status(404).json({ error: "المحامي غير موجود" });
    return;
  }

  const adminId = await getAdminUserId();
  if (!adminId) {
    res.status(500).json({ error: "تعذر تحديد حساب الإدارة" });
    return;
  }

  const [request] = await db
    .insert(contractRequestsTable)
    .values({
      id: randomUUID(),
      requestedByType: "admin",
      requestedById: adminId,
      requesterName: requesterName?.trim() || "شبكة دلال العراق",
      requesterPhone: requesterPhone?.trim() || null,
      contractType: type,
      lawyerId,
      details: details?.trim() || null,
      status: "in_progress",
    })
    .returning();

  const chatId = await openAdminLawyerChat(
    adminId,
    lawyerId,
    note?.trim() ||
      `مرحباً أستاذ ${lawyer.name}، نطلب منك صياغة عقد (${CONTRACT_TYPE_AR[type]}). نرجو التنسيق هنا حول الموعد ومكان اللقاء ومتى يمكنك الحضور.`,
  );

  await notifyNetwork({
    recipientType: "lawyer",
    recipientId: lawyerId,
    type: "contract_request",
    title: "طلب صياغة عقد جديد",
    body: `وصلك طلب صياغة عقد (${CONTRACT_TYPE_AR[type]}) من إدارة شبكة دلال العراق.`,
    link: "/lawyer/contracts",
  });

  res.status(201).json({ request, chatId });
});

router.get("/network-overview", async (req, res) => {
  const [officesCount] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(officesTable);
  const [lawyersCount] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(lawyersTable);
  const [pendingPayouts] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(payoutRequestsTable)
    .where(eq(payoutRequestsTable.status, "pending"));
  const [pendingInspections] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(inspectionRequestsTable)
    .where(eq(inspectionRequestsTable.status, "new"));
  res.json({
    officesCount: officesCount.count,
    lawyersCount: lawyersCount.count,
    pendingPayouts: pendingPayouts.count,
    pendingInspections: pendingInspections.count,
  });
});

router.get("/payout-requests", async (req, res) => {
  const requests = await db
    .select({
      request: payoutRequestsTable,
      officeName: officesTable.name,
      lawyerName: lawyersTable.name,
    })
    .from(payoutRequestsTable)
    .leftJoin(officesTable, eq(payoutRequestsTable.payeeId, officesTable.id))
    .leftJoin(lawyersTable, eq(payoutRequestsTable.payeeId, lawyersTable.id))
    .orderBy(sql`${payoutRequestsTable.requestedAt} DESC`);
  res.json({
    requests: requests.map((r) => ({
      ...r.request,
      payeeName: r.officeName || r.lawyerName || r.request.payeeId,
    })),
  });
});

router.patch("/payout-requests/:id", async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body as { status?: string };
  if (!status || !["approved", "paid"].includes(status)) {
    res.status(400).json({ error: "حالة غير صالحة" });
    return;
  }
  const [existing] = await db.select().from(payoutRequestsTable).where(eq(payoutRequestsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  const [updated] = await db
    .update(payoutRequestsTable)
    .set({ status, resolvedAt: status === "paid" ? (sql`now()` as unknown as Date) : existing.resolvedAt })
    .where(eq(payoutRequestsTable.id, id))
    .returning();

  if (status === "paid") {
    // يُسدَّد المبلغ بالكامل، فتُعلَّم كل مستحقات هذا المكتب/المحامي المعلّقة كمدفوعة.
    await db
      .update(paymentsLedgerTable)
      .set({ status: "paid" })
      .where(
        sql`${paymentsLedgerTable.payeeType} = ${existing.payeeType} and ${paymentsLedgerTable.payeeId} = ${existing.payeeId} and ${paymentsLedgerTable.status} = 'pending'`,
      );
  }

  await notifyNetwork({
    recipientType: existing.payeeType as "office" | "lawyer",
    recipientId: existing.payeeId,
    type: "payout_status",
    title: status === "approved" ? "تمت الموافقة على طلب السحب" : "تم صرف مستحقاتك",
    body:
      status === "approved"
        ? "وافقت الإدارة على طلب سحب مستحقاتك وسيتم الصرف قريباً."
        : `تم صرف مبلغ ${existing.amount.toLocaleString("ar-IQ")} د.ع إلى حسابك.`,
  });

  res.json(updated);
});

router.post("/offices/:id/reset-password", async (req, res) => {
  const id = req.params.id as string;
  const bcrypt = await import("bcryptjs");
  const { generateRandomPassword } = await import("../lib/auth");
  const plainPassword = generateRandomPassword();
  const hashed = await bcrypt.default.hash(plainPassword, 10);
  const [office] = await db
    .update(officesTable)
    .set({ password: hashed, mustChangePassword: true })
    .where(eq(officesTable.id, id))
    .returning();
  if (!office) {
    res.status(404).json({ error: "المكتب غير موجود" });
    return;
  }
  res.json({ id, password: plainPassword });
});

router.post("/lawyers/:id/reset-password", async (req, res) => {
  const id = req.params.id as string;
  const bcrypt = await import("bcryptjs");
  const { generateRandomPassword } = await import("../lib/auth");
  const plainPassword = generateRandomPassword();
  const hashed = await bcrypt.default.hash(plainPassword, 10);
  const [lawyer] = await db
    .update(lawyersTable)
    .set({ password: hashed, mustChangePassword: true })
    .where(eq(lawyersTable.id, id))
    .returning();
  if (!lawyer) {
    res.status(404).json({ error: "المحامي غير موجود" });
    return;
  }
  res.json({ id, password: plainPassword });
});

export default router;
DALAL_FIX3_EOF_7c1e

apply_file api-server/src/routes/chats.ts <<'DALAL_FIX3_EOF_7c1e'
import { Router } from "express";
import { eq, or, and, sql, isNull, inArray } from "drizzle-orm";
import { db, chatsTable, messagesTable, listingsTable, usersTable, officesTable, lawyersTable, referralsTable } from "@workspace/db";
import { authMiddleware } from "../lib/auth";
import { getAdminUserId, createNotification, notifyNetwork } from "../lib/dalal";
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
  // المحامون أيضاً ليسوا في usersTable — نبحث عنهم في lawyersTable.
  const [l] = await db
    .select({ id: lawyersTable.id, name: lawyersTable.name, phone: lawyersTable.phone })
    .from(lawyersTable)
    .where(eq(lawyersTable.id, id))
    .limit(1);
  if (l) return { id: l.id, name: l.name, phone: l.phone };
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

  // رسائل المكاتب/المحامين لا تُطابق usersTable — نكمل أسماءها من officesTable وlawyersTable.
  const missingIds = messages.filter((m) => !m.user?.id).map((m) => m.userId);
  const nameMap = new Map<string, string>();
  if (missingIds.length > 0) {
    const [offices, lawyers] = await Promise.all([
      db.select({ id: officesTable.id, name: officesTable.name }).from(officesTable).where(inArray(officesTable.id, missingIds)),
      db.select({ id: lawyersTable.id, name: lawyersTable.name }).from(lawyersTable).where(inArray(lawyersTable.id, missingIds)),
    ]);
    for (const o of offices) nameMap.set(o.id, o.name);
    for (const l of lawyers) nameMap.set(l.id, l.name);
  }
  const out = messages.map((m) =>
    m.user?.id ? m : { ...m, user: { id: m.userId, name: nameMap.get(m.userId) ?? "مستخدم" } },
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
    const title = fromAdmin ? `رسالة من ${DALAL_NAME}` : `رسالة جديدة من ${user?.name || "مستخدم"}`;
    // المحامون يستخدمون إشعارات الشبكة، فنُعلمهم عبرها؛ وغيرهم عبر إشعارات المستخدمين.
    const [recipientLawyer] = await db
      .select({ id: lawyersTable.id })
      .from(lawyersTable)
      .where(eq(lawyersTable.id, recipientId))
      .limit(1);
    if (recipientLawyer) {
      await notifyNetwork({ recipientType: "lawyer", recipientId, type: "message", title, body: preview, link });
    } else {
      await createNotification({ userId: recipientId, type: "message", title, body: preview, link });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to create message notification");
  }

  res.status(201).json({ ...msg, user });
});

export default router;
DALAL_FIX3_EOF_7c1e

apply_file api-server/src/routes/inspections.ts <<'DALAL_FIX3_EOF_7c1e'
import { Router } from "express";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  inspectionRequestsTable,
  inspectionReportsTable,
  networkPropertiesTable,
  listingsTable,
  lawyersTable,
} from "@workspace/db";
import { authMiddleware, requireRole } from "../lib/auth";
import { notifyNetwork, createNotification } from "../lib/dalal";

const router = Router();

const TIERS = ["silver", "gold", "diamond"];

// إرسال طلب فحص قانوني — من مكتب أو مستخدم عادي.
router.post("/requests", authMiddleware, requireRole("office", "user"), async (req, res) => {
  const { propertyId, lawyerId, tier } = req.body as { propertyId?: string; lawyerId?: string; tier?: string };
  if (!tier || !TIERS.includes(tier)) {
    res.status(400).json({ error: "درجة الفحص غير صالحة" });
    return;
  }
  if (lawyerId) {
    const [lawyer] = await db.select({ id: lawyersTable.id }).from(lawyersTable).where(eq(lawyersTable.id, lawyerId)).limit(1);
    if (!lawyer) {
      res.status(404).json({ error: "المحامي غير موجود" });
      return;
    }
  }
  const [request] = await db
    .insert(inspectionRequestsTable)
    .values({
      id: randomUUID(),
      propertyId: propertyId || null,
      requestedByType: req.user!.role,
      requestedById: req.user!.userId,
      lawyerId: lawyerId || null,
      tier,
      status: "new",
    })
    .returning();
  if (lawyerId) {
    await notifyNetwork({
      recipientType: "lawyer",
      recipientId: lawyerId,
      type: "inspection_request",
      title: "طلب فحص قانوني جديد",
      body: `وصلك طلب فحص قانوني بدرجة ${tier === "silver" ? "فضية" : tier === "gold" ? "ذهبية" : "ماسية"}.`,
      link: "/lawyer/inspections",
    });
  }
  res.status(201).json(request);
});

router.get("/requests/sent", authMiddleware, requireRole("office", "user"), async (req, res) => {
  const requests = await db
    .select()
    .from(inspectionRequestsTable)
    .where(and(eq(inspectionRequestsTable.requestedByType, req.user!.role), eq(inspectionRequestsTable.requestedById, req.user!.userId)))
    .orderBy(sql`${inspectionRequestsTable.createdAt} DESC`);
  res.json({ requests });
});

// قائمة الطلبات — للمحامي: الطلبات الموجهة له تحديداً + الطلبات المفتوحة لكل المحامين.
router.get("/requests", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const lawyerId = req.user!.userId;
  const requests = await db
    .select()
    .from(inspectionRequestsTable)
    .where(
      or(
        eq(inspectionRequestsTable.lawyerId, lawyerId),
        and(isNull(inspectionRequestsTable.lawyerId), eq(inspectionRequestsTable.status, "new")),
      ),
    )
    .orderBy(sql`${inspectionRequestsTable.createdAt} DESC`);
  res.json({ requests });
});

router.patch("/requests/:id/accept", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const id = req.params.id as string;
  const lawyerId = req.user!.userId;
  const [request] = await db.select().from(inspectionRequestsTable).where(eq(inspectionRequestsTable.id, id)).limit(1);
  if (!request || (request.lawyerId && request.lawyerId !== lawyerId) || request.status !== "new") {
    res.status(404).json({ error: "الطلب غير متاح" });
    return;
  }
  const [updated] = await db
    .update(inspectionRequestsTable)
    .set({ lawyerId, status: "accepted", updatedAt: sql`now()` as unknown as Date })
    .where(eq(inspectionRequestsTable.id, id))
    .returning();
  await notifyNetwork({
    recipientType: request.requestedByType as "office" | "lawyer",
    recipientId: request.requestedById,
    type: "inspection_accepted",
    title: "تم قبول طلب الفحص",
    body: "قبل أحد المحامين المعتمدين طلب الفحص القانوني الخاص بك وسيبدأ العمل عليه.",
  });
  res.json(updated);
});

router.patch("/requests/:id/reject", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const id = req.params.id as string;
  const lawyerId = req.user!.userId;
  const { reason } = req.body as { reason?: string };
  const [request] = await db.select().from(inspectionRequestsTable).where(eq(inspectionRequestsTable.id, id)).limit(1);
  if (!request || (request.lawyerId && request.lawyerId !== lawyerId)) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  const [updated] = await db
    .update(inspectionRequestsTable)
    .set({ status: "rejected", rejectionReason: reason?.trim() || null, updatedAt: sql`now()` as unknown as Date })
    .where(eq(inspectionRequestsTable.id, id))
    .returning();
  await notifyNetwork({
    recipientType: request.requestedByType as "office" | "lawyer",
    recipientId: request.requestedById,
    type: "inspection_rejected",
    title: "تم رفض طلب الفحص",
    body: reason ? `سبب الرفض: ${reason}` : "تم رفض طلب الفحص القانوني.",
  });
  res.json(updated);
});

// ---------- تقرير الفحص ----------

router.get("/reports/:requestId", authMiddleware, requireRole("lawyer", "office", "user"), async (req, res) => {
  const requestId = req.params.requestId as string;
  const [request] = await db.select().from(inspectionRequestsTable).where(eq(inspectionRequestsTable.id, requestId)).limit(1);
  if (!request) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  const isOwnerLawyer = req.user!.role === "lawyer" && req.user!.userId === request.lawyerId;
  const isRequester = req.user!.role === request.requestedByType && req.user!.userId === request.requestedById;
  if (!isOwnerLawyer && !isRequester) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const [report] = await db.select().from(inspectionReportsTable).where(eq(inspectionReportsTable.requestId, requestId)).limit(1);
  res.json({ request, report: report || null });
});

router.put("/reports/:requestId", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const requestId = req.params.requestId as string;
  const lawyerId = req.user!.userId;
  const [request] = await db.select().from(inspectionRequestsTable).where(eq(inspectionRequestsTable.id, requestId)).limit(1);
  if (!request || request.lawyerId !== lawyerId) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const isDraft = body.isDraft !== false;

  const fields = {
    aurScreenshotUrl: typeof body.aurScreenshotUrl === "string" ? body.aurScreenshotUrl : null,
    aurNotes: typeof body.aurNotes === "string" ? body.aurNotes.slice(0, 2000) : null,
    ownershipChainText: typeof body.ownershipChainText === "string" ? body.ownershipChainText.slice(0, 2000) : null,
    ownershipDocs: Array.isArray(body.ownershipDocs) ? body.ownershipDocs.slice(0, 15).map(String) : [],
    liensText: typeof body.liensText === "string" ? body.liensText.slice(0, 2000) : null,
    liensProofs: Array.isArray(body.liensProofs) ? body.liensProofs.slice(0, 15).map(String) : [],
    financialDuesReceipts: Array.isArray(body.financialDuesReceipts) ? body.financialDuesReceipts.slice(0, 15).map(String) : [],
    easementsText: typeof body.easementsText === "string" ? body.easementsText.slice(0, 2000) : null,
    easementsImages: Array.isArray(body.easementsImages) ? body.easementsImages.slice(0, 15).map(String) : [],
    finalVerdict: typeof body.finalVerdict === "string" ? body.finalVerdict : null,
    responsibilityAccepted: Boolean(body.responsibilityAccepted),
    isDraft,
  };

  if (!isDraft && !fields.responsibilityAccepted) {
    res.status(400).json({ error: "يجب الموافقة على تحمل المسؤولية القانونية قبل إرسال التقرير النهائي" });
    return;
  }
  if (!isDraft && !fields.finalVerdict) {
    res.status(400).json({ error: "يجب اختيار التوصية النهائية قبل إرسال التقرير" });
    return;
  }

  const [existing] = await db.select().from(inspectionReportsTable).where(eq(inspectionReportsTable.requestId, requestId)).limit(1);

  let reportId = existing?.id;
  if (existing) {
    await db
      .update(inspectionReportsTable)
      .set({
        ...fields,
        submittedAt: !isDraft ? (sql`now()` as unknown as Date) : existing.submittedAt,
        updatedAt: sql`now()` as unknown as Date,
      })
      .where(eq(inspectionReportsTable.id, existing.id));
  } else {
    reportId = randomUUID();
    await db.insert(inspectionReportsTable).values({
      id: reportId,
      requestId,
      ...fields,
      submittedAt: !isDraft ? (sql`now()` as unknown as Date) : null,
    });
  }

  if (!isDraft) {
    const pdfUrl = `/inspection-report/${requestId}`;
    await db.update(inspectionReportsTable).set({ pdfUrl }).where(eq(inspectionReportsTable.id, reportId!));
    await db
      .update(inspectionRequestsTable)
      .set({ status: "closed", updatedAt: sql`now()` as unknown as Date })
      .where(eq(inspectionRequestsTable.id, requestId));
    // القبول = توصية «سليم» أو «بحاجة لحذر». «غير موصى به» لا يُنشر للعامة.
    const approved = fields.finalVerdict === "clear" || fields.finalVerdict === "caution";
    const verdictNote =
      fields.finalVerdict === "clear"
        ? "سليم — تمت مطابقة الملكية والمستندات."
        : fields.finalVerdict === "caution"
          ? "مقبول مع ملاحظات، يرجى مراجعة تفاصيل الفحص."
          : "غير موصى به — لم يجتز الفحص القانوني.";
    const description = [verdictNote, fields.ownershipChainText, fields.aurNotes]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 2000);
    if (request.propertyId) {
      // عقار مكتب: نحفظ رابط التقرير، ونحوّله إلى «متاح» عند القبول فقط.
      await db
        .update(networkPropertiesTable)
        .set(approved ? { inspectionReportUrl: pdfUrl, status: "available" } : { inspectionReportUrl: pdfUrl })
        .where(eq(networkPropertiesTable.id, request.propertyId));

      // إعلان فرد «قيد التدقيق»: يُنشر للعامة عند القبول فقط، وإلا يبقى قيد التدقيق.
      const [listing] = await db
        .select({ id: listingsTable.id, userId: listingsTable.userId, title: listingsTable.title })
        .from(listingsTable)
        .where(eq(listingsTable.id, request.propertyId))
        .limit(1);
      if (listing) {
        await db
          .update(listingsTable)
          .set({
            status: approved ? "active" : "pending_audit",
            verified: approved,
            auditNote: description,
            updatedAt: sql`now()` as unknown as Date,
          })
          .where(eq(listingsTable.id, listing.id));
        await createNotification({
          userId: listing.userId,
          type: approved ? "listing_approved" : "listing_rejected",
          title: approved ? "تمت الموافقة على إعلانك" : "إعلانك بحاجة لمراجعة",
          body: approved
            ? `اكتمل الفحص القانوني لإعلانك "${listing.title}" وأصبح منشوراً للعامة.`
            : `راجع المحامي إعلانك "${listing.title}" ولم يُنشر بعد. ${verdictNote}`,
          link: `/listings/${listing.id}`,
        });
      }
    }
    await notifyNetwork({
      recipientType: request.requestedByType as "office" | "lawyer" | "admin",
      recipientId: request.requestedById,
      type: "inspection_report_ready",
      title: "تقرير الفحص القانوني جاهز",
      body: "أنهى المحامي تقرير الفحص القانوني وأصبح متاحاً للعرض.",
      link: pdfUrl,
    });
  } else {
    await db
      .update(inspectionRequestsTable)
      .set({ status: "in_progress", updatedAt: sql`now()` as unknown as Date })
      .where(eq(inspectionRequestsTable.id, requestId));
  }

  const [report] = await db.select().from(inspectionReportsTable).where(eq(inspectionReportsTable.requestId, requestId)).limit(1);
  res.json(report);
});

export default router;
DALAL_FIX3_EOF_7c1e

apply_file api-server/src/routes/listings.ts <<'DALAL_FIX3_EOF_7c1e'
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
      auditNote: listingsTable.auditNote,
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
  // العقارات تمر بمرحلة "قيد التدقيق" (فحص قانوني) قبل نشرها للعامة. المنشورات
  // من الإدارة تُنشر مباشرة، وبقية التصنيفات (سيارات..) لا تحتاج تدقيقاً قانونياً.
  const initialStatus = category === "عقارات" && req.user!.role !== "admin" ? "pending_audit" : "active";
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
    status: initialStatus,
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
        text: initialStatus === "pending_audit"
          ? `مرحباً، شكراً لنشر إعلانك "${title.trim()}" عبر شبكة دلال العراق. إعلانك الآن "قيد التدقيق" وسيقوم أحد محامينا بفحصه قانونياً قبل نشره للعامة. سنعلمك فور اكتمال الفحص. 🤝`
          : `مرحباً، شكراً لنشر إعلانك "${title.trim()}" عبر شبكة دلال العراق. فريقنا سيتواصل معك لمتابعة عرضه وتسويقه. الاستشارة مجانية ونحن وسيطك الموثوق. 🤝`,
      });
      await createNotification({
        userId: adminId,
        type: "new_listing",
        title: initialStatus === "pending_audit" ? "إعلان جديد قيد التدقيق" : "إعلان جديد بانتظار التصنيف",
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
DALAL_FIX3_EOF_7c1e

apply_file dalal-app/src/components/listing-card.tsx <<'DALAL_FIX3_EOF_7c1e'
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
  const pendingAudit = listing.status === "pending_audit";
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

        {pendingAudit && !sold && (
          <div className="absolute inset-0 bg-black/35 flex items-center justify-center z-10 pointer-events-none">
            <span className="bg-amber-500 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-sm">
              قيد التدقيق
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
DALAL_FIX3_EOF_7c1e

apply_file dalal-app/src/components/navigation.tsx <<'DALAL_FIX3_EOF_7c1e'
import { Link, useLocation } from "wouter";
import { Home, Search, Plus, MessageCircle, User, Bell, Moon, Sun, Globe, Building2, Scale, LogOut, LayoutGrid, Wallet } from "lucide-react";
import { api, getUser, clearToken } from "@/lib/api";
import { LOGO_URL } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useI18n, useT, LANGS } from "@/lib/i18n";
import { useState, useEffect, useRef } from "react";

interface UserInfo { userId: string; phone: string; name: string; role: string }

export function Navigation() {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const { lang, setLang } = useI18n();
  const t = useT();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [unread, setUnread] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    setUser(getUser());
    const onStorage = () => setUser(getUser());
    window.addEventListener("storage", onStorage);
    window.addEventListener("auth-change", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("auth-change", onStorage);
    };
  }, []);

  const isNetworkRole = user?.role === "office" || user?.role === "lawyer";

  useEffect(() => {
    if (!user || isNetworkRole) { setUnread(0); setUnreadMessages(0); return; }
    let active = true;
    const poll = () => {
      api.get<{ count: number }>("/notifications/unread-count")
        .then((d) => { if (active) setUnread(d.count); })
        .catch(() => {});
      api.get<{ count: number }>("/notifications/unread-count?type=message")
        .then((d) => { if (active) setUnreadMessages(d.count); })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 30_000);
    const onRead = () => poll();
    window.addEventListener("notifications-read", onRead);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("notifications-read", onRead);
    };
  }, [user, location, isNetworkRole]);

  useEffect(() => {
    if (!user || !isNetworkRole) return;
    let active = true;
    const poll = () => {
      api.get<{ count: number }>("/network-notifications/unread-count")
        .then((d) => { if (active) setUnread(d.count); })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 30_000);
    window.addEventListener("notifications-read", poll);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("notifications-read", poll);
    };
  }, [user, isNetworkRole]);

  function handleLogout() {
    clearToken();
    window.dispatchEvent(new Event("auth-change"));
    window.location.href = user?.role === "office" ? "/office/login" : "/lawyer/login";
  }

  const nav = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/listings", icon: Search, label: t("nav.listings") },
    { href: "/add-listing", icon: Plus, label: t("nav.add") },
    { href: "/chat", icon: MessageCircle, label: t("nav.chat") },
    { href: "/profile", icon: User, label: t("nav.profile") },
  ];

  const officeNav = [
    { href: "/office", icon: LayoutGrid, label: "لوحتي" },
    { href: "/office/network", icon: Search, label: "الشبكة" },
    { href: "/office/deals", icon: Building2, label: "صفقاتي" },
    { href: "/office/wallet", icon: User, label: "المحفظة" },
    { href: "/network-notifications-page", icon: Bell, label: "الإشعارات" },
  ];

  const lawyerNav = [
    { href: "/lawyer", icon: LayoutGrid, label: "لوحتي" },
    { href: "/lawyer/inspections", icon: Scale, label: "الفحوصات" },
    { href: "/lawyer/contracts", icon: Building2, label: "العقود" },
    { href: "/chat", icon: MessageCircle, label: "المحادثات" },
    { href: "/lawyer/wallet", icon: Wallet, label: "المحفظة" },
    { href: "/network-notifications-page", icon: Bell, label: "الإشعارات" },
  ];

  if (isNetworkRole) {
    const navItems = user!.role === "office" ? officeNav : lawyerNav;
    return (
      <>
        <header className="bg-white dark:bg-gray-900 shadow-sm sticky top-0 z-50 border-b border-gray-100 dark:border-gray-800">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href={user!.role === "office" ? "/office" : "/lawyer"} className="font-bold text-xl text-orange-500 flex items-center gap-2">
              <img src={LOGO_URL} alt="دلال العراق" className="w-9 h-9 rounded-lg object-cover" />
              <span className="hidden sm:inline">شبكة دلال العراق</span>
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:flex items-center gap-1.5">
                {user!.role === "office" ? <Building2 className="w-4 h-4 text-orange-500" /> : <Scale className="w-4 h-4 text-orange-500" />}
                {user!.name} <span className="text-gray-300 dark:text-gray-600">({user!.userId})</span>
              </span>
              <button
                type="button"
                onClick={toggle}
                aria-label={t("nav.darkMode")}
                className="text-gray-400 hover:text-orange-500 transition p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-gray-800"
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="text-gray-400 hover:text-red-500 transition p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-gray-800"
                aria-label="تسجيل الخروج"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 safe-area-inset-bottom">
          <div className="flex justify-around max-w-lg mx-auto">
            {navItems.map(({ href, icon: Icon, label }) => {
              const active = location === href || (href !== "/office" && href !== "/lawyer" && location.startsWith(href));
              const showDot = label === "الإشعارات" && unread > 0;
              return (
                <Link key={href} href={href} className={`flex flex-col items-center py-2 px-2 flex-1 transition ${active ? "text-orange-500" : "text-gray-400"}`}>
                  <div className="relative">
                    <Icon className={`w-5 h-5 ${active ? "text-orange-500" : ""}`} />
                    {showDot && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-900" />}
                  </div>
                  <span className="text-xs mt-0.5">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </>
    );
  }

  return (
    <>
      {/* Top bar */}
      <header className="bg-white dark:bg-gray-900 shadow-sm sticky top-0 z-50 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-orange-500 flex items-center gap-2">
            <img src={LOGO_URL} alt="دلال العراق" className="w-9 h-9 rounded-lg object-cover" />
            دلال العراق
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link href="/notifications" className="relative text-gray-400 hover:text-orange-500 transition p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-gray-800">
                  <Bell className="w-5 h-5" />
                  {unread > 0 && (
                    <span className="absolute top-0 left-0 bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
                <Link href="/profile" className="w-9 h-9 bg-orange-100 dark:bg-orange-950 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold text-sm hover:bg-orange-200 dark:hover:bg-orange-900 transition">
                  {user.name?.charAt(0) || user.phone?.slice(-2)}
                </Link>
              </>
            ) : (
              <>
                <div className="relative" ref={langRef}>
                  <button
                    type="button"
                    onClick={() => setLangOpen((o) => !o)}
                    aria-label={t("nav.language")}
                    className="text-gray-400 hover:text-orange-500 transition p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-gray-800 flex items-center gap-1"
                  >
                    <Globe className="w-5 h-5" />
                    <span className="text-xs font-medium uppercase">{lang}</span>
                  </button>
                  {langOpen && (
                    <div className="absolute end-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-50">
                      {LANGS.map((l) => (
                        <button
                          key={l.code}
                          type="button"
                          onClick={() => { setLang(l.code); setLangOpen(false); }}
                          className={`w-full text-start px-3 py-2 text-sm flex items-center gap-2 hover:bg-orange-50 dark:hover:bg-gray-700 transition ${
                            lang === l.code ? "text-orange-500 font-semibold" : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          <span>{l.flag}</span>
                          {l.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={t("nav.darkMode")}
                  className="text-gray-400 hover:text-orange-500 transition p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-gray-800"
                >
                  {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <Link href="/login" className="bg-orange-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-600 transition">
                  {t("nav.login")}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 safe-area-inset-bottom">
        <div className="flex justify-around max-w-lg mx-auto">
          {nav.map(({ href, icon: Icon, label }) => {
            const active = location === href || (href !== "/" && location.startsWith(href));
            const showMsgDot = href === "/chat" && unreadMessages > 0 && user;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center py-2 px-2 flex-1 transition ${
                  active ? "text-orange-500" : "text-gray-400"
                }`}
              >
                {href === "/add-listing" ? (
                  <div className="w-11 h-11 bg-orange-500 rounded-full flex items-center justify-center -mt-5 shadow-lg shadow-orange-200">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                ) : (
                  <div className="relative">
                    <Icon className={`w-5 h-5 ${active ? "text-orange-500" : ""}`} />
                    {showMsgDot && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-900" />
                    )}
                  </div>
                )}
                <span className={`text-xs mt-0.5 ${href === "/add-listing" ? "mt-1" : ""}`}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
DALAL_FIX3_EOF_7c1e

apply_file dalal-app/src/pages/admin.tsx <<'DALAL_FIX3_EOF_7c1e'
import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Building2, Users, Eye, Trash2, CheckCircle, XCircle, Handshake, Plus, MapPin, Phone, Loader2, Pin, Flag, Scale, Wallet, KeyRound, Ban, PlayCircle, QrCode, X, Download, Map } from "lucide-react";
import { formatPrice, timeAgo, CITIES, DEAL_TYPES } from "@/lib/utils";
import { api, getUser, mediaUrl } from "@/lib/api";
import { ListingItem } from "@/components/listing-card";
import { LocationPicker } from "@/components/location-picker";

const SPECIALIZATIONS = ["عقاري", "تجاري", "إرث وتوزيع تركات", "عام"];

const CONTRACT_TYPE_OPTIONS = [
  { id: "sale", label: "عقد بيع" },
  { id: "rent_to_own", label: "عقد إيجار تمليكي" },
  { id: "inheritance", label: "عقد إرث/تركة" },
];

const INSPECTION_STATUS_AR: Record<string, string> = {
  new: "جديد",
  accepted: "قيد الفحص",
  in_progress: "قيد الفحص",
  submitted: "بانتظار الاعتماد",
  closed: "اكتمل الفحص",
  rejected: "مرفوض",
};

interface PendingItem {
  kind: "listing" | "network";
  id: string;
  title: string;
  price: number;
  category: string;
  type: string;
  city: string;
  images: string[];
  createdAt: string;
  publisherName: string | null;
  publisherPhone: string | null;
  inspectionReportUrl?: string | null;
  inspection: { status: string; lawyerId: string | null; lawyerName: string | null } | null;
}

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
  const [tab, setTab] = useState<"listings" | "audit" | "offices" | "lawyers" | "payouts" | "reports" | "areas">("listings");

  const [pending, setPending] = useState<PendingItem[]>([]);
  const [assignSel, setAssignSel] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [contractLawyer, setContractLawyer] = useState("");
  const [contractType, setContractType] = useState("sale");
  const [contractNote, setContractNote] = useState("");
  const [contractSaving, setContractSaving] = useState(false);

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
      api.get<{ items: PendingItem[] }>("/admin/pending-audit").then((d) => setPending(d.items)).catch(() => {}),
    ])
      .catch(() => navigate("/"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPending() {
    try {
      const d = await api.get<{ items: PendingItem[] }>("/admin/pending-audit");
      setPending(d.items);
    } catch {
      // ignore
    }
  }

  async function assignLawyer(item: PendingItem) {
    const lawyerId = assignSel[item.id];
    if (!lawyerId) { alert("اختر محامياً أولاً"); return; }
    setActionBusy(item.id);
    try {
      const r = await api.post<{ chatId: string }>("/admin/audit/assign-lawyer", {
        targetType: item.kind,
        targetId: item.id,
        lawyerId,
      });
      await loadPending();
      navigate(`/chat?id=${r.chatId}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال طلب الفحص");
    } finally {
      setActionBusy(null);
    }
  }

  async function publishPending(item: PendingItem) {
    if (!confirm("نشر هذا المنشور للعامة؟")) return;
    setActionBusy(item.id);
    try {
      await api.patch(`/admin/listings/${item.id}`, { status: "active" });
      await loadPending();
      api.get<AdminData>("/admin/stats").then(setData).catch(() => {});
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر النشر");
    } finally {
      setActionBusy(null);
    }
  }

  async function submitContractRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!contractLawyer) { alert("اختر محامياً"); return; }
    setContractSaving(true);
    try {
      const r = await api.post<{ chatId: string }>("/admin/contract-requests", {
        lawyerId: contractLawyer,
        contractType,
        note: contractNote.trim() || undefined,
      });
      setContractNote("");
      navigate(`/chat?id=${r.chatId}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال الطلب");
    } finally {
      setContractSaving(false);
    }
  }

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
        <button onClick={() => setTab("audit")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap flex items-center gap-1.5 ${tab === "audit" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          قيد التدقيق
          {pending.length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{pending.length}</span>
          )}
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

      {/* Pending audit queue + contract drafting */}
      {tab === "audit" && (
        <div className="space-y-5">
          {/* طلب صياغة عقد */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-1 flex items-center gap-2">
              <Handshake className="w-5 h-5 text-orange-500" /> طلب صياغة عقد
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">اختر محامياً ونوع العقد، ستُفتح محادثة مباشرة معه للتنسيق حول الموعد والمكان.</p>
            <form onSubmit={submitContractRequest} className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>المحامي</label>
                <select value={contractLawyer} onChange={(e) => setContractLawyer(e.target.value)} className={inputCls}>
                  <option value="">— اختر محامياً —</option>
                  {lawyers.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.specialization} · {l.city}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>نوع العقد</label>
                <select value={contractType} onChange={(e) => setContractType(e.target.value)} className={inputCls}>
                  {CONTRACT_TYPE_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>ملاحظة/تفاصيل الموعد <span className="text-gray-400">(اختياري)</span></label>
                <textarea value={contractNote} onChange={(e) => setContractNote(e.target.value)} rows={2} placeholder="مثال: نرجو تحديد موعد للقاء يوم الأحد في مقر الشبكة." className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" disabled={contractSaving}
                  className="w-full sm:w-auto px-6 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                  {contractSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Handshake className="w-4 h-4" />}
                  {contractSaving ? "جاري الإرسال..." : "إرسال الطلب وفتح المحادثة"}
                </button>
              </div>
            </form>
          </div>

          {/* قائمة قيد التدقيق */}
          <div>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Scale className="w-5 h-5 text-orange-500" /> المنشورات قيد التدقيق ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-10 text-center text-gray-400">
                <Scale className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">لا توجد منشورات قيد التدقيق حالياً</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4">
                    <div className="flex gap-3">
                      {item.images?.[0] ? (
                        <img src={mediaUrl(item.images[0])} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-6 h-6 text-gray-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-800 dark:text-gray-100 text-sm truncate">{item.title}</p>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${item.kind === "network" ? "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" : "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300"}`}>
                            {item.kind === "network" ? "عقار مكتب" : "إعلان فرد"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatPrice(item.price)} · {item.city} · {item.type}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          الناشر: {item.publisherName || "غير معروف"}{item.publisherPhone ? ` · ${item.publisherPhone}` : ""} · {timeAgo(item.createdAt)}
                        </p>
                        {item.inspection && (
                          <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                            الفحص: {INSPECTION_STATUS_AR[item.inspection.status] || item.inspection.status}
                            {item.inspection.lawyerName ? ` · المحامي: ${item.inspection.lawyerName}` : ""}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <select
                        value={assignSel[item.id] || item.inspection?.lawyerId || ""}
                        onChange={(e) => setAssignSel((s) => ({ ...s, [item.id]: e.target.value }))}
                        className="flex-1 min-w-[160px] border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm"
                      >
                        <option value="">— اختر محامياً للفحص —</option>
                        {lawyers.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.specialization}</option>)}
                      </select>
                      <button
                        onClick={() => assignLawyer(item)}
                        disabled={actionBusy === item.id}
                        className="px-4 py-2 bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300 rounded-xl text-sm font-bold hover:bg-blue-100 transition disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Scale className="w-4 h-4" /> طلب فحص + محادثة
                      </button>
                      {item.kind === "listing" && (
                        <button
                          onClick={() => publishPending(item)}
                          disabled={actionBusy === item.id}
                          className="px-4 py-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300 rounded-xl text-sm font-bold hover:bg-emerald-100 transition disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <CheckCircle className="w-4 h-4" /> نشر للعامة
                        </button>
                      )}
                      {item.kind === "listing" && (
                        <Link href={`/listings/${item.id}`} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-200 transition flex items-center gap-1.5 whitespace-nowrap">
                          <Eye className="w-4 h-4" /> عرض
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
DALAL_FIX3_EOF_7c1e

apply_file dalal-app/src/pages/listing-detail.tsx <<'DALAL_FIX3_EOF_7c1e'
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
  auditNote?: string | null;
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
      {listing.status === "pending_audit" && (isOwner || isAdmin) && (
        <div className="mx-4 mt-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-bold mb-1">قيد التدقيق</p>
          <p>هذا الإعلان قيد التدقيق القانوني من قبل شبكة دلال العراق، ولا يظهر للعامة إلا بعد اكتمال فحص المحامي وقبوله.</p>
          {listing.auditNote && <p className="mt-2 text-amber-700 dark:text-amber-400">{listing.auditNote}</p>}
        </div>
      )}

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
DALAL_FIX3_EOF_7c1e

echo ""
echo "تم تطبيق جميع الإصلاحات بنجاح ✅"
echo ""
echo "الخطوات التالية:"
echo "  1) pnpm install"
echo "  2) pnpm --filter @workspace/db run push   # يضيف العمود: listings.audit_note"
echo "  3) pnpm run typecheck"
echo "  4) pnpm --filter @workspace/dalal-app run build && pnpm --filter @workspace/api-server run build"
