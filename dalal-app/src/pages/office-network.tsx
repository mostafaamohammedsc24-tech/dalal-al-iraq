import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Search, Handshake, UserPlus, Scale, Wrench, X, FileText } from "lucide-react";
import { api, getUser, mediaUrl } from "@/lib/api";
import { CITIES, formatPrice, formatSize, timeAgo } from "@/lib/utils";

const CONTRACT_TYPE_AR: Record<string, string> = { sale: "بيع", rent_to_own: "إيجار تمليكي", inheritance: "إرث" };

const TABS = [
  { id: "browse", label: "عقارات الشبكة", icon: Search },
  { id: "mediation", label: "الوساطة", icon: Handshake },
  { id: "referrals", label: "الإحالات", icon: UserPlus },
  { id: "lawyers", label: "المحامون", icon: Scale },
  { id: "workshops", label: "الورش", icon: Wrench },
];

interface Property {
  id: string; type: string; city: string; area?: string | null; price: number; size?: number | null; rooms?: number | null; images: string[];
}
interface MediationRequest {
  id: string; propertyId: string; requestingOfficeId: string; ownerOfficeId: string; status: string; commissionAmount?: number | null; createdAt: string;
}
interface Referral {
  id: string; propertyId: string; referringOfficeId: string; ownerOfficeId: string; customerName: string; customerPhone: string; status: string; rewardAmount: number; createdAt: string;
}
interface Lawyer {
  id: string; name: string; phone: string; specialization: string; city: string; availability: string; rating: number; reviewCount: number;
}
interface Workshop {
  id: string; name: string; specialty: string; phone: string; city: string; rating: number;
}

