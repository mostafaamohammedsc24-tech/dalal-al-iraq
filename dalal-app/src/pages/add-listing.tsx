import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Building2, Car, X, Upload, MapPin, Phone, Handshake, Loader2, ImagePlus, Video as VideoIcon, Film } from "lucide-react";
import { CITIES, REAL_ESTATE_TYPES, CAR_BRANDS, SIZE_OPTIONS, OWNERSHIP_TYPES, BEDROOM_OPTIONS, BATHROOM_OPTIONS, CAR_YEARS, formatPrice, fileToCompressedDataUrl } from "@/lib/utils";
import { api, getUser, uploadFile, mediaUrl } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { LocationPicker } from "@/components/location-picker";

interface MarketStats {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  count: number;
  avgPricePerM2: number;
}

interface Office {
  id: string;
  name: string;
  city: string;
  area: string | null;
  phone: string;
  address: string | null;
}

export default function AddListingPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [size, setSize] = useState("");
  const [ownershipType, setOwnershipType] = useState("");
  const [dealType, setDealType] = useState("للبيع");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [buildYear, setBuildYear] = useState("");
  const [carYear, setCarYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [video, setVideo] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [offices, setOffices] = useState<Office[]>([]);
  const [officesLoading, setOfficesLoading] = useState(false);
  const [market, setMarket] = useState<MarketStats | null>(null);

  const t = useT();
  const types = category === "عقارات" ? REAL_ESTATE_TYPES : CAR_BRANDS;

  const inputCls = "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500";
  const selectCls = "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100";
  const labelCls = "block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5";

  useEffect(() => {
    if (!category) { setMarket(null); return; }
    const p = new URLSearchParams({ category });
    if (city) p.set("city", city);
    api.get<MarketStats>(`/listings/market/stats?${p.toString()}`)
      .then((d) => setMarket(d.count > 0 ? d : null))
      .catch(() => setMarket(null));
  }, [category, city]);

  useEffect(() => {
    if (!city) { setOffices([]); return; }
    setOfficesLoading(true);
    api.get<{ offices: Office[] }>(`/offices?city=${encodeURIComponent(city)}`)
      .then((d) => setOffices(d.offices))
      .catch(() => setOffices([]))
      .finally(() => setOfficesLoading(false));
  }, [city]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError("");
    setUploading(true);
    try {
      const remaining = 6 - images.length;
      const toProcess = files.slice(0, remaining);
      const processed = await Promise.all(toProcess.map((f) => fileToCompressedDataUrl(f)));
      setImages((prev) => [...prev, ...processed]);
    } catch {
      setError("تعذر تحميل بعض الصور");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removeImage(i: number) {
    setImages((prev) => prev.filter((_, j) => j !== i));
  }

  async function handleVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("الرجاء اختيار ملف فيديو"); return; }
    if (file.size > 80 * 1024 * 1024) { setError("حجم الفيديو يجب أن يكون أقل من 80 ميغابايت"); return; }
    setError("");
    setVideoUploading(true);
    try {
      const path = await uploadFile(file);
      setVideo(path);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "تعذر رفع الفيديو");
    } finally {
      setVideoUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!getUser()) { navigate("/login"); return; }
    setError(""); setLoading(true);
    try {
      const listing = await api.post<{ id: string }>("/listings", {
        title, description,
        price: parseFloat(price),
        category, type, city,
        area: area || null,
        size: category === "عقارات" && size ? parseFloat(size) : null,
        ownershipType: category === "عقارات" && ownershipType ? ownershipType : null,
        dealType,
        bedrooms: category === "عقارات" && bedrooms ? parseInt(bedrooms) : null,
        bathrooms: category === "عقارات" && bathrooms ? parseInt(bathrooms) : null,
        buildYear: category === "عقارات" && buildYear ? parseInt(buildYear) : null,
        carYear: category === "سيارات" && carYear ? parseInt(carYear) : null,
        mileage: category === "سيارات" && mileage ? parseInt(mileage) : null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        images,
        video,
      });
      navigate(`/listings/${listing.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">إضافة إعلان جديد</h1>
      <p className="text-gray-400 text-sm mb-5">انشر إعلانك مجاناً وصل لآلاف المشترين</p>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-7">
        {["الفئة", "التفاصيل", "الموقع والصور"].map((label, i) => {
          const s = i + 1;
          return (
            <div key={label} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${s <= step ? "bg-orange-500" : "bg-gray-200 dark:bg-gray-700"}`} />
              <p className={`text-[11px] mt-1.5 text-center font-medium ${s <= step ? "text-orange-500" : "text-gray-400"}`}>{label}</p>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl p-3 mb-4 text-sm">{error}</div>
      )}

      {/* Step 1: Category */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-4">اختر نوع الإعلان</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { val: "عقارات", Icon: Building2, color: "blue", sub: "شقق، بيوت، أراضي" },
              { val: "سيارات", Icon: Car, color: "emerald", sub: "جديدة ومستعملة" },
            ].map(({ val, Icon, color, sub }) => (
              <button key={val}
                onClick={() => { setCategory(val); setType(""); setStep(2); }}
                className={`p-6 rounded-2xl border-2 text-center transition ${
                  category === val
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                    : "border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700 bg-white dark:bg-gray-900"
                }`}>
                <Icon className={`w-10 h-10 text-${color}-500 mx-auto mb-2`} />
                <p className="font-bold text-gray-800 dark:text-gray-100">{val}</p>
                <p className="text-gray-400 text-sm">{sub}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-2">تفاصيل {category === "عقارات" ? "العقار" : "السيارة"}</h2>

          <div>
            <label className={labelCls}>
              {category === "عقارات" ? "نوع العقار" : "ماركة السيارة"}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {types.map((tp) => (
                <button key={tp} onClick={() => setType(tp)}
                  className={`py-2 px-2 rounded-xl text-xs border-2 transition font-medium ${
                    type === tp
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-600"
                      : "border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700 text-gray-600 dark:text-gray-300"
                  }`}>
                  {tp}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("add.titleField")}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={category === "عقارات" ? "مثال: شقة 3 غرف في حي الجامعة" : "مثال: تويوتا كامري 2022 بحالة ممتازة"}
              className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>وصف تفصيلي</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="اذكر كل التفاصيل المهمة: المساحة، الحالة، المميزات..." rows={4}
              className={`${inputCls} resize-none`} />
          </div>

          <div>
            <label className={labelCls}>السعر (دينار عراقي)</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" placeholder="0" min="0"
              className={inputCls} />

            {market && (
              <div className="mt-2 rounded-xl border border-orange-100 dark:border-orange-900 bg-orange-50/60 dark:bg-orange-950/40 p-3">
                <p className="text-xs font-bold text-orange-600 dark:text-orange-400 mb-1">{t("add.valuationTitle")}</p>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  {t("add.valuationAvg")}: <span className="font-bold text-gray-800 dark:text-gray-200">{formatPrice(market.avgPrice)}</span>
                  {" · "}{t("add.valuationRange")}: {formatPrice(market.minPrice)} — {formatPrice(market.maxPrice)}
                </p>
                {price && parseFloat(price) > 0 && (
                  <p className="text-[11px] mt-1 font-medium">
                    {parseFloat(price) > market.avgPrice * 1.15 ? (
                      <span className="text-amber-600">{t("add.valuationHigh")}</span>
                    ) : parseFloat(price) < market.avgPrice * 0.85 ? (
                      <span className="text-emerald-600">{t("add.valuationLow")}</span>
                    ) : (
                      <span className="text-emerald-600">{t("add.valuationFair")}</span>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>نوع العرض</label>
            <div className="grid grid-cols-2 gap-2">
              {["للبيع", "للايجار"].map((d) => (
                <button key={d} type="button" onClick={() => setDealType(d)}
                  className={`py-2.5 rounded-xl text-sm border-2 transition font-medium ${
                    dealType === d
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-600"
                      : "border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700 text-gray-600 dark:text-gray-300"
                  }`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {category === "عقارات" && (
            <>
              <div>
                <label className={labelCls}>المساحة (م²)</label>
                <select value={size} onChange={(e) => setSize(e.target.value)} className={selectCls}>
                  <option value="">اختر المساحة (اختياري)</option>
                  {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s} م²</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t("listings.bedrooms")}</label>
                  <select value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className={selectCls}>
                    <option value="">{t("common.optional")}</option>
                    {BEDROOM_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t("listings.bathrooms")}</label>
                  <select value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} className={selectCls}>
                    <option value="">{t("common.optional")}</option>
                    {BATHROOM_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>{t("detail.buildYear")} <span className="text-gray-400">({t("common.optional")})</span></label>
                <select value={buildYear} onChange={(e) => setBuildYear(e.target.value)} className={selectCls}>
                  <option value="">اختر السنة</option>
                  {CAR_YEARS.filter((y) => y <= new Date().getFullYear()).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>{t("detail.ownership")}</label>
                <div className="grid grid-cols-2 gap-2">
                  {OWNERSHIP_TYPES.map((o) => (
                    <button key={o} type="button" onClick={() => setOwnershipType(ownershipType === o ? "" : o)}
                      className={`py-2.5 rounded-xl text-sm border-2 transition font-medium ${
                        ownershipType === o
                          ? "border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-600"
                          : "border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-700 text-gray-600 dark:text-gray-300"
                      }`}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {category === "سيارات" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t("detail.carYear")}</label>
                <select value={carYear} onChange={(e) => setCarYear(e.target.value)} className={selectCls}>
                  <option value="">{t("common.optional")}</option>
                  {CAR_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>المسافة (كم)</label>
                <input value={mileage} onChange={(e) => setMileage(e.target.value)} type="number" min="0" placeholder="اختياري"
                  className={inputCls} />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep(1)}
              className="flex-1 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition text-gray-600 dark:text-gray-300">
              {t("common.previous")}
            </button>
            <button onClick={() => {
              if (!type || !title.trim() || !description.trim() || !price) {
                setError("يرجى تعبئة جميع الحقول"); return;
              }
              setError(""); setStep(3);
            }} className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition text-sm">
              {t("common.next")}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Location + Images */}
      {step === 3 && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200">الموقع والصور</h2>

          <div>
            <label className={labelCls}>{t("common.city")}</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} required className={selectCls}>
              <option value="">اختر المحافظة</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>المنطقة / الحي <span className="text-gray-400">({t("common.optional")})</span></label>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="مثال: حي الجامعة"
              className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>
              الموقع على الخريطة <span className="text-gray-400">(اختياري — ابحث عن معلم أو اضغط على الخريطة)</span>
            </label>
            <LocationPicker value={coords} onChange={setCoords} />
          </div>

          {/* Nearest brokerage office notice */}
          {city && (
            <div className="rounded-2xl border border-orange-100 dark:border-orange-900 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/50 dark:to-amber-950/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Handshake className="w-5 h-5 text-orange-500" />
                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm">الدلال المعتمد لمنطقتك</h3>
              </div>
              {officesLoading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> جاري البحث عن أقرب مكتب...
                </div>
              ) : offices.length > 0 ? (
                <>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-orange-100 dark:border-orange-900 mb-3">
                    <p className="font-bold text-gray-800 dark:text-gray-100 text-sm mb-1">{offices[0].name}</p>
                    <p className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs mb-0.5">
                      <MapPin className="w-3.5 h-3.5 text-orange-400" />
                      {offices[0].city}{offices[0].area ? ` - ${offices[0].area}` : ""}
                      {offices[0].address ? ` · ${offices[0].address}` : ""}
                    </p>
                    <p className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs">
                      <Phone className="w-3.5 h-3.5 text-orange-400" />
                      {offices[0].phone}
                    </p>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed">
                    عند العثور على مشترٍ لإعلانك، تتم عملية المكاتبة وإتمام الصفقة بشكل آمن وموثوق
                    في هذا المكتب الأقرب إليك ضمن شبكة دلال العراق.
                  </p>
                </>
              ) : (
                <p className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed">
                  لا يوجد مكتب دلالية معتمد في <span className="font-bold">{city}</span> حالياً.
                  سيتواصل معك فريق شبكة دلال العراق لترتيب أقرب مكتب لإتمام الصفقة بأمان عند العثور على مشترٍ.
                </p>
              )}
            </div>
          )}

          {/* Image upload */}
          <div>
            <label className={labelCls}>
              صور الإعلان <span className="text-gray-400">(حتى 6 صور من جهازك)</span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 group">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImage(i)}
                    className="absolute top-1 left-1 bg-black/50 text-white rounded-full p-1 hover:bg-red-500 transition">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {images.length < 6 && (
                <label className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition ${
                  uploading
                    ? "border-orange-200 bg-orange-50 dark:bg-orange-950"
                    : "border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50/50 dark:hover:bg-orange-950/30 text-gray-400"
                }`}>
                  {uploading ? (
                    <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="w-6 h-6 mb-1" />
                      <span className="text-[11px] font-medium">أضف صورة</span>
                    </>
                  )}
                  <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={uploading} className="hidden" />
                </label>
              )}
            </div>

            {images.length === 0 && !uploading && (
              <p className="flex items-center gap-1.5 text-gray-400 text-xs mt-2">
                <Upload className="w-3.5 h-3.5" /> اختر صوراً واضحة لزيادة فرص البيع
              </p>
            )}
          </div>

          {/* Video upload */}
          <div>
            <label className={labelCls}>
              فيديو الإعلان <span className="text-gray-400">(اختياري — مقطع واحد حتى 80 ميغابايت)</span>
            </label>

            {video ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <video src={mediaUrl(video)} controls playsInline preload="metadata" className="w-full h-48 object-cover bg-black" />
                <button type="button" onClick={() => setVideo(null)}
                  className="absolute top-2 left-2 bg-black/55 text-white rounded-full p-1.5 hover:bg-red-500 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-7 cursor-pointer transition ${
                videoUploading
                  ? "border-orange-200 bg-orange-50 dark:bg-orange-950"
                  : "border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50/50 dark:hover:bg-orange-950/30 text-gray-400"
              }`}>
                {videoUploading ? (
                  <>
                    <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
                    <span className="text-xs font-medium text-orange-500">جاري رفع الفيديو...</span>
                  </>
                ) : (
                  <>
                    <Film className="w-7 h-7" />
                    <span className="text-xs font-medium">أضف فيديو للإعلان</span>
                  </>
                )}
                <input type="file" accept="video/*" onChange={handleVideo} disabled={videoUploading} className="hidden" />
              </label>
            )}
            <p className="flex items-center gap-1.5 text-gray-400 text-xs mt-2">
              <VideoIcon className="w-3.5 h-3.5" /> الفيديو يظهر أولاً في معرض الإعلان ويزيد ثقة المشتري
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep(2)}
              className="flex-1 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition text-gray-600 dark:text-gray-300">
              {t("common.previous")}
            </button>
            <button type="submit" disabled={loading || uploading || videoUploading || !city}
              className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 text-sm">
              {loading ? t("add.publishing") : t("add.publish")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
