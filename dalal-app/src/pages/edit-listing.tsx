import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2, Save } from "lucide-react";
import { CITIES, SIZE_OPTIONS, BEDROOM_OPTIONS, BATHROOM_OPTIONS, CAR_YEARS } from "@/lib/utils";
import { api, getUser } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface FullListing {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  type: string;
  city: string;
  area: string | null;
  size: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  buildYear: number | null;
  carYear: number | null;
  mileage: number | null;
  dealType: string | null;
  status: string;
  user: { id: string };
}

export default function EditListingPage() {
  const [, params] = useRoute("/edit-listing/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  const t = useT();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [size, setSize] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [buildYear, setBuildYear] = useState("");
  const [carYear, setCarYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [dealType, setDealType] = useState("للبيع");
  const [status, setStatus] = useState("active");

  useEffect(() => {
    if (!id) return;
    const u = getUser();
    if (!u) { navigate("/login"); return; }
    api.get<FullListing>(`/listings/${id}`)
      .then((l) => {
        if (l.user.id !== u.userId && u.role !== "admin") { setDenied(true); return; }
        setCategory(l.category);
        setTitle(l.title);
        setDescription(l.description);
        setPrice(String(l.price));
        setCity(l.city);
        setArea(l.area ?? "");
        setSize(l.size != null ? String(l.size) : "");
        setBedrooms(l.bedrooms != null ? String(l.bedrooms) : "");
        setBathrooms(l.bathrooms != null ? String(l.bathrooms) : "");
        setBuildYear(l.buildYear != null ? String(l.buildYear) : "");
        setCarYear(l.carYear != null ? String(l.carYear) : "");
        setMileage(l.mileage != null ? String(l.mileage) : "");
        setDealType(l.dealType ?? "للبيع");
        setStatus(l.status);
      })
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(""); setSaving(true);
    try {
      await api.patch(`/listings/${id}`, {
        title, description,
        price: parseFloat(price),
        city, area: area || null,
        dealType, status,
        size: category === "عقارات" && size ? parseFloat(size) : null,
        bedrooms: category === "عقارات" && bedrooms ? parseInt(bedrooms) : null,
        bathrooms: category === "عقارات" && bathrooms ? parseInt(bathrooms) : null,
        buildYear: category === "عقارات" && buildYear ? parseInt(buildYear) : null,
        carYear: category === "سيارات" && carYear ? parseInt(carYear) : null,
        mileage: category === "سيارات" && mileage ? parseInt(mileage) : null,
      });
      navigate(`/listings/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.error"));
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
    </div>
  );

  if (denied) return (
    <div className="text-center py-20 text-gray-400">
      <p className="text-lg font-bold mb-2">{t("common.error")}</p>
      <button onClick={() => navigate("/listings")} className="text-orange-500 hover:underline text-sm">
        {t("common.back")}
      </button>
    </div>
  );

  const inputCls = "w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300";

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-5">{t("common.edit")}</h1>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-3 mb-4 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("add.titleField")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("add.descField")}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} required className={`${inputCls} resize-none`} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("add.priceField")}</label>
          <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" required className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">{t("common.type")}</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "للبيع", l: t("common.forSale") },
              { v: "للايجار", l: t("common.forRent") },
              { v: "مباع", l: t("common.sold") },
            ].map(({ v, l }) => (
              <button key={v} type="button" onClick={() => setDealType(v)}
                className={`py-2.5 rounded-xl text-sm border-2 transition font-medium ${
                  dealType === v ? "border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("common.city")}</label>
          <select value={city} onChange={(e) => setCity(e.target.value)} required className={inputCls}>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {category === "عقارات" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.size")}</label>
              <select value={size} onChange={(e) => setSize(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s} م²</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.bedrooms")}</label>
                <select value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {BEDROOM_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.bathrooms")}</label>
                <select value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {BATHROOM_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.buildYear")}</label>
              <select value={buildYear} onChange={(e) => setBuildYear(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {CAR_YEARS.filter((y) => y <= new Date().getFullYear()).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </>
        )}

        {category === "سيارات" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.carYear")}</label>
              <select value={carYear} onChange={(e) => setCarYear(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {CAR_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">{t("detail.mileage")}</label>
              <input value={mileage} onChange={(e) => setMileage(e.target.value)} type="number" min="0" className={inputCls} />
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => navigate(`/listings/${id}`)}
            className="flex-1 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition text-sm disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
