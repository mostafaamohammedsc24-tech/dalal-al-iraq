import { Router } from "express";
import { eq, and, or, ilike, gte, lte, asc, sql, type SQL } from "drizzle-orm";
import { db, listingsTable, aiMessagesTable } from "@workspace/db";
import { authMiddleware } from "../lib/auth";
import { randomUUID } from "crypto";
import {
  extractSearchParams,
  formatResults,
  fallbackFormat,
  isAiAvailable,
  NO_RESULTS_MESSAGE,
  type SearchParams,
  type AiListing,
} from "../lib/ai";

const router = Router();
router.use(authMiddleware);

function queryListings(conds: SQL[]): Promise<AiListing[]> {
  return db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      price: listingsTable.price,
      city: listingsTable.city,
      area: listingsTable.area,
      size: listingsTable.size,
      bedrooms: listingsTable.bedrooms,
      dealType: listingsTable.dealType,
      category: listingsTable.category,
      type: listingsTable.type,
    })
    .from(listingsTable)
    .where(and(...conds))
    .orderBy(sql`${listingsTable.pinned} DESC, ${listingsTable.createdAt} DESC`)
    .limit(8);
}

// The model NEVER queries data directly: it only produces structured params,
// which we translate into a parameterized PostgreSQL query here.
// Text fields the model may slightly misspell (area, type, free-text keywords)
// are treated as "soft" filters: if the strict query returns nothing we relax
// them progressively so a small AI typo doesn't hide real listings.
async function runSearch(params: SearchParams): Promise<AiListing[]> {
  const core: SQL[] = [eq(listingsTable.status, "active")];
  if (params.category) core.push(eq(listingsTable.category, params.category));
  if (params.dealType) core.push(eq(listingsTable.dealType, params.dealType));
  if (params.city) core.push(ilike(listingsTable.city, `%${params.city}%`));
  if (params.minPrice != null) core.push(gte(listingsTable.price, params.minPrice));
  if (params.maxPrice != null) core.push(lte(listingsTable.price, params.maxPrice));
  if (params.minSize != null) core.push(gte(listingsTable.size, params.minSize));
  if (params.maxSize != null) core.push(lte(listingsTable.size, params.maxSize));
  if (params.minBedrooms != null) core.push(gte(listingsTable.bedrooms, params.minBedrooms));

  const area = params.area ? ilike(listingsTable.area, `%${params.area}%`) : null;
  const type = params.type ? ilike(listingsTable.type, `%${params.type}%`) : null;
  const keywords = params.keywords
    ? or(
        ilike(listingsTable.title, `%${params.keywords}%`),
        ilike(listingsTable.description, `%${params.keywords}%`),
      )!
    : null;

  // Most specific first, then progressively drop soft filters.
  const tiers: SQL[][] = [
    [...core, area, type, keywords],
    [...core, area, type],
    [...core, type],
    core,
  ].map((t) => t.filter((c): c is SQL => c != null));

  const seen = new Set<string>();
  const uniqueTiers = tiers.filter((t) => {
    const key = t.length.toString() + JSON.stringify(t.map(() => 1));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const conds of uniqueTiers) {
    const rows = await queryListings(conds);
    if (rows.length > 0) return rows;
  }
  return [];
}

router.get("/messages", async (req, res) => {
  const userId = req.user!.userId;
  const messages = await db
    .select({
      id: aiMessagesTable.id,
      role: aiMessagesTable.role,
      content: aiMessagesTable.content,
      createdAt: aiMessagesTable.createdAt,
    })
    .from(aiMessagesTable)
    .where(eq(aiMessagesTable.userId, userId))
    .orderBy(asc(aiMessagesTable.createdAt))
    .limit(200);
  res.json({ messages });
});

router.delete("/messages", async (req, res) => {
  await db.delete(aiMessagesTable).where(eq(aiMessagesTable.userId, req.user!.userId));
  res.json({ ok: true });
});

router.post("/messages", async (req, res) => {
  const userId = req.user!.userId;
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    res.status(400).json({ error: "الرسالة فارغة" });
    return;
  }
  if (content.length > 1000) {
    res.status(400).json({ error: "الرسالة طويلة جداً" });
    return;
  }

  const userMsg = { id: randomUUID(), userId, role: "user", content };
  await db.insert(aiMessagesTable).values(userMsg);

  let reply: string;
  const aiUp = await isAiAvailable();
  try {
    // 1) Understand the request -> structured params (LLM, no data access).
    const params = aiUp ? await extractSearchParams(content) : { keywords: content };
    // 2) Search PostgreSQL with those params.
    const listings = await runSearch(params);
    // 3) Format the DB results (LLM if available, deterministic fallback else).
    if (listings.length === 0) {
      reply = NO_RESULTS_MESSAGE;
    } else if (aiUp) {
      try {
        reply = await formatResults(content, listings);
        if (!reply) reply = fallbackFormat(listings);
      } catch {
        reply = fallbackFormat(listings);
      }
    } else {
      reply =
        "المساعد الذكي غير مفعّل حالياً (Ollama غير متصل)، لكن إليك ما وجدته في قاعدة البيانات:\n\n" +
        fallbackFormat(listings);
    }
  } catch (err) {
    req.log.error({ err }, "AI assistant failed");
    reply = "حدث خطأ أثناء معالجة طلبك. حاول مرة أخرى بعد قليل.";
  }

  const assistantMsg = { id: randomUUID(), userId, role: "assistant", content: reply };
  await db.insert(aiMessagesTable).values(assistantMsg);

  res.status(201).json({
    userMessage: { ...userMsg, createdAt: new Date().toISOString() },
    assistantMessage: { ...assistantMsg, createdAt: new Date().toISOString() },
  });
});

export default router;
