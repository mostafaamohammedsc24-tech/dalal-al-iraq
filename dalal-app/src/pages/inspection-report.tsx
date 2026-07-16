import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { api, getUser, mediaUrl } from "@/lib/api";

interface InspectionRequest {
  id: string; tier: string; status: string; createdAt: string;
}
interface Report {
  aurScreenshotUrl?: string | null; aurNotes?: string | null; ownershipChainText?: string | null;
  ownershipDocs: string[]; liensText?: string | null; liensProofs: string[]; financialDuesReceipts: string[];
  easementsText?: string | null; easementsImages: string[]; finalVerdict?: string | null;
  responsibilityAccepted: boolean; submittedAt?: string | null;
}

const TIER_AR: Record<string, string> = { silver: "فضية", gold: "ذهبية", diamond: "ماسية" };
const VERDICT_AR: Record<string, { label: string; tone: string }> = {
  clear: { label: "سليم - يمكن المتابعة", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" },
  caution: { label: "بحاجة لحذر", tone: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400" },
  risky: { label: "غير موصى به", tone: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400" },
};

export default function InspectionReportPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [request, setRequest] = useState<InspectionRequest | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u || (u.role !== "office" && u.role !== "lawyer" && u.role !== "user")) { navigate("/"); return; }
    setRole(u.role);
    api.get<{ request: InspectionRequest; report: Report | null }>(`/inspections/reports/${id}`)
      .then((d) => { setRequest(d.request); setReport(d.report); })
      .catch((err) => setError(err instanceof Error ? err.message : "تعذر عرض التقرير"))
      .finally(() => setReady(true));
  }, [id, navigate]);

  if (!ready) return <div className="text-center text-gray-400 py-16">جاري التحميل...</div>;
  if (error) return <div className="text-center text-red-500 py-16">{error}</div>;
  if (!request || !report) return <div className="text-center text-gray-400 py-16">التقرير غير متاح بعد</div>;

  const backHref = role === "office" ? "/office" : role === "lawyer" ? "/lawyer" : "/";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 print:py-2">
      <Link href={backHref} className="text-orange-500 text-sm flex items-center gap-1 mb-4 print:hidden hover:underline">
        <ArrowRight className="w-4 h-4" /> رجوع
      </Link>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-6 h-6 text-orange-500" />
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">تقرير الفحص القانوني — درجة {TIER_AR[request.tier]}</h1>
        </div>
        {report.submittedAt && <p className="text-xs text-gray-400 mb-5">تاريخ الإصدار: {new Date(report.submittedAt).toLocaleDateString("ar-IQ")}</p>}

        {report.finalVerdict && (
          <div className={`rounded-xl p-3 text-sm font-bold mb-5 ${VERDICT_AR[report.finalVerdict]?.tone}`}>
            التوصية النهائية: {VERDICT_AR[report.finalVerdict]?.label}
          </div>
        )}

        <Section title="الاستفسار العقاري (AUR)">
          {report.aurScreenshotUrl && <img src={mediaUrl(report.aurScreenshotUrl)} className="w-full rounded-lg mb-2" />}
          <p className="text-sm text-gray-600 dark:text-gray-300">{report.aurNotes || "لا توجد ملاحظات"}</p>
        </Section>

        <Section title="سلسلة الملكية">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{report.ownershipChainText || "لا توجد بيانات"}</p>
          <ImageGrid files={report.ownershipDocs} />
        </Section>

        <Section title="الرهون والحجوزات">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{report.liensText || "لا توجد رهون مسجلة"}</p>
          <ImageGrid files={report.liensProofs} />
        </Section>

        <Section title="إيصالات المستحقات المالية">
          <ImageGrid files={report.financialDuesReceipts} />
        </Section>

        <Section title="الارتفاقات والحقوق العينية">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{report.easementsText || "لا توجد ارتفاقات مسجلة"}</p>
          <ImageGrid files={report.easementsImages} />
        </Section>

        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
          تم إعداد هذا التقرير من قبل محامٍ معتمد في شبكة دلال العراق، وهو يتحمل المسؤولية القانونية الكاملة عن دقة محتواه.
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1.5">{title}</h2>
      {children}
    </div>
  );
}

function ImageGrid({ files }: { files: string[] }) {
  if (!files?.length) return <p className="text-xs text-gray-400">لا توجد مرفقات</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <a key={i} href={mediaUrl(f)} target="_blank" rel="noreferrer">
          <img src={mediaUrl(f)} className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
        </a>
      ))}
    </div>
  );
}
