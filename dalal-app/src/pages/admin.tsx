import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Building2, Users, Eye, Trash2, CheckCircle, XCircle, Handshake, Plus, MapPin, Phone, Loader2, Pin, Flag, Scale, Wallet, KeyRound, Ban, PlayCircle, QrCode, X, Download, Map } from "lucide-react";
import { formatPrice, timeAgo, CITIES, DEAL_TYPES } from "@/lib/utils";
import { api, getUser } from "@/lib/api";
import { ListingItem } from "@/components/listing-card";
import { LocationPicker } from "@/components/location-picker";

const SPECIALIZATIONS = ["عقاري", "تجاري", "إرث وتوزيع تركات", "عام"];

interface Lawyer {
  id: string; name: string; phone: string; specialization: string; city: string; status: string; availability: string;
}
interface PayoutRequest {
  id: string; payeeType: string; payeeId: string; payeeName: string; amount: number; status: string; requestedAt: string;
}
interface NetworkOverview {
  officesCount: number; lawyersCount: number; pendingPayouts: number; pendingInspections: number;
}

interface AdminData {
  listings: (ListingItem & { status: string; user: { name: string; phone: string } })[];
  usersCount: number;
  listingsCount: number;
  totalViews: number;
}

interface Office {
  id: string;
  name: string;
  city: string;
  area: string | null;
  phone: string;
  address: string | null;
  description?: string | null;
  workingHours?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface Report {
  id: string;
  listingId: string;
  reason: string;
  note: string | null;
  status: string;
  createdAt: string;
  listingTitle: string | null;
  listingStatus: string | null;
  reporterName: string | null;
}

export default function AdminPage() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"listings" | "offices" | "lawyers" | "payouts" | "reports" | "areas">("listings");

  const [qr, setQr] = useState<{ officeName: string; url: string; qr: string } | null>(null);
  const [qrLoading, setQrLoading] = useState<string | null>(null);

  const [areas, setAreas] = useState<{ id: string; city: string; name: string }[]>([]);
  const [areaCity, setAreaCity] = useState(CITIES[0]);
  const [areaName, setAreaName] = useState("");
  const [areaSaving, setAreaSaving] = useState(false);
  const [areaError, setAreaError] = useState("");

