import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Wallet, ArrowDownToLine } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

interface LedgerEntry {
  id: string; serviceType: string; clientName?: string | null; amount: number; status: string; date: string;
}
interface PayoutRequest {
  id: string; amount: number; status: string; requestedAt: string; paidAt?: string | null;
}

const SERVICE_LABELS: Record<string, string> = {
  deal_commission: "عمولة صفقة",
  inspection_fee: "أجرة فحص قانوني",
  contract_fee: "أجرة صياغة عقد",
  referral_reward: "مكافأة إحالة",
};

export default function LawyerWalletPage() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [pending, setPending] = useState(0);
  const [paid, setPaid] = useState(0);
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "lawyer") { navigate("/lawyer/login"); return; }
    setReady(true);
    load();
  }, [navigate]);

  async function load() {
    setLoading(true);
    try {
      const [ledger, reqs] = await Promise.all([
        api.get<{ entries: LedgerEntry[]; pending: number; paid: number }>("/finance/ledger"),
        api.get<{ requests: PayoutRequest[] }>("/finance/payout-requests"),
      ]);
      setEntries(ledger.entries);
      setPending(ledger.pending);
      setPaid(ledger.paid);
      setRequests(reqs.requests);
    } finally {
      setLoading(false);
    }
  }

  async function requestPayout() {
    setRequesting(true);
    try {
      await api.post("/finance/payout-requests", {});
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال طلب السحب");
    } finally {
      setRequesting(false);
    }
  }

  const hasPendingRequest = requests.some((r) => r.status === "pending");

  if (!ready) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-5 flex items-center gap-2">
        <Wallet className="w-5 h-5 text-orange-500" /> محفظتي
      </h1>

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري التحميل...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-orange-50 dark:bg-orange-950/30 rounded-2xl p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">مستحق للسحب</p>
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{pending.toLocaleString("ar-IQ")} د.ع</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">تم دفعه</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{paid.toLocaleString("ar-IQ")} د.ع</p>
            </div>
          </div>

          <button
            onClick={requestPayout}
            disabled={requesting || hasPendingRequest || pending <= 0}
            className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-40 text-sm flex items-center justify-center gap-2 mb-6"
          >
            <ArrowDownToLine className="w-4 h-4" />
            {hasPendingRequest ? "لديك طلب سحب قيد المعالجة" : requesting ? "جاري الإرسال..." : "طلب سحب المستحقات"}
          </button>

          {requests.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">طلبات السحب</h2>
              <div className="space-y-2">
                {requests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{r.amount.toLocaleString("ar-IQ")} د.ع</p>
                      <p className="text-xs text-gray-400">{timeAgo(r.requestedAt)}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.status === "paid" ? "bg-emerald-50 text-emerald-600" : r.status === "approved" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                      {r.status === "paid" ? "تم الدفع" : r.status === "approved" ? "تمت الموافقة" : "قيد الانتظار"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">سجل الحركات</h2>
            {entries.length === 0 ? (
              <div className="text-center text-gray-400 py-10 text-sm">لا توجد حركات مالية بعد</div>
            ) : (
              <div className="space-y-2">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{SERVICE_LABELS[e.serviceType] || e.serviceType}{e.clientName ? ` · ${e.clientName}` : ""}</p>
                      <p className="text-xs text-gray-400">{timeAgo(e.date)}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{e.amount.toLocaleString("ar-IQ")} د.ع</p>
                      <p className={`text-xs ${e.status === "paid" ? "text-emerald-500" : "text-amber-500"}`}>{e.status === "paid" ? "مدفوع" : "معلق"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
