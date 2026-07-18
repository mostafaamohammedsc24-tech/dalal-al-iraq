import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Plus, Trash2, Pencil, X, Home, ShieldCheck, Clock, CheckCircle2, QrCode, Download } from "lucide-react";
import { api, getUser, uploadFile, mediaUrl } from "@/lib/api";
import { CITIES, formatPrice, formatSize } from "@/lib/utils";

const PROPERTY_TYPES = ["أرض", "شقة", "دار", "محل"];

interface NetworkProperty {
  id: string;
  type: string;
  city: string;
  area?: string | null;
  price: number;
  size?: number | null;
  rooms?: number | null;
  description?: string | null;
  images: string[];
  status: string;
  inspectionReportUrl?: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
  pending_audit: { label: "بانتظار الفحص القانوني", tone: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400", icon: Clock },
  available: { label: "متاح في الشبكة", tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400", icon: ShieldCheck },
  pending: { label: "قيد التفاوض", tone: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400", icon: Clock },
  sold: { label: "مباع", tone: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400", icon: CheckCircle2 },
};

const emptyForm = { type: "دار", city: CITIES[0], area: "", price: "", size: "", rooms: "", description: "" };

export default function OfficeDashboardPage() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [properties, setProperties] = useState<NetworkProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NetworkProperty | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requestingInspection, setRequestingInspection] = useState<NetworkProperty | null>(null);
  const [qr, setQr] = useState<{ officeName: string; url: string; qr: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  async function showMyQr() {
    const u = getUser();
    if (!u) return;
    setQrLoading(true);
    try {
      const d = await api.get<{ officeName: string; url: string; qr: string }>(`/offices/${u.userId}/qr`);
      setQr(d);
    } catch {
      alert("تعذّر جلب الباركود");
    } finally {
      setQrLoading(false);
    }
  }

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "office") { navigate("/office/login"); return; }
    setReady(true);
    load();
  }, [navigate]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ properties: NetworkProperty[] }>("/network-properties/mine");
      setProperties(data.properties);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setImages([]);
    setError("");
    setShowForm(true);
  }

  function openEdit(p: NetworkProperty) {
    setEditing(p);
    setForm({
      type: p.type, city: p.city, area: p.area || "",
      price: String(p.price), size: p.size ? String(p.size) : "",
      rooms: p.rooms ? String(p.rooms) : "", description: p.description || "",
    });
    setImages(p.images || []);
    setError("");
    setShowForm(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(Array.from(files).slice(0, 10).map((f) => uploadFile(f)));
      setImages((prev) => [...prev, ...uploaded].slice(0, 15));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "تعذر رفع الصور");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.price || Number(form.price) <= 0) { setError("السعر مطلوب"); return; }
    setSaving(true);
    try {
      const payload = { ...form, price: Number(form.price), size: form.size ? Number(form.size) : null, rooms: form.rooms ? Number(form.rooms) : null, images };
      if (editing) await api.patch(`/network-properties/${editing.id}`, payload);
      else await api.post("/network-properties", payload);
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("هل تريد حذف هذا العقار من الشبكة؟")) return;
    await api.delete(`/network-properties/${id}`);
    load();
  }

  async function submitInspectionRequest(tier: string) {
    if (!requestingInspection) return;
    try {
      await api.post("/inspections/requests", { propertyId: requestingInspection.id, tier });
      setRequestingInspection(null);
      alert("تم إرسال طلب الفحص القانوني، سيتم إشعارك عند القبول");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر إرسال الطلب");
    }
  }

  if (!ready) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">عقاراتي في الشبكة</h1>
          <p className="text-gray-400 text-sm mt-0.5">أضف عقاراً واطلب فحصاً قانونياً لنشره للمكاتب الأخرى</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={showMyQr} disabled={qrLoading}
            className="border border-purple-300 dark:border-purple-800 text-purple-600 dark:text-purple-400 rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 hover:bg-purple-50 dark:hover:bg-purple-950 transition disabled:opacity-50">
            <QrCode className="w-4 h-4" /> باركود المكتب
          </button>
          <button onClick={openCreate} className="bg-orange-500 text-white rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 hover:bg-orange-600 transition">
            <Plus className="w-4 h-4" /> إضافة عقار
          </button>
        </div>
      </div>

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
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">اطبع الباركود وضعه في مكتبك — عند مسحه تُفتح محادثة مع دلال العراق منسوبة لمكتبك.</p>
            <a href={qr.qr} download={`qr-${qr.officeName}.png`}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-orange-500 text-white py-2.5 rounded-xl font-bold hover:bg-orange-600 transition text-sm">
              <Download className="w-4 h-4" /> تنزيل الباركود
            </a>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري التحميل...</div>
      ) : properties.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <Home className="w-10 h-10 mx-auto mb-3 opacity-30" />
          لم تُضف أي عقار بعد
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {properties.map((p) => {
            const status = STATUS_LABELS[p.status] || STATUS_LABELS.pending_audit;
            const StatusIcon = status.icon;
            return (
              <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
                <div className="h-36 bg-gray-100 dark:bg-gray-800">
                  {p.images[0] && <img src={mediaUrl(p.images[0])} alt={p.type} className="w-full h-full object-cover" />}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${status.tone}`}>
                      <StatusIcon className="w-3 h-3" /> {status.label}
                    </span>
                    <span className="text-xs text-gray-300">{p.type}</span>
                  </div>
                  <p className="font-bold text-gray-800 dark:text-gray-100">{formatPrice(p.price)}</p>
                  <p className="text-sm text-gray-400">{p.city}{p.size ? ` · ${formatSize(p.size)}` : ""}</p>
                  <div className="flex items-center gap-2 mt-3">
                    {p.status === "pending_audit" && !p.inspectionReportUrl && (
                      <button onClick={() => setRequestingInspection(p)} className="text-xs bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 px-3 py-1.5 rounded-lg font-medium hover:bg-orange-100 transition">
                        طلب فحص قانوني
                      </button>
                    )}
                    {p.inspectionReportUrl && p.status === "pending_audit" && (
                      <button onClick={() => api.patch(`/network-properties/${p.id}`, { status: "available" }).then(load)} className="text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-100 transition">
                        نشر في الشبكة
                      </button>
                    )}
                    <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-orange-500 p-1.5"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-red-500 p-1.5"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {requestingInspection && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setRequestingInspection(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-1">طلب فحص قانوني</h2>
            <p className="text-sm text-gray-400 mb-4">اختر درجة الفحص المطلوبة</p>
            <div className="space-y-2">
              {[{ id: "silver", label: "فضية - فحص أساسي" }, { id: "gold", label: "ذهبية - فحص شامل" }, { id: "diamond", label: "ماسية - فحص متقدم مع متابعة" }].map((t) => (
                <button key={t.id} onClick={() => submitInspectionRequest(t.id)} className="w-full text-right p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition text-sm">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">{editing ? "تعديل العقار" : "إضافة عقار"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 mb-3">{error}</div>}
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm">
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm">
                  {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="المنطقة" className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <div className="grid grid-cols-3 gap-3">
                <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="السعر" required className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
                <input type="number" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="المساحة م²" className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
                <input type="number" value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} placeholder="الغرف" className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف العقار" rows={3} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
              <div>
                <label className="text-sm text-gray-500 mb-1.5 block">الصور</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden">
                      <img src={mediaUrl(img)} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setImages(images.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">×</button>
                    </div>
                  ))}
                </div>
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} disabled={uploading} className="text-sm" />
              </div>
              <button type="submit" disabled={saving} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm">
                {saving ? "جاري الحفظ..." : "حفظ"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
