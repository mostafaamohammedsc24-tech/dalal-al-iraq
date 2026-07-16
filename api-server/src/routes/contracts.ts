import { Router } from "express";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, contractRequestsTable, contractsTable, lawyerServicesTable, lawyersTable } from "@workspace/db";
import { authMiddleware, requireRole } from "../lib/auth";
import { notifyNetwork } from "../lib/dalal";

const router = Router();
const CONTRACT_TYPES = ["sale", "rent_to_own", "inheritance"];

router.post("/requests", authMiddleware, requireRole("office", "user"), async (req, res) => {
  const { requesterName, requesterPhone, contractType, lawyerId, parties, details } = req.body as Record<string, string>;
  if (!requesterName?.trim() || !contractType || !CONTRACT_TYPES.includes(contractType)) {
    res.status(400).json({ error: "اسم الطالب ونوع العقد مطلوبان" });
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
    .insert(contractRequestsTable)
    .values({
      id: randomUUID(),
      requestedByType: req.user!.role,
      requestedById: req.user!.userId,
      requesterName: requesterName.trim(),
      requesterPhone: requesterPhone?.trim() || null,
      contractType,
      lawyerId: lawyerId || null,
      parties: parties?.trim() || null,
      details: details?.trim() || null,
      status: "new",
    })
    .returning();
  if (lawyerId) {
    await notifyNetwork({
      recipientType: "lawyer",
      recipientId: lawyerId,
      type: "contract_request",
      title: "طلب صياغة عقد جديد",
      body: `وصلك طلب صياغة عقد (${contractType === "sale" ? "بيع" : contractType === "rent_to_own" ? "إيجار تمليكي" : "إرث"}).`,
      link: "/lawyer/contracts",
    });
  }
  res.status(201).json(request);
});

router.get("/requests/sent", authMiddleware, requireRole("office", "user"), async (req, res) => {
  const requests = await db
    .select()
    .from(contractRequestsTable)
    .where(and(eq(contractRequestsTable.requestedByType, req.user!.role), eq(contractRequestsTable.requestedById, req.user!.userId)))
    .orderBy(sql`${contractRequestsTable.createdAt} DESC`);
  res.json({ requests });
});

router.get("/requests", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const lawyerId = req.user!.userId;
  const requests = await db
    .select()
    .from(contractRequestsTable)
    .where(
      or(
        eq(contractRequestsTable.lawyerId, lawyerId),
        and(isNull(contractRequestsTable.lawyerId), eq(contractRequestsTable.status, "new")),
      ),
    )
    .orderBy(sql`${contractRequestsTable.createdAt} DESC`);
  res.json({ requests });
});

router.patch("/requests/:id", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const id = req.params.id as string;
  const lawyerId = req.user!.userId;
  const { status } = req.body as { status?: string };
  const [request] = await db.select().from(contractRequestsTable).where(eq(contractRequestsTable.id, id)).limit(1);
  if (!request || (request.lawyerId && request.lawyerId !== lawyerId)) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  if (!status || !["in_progress", "completed"].includes(status)) {
    res.status(400).json({ error: "حالة غير صالحة" });
    return;
  }
  const [updated] = await db
    .update(contractRequestsTable)
    .set({ status, lawyerId })
    .where(eq(contractRequestsTable.id, id))
    .returning();
  res.json(updated);
});

// ---------- محرر العقد ----------

router.get("/:requestId", authMiddleware, requireRole("lawyer", "office", "user"), async (req, res) => {
  const requestId = req.params.requestId as string;
  const [request] = await db.select().from(contractRequestsTable).where(eq(contractRequestsTable.id, requestId)).limit(1);
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
  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.requestId, requestId)).limit(1);
  res.json({ request, contract: contract || null });
});

router.put("/:requestId", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const requestId = req.params.requestId as string;
  const lawyerId = req.user!.userId;
  const { content, finalFileUrl, format, sent } = req.body as Record<string, unknown>;
  const [request] = await db.select().from(contractRequestsTable).where(eq(contractRequestsTable.id, requestId)).limit(1);
  if (!request || request.lawyerId !== lawyerId) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  const [existing] = await db.select().from(contractsTable).where(eq(contractsTable.requestId, requestId)).limit(1);
  const values = {
    content: typeof content === "string" ? content : existing?.content ?? null,
    finalFileUrl: typeof finalFileUrl === "string" ? finalFileUrl : existing?.finalFileUrl ?? null,
    format: typeof format === "string" ? format : existing?.format ?? null,
    sentAt: sent ? (sql`now()` as unknown as Date) : existing?.sentAt ?? null,
    updatedAt: sql`now()` as unknown as Date,
  };
  if (existing) {
    await db.update(contractsTable).set(values).where(eq(contractsTable.id, existing.id));
  } else {
    await db.insert(contractsTable).values({ id: randomUUID(), requestId, ...values });
  }
  if (sent) {
    await db.update(contractRequestsTable).set({ status: "completed" }).where(eq(contractRequestsTable.id, requestId));
    await notifyNetwork({
      recipientType: request.requestedByType as "office" | "lawyer",
      recipientId: request.requestedById,
      type: "contract_ready",
      title: "العقد جاهز",
      body: "أنهى المحامي صياغة عقدك وأصبح جاهزاً للاستلام.",
    });
  }
  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.requestId, requestId)).limit(1);
  res.json(contract);
});

// ---------- خدمات المحامي الإضافية ----------

export const lawyerServicesRouter = Router();

lawyerServicesRouter.post("/", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const { name, price, description } = req.body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "اسم الخدمة مطلوب" });
    return;
  }
  const [service] = await db
    .insert(lawyerServicesTable)
    .values({
      id: randomUUID(),
      lawyerId: req.user!.userId,
      name: name.trim(),
      price: price != null && Number.isFinite(parseFloat(String(price))) ? parseFloat(String(price)) : null,
      description: typeof description === "string" ? description.trim().slice(0, 500) || null : null,
    })
    .returning();
  res.status(201).json(service);
});

lawyerServicesRouter.delete("/:id", authMiddleware, requireRole("lawyer"), async (req, res) => {
  const id = req.params.id as string;
  const [existing] = await db.select().from(lawyerServicesTable).where(eq(lawyerServicesTable.id, id)).limit(1);
  if (!existing || existing.lawyerId !== req.user!.userId) {
    res.status(404).json({ error: "الخدمة غير موجودة" });
    return;
  }
  await db.delete(lawyerServicesTable).where(eq(lawyerServicesTable.id, id));
  res.json({ ok: true });
});

export default router;
