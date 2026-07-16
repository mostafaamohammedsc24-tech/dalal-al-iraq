import { useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { Search, SlidersHorizontal, X, LocateFixed, Loader2, MapPin, Map as MapIcon, LayoutGrid, BellPlus, Check } from "lucide-react";
import { ListingCard, ListingItem } from "@/components/listing-card";
import { ListingsMap } from "@/components/listings-map";
import {
  CITIES, REAL_ESTATE_TYPES, CAR_BRANDS, SIZE_FILTERS, OWNERSHIP_TYPES, DEAL_TYPES,
  BEDROOM_OPTIONS, BATHROOM_OPTIONS, CAR_YEARS, MILEAGE_FILTERS, getCurrentLocation,
} from "@/lib/utils";
import { api, getUser } from "@/lib/api";
import { useT } from "@/lib/i18n";

const NEAR_RADII = [5, 10, 25, 50];

export default function ListingsPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const t = useT();

  const [listings, setListings] = useState<ListingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<"grid" | "map">("grid");
  const [page, setPage] = useState(1);

  const [q, setQ] = useState(params.get("q") || "");
  const [city, setCity] = useState(params.get("city") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [type, setType] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sizeIdx, setSizeIdx] = useState("");
  const [ownershipType, setOwnershipType] = useState("");
  const [dealType, setDealType] = useState("");
  const [minBedrooms, setMinBedrooms] = useState("");
  const [minBathrooms, setMinBathrooms] = useState("");
  const [minBuildYear, setMinBuildYear] = useState("");
  const [minCarYear, setMinCarYear] = useState("");
  const [maxMileageIdx, setMaxMileageIdx] = useState("");
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(10);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  const [suggestions, setSuggestions] = useState<{ id: string; title: string }[]>([]);
  const [showSug, setShowSug] = useState(false);
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, near, radius]);

  function buildParams(forFetch: boolean) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (category) p.set("category", category);
    if (type) p.set("type", type);
    if (minPrice) p.set("minPrice", minPrice);
    if (maxPrice) p.set("maxPrice", maxPrice);
    if (sizeIdx !== "") {
      const f = SIZE_FILTERS[Number(sizeIdx)];
      if (f?.min) p.set("minSize", f.min);
      if (f?.max) p.set("maxSize", f.max);
    }
    if (ownershipType) p.set("ownershipType", ownershipType);
    if (dealType) p.set("dealType", dealType);
    if (minBedrooms) p.set("minBedrooms", minBedrooms);
    if (minBathrooms) p.set("minBathrooms", minBathrooms);
    if (minBuildYear) p.set("minBuildYear", minBuildYear);
    if (minCarYear) p.set("minCarYear", minCarYear);
    if (maxMileageIdx !== "") {
      const f = MILEAGE_FILTERS[Number(maxMileageIdx)];
      if (f?.max) p.set("maxMileage", f.max);
    }
    if (forFetch) {
      if (near) {
        p.set("lat", String(near.lat));
        p.set("lng", String(near.lng));
        p.set("radius", String(radius));
      } else if (city) {
        p.set("city", city);
      }
      p.set("page", String(page));
      p.set("limit", view === "map" ? "60" : "12");
    } else if (city) {
      p.set("city", city);
    }
    return p;
  }

  async function fetchListings() {
    setLoading(true);
    try {
      const p = buildParams(true);
      const d = await api.get<{ listings: ListingItem[]; total: number }>(`/listings?${p}`);
      setListings(d.listings);
      setTotal(d.total);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }

  function onQChange(value: string) {
    setQ(value);
    setSaved(false);
    if (sugTimer.current) clearTimeout(sugTimer.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowSug(false);
      return;
    }
    sugTimer.current = setTimeout(async () => {
      try {
        const sp = new URLSearchParams({ q: value.trim(), limit: "6" });
        if (category) sp.set("category", category);
        const d = await api.get<{ listings: { id: string; title: string }[] }>(`/listings?${sp}`);
        setSuggestions(d.listings.map((l) => ({ id: l.id, title: l.title })));
        setShowSug(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }

  async function toggleNearby() {
    if (near) { setNear(null); return; }
    setLocError("");
    setLocating(true);
    try {
      const c = await getCurrentLocation();
      setPage(1);
      setNear(c);
    } catch (err) {
      setLocError(err instanceof Error ? err.message : t("listings.locError"));
    } finally {
      setLocating(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setShowSug(false);
    setPage(1);
    fetchListings();
    setShowFilters(false);
  }

  function clearFilters() {
    setQ(""); setCity(""); setCategory(""); setType(""); setMinPrice(""); setMaxPrice("");
    setSizeIdx(""); setOwnershipType(""); setDealType(""); setNear(null);
    setMinBedrooms(""); setMinBathrooms(""); setMinBuildYear(""); setMinCarYear(""); setMaxMileageIdx("");
  }

  async function saveSearch() {
    if (!getUser()) {
      window.location.href = `${import.meta.env.BASE_URL}login`;
      return;
    }
    setSaving(true);
    try {
      const p = buildParams(false);
      const obj: Record<string, string> = {};
      p.forEach((v, k) => { obj[k] = v; });
      const label = [category, city, type, q].filter(Boolean).join(" ") || "بحث محفوظ";
      await api.post("/saved-searches", { label, params: obj });
      setSaved(true);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  const types = category === "عقارات" ? REAL_ESTATE_TYPES : category === "سيارات" ? CAR_BRANDS : [];
  const hasAnyFilter = !!(q || category || city || type || minPrice || maxPrice);

  return (
    <div className="max-w-5xl mx-auto px-4 py-5">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <input
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            onFocus={() => suggestions.length && setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
            placeholder={t("listings.searchPlaceholder")}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
          />
          {showSug && suggestions.length > 0 && (
            <div className="absolute top-full mt-1 right-0 left-0 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg z-30 overflow-hidden">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={() => { setQ(s.title); setShowSug(false); setPage(1); setTimeout(fetchListings, 0); }}
                  className="w-full text-right px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                >
                  <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="line-clamp-1">{s.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`border rounded-xl px-3 py-2.5 transition ${showFilters ? "border-orange-400 bg-orange-50 dark:bg-orange-950 text-orange-500" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500"}`}
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
        <button type="submit" className="bg-orange-500 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-orange-600 transition text-sm">
          {t("common.search")}
        </button>
      </form>

      {/* Toolbar: view toggle + nearby + save search */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button type="button" onClick={() => setView("grid")}
            className={`flex items-center gap-1 px-3 py-2 text-sm ${view === "grid" ? "bg-orange-500 text-white" : "bg-white dark:bg-gray-900 text-gray-500"}`}>
            <LayoutGrid className="w-4 h-4" /> {t("listings.grid")}
          </button>
          <button type="button" onClick={() => { setView("map"); setPage(1); }}
            className={`flex items-center gap-1 px-3 py-2 text-sm ${view === "map" ? "bg-orange-500 text-white" : "bg-white dark:bg-gray-900 text-gray-500"}`}>
            <MapIcon className="w-4 h-4" /> {t("listings.map")}
          </button>
        </div>

        <button type="button" onClick={toggleNearby} disabled={locating}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition ${
            near ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950 text-emerald-600" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 hover:border-orange-300"
          } disabled:opacity-60`}>
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : near ? <MapPin className="w-4 h-4" /> : <LocateFixed className="w-4 h-4" />}
          {locating ? t("listings.locating") : near ? t("listings.stopNearby") : t("listings.nearby")}
        </button>

        {hasAnyFilter && (
          <button type="button" onClick={saveSearch} disabled={saving || saved}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition ${
              saved ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950 text-emerald-600" : "border-orange-300 bg-orange-50 dark:bg-orange-950 text-orange-600 hover:bg-orange-100"
            } disabled:opacity-60`}>
            {saved ? <Check className="w-4 h-4" /> : <BellPlus className="w-4 h-4" />}
            {saved ? t("listings.searchSavedShort") : t("listings.saveSearchAlert")}
          </button>
        )}
      </div>

      {near && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-gray-500 text-xs">{t("listings.withinRadius")}</span>
          {NEAR_RADII.map((r) => (
            <button key={r} type="button" onClick={() => { setPage(1); setRadius(r); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                radius === r ? "border-emerald-400 bg-emerald-500 text-white" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:border-emerald-300"
              }`}>
              {t("listings.km", { n: r })}
            </button>
          ))}
        </div>
      )}
      {locError && <p className="text-red-500 text-xs mb-3">{locError}</p>}

      {/* Filters */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="grid grid-cols-2 gap-3">
            <select value={category} onChange={(e) => { setCategory(e.target.value); setType(""); }}
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="">{t("common.allCategories")}</option>
              <option value="عقارات">{t("common.realestate")}</option>
              <option value="سيارات">{t("common.cars")}</option>
            </select>
            <select value={city} onChange={(e) => setCity(e.target.value)}
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="">{t("common.allCities")}</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {types.length > 0 && (
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 col-span-2">
                <option value="">{t("listings.allTypes")}</option>
                {types.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
              </select>
            )}
            <select value={dealType} onChange={(e) => setDealType(e.target.value)}
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="">{t("listings.allDeals")}</option>
              {DEAL_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {category === "عقارات" && (
              <select value={sizeIdx} onChange={(e) => setSizeIdx(e.target.value)}
                className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                <option value="">{t("listings.allSizes")}</option>
                {SIZE_FILTERS.map((f, i) => <option key={f.label} value={i}>{f.label}</option>)}
              </select>
            )}
            {category === "عقارات" && (
              <>
                <select value={minBedrooms} onChange={(e) => setMinBedrooms(e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                  <option value="">{t("listings.bedrooms")}</option>
                  {BEDROOM_OPTIONS.map((n) => <option key={n} value={n}>{t("listings.bedroomsPlus", { n })}</option>)}
                </select>
                <select value={minBathrooms} onChange={(e) => setMinBathrooms(e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                  <option value="">{t("listings.bathrooms")}</option>
                  {BATHROOM_OPTIONS.map((n) => <option key={n} value={n}>{t("listings.bathroomsPlus", { n })}</option>)}
                </select>
                <select value={minBuildYear} onChange={(e) => setMinBuildYear(e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 col-span-2">
                  <option value="">{t("listings.buildYearFrom")}</option>
                  {CAR_YEARS.filter((y) => y <= new Date().getFullYear()).map((y) => <option key={y} value={y}>{y}+</option>)}
                </select>
                <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 col-span-2">
                  <option value="">{t("listings.allOwnership")}</option>
                  {OWNERSHIP_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </>
            )}
            {category === "سيارات" && (
              <>
                <select value={minCarYear} onChange={(e) => setMinCarYear(e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                  <option value="">{t("listings.modelFrom")}</option>
                  {CAR_YEARS.map((y) => <option key={y} value={y}>{y}+</option>)}
                </select>
                <select value={maxMileageIdx} onChange={(e) => setMaxMileageIdx(e.target.value)}
                  className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                  <option value="">{t("listings.mileage")}</option>
                  {MILEAGE_FILTERS.map((f, i) => <option key={f.label} value={i}>{f.label}</option>)}
                </select>
              </>
            )}
            <input value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
              placeholder={t("listings.minPricePlaceholder")} type="number"
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
            <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
              placeholder={t("listings.maxPricePlaceholder")} type="number"
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSearch} className="flex-1 bg-orange-500 text-white py-2 rounded-xl text-sm font-medium hover:bg-orange-600 transition">
              {t("listings.applyFilters")}
            </button>
            <button onClick={clearFilters} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      )}

      {/* Active filters tags */}
      {(category || city || type) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {category && <span className="bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full text-xs font-medium">{category}</span>}
          {city && <span className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-xs font-medium">{city}</span>}
          {type && <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-xs font-medium">{type}</span>}
        </div>
      )}

      <p className="text-gray-400 text-sm mb-4">{t("listings.resultsCount", { count: total.toLocaleString("ar-IQ") })}</p>

      {view === "map" ? (
        loading ? (
          <div className="h-[70vh] bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
        ) : (
          <ListingsMap listings={listings} basePath={import.meta.env.BASE_URL} />
        )
      ) : loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl h-56 animate-pulse" />)}
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Search className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p className="text-lg">{t("common.noResults")}</p>
          <p className="text-sm mt-1">{t("listings.tryChange")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
          <div className="flex justify-center gap-2 mt-8">
            {page > 1 && (
              <button onClick={() => setPage((p) => p - 1)}
                className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                ← {t("common.previous")}
              </button>
            )}
            {listings.length === 12 && (
              <button onClick={() => setPage((p) => p + 1)}
                className="px-5 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 text-sm">
                {t("common.next")} →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
