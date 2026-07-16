import { useState, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { LogOut, Plus, Trash2, Eye, MapPin, Heart, Bell, TrendingUp, BarChart3, Pencil, ArrowUpCircle, Settings, Globe, Moon, Sun, Shield } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { api, getUser, clearToken } from "@/lib/api";
import { useT, useI18n, LANGS } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { ListingCard, ListingItem } from "@/components/listing-card";
import { LazyImage } from "@/components/lazy-image";

interface UserInfo { userId: string; phone: string; name: string; role: string }
interface SavedSearch { id: string; label: string; params: string; createdAt: string }

type Tab = "listings" | "favorites" | "searches";

export default function ProfilePage() {
  const t = useT();
  const { lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const [, navigate] = useLocation();
  const search = useSearch();
  const initialTab = (new URLSearchParams(search).get("tab") as Tab) || "listings";

  const [user, setUser] = useState<UserInfo | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [favorites, setFavorites] = useState<ListingItem[]>([]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [bumping, setBumping] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) { navigate("/login"); return; }
    setUser(u);
    Promise.all([
      api.get<{ listings: ListingItem[] }>(`/listings?userId=${u.userId}&limit=50`).then((d) => setListings(d.listings)).catch(() => {}),
      api.get<{ listings: ListingItem[] }>("/favorites").then((d) => setFavorites(d.listings)).catch(() => {}),
      api.get<{ searches: SavedSearch[] }>("/saved-searches").then((d) => setSearches(d.searches)).catch(() => {}),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("هل أنت متأكد؟")) return;
    await api.delete(`/listings/${id}`);
    setListings((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleBump(id: string) {
    setBumping(id);
    try {
      const r = await api.post<{ bumpedAt: string }>(`/listings/${id}/bump`, {});
      setListings((prev) => prev.map((l) => (l.id === id ? { ...l, bumpedAt: r.bumpedAt } : l)));
      alert(t("profile.bumpDone"));
    } catch (e) {
      alert(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBumping(null);
    }
  }

  const BUMP_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  function bumpReady(l: ListingItem): boolean {
    if (l.status !== "active") return false;
    if (!l.bumpedAt) return true;
    return Date.now() - new Date(l.bumpedAt).getTime() >= BUMP_COOLDOWN_MS;
  }

  async function deleteSearch(id: string) {
    await api.delete(`/saved-searches/${id}`);
    setSearches((prev) => prev.filter((s) => s.id !== id));
  }

  function runSearch(s: SavedSearch) {
    try {
      const obj = JSON.parse(s.params) as Record<string, string>;
      const p = new URLSearchParams(obj);
      navigate(`/listings?${p}`);
    } catch {
      navigate("/listings");
    }
  }

  function handleLogout() {
    clearToken();
    window.dispatchEvent(new Event("auth-change"));
    navigate("/");
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );
  if (!user) return null;

  const totalViews = listings.reduce((s, l) => s + l.views, 0);
  const activeCount = listings.filter((l) => l.status !== "hidden").length;
  const avgViews = listings.length ? Math.round(totalViews / listings.length) : 0;
  const topListing = [...listings].sort((a, b) => b.views - a.views)[0];

  const tabs: { key: Tab; label: string; icon: typeof Heart; count: number }[] = [
    { key: "listings", label: t("profile.myListings"), icon: BarChart3, count: listings.length },
    { key: "favorites", label: t("profile.favorites"), icon: Heart, count: favorites.length },
    { key: "searches", label: "عمليات البحث", icon: Bell, count: searches.length },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-5 text-white mb-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
            {user.name?.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold">{user.name}</h2>
            <p className="text-orange-100 text-sm">{user.phone}</p>
            {user.role === "admin" && (
              <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full mt-1 inline-block">مشرف</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <p className="text-xl font-bold">{listings.length}</p>
            <p className="text-orange-100 text-xs">{t("profile.myListings")}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <p className="text-xl font-bold">{totalViews}</p>
            <p className="text-orange-100 text-xs">{t("common.views")}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <p className="text-xl font-bold">{favorites.length}</p>
            <p className="text-orange-100 text-xs">مفضلة</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href="/add-listing"
          className="flex items-center justify-center gap-2 bg-orange-500 text-white py-3 rounded-xl font-medium hover:bg-orange-600 transition text-sm">
          <Plus className="w-4 h-4" /> {t("add.title")}
        </Link>
        <button onClick={handleLogout}
          className="flex items-center justify-center gap-2 border border-red-200 dark:border-red-900 text-red-500 py-3 rounded-xl font-medium hover:bg-red-50 dark:hover:bg-red-950 transition text-sm">
          <LogOut className="w-4 h-4" /> {t("profile.logout")}
        </button>
      </div>

      {/* Owner analytics (only when has listings) */}
      {listings.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-500" /> أداء إعلاناتك
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center mb-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{activeCount}</p>
              <p className="text-gray-400 text-xs">إعلان نشط</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{avgViews}</p>
              <p className="text-gray-400 text-xs">متوسط المشاهدات</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{totalViews}</p>
              <p className="text-gray-400 text-xs">إجمالي المشاهدات</p>
            </div>
          </div>
          {topListing && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-orange-50 dark:bg-orange-950 rounded-xl px-3 py-2">
              <TrendingUp className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
              <span className="line-clamp-1">الأكثر مشاهدة: <span className="font-medium text-gray-700 dark:text-gray-200">{topListing.title}</span> ({topListing.views} {t("common.views")})</span>
            </div>
          )}
        </div>
      )}

      {/* Settings */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-2">
          <Settings className="w-5 h-5 text-orange-500" /> {t("profile.settings")}
        </h3>
        {/* Language */}
        <div className="flex items-center justify-between py-2.5">
          <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Globe className="w-4 h-4 text-gray-400" /> {t("nav.language")}
          </span>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  lang === l.code ? "bg-white dark:bg-gray-900 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        {/* Theme */}
        <div className="flex items-center justify-between py-2.5 border-t border-gray-100 dark:border-gray-800">
          <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            {theme === "dark" ? <Moon className="w-4 h-4 text-gray-400" /> : <Sun className="w-4 h-4 text-gray-400" />} {t("nav.darkMode")}
          </span>
          <button
            type="button"
            onClick={toggle}
            role="switch"
            aria-checked={theme === "dark"}
            aria-label={t("nav.darkMode")}
            className={`relative w-11 h-6 rounded-full transition ${theme === "dark" ? "bg-orange-500" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${theme === "dark" ? "left-0.5" : "left-[22px]"}`} />
          </button>
        </div>
        {/* Admin panel */}
        {user.role === "admin" && (
          <Link
            href="/admin"
            className="flex items-center justify-between py-2.5 border-t border-gray-100 dark:border-gray-800 group"
          >
            <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <Shield className="w-4 h-4 text-gray-400" /> {t("profile.adminPanel")}
            </span>
            <span className="text-orange-500 text-lg leading-none">‹</span>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition ${
              tab === key ? "bg-white dark:bg-gray-900 text-orange-500 shadow-sm" : "text-gray-500 dark:text-gray-400"
            }`}>
            <Icon className="w-4 h-4" /> {label}
            {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
          </button>
        ))}
      </div>

      {/* My listings */}
      {tab === "listings" && (
        listings.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="mb-3">لا توجد إعلانات بعد</p>
            <Link href="/add-listing" className="text-orange-500 text-sm hover:underline">أضف أول إعلان ←</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((listing) => (
              <div key={listing.id} className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 flex">
                <div className={`w-20 h-20 flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${listing.images?.[0] ? "" : "from-orange-50 to-amber-50"}`}>
                  {listing.images?.[0] ? (
                    <LazyImage src={listing.images[0]} alt="" className="w-20 h-20 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <span className="text-3xl">{listing.category === "عقارات" ? "🏠" : "🚗"}</span>
                  )}
                </div>
                <div className="flex-1 p-3 min-w-0">
                  <Link href={`/listings/${listing.id}`} className="font-bold text-gray-800 dark:text-gray-100 text-sm line-clamp-1 hover:text-orange-500 block">
                    {listing.title}
                  </Link>
                  <p className="text-orange-500 font-bold text-sm mt-0.5">{formatPrice(listing.price)}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{listing.views}</span>
                      <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{listing.city}</span>
                      {listing.status === "hidden" && <span className="text-red-400">مخفي</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {listing.status === "active" && (
                        <button
                          onClick={() => handleBump(listing.id)}
                          disabled={!bumpReady(listing) || bumping === listing.id}
                          title={bumpReady(listing) ? t("profile.bumpTooltip") : t("profile.bumpRecent")}
                          className="text-orange-400 hover:text-orange-600 disabled:text-gray-200 dark:disabled:text-gray-700 disabled:cursor-not-allowed p-1 transition"
                        >
                          <ArrowUpCircle className={`w-4 h-4 ${bumping === listing.id ? "animate-pulse" : ""}`} />
                        </button>
                      )}
                      <Link href={`/edit-listing/${listing.id}`} className="text-gray-300 hover:text-orange-500 p-1 transition">
                        <Pencil className="w-4 h-4" />
                      </Link>
                      <button onClick={() => handleDelete(listing.id)} className="text-red-300 hover:text-red-500 p-1 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Favorites */}
      {tab === "favorites" && (
        favorites.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Heart className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">لا توجد إعلانات مفضلة بعد</p>
            <Link href="/listings" className="text-orange-500 text-sm hover:underline mt-2 inline-block">تصفح الإعلانات ←</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {favorites.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        )
      )}

      {/* Saved searches */}
      {tab === "searches" && (
        searches.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">{t("profile.noSavedSearches")}</p>
            <p className="text-xs mt-1">احفظ بحثك من صفحة الإعلانات لتصلك تنبيهات بالإعلانات الجديدة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {searches.map((s) => (
              <div key={s.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                <button onClick={() => runSearch(s)} className="flex items-center gap-3 flex-1 text-right min-w-0">
                  <div className="w-10 h-10 bg-orange-100 dark:bg-orange-950 rounded-xl flex items-center justify-center text-orange-500 flex-shrink-0">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-100 text-sm line-clamp-1">{s.label}</p>
                    <p className="text-gray-400 text-xs">سيصلك تنبيه بالإعلانات الجديدة المطابقة</p>
                  </div>
                </button>
                <button onClick={() => deleteSearch(s.id)} className="text-red-300 hover:text-red-500 p-1 transition flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
