import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Scale, Plus, Trash2, Save } from "lucide-react";
import { api, getUser } from "@/lib/api";

interface LawyerProfile {
  id: string; name: string; phone: string; email?: string | null; specialization: string; city: string;
  availability: string; bio?: string | null; yearsExperience?: number | null; licenseNumber?: string | null;
  syndicateNumber?: string | null; officeAddress?: string | null; status: string;
}
interface Service {
  id: string; name: string; price?: number | null; description?: string | null;
}

export default function LawyerDashboardPage() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [lawyerId, setLawyerId] = useState("");
  const [profile, setProfile] = useState<LawyerProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bio: "", email: "", officeAddress: "", yearsExperience: "", licenseNumber: "", syndicateNumber: "" });
  const [newService, setNewService] = useState({ name: "", price: "", description: "" });

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "lawyer") { navigate("/lawyer/login"); return; }
    setLawyerId(u.userId);
    setReady(true);
    load(u.userId);
  }, [navigate]);

  async function load(id: string) {
    setLoading(true);
    try {
      const d = await api.get<{ lawyer: LawyerProfile; services: Service[] }>(`/lawyers/${id}`);
      setProfile(d.lawyer);
      setServices(d.services);
      setForm({
        bio: d.lawyer.bio || "", email: d.lawyer.email || "", officeAddress: d.lawyer.officeAddress || "",
        yearsExperience: d.lawyer.yearsExperience ? String(d.lawyer.yearsExperience) : "",
        licenseNumber: d.lawyer.licenseNumber || "", syndicateNumber: d.lawyer.syndicateNumber || "",
      });
    } finally {
      setLoading(false);
    }
  }

  async function toggleAvailability() {
    if (!profile) return;
    const next = profile.availability === "available" ? "busy" : "available";
    const updated = await api.patch<LawyerProfile>("/lawyers/me", { availability: next });
    setProfile((p) => (p ? { ...p, availability: updated.availability } : p));
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.patch<LawyerProfile>("/lawyers/me", form);
      setProfile((p) => (p ? { ...p, ...updated } : p));
      alert("تم حفظ الملف الشخصي");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function addService(e: React.FormEvent) {
    e.preventDefault();
    if (!newService.name.trim()) return;
    await api.post("/lawyer-services", { ...newService, price: newService.price ? Number(newService.price) : null });
    setNewService({ name: "", price: "", description: "" });
    load(lawyerId);
  }

  async function removeService(id: string) {
    await api.delete(`/lawyer-services/${id}`);
    load(lawyerId);
  }

  if (!ready || loading || !profile) return <div className="text-center text-gray-400 py-16">جاري التحميل...</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Scale className="w-5 h-5 text-orange-500" /> لوحة المحامي
        </h1>
        <button onClick={toggleAvailability} className={`text-sm px-4 py-2 rounded-xl font-bold transition ${profile.availability === "available" ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
          {profile.availability === "available" ? "متاح للعمل" : "مشغول حالياً"}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 mb-6">
        <p className="font-bold text-gray-800 dark:text-gray-100 text-lg">{profile.name}</p>
        <p className="text-sm text-gray-400">{profile.specialization} · {profile.city} · {profile.id}</p>
      </div>

      <form onSubmit={saveProfile} className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 mb-6 space-y-3">
        <h2 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-1">تعديل الملف الشخصي</h2>
        <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="نبذة تعريفية" rows={3} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
        <div className="grid grid-cols-2 gap-3">
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="البريد الإلكتروني" className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
          <input type="number" value={form.yearsExperience} onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })} placeholder="سنوات الخبرة" className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
        </div>
        <input value={form.officeAddress} onChange={(e) => setForm({ ...form, officeAddress: e.target.value })} placeholder="عنوان المكتب" className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
        <div className="grid grid-cols-2 gap-3">
          <input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} placeholder="رقم الترخيص" className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
          <input value={form.syndicateNumber} onChange={(e) => setForm({ ...form, syndicateNumber: e.target.value })} placeholder="رقم نقابة المحامين" className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2.5 text-sm" />
        </div>
        <button type="submit" disabled={saving} className="bg-orange-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 transition disabled:opacity-50 flex items-center gap-1.5">
          <Save className="w-4 h-4" /> {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        </button>
      </form>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800">
        <h2 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">خدماتي الإضافية</h2>
        <div className="space-y-2 mb-4">
          {services.map((s) => (
            <div key={s.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{s.name}{s.price ? ` — ${s.price.toLocaleString("ar-IQ")} د.ع` : ""}</p>
                {s.description && <p className="text-xs text-gray-400">{s.description}</p>}
              </div>
              <button onClick={() => removeService(s.id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {services.length === 0 && <p className="text-sm text-gray-400">لا توجد خدمات مضافة بعد</p>}
        </div>
        <form onSubmit={addService} className="flex flex-wrap gap-2">
          <input value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.target.value })} placeholder="اسم الخدمة" className="flex-1 min-w-[120px] border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm" />
          <input type="number" value={newService.price} onChange={(e) => setNewService({ ...newService, price: e.target.value })} placeholder="السعر" className="w-24 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm" />
          <button type="submit" className="bg-orange-500 text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-orange-600 transition flex items-center gap-1"><Plus className="w-4 h-4" /> إضافة</button>
        </form>
      </div>
    </div>
  );
}
