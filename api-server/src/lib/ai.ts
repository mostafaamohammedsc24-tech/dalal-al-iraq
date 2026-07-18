// Local AI assistant powered by Ollama (Qwen2.5-1.5B-Instruct by default).
//
// Design constraints (per product spec):
//  - The model NEVER searches the data itself. It only (1) turns the user's
//    Arabic message into structured search parameters and (2) phrases the
//    results in natural Arabic. All property lookups run against PostgreSQL.
//  - Runs fully locally on CPU; if Ollama is unavailable the assistant
//    degrades gracefully with deterministic Arabic fallbacks.

const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:1.5b-instruct";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 60_000;

export interface SearchParams {
  category?: "عقارات" | "سيارات" | null;
  dealType?: string | null;
  city?: string | null;
  area?: string | null;
  type?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minSize?: number | null;
  maxSize?: number | null;
  minBedrooms?: number | null;
  keywords?: string | null;
}

async function ollamaChat(
  messages: Array<{ role: string; content: string }>,
  opts?: { json?: boolean },
): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      ...(opts?.json ? { format: "json" } : {}),
      options: { temperature: 0.2, num_predict: 512 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content?.trim() || "";
}

export async function isAiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

const EXTRACT_SYSTEM = `أنت مساعد لاستخراج معايير البحث العقاري والسيارات في العراق من رسالة المستخدم.
أعد فقط كائن JSON صالح بهذه الحقول (استخدم null لأي حقل غير مذكور):
{
  "category": "عقارات" أو "سيارات" أو null,
  "dealType": "للبيع" أو "للايجار" أو "رهن" أو null,
  "city": اسم المحافظة أو null,
  "area": اسم المنطقة/الحي أو null,
  "type": نوع العقار (شقة، بيت، فيلا، أرض...) أو ماركة السيارة أو null,
  "minPrice": رقم أو null,
  "maxPrice": رقم أو null,
  "minSize": المساحة الأدنى بالمتر المربع أو null,
  "maxSize": المساحة الأعلى بالمتر المربع أو null,
  "minBedrooms": عدد الغرف الأدنى أو null,
  "keywords": كلمات مفتاحية للبحث في الوصف أو null
}
لا تكتب أي شرح، فقط JSON.`;

// The model often returns a price like `200` when the user said "200 مليون".
// Recover the intended magnitude from the original message so a real listing
// isn't filtered out by an off-by-1000000 bound.
function normalizePrice(n: number | null, userMessage: string): number | null {
  if (n == null) return null;
  if (n >= 100_000) return n; // already a full IQD amount
  if (/مليار/.test(userMessage)) return n * 1_000_000_000;
  if (/مليون/.test(userMessage)) return n * 1_000_000;
  if (/(ألف|الف)/.test(userMessage)) return n * 1_000;
  return n;
}

export async function extractSearchParams(userMessage: string): Promise<SearchParams> {
  const raw = await ollamaChat(
    [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: userMessage },
    ],
    { json: true },
  );
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const num = (v: unknown): number | null => {
      if (v == null) return null;
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const str = (v: unknown): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s && s.toLowerCase() !== "null" ? s : null;
    };
    return {
      category: (str(parsed.category) as SearchParams["category"]) ?? null,
      dealType: str(parsed.dealType),
      city: str(parsed.city),
      area: str(parsed.area),
      type: str(parsed.type),
      minPrice: normalizePrice(num(parsed.minPrice), userMessage),
      maxPrice: normalizePrice(num(parsed.maxPrice), userMessage),
      minSize: num(parsed.minSize),
      maxSize: num(parsed.maxSize),
      minBedrooms: num(parsed.minBedrooms),
      keywords: str(parsed.keywords),
    };
  } catch {
    return { keywords: userMessage };
  }
}

export interface AiListing {
  id: string;
  title: string;
  price: number;
  city: string;
  area: string | null;
  size: number | null;
  bedrooms: number | null;
  dealType: string | null;
  category: string;
  type: string;
}

// Human-readable IQD price in the same style the site uses ("175 مليون د.ع").
// Kept deterministic so listing prices are NEVER passed through the LLM.
export function formatPriceIQ(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "السعر عند الطلب";
  const trim = (v: number) => String(Math.round(v * 100) / 100).replace(/\.0+$/, "");
  if (price >= 1_000_000_000) return `${trim(price / 1_000_000_000)} مليار د.ع`;
  if (price >= 1_000_000) return `${trim(price / 1_000_000)} مليون د.ع`;
  if (price >= 1_000) return `${trim(price / 1_000)} ألف د.ع`;
  return `${price} د.ع`;
}

// Deterministic rendering of the DB rows. All numbers come straight from
// PostgreSQL — the model is never allowed to (re)write prices/sizes.
export function renderListings(listings: AiListing[]): string {
  return listings
    .map(
      (l, i) =>
        `${i + 1}. ${l.title} — ${formatPriceIQ(l.price)}، ${l.city}${l.area ? " - " + l.area : ""}` +
        `${l.size ? `، ${l.size} م²` : ""}${l.bedrooms ? `، ${l.bedrooms} غرف` : ""} (${l.dealType || "للبيع"})`,
    )
    .join("\n");
}

const INTRO_SYSTEM = `أنت "مساعد دلال العراق". اكتب جملة افتتاحية واحدة قصيرة وودودة بالعربية تمهّد لعرض نتائج البحث.
ممنوع منعاً باتاً ذكر أي أرقام أو أسعار أو مساحات أو أسماء عقارات — التمهيد عام فقط.
مثال: "إليك أفضل ما وجدته لك:". لا تكتب أكثر من جملة واحدة.`;

// The LLM only writes a friendly intro sentence (no data); the accurate
// listing details are appended deterministically from the DB rows.
export async function formatResults(userMessage: string, listings: AiListing[]): Promise<string> {
  let intro = "";
  try {
    intro = await ollamaChat([
      { role: "system", content: INTRO_SYSTEM },
      { role: "user", content: `طلب المستخدم: ${userMessage}\nعدد النتائج: ${listings.length}` },
    ]);
  } catch {
    intro = "";
  }
  // Discard the intro entirely if the model sneaked in any digit.
  if (/[0-9\u0660-\u0669]/.test(intro)) intro = "";
  if (!intro) intro = `وجدت لك ${listings.length} نتيجة مطابقة:`;
  return `${intro.trim()}\n\n${renderListings(listings)}`;
}

export function fallbackFormat(listings: AiListing[]): string {
  return `وجدت لك ${listings.length} نتيجة مطابقة:\n\n${renderListings(listings)}`;
}

export const NO_RESULTS_MESSAGE =
  "عذراً، لا توجد حالياً عقارات أو إعلانات مطابقة لطلبك. جرّب توسيع نطاق البحث (مدينة أخرى، سعر أعلى، أو مواصفات أقل) وسأبحث لك من جديد. 🌟";
