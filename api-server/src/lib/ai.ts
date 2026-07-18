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
      minPrice: num(parsed.minPrice),
      maxPrice: num(parsed.maxPrice),
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

const FORMAT_SYSTEM = `أنت "مساعد دلال العراق" الذكي. مهمتك صياغة نتائج بحث عقاري/سيارات بالعربية بأسلوب ودود ومختصر.
استخدم فقط العقارات المزوّدة في البيانات. لا تخترع عقارات أو أسعاراً غير موجودة.
اذكر لكل نتيجة: العنوان، السعر، المدينة/المنطقة، وأهم التفاصيل. اجعل الرد منظّماً وسهل القراءة.`;

export async function formatResults(userMessage: string, listings: AiListing[]): Promise<string> {
  const data = listings
    .map(
      (l, i) =>
        `${i + 1}. ${l.title} | السعر: ${l.price} د.ع | ${l.city}${l.area ? " - " + l.area : ""}` +
        `${l.size ? " | المساحة: " + l.size + " م²" : ""}${l.bedrooms ? " | غرف: " + l.bedrooms : ""}` +
        ` | ${l.dealType || "للبيع"}`,
    )
    .join("\n");
  return ollamaChat([
    { role: "system", content: FORMAT_SYSTEM },
    {
      role: "user",
      content: `طلب المستخدم: ${userMessage}\n\nالعقارات المتوفرة:\n${data}\n\nصُغ رداً عربياً يعرض هذه النتائج.`,
    },
  ]);
}

export function fallbackFormat(listings: AiListing[]): string {
  const lines = listings.map(
    (l, i) =>
      `${i + 1}. ${l.title} — ${l.price.toLocaleString("ar-IQ")} د.ع، ${l.city}${l.area ? " - " + l.area : ""}` +
      `${l.size ? `، ${l.size} م²` : ""}${l.bedrooms ? `، ${l.bedrooms} غرف` : ""} (${l.dealType || "للبيع"})`,
  );
  return `وجدت لك ${listings.length} نتيجة مطابقة:\n\n${lines.join("\n")}`;
}

export const NO_RESULTS_MESSAGE =
  "عذراً، لا توجد حالياً عقارات أو إعلانات مطابقة لطلبك. جرّب توسيع نطاق البحث (مدينة أخرى، سعر أعلى، أو مواصفات أقل) وسأبحث لك من جديد. 🌟";
