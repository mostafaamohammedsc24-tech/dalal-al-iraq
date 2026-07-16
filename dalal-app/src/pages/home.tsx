import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Search, Building2, Car, TrendingUp, MapPin, Eye, Flame, HelpCircle } from "lucide-react";
import { ListingCard, ListingItem } from "@/components/listing-card";
import { CITIES, getRecentlyViewed } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { api } from "@/lib/api";

export default function HomePage() {
  const [, navigate] = useLocation();
  const t = useT();
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [trending, setTrending] = useState<ListingItem[]>([]);
  const [recent, setRecent] = useState<ListingItem[]>([]);
  const [stats, setStats] = useState<{ total: number; cities: number; views: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    api.get<{ listings: ListingItem[] }>("/listings?limit=8")
      .then((d) => setListings(d.listings))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));

    api.get<{ listings: ListingItem[] }>("/listings/trending?limit=8")
      .then((d) => setTrending(d.listings))
      .catch(() => setTrending([]));

    api.get<{ total: number; cities: number; views: number }>("/listings/stats/overview")
      .then((d) => setStats(d))
      .catch(() => setStats(null));

    const ids = getRecentlyViewed();
    if (ids.length > 0) {
      Promise.all(ids.slice(0, 8).map((id) => api.get<ListingItem>(`/listings/${id}`).catch(() => null)))
        .then((res) => setRecent(res.filter((x): x is ListingItem => x !== null)))
        .catch(() => setRecent([]));
    }
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (city) p.set("city", city);
    if (category) p.set("category", category);
    navigate(`/listings?${p.toString()}`);
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-3">{t("home.title")}</h1>
          <p className="text-orange-100 text-lg mb-8">{t("home.subtitle")}</p>

          <form onSubmit={handleSearch} className="bg-white dark:bg-gray-900 rounded-2xl p-3 shadow-xl">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <Search className="absolute right-3 top-3 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder={t("home.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pr-10 pl-4 py-3 border border-gray-100 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-100 text-right focus:outline-none focus:ring-2 focus:ring-orange-300 bg-gray-50 dark:bg-gray-800"
                />
              </div>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="px-3 py-3 border border-gray-100 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-200 text-right focus:outline-none bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-orange-300 text-sm"
              >
                <option value="">{t("common.allCities")}</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-3 py-3 border border-gray-100 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-200 text-right focus:outline-none bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-orange-300 text-sm"
              >
                <option value="">{t("common.allCategories")}</option>
                <option value="عقارات">{t("common.realestate")}</option>
                <option value="سيارات">{t("common.cars")}</option>
              </select>
              <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-xl font-bold transition whitespace-nowrap">
                {t("common.search")}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => navigate("/listings?category=عقارات")}
            className="flex items-center gap-4 bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md hover:border-orange-200 dark:hover:border-orange-800 transition text-right"
          >
            <div className="w-14 h-14 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center">
              <Building2 className="w-7 h-7 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{t("home.realestate")}</h3>
              <p className="text-gray-400 dark:text-gray-500 text-sm">{t("home.realestateSub")}</p>
            </div>
          </button>
          <button
            onClick={() => navigate("/listings?category=سيارات")}
            className="flex items-center gap-4 bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md hover:border-orange-200 dark:hover:border-orange-800 transition text-right"
          >
            <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950 rounded-xl flex items-center justify-center">
              <Car className="w-7 h-7 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{t("home.cars")}</h3>
              <p className="text-gray-400 dark:text-gray-500 text-sm">{t("home.carsSub")}</p>
            </div>
          </button>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white dark:bg-gray-900 py-8 px-4 border-y border-gray-100 dark:border-gray-800">
        <div className="max-w-5xl mx-auto grid grid-cols-3 gap-4 text-center">
          {[
            { icon: TrendingUp, value: stats?.total, label: t("home.statsListings") },
            { icon: MapPin, value: stats?.cities, label: t("home.statsCities") },
            { icon: Eye, value: stats?.views, label: t("home.statsViews") },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="p-3">
              <Icon className="w-8 h-8 text-orange-400 mx-auto mb-2" />
              <p className="font-bold text-gray-800 dark:text-gray-100 text-xl tabular-nums">
                {value != null ? value.toLocaleString("en-US") : "—"}
              </p>
              <p className="text-gray-400 text-xs">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recently viewed */}
      {recent.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 pt-8">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">{t("home.recentlyViewed")}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
            {recent.map((l) => (
              <div key={l.id} className="w-40 flex-shrink-0 snap-start">
                <ListingCard listing={l} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Trending */}
      {trending.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 pt-8">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-orange-500" />
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{t("home.trending")}</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
            {trending.map((l) => (
              <div key={l.id} className="w-44 flex-shrink-0 snap-start">
                <ListingCard listing={l} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Featured Listings */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{t("home.featured")}</h2>
          <button onClick={() => navigate("/listings")} className="text-orange-500 text-sm font-medium hover:text-orange-600">
            {t("common.viewAll")} ←
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl h-56 animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Building2 className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p>{t("home.noListingsYet")}</p>
            <button onClick={() => navigate("/add-listing")}
              className="mt-4 bg-orange-500 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-orange-600 transition">
              {t("home.addFirstListing")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-orange-500 to-amber-500 text-white py-12 px-4 text-center">
        <h2 className="text-2xl font-bold mb-2">{t("home.ctaTitle")}</h2>
        <p className="text-orange-100 mb-6 text-sm">{t("home.ctaSub")}</p>
        <button onClick={() => navigate("/add-listing")}
          className="bg-white text-orange-500 px-8 py-3 rounded-xl font-bold hover:bg-orange-50 transition inline-block">
          {t("home.ctaButton")}
        </button>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-4 text-center text-sm">
        <p className="text-white font-bold text-base mb-1">{t("brand.full")}</p>
        <p className="mb-4 text-gray-500">{t("home.footerTagline")}</p>
        <div className="flex justify-center gap-4">
          <button onClick={() => navigate("/about")} className="hover:text-white transition">{t("home.about")}</button>
          <span>|</span>
          <button onClick={() => navigate("/privacy")} className="hover:text-white transition">{t("home.privacy")}</button>
          <span>|</span>
          <a href="https://wa.me/9647740080310" target="_blank" rel="noreferrer" className="hover:text-white transition">{t("home.whatsapp")}</a>
        </div>
        <p className="text-xs mt-4 text-gray-600">{t("home.copyright")}</p>
      </footer>
    </div>
  );
}
