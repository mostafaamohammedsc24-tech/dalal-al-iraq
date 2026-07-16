import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Building2, Plus, X } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { formatPrice, timeAgo } from "@/lib/utils";

interface Deal {
  id: string; propertyId: string; buyerName?: string | null; buyerPhone?: string | null;
  price: number; status: string; commissionRate?: number | null; networkCommission?: number | null;
  officeNetCommission?: number | null; createdAt: string; completedAt?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  negotiating: "قيد التفاوض",
  contract_signed: "تم توقيع العقد",
  transferring_ownership: "نقل الملكية",
  completed: "مكتملة",
  cancelled: "ملغاة",
};
const STATUS_FLOW = ["negotiating", "contract_signed", "transferring_ownership", "completed"];

export default function OfficeDealsPage() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ propertyId: "", buyerName: "", buyerPhone: "", price: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "office") { navigate("/office/login"); return; }
    setReady(true);
    load();
  }, [navigate]);

  async function load() {
    setLoading(true);
    try {
      const d = await api.get<{ deals: Deal[] }>("/deals/mine");
      setDeals(d.deals);
    } finally {
      setLoading(false);
    }
  }

  async function createDeal(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.propertyId.trim() || !form.price) { setError("رقم العقار والسعر مطلوبان"); return; }
    setSaving(true);
    try {
      await api.post("/deals", { ...form, price: Number(form.price) });
      setShowForm(false);
      setForm({ propertyId: "", buyerName: "", buyerPhone: "", price: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function advance(deal: Deal) {
    const idx = STATUS_FLOW.indexOf(deal.status);
    if (idx === -1 || idx === STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    if (next === "completed" && !confirm("سيتم احتساب عمولة الشبكة (2%) وتحويل نسبة مكتبك إلى محفظتك. تأكيد؟")) return;
    await api.patch(`/deals/${deal.id}`, { status: next });
    load();
  }

  async function cancel(deal: Deal) {
    if (!confirm("هل تريد إلغاء هذه الصفقة؟")) return;
    await api.patch(`/deals/${deal.id}`, { status: "cancelled" });
    load();
  }

  if (!ready) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">صفقاتي</h1>
        <button onClick={() => setShowForm(true)} className="bg-orange-500 text-white rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 hover:bg-orange-600 transition">
          <Plus className="w-4 h-4" /> صفقة جديدة
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري التحميل...</div>
      ) : deals.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          لا توجد صفقات بعد
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map((d) => (
            <div key={d.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-gray-800 dark:text-gray-100">{formatPrice(d.price)}</p>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${d.status === "completed" ? "bg-emerald-50 text-emerald-600" : d.status === "cancelled" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                  {STATUS_LABELS[d.status]}
                </span>
              </div>
              {(d.buyerName || d.buyerPhone) && <p className="text-sm text-gray-400">{d.buyerName} {d.buyerPhone && `· ${d.buyerPhone}`}</p>}
              <p className="text-xs text-gray-300 mt-1">{timeAgo(d.createdAt)}</p>
              {d.status === "completed" && d.officeNetCommission != null && (
                <p className="text-sm text-emerald-600 mt-2 font-medium">عمولتك: {d.officeNetCommission.toLocaleString("ar-IQ")} د.ع (بعد خصم نسبة الشبكة {((d.networkCommission || 0)).toLocaleString("ar-IQ")} د.ع)</p>
              )}
              {d.status !== "completed" && d.status !== "cancelled" && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => advance(d)} className="text-xs bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 px-3 py-1.5 rounded-lg font-medium hover:bg-orange-100 transition">
                    نقل للمرحلة التالية
                  </button>
                  <button onClick={() => cancel(d)} className="text-xs bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg font-medium hover:bg-red-100 transition">
                    إلغاء
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">صفقة جديدة</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 mb-3">{error}</div>}
            <form onSubmit={createDeal} className="space-y-3">
              <input value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} placeholder="رقم العقار (من قائمة عقاراتي)" required className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <input value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} placeholder="اسم المشتري" className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <input value={form.buyerPhone} onChange={(e) => setForm({ ...form, buyerPhone: e.target.value })} placeholder="هاتف المشتري" className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="سعر البيع" required className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <button type="submit" disabled={saving} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm">
                {saving ? "جاري الحفظ..." : "إنشاء الصفقة"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