export default function OfficeNetworkPage() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("browse");
  const [officeId, setOfficeId] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [mediations, setMediations] = useState<MediationRequest[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState("");
  const [referralTarget, setReferralTarget] = useState<Property | null>(null);
  const [referralForm, setReferralForm] = useState({ customerName: "", customerPhone: "", notes: "" });
  const [contractTarget, setContractTarget] = useState<Lawyer | null>(null);
  const [contractForm, setContractForm] = useState({ contractType: "sale", parties: "", details: "" });
  const [officeName, setOfficeName] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "office") { navigate("/office/login"); return; }
    setOfficeId(u.userId);
    setOfficeName(u.name || "");
    setReady(true);
  }, [navigate]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, tab, cityFilter]);

  async function load() {
    setLoading(true);
    try {
      if (tab === "browse") {
        const q = cityFilter ? `?city=${encodeURIComponent(cityFilter)}` : "";
        const d = await api.get<{ properties: { property: Property }[] }>(`/network-properties${q}`);
        setProperties(d.properties.map((r) => r.property));
      } else if (tab === "mediation") {
        const d = await api.get<{ requests: MediationRequest[] }>("/network-properties/mediation/mine");
        setMediations(d.requests);
      } else if (tab === "referrals") {
        const d = await api.get<{ referrals: Referral[] }>("/network-properties/referrals/mine");
        setReferrals(d.referrals);
      } else if (tab === "lawyers") {
        const d = await api.get<{ lawyers: Lawyer[] }>("/lawyers");
        setLawyers(d.lawyers);
      } else if (tab === "workshops") {
        const d = await api.get<{ workshops: Workshop[] }>("/workshops");
        setWorkshops(d.workshops);
      }
    } finally {
      setLoading(false);
    }
  }

  async function requestMediation(propertyId: string) {
    try {
      await api.post(`/network-properties/${propertyId}/mediation-requests`, {});
      alert("تم إرسال طلب الوساطة");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال الطلب");
    }
  }

  async function submitReferral(e: React.FormEvent) {
    e.preventDefault();
    if (!referralTarget) return;
    try {
      await api.post(`/network-properties/${referralTarget.id}/referrals`, referralForm);
      setReferralTarget(null);
      setReferralForm({ customerName: "", customerPhone: "", notes: "" });
      alert("تم إرسال الإحالة، ستحصل على مكافأة عند إتمام الصفقة");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال الإحالة");
    }
  }

  async function submitContractRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!contractTarget) return;
    try {
      await api.post("/contracts/requests", { ...contractForm, requesterName: officeName, lawyerId: contractTarget.id });
      setContractTarget(null);
      setContractForm({ contractType: "sale", parties: "", details: "" });
      alert("تم إرسال طلب صياغة العقد للمحامي");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال الطلب");
    }
  }

  async function respondMediation(id: string, status: string) {
    await api.patch(`/network-properties/mediation-requests/${id}`, { status });
    load();
  }

  async function respondReferral(id: string, status: string) {
    await api.patch(`/network-properties/referrals/${id}`, { status });
    load();
  }

  const STATUS_AR: Record<string, string> = { pending: "قيد الانتظار", accepted: "مقبول", rejected: "مرفوض", completed: "مكتمل", cancelled: "ملغى" };

  if (!ready) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">شبكة المكاتب</h1>

      <div className="flex gap-1 overflow-x-auto mb-5 pb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${tab === id ? "bg-orange-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري التحميل...</div>
      ) : tab === "browse" ? (
        <>
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm mb-4">
            <option value="">كل المحافظات</option>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {properties.length === 0 ? (
            <div className="text-center text-gray-400 py-16">لا توجد عقارات متاحة حالياً</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {properties.map((p) => (
                <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
                  <div className="h-32 bg-gray-100 dark:bg-gray-800">{p.images[0] && <img src={mediaUrl(p.images[0])} className="w-full h-full object-cover" />}</div>
                  <div className="p-4">
                    <p className="font-bold text-gray-800 dark:text-gray-100">{formatPrice(p.price)}</p>
                    <p className="text-sm text-gray-400">{p.type} · {p.city}{p.size ? ` · ${formatSize(p.size)}` : ""}</p>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => requestMediation(p.id)} className="flex-1 text-xs bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 py-2 rounded-lg font-medium hover:bg-orange-100 transition">طلب وساطة</button>
                      <button onClick={() => setReferralTarget(p)} className="flex-1 text-xs bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 py-2 rounded-lg font-medium hover:bg-blue-100 transition">إحالة زبون</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : tab === "mediation" ? (
        mediations.length === 0 ? <div className="text-center text-gray-400 py-16">لا توجد طلبات وساطة</div> : (
          <div className="space-y-3">
            {mediations.map((m) => {
              const isOwner = m.ownerOfficeId === officeId;
              return (
                <div key={m.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{isOwner ? "طلب وارد من مكتب آخر" : "طلبك على عقار مكتب آخر"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{STATUS_AR[m.status]} · {timeAgo(m.createdAt)}</p>
                  </div>
                  {isOwner && m.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => respondMediation(m.id, "accepted")} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">قبول</button>
                      <button onClick={() => respondMediation(m.id, "rejected")} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-medium">رفض</button>
                    </div>
                  )}
                  {isOwner && m.status === "accepted" && (
                    <button onClick={() => respondMediation(m.id, "completed")} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium">إتمام</button>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : tab === "referrals" ? (
        referrals.length === 0 ? <div className="text-center text-gray-400 py-16">لا توجد إحالات</div> : (
          <div className="space-y-3">
            {referrals.map((r) => {
              const isOwner = r.ownerOfficeId === officeId;
              return (
                <div key={r.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{r.customerName} · {r.customerPhone}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{STATUS_AR[r.status]} · مكافأة {r.rewardAmount.toLocaleString("ar-IQ")} د.ع · {timeAgo(r.createdAt)}</p>
                  </div>
                  {isOwner && r.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => respondReferral(r.id, "completed")} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">إتمام</button>
                      <button onClick={() => respondReferral(r.id, "cancelled")} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-medium">إلغاء</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : tab === "lawyers" ? (
        lawyers.length === 0 ? <div className="text-center text-gray-400 py-16">لا يوجد محامون معتمدون بعد</div> : (
          <div className="grid sm:grid-cols-2 gap-4">
            {lawyers.map((l) => (
              <div key={l.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-800 dark:text-gray-100">{l.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${l.availability === "available" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>{l.availability === "available" ? "متاح" : "مشغول"}</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{l.specialization} · {l.city}</p>
                <p className="text-xs text-gray-300 mt-1">تقييم {l.rating.toFixed(1)} ({l.reviewCount})</p>
                <div className="flex gap-2 mt-3">
                  <a href={`tel:${l.phone}`} className="flex-1 text-center text-xs bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 py-2 rounded-lg font-medium">{l.phone}</a>
                  <button onClick={() => setContractTarget(l)} className="flex-1 flex items-center justify-center gap-1 text-xs bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 py-2 rounded-lg font-medium hover:bg-blue-100 transition">
                    <FileText className="w-3.5 h-3.5" /> طلب عقد
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        workshops.length === 0 ? <div className="text-center text-gray-400 py-16">لا توجد ورش مسجلة بعد</div> : (
          <div className="grid sm:grid-cols-2 gap-4">
            {workshops.map((w) => (
              <div key={w.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                <p className="font-bold text-gray-800 dark:text-gray-100">{w.name}</p>
                <p className="text-sm text-gray-400 mt-1">{w.specialty} · {w.city}</p>
                <a href={`tel:${w.phone}`} className="block text-center mt-3 text-xs bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 py-2 rounded-lg font-medium">{w.phone}</a>
              </div>
            ))}
          </div>
        )
      )}

      {referralTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setReferralTarget(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">إحالة زبون</h2>
              <button onClick={() => setReferralTarget(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={submitReferral} className="space-y-3">
              <input value={referralForm.customerName} onChange={(e) => setReferralForm({ ...referralForm, customerName: e.target.value })} placeholder="اسم الزبون" required className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <input value={referralForm.customerPhone} onChange={(e) => setReferralForm({ ...referralForm, customerPhone: e.target.value })} placeholder="هاتف الزبون" required className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <textarea value={referralForm.notes} onChange={(e) => setReferralForm({ ...referralForm, notes: e.target.value })} placeholder="ملاحظات" rows={2} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <button type="submit" className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition text-sm">إرسال الإحالة</button>
            </form>
          </div>
        </div>
      )}

      {contractTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setContractTarget(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">طلب صياغة عقد — {contractTarget.name}</h2>
              <button onClick={() => setContractTarget(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={submitContractRequest} className="space-y-3">
              <select value={contractForm.contractType} onChange={(e) => setContractForm({ ...contractForm, contractType: e.target.value })} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm">
                {Object.entries(CONTRACT_TYPE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={contractForm.parties} onChange={(e) => setContractForm({ ...contractForm, parties: e.target.value })} placeholder="أطراف العقد" className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <textarea value={contractForm.details} onChange={(e) => setContractForm({ ...contractForm, details: e.target.value })} placeholder="تفاصيل إضافية" rows={2} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <button type="submit" className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition text-sm">إرسال الطلب</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
