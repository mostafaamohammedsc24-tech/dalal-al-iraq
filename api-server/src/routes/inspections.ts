import { Router } from "express";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  inspectionRequestsTable,
  inspectionReportsTable,
  networkPropertiesTable,
  lawyersTable,
} from "@workspace/db";
import { authMiddleware, requireRole } from "../lib/auth";
import { notifyNetwork } from "../lib/dalal";

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
    if (request.propertyId) {
      await db
        .update(networkPropertiesTable)
        .set({ inspectionReportUrl: pdfUrl })
        .where(eq(networkPropertiesTable.id, request.propertyId));
    }
    await notifyNetwork({
      recipientType: request.requestedByType as "office" | "lawyer",
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
