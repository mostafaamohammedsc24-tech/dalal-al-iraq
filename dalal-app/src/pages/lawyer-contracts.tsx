import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { FileText, X } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

interface ContractRequest {
  id: string; requestedByType: string; requestedById: string; requesterName: string; requesterPhone?: string | null;
  contractType: string; lawyerId?: string | null; parties?: string | null; details?: string | null; status: string; createdAt: string;
}
interface Contract {
  id: string; requestId: string; content?: string | null; sentAt?: string | null;
}

const TYPE_AR: Record<string, string> = { sale: "بيع", rent_to_own: "إيجار تمليكي", inheritance: "إرث" };
const STATUS_AR: Record<string, string> = { new: "جديد", in_progress: "قيد الصياغة", completed: "مكتمل" };

export default function LawyerContractsPage() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [requests, setRequests] = useState<ContractRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ContractRequest | null>(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "lawyer") { navigate("/lawyer/login"); return; }
    setReady(true);
    load();
  }, [navigate]);

  async function load() {
    setLoading(true);
    try {
      const d = await api.get<{ requests: ContractRequest[] }>("/contracts/requests");
      setRequests(d.requests);
    } finally {
      setLoading(false);
    }
  }

  async function startWork(req: ContractRequest) {
    if (req.status === "new") await api.patch(`/contracts/requests/${req.id}`, { status: "in_progress" });
    setActive(req);
    const d = await api.get<{ contract: Contract | null }>(`/contracts/${req.id}`);
    setContent(d.contract?.content || "");
    load();
  }

  async function saveContract(sent: boolean) {
    if (!active) return;
    if (sent && !confirm("سيتم إرسال العقد للطالب وإغلاق الطلب. تأكيد؟")) return;
    setSaving(true);
    try {
      await api.put(`/contracts/${active.id}`, { content, format: "text", sent });
      setActive(null);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  const TEMPLATES: Record<string, string> = {
    sale: `عقد بيع عقار\n\nتم الاتفاق بين الطرف الأول (البائع) والطرف الثاني (المشتري) على بيع العقار الموصوف أدناه...\n\nالطرفان: \nوصف العقار: \nالثمن المتفق عليه: \nشروط التسليم: `,
    rent_to_own: `عقد إيجار تمليكي\n\nيقضي هذا العقد بتأجير العقار الموصوف أدناه مع خيار التمليك بعد استكمال الدفعات...\n\nالطرفان: \nوصف العقار: \nقيمة الإيجار الشهري: \nمدة العقد: `,
    inheritance: `عقد قسمة إرث\n\nتم الاتفاق بين الورثة الموضحة أسماؤهم أدناه على قسمة التركة العقارية...\n\nالورثة: \nوصف العقار: \nنسب القسمة: `,
  };

  if (!ready) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
        <FileText className="w-5 h-5 text-orange-500" /> طلبات صياغة العقود
      </h1>

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري التحميل...</div>
      ) : requests.length === 0 ? (
        <div className="text-center text-gray-400 py-16">لا توجد طلبات عقود حالياً</div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{r.requesterName} · عقد {TYPE_AR[r.contractType]}</p>
                <p className="text-xs text-gray-400 mt-0.5">{STATUS_AR[r.status]} · {timeAgo(r.createdAt)}</p>
              </div>
              {r.status !== "completed" ? (
                <button onClick={() => startWork(r)} className="text-xs bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg font-medium">فتح المحرر</button>
              ) : (
                <span className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">مكتمل</span>
              )}
            </div>
          ))}
        </div>
      )}

      {active && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-2xl my-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-800 dark:text-gray-100">محرر العقد — {active.requesterName}</h2>
                {active.parties && <p className="text-xs text-gray-400 mt-0.5">الأطراف: {active.parties}</p>}
                {active.details && <p className="text-xs text-gray-400">التفاصيل: {active.details}</p>}
              </div>
              <button onClick={() => setActive(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {!content && (
              <button onClick={() => setContent(TEMPLATES[active.contractType])} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium mb-3">
                استخدام نموذج جاهز
              </button>
            )}
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={16} placeholder="نص العقد..." className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm font-mono leading-relaxed" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => saveContract(false)} disabled={saving} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 py-3 rounded-xl font-bold text-sm disabled:opacity-50">حفظ كمسودة</button>
              <button onClick={() => saveContract(true)} disabled={saving} className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold text-sm hover:bg-orange-600 transition disabled:opacity-50">إرسال العقد النهائي</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