  const [offices, setOffices] = useState<Office[]>([]);
  const [officeStatuses, setOfficeStatuses] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Report[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [form, setForm] = useState({ name: "", city: "", area: "", phone: "", address: "", description: "", workingHours: "" });
  const [saving, setSaving] = useState(false);
  const [officeError, setOfficeError] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [lawyerForm, setLawyerForm] = useState({ name: "", phone: "", email: "", specialization: SPECIALIZATIONS[0], city: CITIES[0] });
  const [lawyerSaving, setLawyerSaving] = useState(false);
  const [lawyerError, setLawyerError] = useState("");
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [newCredentials, setNewCredentials] = useState<{ id: string; password: string } | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "admin") { navigate("/"); return; }
    Promise.all([
      api.get<AdminData>("/admin/stats").then(setData),
      api.get<{ offices: Office[] }>("/offices").then((d) => setOffices(d.offices)),
      api.get<{ reports: Report[]; openCount: number }>("/reports").then((d) => { setReports(d.reports); setOpenCount(d.openCount); }),
      api.get<{ lawyers: Lawyer[] }>("/lawyers").then((d) => setLawyers(d.lawyers)).catch(() => {}),
      api.get<{ requests: PayoutRequest[] }>("/admin/payout-requests").then((d) => setPayouts(d.requests)).catch(() => {}),
      api.get<NetworkOverview>("/admin/network-overview").then(setOverview).catch(() => {}),
    ])
      .catch(() => navigate("/"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadAreas(city: string) {
    api.get<{ areas: { id: string; city: string; name: string }[] }>(`/areas?city=${encodeURIComponent(city)}`)
      .then((d) => setAreas(d.areas))
      .catch(() => setAreas([]));
  }

  useEffect(() => {
    if (tab === "areas") loadAreas(areaCity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, areaCity]);

  async function addArea(e: React.FormEvent) {
    e.preventDefault();
    if (!areaName.trim()) { setAreaError("اسم المنطقة مطلوب"); return; }
    setAreaError(""); setAreaSaving(true);
    try {
      const created = await api.post<{ id: string; city: string; name: string }>("/areas", { city: areaCity, name: areaName.trim() });
      setAreas((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "ar")));
      setAreaName("");
    } catch (err: unknown) {
      setAreaError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setAreaSaving(false);
    }
  }

  async function deleteArea(id: string) {
    if (!confirm("حذف هذه المنطقة؟")) return;
    await api.delete(`/areas/${id}`);
    setAreas((prev) => prev.filter((a) => a.id !== id));
  }

  async function showOfficeQr(id: string) {
    setQrLoading(id);
    try {
      const d = await api.get<{ officeName: string; url: string; qr: string }>(`/offices/${id}/qr`);
      setQr(d);
    } catch {
      /* ignore */
    } finally {
      setQrLoading(null);
    }
  }

  async function addLawyer(e: React.FormEvent) {
    e.preventDefault();
    if (!lawyerForm.name.trim() || !lawyerForm.phone.trim()) { setLawyerError("الاسم والهاتف مطلوبان"); return; }
    setLawyerError(""); setLawyerSaving(true);
    try {
      const lawyer = await api.post<Lawyer & { credentials: { id: string; password: string } }>("/lawyers", lawyerForm);
      setLawyers((prev) => [lawyer, ...prev]);
      setNewCredentials(lawyer.credentials);
      setLawyerForm({ name: "", phone: "", email: "", specialization: SPECIALIZATIONS[0], city: CITIES[0] });
    } catch (err: unknown) {
      setLawyerError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLawyerSaving(false);
    }
  }

  async function toggleLawyerStatus(id: string, status: string) {
    const next = status === "active" ? "suspended" : "active";
    const updated = await api.patch<Lawyer>(`/lawyers/${id}/status`, { status: next });
    setLawyers((prev) => prev.map((l) => (l.id === id ? { ...l, status: updated.status } : l)));
  }

  async function resetLawyerPassword(id: string) {
    if (!confirm("سيتم إنشاء كلمة مرور جديدة لهذا المحامي. تأكيد؟")) return;
    const d = await api.post<{ id: string; password: string }>(`/admin/lawyers/${id}/reset-password`, {});
    setNewCredentials(d);
  }

  async function deleteLawyer(id: string) {
    if (!confirm("حذف هذا المحامي؟")) return;
    await api.delete(`/lawyers/${id}`);
    setLawyers((prev) => prev.filter((l) => l.id !== id));
  }

  async function toggleOfficeStatus(id: string) {
    const current = officeStatuses[id] || "active";
    const next = current === "active" ? "suspended" : "active";
    await api.patch(`/offices/${id}/status`, { status: next });
    setOfficeStatuses((prev) => ({ ...prev, [id]: next }));
  }

  async function resetOfficePassword(id: string) {
    if (!confirm("سيتم إنشاء كلمة مرور جديدة لهذا المكتب. تأكيد؟")) return;
    const d = await api.post<{ id: string; password: string }>(`/admin/offices/${id}/reset-password`, {});
    setNewCredentials(d);
  }

  async function updatePayoutStatus(id: string, status: string) {
    if (status === "paid" && !confirm("سيتم تعليم كل مستحقات هذا الحساب المعلقة كمدفوعة. تأكيد؟")) return;
    const updated = await api.patch<PayoutRequest>(`/admin/payout-requests/${id}`, { status });
    setPayouts((prev) => prev.map((p) => (p.id === id ? { ...p, status: updated.status } : p)));
  }

  async function resolveReport(id: string) {
    await api.patch(`/reports/${id}`, { status: "resolved" });
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: "resolved" } : r)));
    setOpenCount((c) => Math.max(0, c - 1));
  }

  async function updateStatus(id: string, status: string) {
    await api.patch(`/admin/listings/${id}`, { status });
    setData((prev) => prev ? {
      ...prev,
      listings: prev.listings.map((l) => l.id === id ? { ...l, status } : l),
    } : null);
  }

  async function updateDealType(id: string, dealType: string) {
    await api.patch(`/admin/listings/${id}`, { dealType });
    setData((prev) => prev ? {
      ...prev,
      listings: prev.listings.map((l) => l.id === id ? { ...l, dealType } : l),
    } : null);
  }

  async function togglePin(id: string, pinned: boolean) {
    await api.patch(`/admin/listings/${id}`, { pinned });
    setData((prev) => prev ? {
      ...prev,
      listings: prev.listings.map((l) => l.id === id ? { ...l, pinned } : l),
    } : null);
  }

  async function deleteListing(id: string) {
    if (!confirm("حذف الإعلان؟")) return;
    await api.delete(`/listings/${id}`);
    setData((prev) => prev ? {
      ...prev,
      listings: prev.listings.filter((l) => l.id !== id),
      listingsCount: prev.listingsCount - 1,
    } : null);
  }

  async function addOffice(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.city || !form.phone.trim()) {
      setOfficeError("الاسم والمحافظة والهاتف مطلوبة"); return;
    }
    setOfficeError(""); setSaving(true);
    try {
      const office = await api.post<Office>("/offices", {
        ...form,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });
      setOffices((prev) => [office, ...prev]);
      setForm({ name: "", city: "", area: "", phone: "", address: "", description: "", workingHours: "" });
      setCoords(null);
    } catch (err: unknown) {
      setOfficeError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOffice(id: string) {
    if (!confirm("حذف المكتب الدلالية؟")) return;
    await api.delete(`/offices/${id}`);
    setOffices((prev) => prev.filter((o) => o.id !== id));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );
  if (!data) return null;

  const inputCls = "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500";
  const labelCls = "block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">لوحة الإدارة</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
        {[
          { icon: Building2, val: data.listingsCount, label: "الإعلانات", color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950" },
          { icon: Users, val: data.usersCount, label: "المستخدمون", color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950" },
          { icon: Eye, val: data.totalViews, label: "المشاهدات", color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950" },
          { icon: Handshake, val: offices.length, label: "المكاتب", color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950" },
        ].map(({ icon: Icon, val, label, color, bg }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm text-center">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mx-auto mb-2`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{val.toLocaleString("ar-IQ")}</p>
            <p className="text-gray-400 text-xs">{label}</p>
          </div>
        ))}
      </div>

      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {[
            { icon: Scale, val: overview.lawyersCount, label: "المحامون", color: "text-teal-500", bg: "bg-teal-50 dark:bg-teal-950" },
            { icon: Wallet, val: overview.pendingPayouts, label: "طلبات سحب معلقة", color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950" },
            { icon: CheckCircle, val: overview.pendingInspections, label: "فحوصات بانتظار محامٍ", color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950" },
          ].map(({ icon: Icon, val, label, color, bg }) => (
            <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm text-center">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mx-auto mb-2`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{val.toLocaleString("ar-IQ")}</p>
              <p className="text-gray-400 text-xs">{label}</p>
            </div>
          ))}
        </div>
      )}

      {newCredentials && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-2xl p-4 mb-6 flex items-center justify-between">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            بيانات الدخول الجديدة — المعرّف: <b>{newCredentials.id}</b> · كلمة المرور: <b>{newCredentials.password}</b> (احفظها الآن، لن تظهر مرة أخرى)
          </p>
          <button onClick={() => setNewCredentials(null)} className="text-emerald-600 hover:text-emerald-800 text-xs font-bold">إغلاق</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit overflow-x-auto">
        <button onClick={() => setTab("listings")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${tab === "listings" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          إدارة الإعلانات
        </button>
        <button onClick={() => setTab("offices")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${tab === "offices" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          المكاتب الدلالية
        </button>
        <button onClick={() => setTab("lawyers")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${tab === "lawyers" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          المحامون
        </button>
        <button onClick={() => setTab("payouts")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap flex items-center gap-1.5 ${tab === "payouts" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          طلبات السحب
          {payouts.filter((p) => p.status === "pending").length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{payouts.filter((p) => p.status === "pending").length}</span>
          )}
        </button>
        <button onClick={() => setTab("reports")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap flex items-center gap-1.5 ${tab === "reports" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          البلاغات
          {openCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{openCount}</span>
          )}
        </button>
        <button onClick={() => setTab("areas")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${tab === "areas" ? "bg-white dark:bg-gray-700 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
          المناطق
        </button>
      </div>

      {/* Listings table */}
      {tab === "listings" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">الإعلان</th>
                  <th className="px-4 py-3 font-medium">المعلن</th>
                  <th className="px-4 py-3 font-medium">السعر</th>
                  <th className="px-4 py-3 font-medium">التصنيف</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {data.listings.map((listing) => (
                  <tr key={listing.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <Link href={`/listings/${listing.id}`} className="font-medium text-gray-800 dark:text-gray-100 hover:text-orange-500 line-clamp-1 flex items-center gap-1">
                        {listing.pinned && <Pin className="w-3.5 h-3.5 text-orange-500 fill-orange-500 flex-shrink-0" />}
                        {listing.title}
                      </Link>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {listing.city} · {listing.category} · <Eye className="w-3 h-3 inline" /> {listing.views}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700 dark:text-gray-300 text-xs">{listing.user.name}</p>
                      <p className="text-gray-400 text-xs">{listing.user.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-orange-500 font-bold text-xs whitespace-nowrap">
                      {formatPrice(listing.price)}
                    </td>
                    <td className="px-4 py-3">
                      <select value={listing.dealType || "للبيع"} onChange={(e) => updateDealType(listing.id, e.target.value)}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
                        {DEAL_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        listing.status === "active" ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400"
                      }`}>
                        {listing.status === "active" ? "نشط" : "مخفي"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => togglePin(listing.id, !listing.pinned)}
                          className={`transition ${listing.pinned ? "text-orange-500 hover:text-orange-600" : "text-gray-300 dark:text-gray-600 hover:text-orange-400"}`}
                          title={listing.pinned ? "إلغاء التثبيت" : "تثبيت في المقدمة"}>
                          <Pin className={`w-4 h-4 ${listing.pinned ? "fill-orange-500" : ""}`} />
                        </button>
                        {listing.status === "active" ? (
                          <button onClick={() => updateStatus(listing.id, "hidden")}
                            className="text-yellow-400 hover:text-yellow-600 transition" title="إخفاء">
                            <XCircle className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => updateStatus(listing.id, "active")}
                            className="text-green-400 hover:text-green-600 transition" title="تفعيل">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => deleteListing(listing.id)}
                          className="text-red-300 hover:text-red-500 transition" title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Offices management */}
      {tab === "offices" && (
        <div className="grid md:grid-cols-2 gap-5">
          {/* Add office form */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 h-fit">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-orange-500" /> إضافة مكتب دلالية
            </h2>
            {officeError && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">{officeError}</div>
            )}
            <form onSubmit={addOffice} className="space-y-3">
              <div>
                <label className={labelCls}>اسم المكتب</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: مكتب الأمانة للعقارات"
                  className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>المحافظة</label>
                  <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className={inputCls}>
                    <option value="">اختر</option>
                    {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>المنطقة</label>
                  <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}
                    placeholder="اختياري"
                    className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>رقم الهاتف</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="07XXXXXXXXX"
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>العنوان التفصيلي <span className="text-gray-400">(اختياري)</span></label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="مثال: شارع الرئيسي، قرب الجامع"
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>ساعات العمل <span className="text-gray-400">(اختياري)</span></label>
                <input value={form.workingHours} onChange={(e) => setForm({ ...form, workingHours: e.target.value })}
                  placeholder="مثال: السبت - الخميس، 9 صباحاً - 6 مساءً"
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>نبذة عن المكتب <span className="text-gray-400">(اختياري)</span></label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="نبذة قصيرة عن المكتب وخدماته"
                  rows={3}
                  className={`${inputCls} resize-none`} />
              </div>
              <div>
                <label className={labelCls}>موقع المكتب على الخريطة <span className="text-gray-400">(اختياري)</span></label>
                <LocationPicker value={coords} onChange={setCoords} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? "جاري الحفظ..." : "إضافة المكتب"}
              </button>
            </form>
          </div>

          {/* Offices list */}
          <div className="space-y-3">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Handshake className="w-5 h-5 text-orange-500" /> المكاتب المعتمدة ({offices.length})
            </h2>
            {offices.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-8 text-center text-gray-400">
                <Handshake className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">لا توجد مكاتب معتمدة بعد</p>
                <p className="text-xs mt-1">أضف أول مكتب دلالية من النموذج</p>
              </div>
            ) : (
              offices.map((office) => {
                const status = officeStatuses[office.id] || "active";
                return (
                  <div key={office.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{office.name}</p>
                        <span className="text-xs text-gray-400">{office.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                          {status === "active" ? "نشط" : "معلّق"}
                        </span>
                      </div>
                      <p className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs mb-0.5">
                        <MapPin className="w-3.5 h-3.5 text-orange-400" />
                        {office.city}{office.area ? ` - ${office.area}` : ""}
                        {office.address ? ` · ${office.address}` : ""}
                      </p>
                      <p className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs">
                        <Phone className="w-3.5 h-3.5 text-orange-400" /> {office.phone}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => showOfficeQr(office.id)} disabled={qrLoading === office.id} className="text-purple-400 hover:text-purple-600 transition p-1 disabled:opacity-50" title="باركود المكتب">
                        {qrLoading === office.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                      </button>
                      <button onClick={() => resetOfficePassword(office.id)} className="text-blue-300 hover:text-blue-500 transition p-1" title="إعادة تعيين كلمة المرور">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleOfficeStatus(office.id)} className={`transition p-1 ${status === "active" ? "text-amber-400 hover:text-amber-600" : "text-emerald-400 hover:text-emerald-600"}`} title={status === "active" ? "تعليق" : "تفعيل"}>
                        {status === "active" ? <Ban className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                      </button>
                      <button onClick={() => deleteOffice(office.id)}
                        className="text-red-300 hover:text-red-500 transition p-1" title="حذف">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Lawyers management */}
      {tab === "lawyers" && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 h-fit">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-orange-500" /> إضافة محامٍ معتمد
            </h2>
            {lawyerError && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">{lawyerError}</div>
            )}
            <form onSubmit={addLawyer} className="space-y-3">
              <div>
                <label className={labelCls}>اسم المحامي</label>
                <input value={lawyerForm.name} onChange={(e) => setLawyerForm({ ...lawyerForm, name: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>رقم الهاتف</label>
                  <input value={lawyerForm.phone} onChange={(e) => setLawyerForm({ ...lawyerForm, phone: e.target.value })} placeholder="07XXXXXXXXX" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>البريد الإلكتروني <span className="text-gray-400">(اختياري)</span></label>
                  <input value={lawyerForm.email} onChange={(e) => setLawyerForm({ ...lawyerForm, email: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>التخصص</label>
                  <select value={lawyerForm.specialization} onChange={(e) => setLawyerForm({ ...lawyerForm, specialization: e.target.value })} className={inputCls}>
                    {SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>المحافظة</label>
                  <select value={lawyerForm.city} onChange={(e) => setLawyerForm({ ...lawyerForm, city: e.target.value })} className={inputCls}>
                    {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={lawyerSaving}
                className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {lawyerSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {lawyerSaving ? "جاري الحفظ..." : "إضافة المحامي"}
              </button>
            </form>
          </div>

          <div className="space-y-3">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Scale className="w-5 h-5 text-orange-500" /> المحامون المعتمدون ({lawyers.length})
            </h2>
            {lawyers.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-8 text-center text-gray-400">
                <Scale className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">لا يوجد محامون معتمدون بعد</p>
              </div>
            ) : (
              lawyers.map((l) => (
                <div key={l.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{l.name}</p>
                      <span className="text-xs text-gray-400">{l.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                        {l.status === "active" ? "نشط" : "معلّق"}
                      </span>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">{l.specialization} · {l.city} · {l.phone}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => resetLawyerPassword(l.id)} className="text-blue-300 hover:text-blue-500 transition p-1" title="إعادة تعيين كلمة المرور">
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleLawyerStatus(l.id, l.status)} className={`transition p-1 ${l.status === "active" ? "text-amber-400 hover:text-amber-600" : "text-emerald-400 hover:text-emerald-600"}`} title={l.status === "active" ? "تعليق" : "تفعيل"}>
                      {l.status === "active" ? <Ban className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                    </button>
                    <button onClick={() => deleteLawyer(l.id)} className="text-red-300 hover:text-red-500 transition p-1" title="حذف">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Payout requests */}
      {tab === "payouts" && (
        payouts.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-10 text-center text-gray-400">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">لا توجد طلبات سحب</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payouts.map((p) => (
              <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{p.payeeName} <span className="text-gray-400 text-xs">({p.payeeType === "office" ? "مكتب" : "محامٍ"})</span></p>
                  <p className="text-orange-500 font-bold text-sm mt-0.5">{p.amount.toLocaleString("ar-IQ")} د.ع</p>
                  <p className="text-gray-400 text-xs mt-0.5">{timeAgo(p.requestedAt)}</p>
                </div>
                {p.status === "pending" ? (
                  <div className="flex gap-2">
                    <button onClick={() => updatePayoutStatus(p.id, "approved")} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium">موافقة</button>
                    <button onClick={() => updatePayoutStatus(p.id, "paid")} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">تم الدفع</button>
                  </div>
                ) : p.status === "approved" ? (
                  <button onClick={() => updatePayoutStatus(p.id, "paid")} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">تم الدفع</button>
                ) : (
                  <span className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">تم الدفع</span>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Reports panel */}
      {tab === "reports" && (
        reports.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-10 text-center text-gray-400">
            <Flag className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">لا توجد بلاغات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.id} className={`bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 border ${r.status === "open" ? "border-red-100 dark:border-red-900" : "border-gray-100 dark:border-gray-800 opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === "open" ? "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400"}`}>
                        {r.status === "open" ? "جديد" : "تمت المعالجة"}
                      </span>
                      <span className="text-orange-600 dark:text-orange-400 text-sm font-medium">{r.reason}</span>
                    </div>
                    {r.listingId ? (
                      <Link href={`/listings/${r.listingId}`} className="font-bold text-gray-800 dark:text-gray-100 text-sm hover:text-orange-500 line-clamp-1 block">
                        {r.listingTitle || "إعلان محذوف"}
                      </Link>
                    ) : (
                      <p className="font-bold text-gray-400 text-sm">إعلان محذوف</p>
                    )}
                    {r.note && <p className="text-gray-500 dark:text-gray-400 text-xs mt-1 leading-relaxed">{r.note}</p>}
                    <p className="text-gray-400 text-xs mt-1">
                      بلاغ من {r.reporterName || "مستخدم"} · {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  {r.status === "open" && (
                    <button onClick={() => resolveReport(r.id)}
                      className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900 transition rounded-xl px-3 py-2 text-xs font-medium flex-shrink-0">
                      <CheckCircle className="w-4 h-4" /> معالجة
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Areas management */}
      {tab === "areas" && (
        <div className="grid md:grid-cols-2 gap-5">
          {/* Add area form */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 h-fit">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Map className="w-5 h-5 text-orange-500" /> إضافة منطقة / حي جديد
            </h2>
            {areaError && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">{areaError}</div>
            )}
            <form onSubmit={addArea} className="space-y-3">
              <div>
                <label className={labelCls}>المحافظة</label>
                <select value={areaCity} onChange={(e) => setAreaCity(e.target.value)} className={inputCls}>
                  {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>اسم المنطقة / الحي</label>
                <input value={areaName} onChange={(e) => setAreaName(e.target.value)}
                  placeholder="مثال: الغزالية" className={inputCls} />
              </div>
              <button type="submit" disabled={areaSaving}
                className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2">
                {areaSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {areaSaving ? "جاري الحفظ..." : "إضافة المنطقة"}
              </button>
            </form>
          </div>

          {/* Areas list */}
          <div className="space-y-3">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-orange-500" /> مناطق {areaCity} ({areas.length})
            </h2>
            {areas.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-8 text-center text-gray-400">
                <Map className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">لا توجد مناطق لهذه المحافظة بعد</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-3 flex flex-wrap gap-2">
                {areas.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-full pr-3 pl-1.5 py-1 text-sm text-gray-700 dark:text-gray-200">
                    {a.name}
                    <button onClick={() => deleteArea(a.id)} className="text-gray-300 hover:text-red-500 transition" title="حذف">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Office QR modal */}
      {qr && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setQr(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 dark:text-gray-100">باركود المكتب</h3>
              <button onClick={() => setQr(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{qr.officeName}</p>
            <img src={qr.qr} alt="QR" className="w-56 h-56 mx-auto rounded-xl border border-gray-100 dark:border-gray-800" />
            <p className="text-xs text-gray-400 mt-3 break-all" dir="ltr">{qr.url}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">عند المسح تُفتح محادثة مع دلال العراق منسوبة لهذا المكتب.</p>
            <a href={qr.qr} download={`qr-${qr.officeName}.png`}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-orange-500 text-white py-2.5 rounded-xl font-bold hover:bg-orange-600 transition text-sm">
              <Download className="w-4 h-4" /> تنزيل الباركود
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
