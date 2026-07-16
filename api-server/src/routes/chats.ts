import { Router } from "express";
import { eq, or, and, sql, isNull } from "drizzle-orm";
import { db, chatsTable, messagesTable, listingsTable, usersTable } from "@workspace/db";
import { authMiddleware } from "../lib/auth";
import { getAdminUserId, createNotification } from "../lib/dalal";
import { randomUUID } from "crypto";

const DALAL_NAME = "شبكة دلال العراق";
const LISTING_CARD_TAG = "[[listing:";

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
    const [sender] = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable).where(eq(usersTable.id, chat.senderId)).limit(1);
    const [receiver] = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable).where(eq(usersTable.id, chat.receiverId)).limit(1);
    const messages = await db.select({ text: messagesTable.text, createdAt: messagesTable.createdAt })
      .from(messagesTable).where(eq(messagesTable.chatId, chat.id))
      .orderBy(sql`${messagesTable.createdAt} DESC`).limit(1);

    const redact = (u?: { id: string; name: string; phone: string }, fallbackId?: string) => {
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
  const { listingId } = req.body;
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
    const inquiryText = `${LISTING_CARD_TAG}${listingId}]]\nمرحباً، أنا مهتم بهذا الإعلان: «${listing?.title || "إعلان"}». أرجو تزويدي بالتفاصيل والتواصل معي.`;
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
      userId: messagesTable.userId,
      chatId: messagesTable.chatId,
      createdAt: messagesTable.createdAt,
      user: { id: usersTable.id, name: usersTable.name },
    })
    .from(messagesTable)
    .leftJoin(usersTable, eq(messagesTable.userId, usersTable.id))
    .where(eq(messagesTable.chatId, chatId))
    .orderBy(sql`${messagesTable.createdAt} ASC`);

  res.json(messages);
});

router.post("/:chatId/messages", async (req, res) => {
  const chatId = req.params.chatId as string;
  const { text } = req.body;
  const userId = req.user!.userId;

  if (!text?.trim()) {
    res.status(400).json({ error: "الرسالة فارغة" });
    return;
  }

  const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1);
  if (!chat || (chat.senderId !== userId && chat.receiverId !== userId)) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const id = randomUUID();
  const [msg] = await db.insert(messagesTable).values({
    id, chatId, userId, text: text.trim(),
  }).returning();

  const [user] = await db.select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  // Notify the other participant about the new message.
  try {
    const recipientId = chat.senderId === userId ? chat.receiverId : chat.senderId;
    const adminId = await getAdminUserId();
    const fromAdmin = userId === adminId;
    const link = `/chat?id=${chatId}`;
    await createNotification({
      userId: recipientId,
      type: "message",
      title: fromAdmin ? `رسالة من ${DALAL_NAME}` : `رسالة جديدة من ${user?.name || "مستخدم"}`,
      body: text.trim().slice(0, 120),
      link,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create message notification");
  }

  res.status(201).json({ ...msg, user });
});

export default router;
