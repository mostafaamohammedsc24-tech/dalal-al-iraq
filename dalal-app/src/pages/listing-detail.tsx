import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  MapPin, Eye, Clock, MessageCircle, Trash2, Ruler, ShieldCheck, BadgeCheck,
  Navigation, BedDouble, Bath, Calendar, Gauge, Flag, TrendingDown, HandCoins,
  Star, Pencil,
} from "lucide-react";
import {
  formatPrice, timeAgo, formatSize, dealTypeStyle, formatCoords, mapsLink,
  formatMileage, marketPosition, addRecentlyViewed,
} from "@/lib/utils";
import { api, getUser } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { ListingCard, ListingItem } from "@/components/listing-card";
import { MediaCarousel } from "@/components/media-carousel";
import { FavoriteButton } from "@/components/favorite-button";
import { ShareButton } from "@/components/share-button";
import { ReportModal } from "@/components/report-modal";
import { MortgageCalculator } from "@/components/mortgage-calculator";
import { PriceHistory } from "@/components/price-history";
import { BookViewing } from "@/components/book-viewing";

interface FullListing extends ListingItem {
  description: string;
  area: string | null;
  buildYear: number | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  user: { id: string; name: string };
}

interface MarketStats {
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  count: number;
  avgPricePerM2: number | null;
}

export default function ListingDetailPage() {
  const [, params] = useRoute("/listings/:id");
  const [, navigate] = useLocation();
  const id = params?.id;

  const [listing, setListing] = useState<FullListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [similar, setSimilar] = useState<ListingItem[]>([]);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offer, setOffer] = useState("");
  const [offerSending, setOfferSending] = useState(false);

  const t = useT();
  const currentUser = getUser();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<FullListing>(`/listings/${id}`)
      .then((l) => {
        setListing(l);
        addRecentlyViewed(l.id);
        const p = new URLSearchParams({ category: l.category });
        if (l.city) p.set("city", l.city);
        if (l.type) p.set("type", l.type);
        api.get<MarketStats>(`/listings/market/stats?${p}`).then(setStats).catch(() => {});
      })
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
    api.get<{ listings: ListingItem[] }>(`/listings/${id}/similar`)
      .then((d) => setSimilar(d.listings))
      .catch(() => setSimilar([]));
  }, [id]);

  async function contactUs() {
    if (!currentUser) { navigate("/login"); return; }
    if (!listing) return;
    setChatLoading(true);
    try {
      const chat = await api.post<{ id: string }>("/chats", { listingId: listing.id });
      navigate(`/chat?id=${chat.id}`);
    } catch {
      setChatLoading(false);
    }
  }

  async function submitOffer() {
    if (!currentUser) { navigate("/login"); return; }
    if (!listing) return;
    const amount = parseInt(offer.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return;
    setOfferSending(true);
    try {
      const chat = await api.post<{ id: string }>("/chats", { listingId: listing.id });
      await api.post(`/chats/${chat.id}/messages`, {
        text: `💰 عرض سعر: ${formatPrice(amount)} على إعلان "${listing.title}"`,
      });
      navigate(`/chat?id=${chat.id}`);
    } catch {
      setOfferSending(false);
    }
  }

  async function deleteListing() {
    if (!confirm(t("detail.confirmDelete"))) return;
    setDeleting(true);
    await api.delete(`/listings/${id}`);
    navigate("/listings");
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto animate-pulse p-4 pt-6">
      <div className="bg-gray-200 dark:bg-gray-800 h-72 rounded-2xl mb-4" />
      <div className="bg-gray-200 dark:bg-gray-800 h-8 rounded-xl mb-3 w-3/4" />
      <div className="bg-gray-200 dark:bg-gray-800 h-6 rounded-xl w-1/3" />
    </div>
  );

  if (!listing) return (
    <div className="text-center py-20 text-gray-400">
      <p className="text-xl font-bold mb-2">{t("detail.notFound")}</p>
      <button onClick={() => navigate("/listings")} className="text-orange-500 hover:underline text-sm">
        {t("detail.backToListings")}
      </button>
    </div>
  );

  const isOwner = currentUser?.userId === listing.user.id;
  const isAdmin = currentUser?.role === "admin";
  const isSold = listing.dealType === "مباع" || listing.status === "sold";
  const reduced = listing.previousPrice != null && listing.previousPrice > listing.price;
  const market = stats?.avgPrice ? marketPosition(listing.price, stats.avgPrice) : null;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Media */}
      <div className="relative">
        <MediaCarousel
          images={listing.images}
          video={listing.video}
          category={listing.category}
          heightClass="h-72 sm:h-80"
        />
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end z-10">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full shadow ${dealTypeStyle(listing.dealType)}`}>
            {listing.dealType || "للبيع"}
          </span>
          <span className="text-xs font-bold px-2 py-1 rounded-full text-white shadow bg-gray-800/80">
            {listing.type}
          </span>
          {listing.verified && (
            <span className="text-xs font-bold px-2 py-1 rounded-full text-white shadow bg-sky-500 flex items-center gap-1">
              <BadgeCheck className="w-3.5 h-3.5" />{t("detail.verified")}
            </span>
          )}
          {listing.featured && (
            <span className="text-xs font-bold px-2 py-1 rounded-full text-white shadow bg-amber-500 flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-white" />{t("detail.featured")}
            </span>
          )}
        </div>
        <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
          <FavoriteButton listingId={listing.id} />
          <ShareButton title={listing.title} text={listing.title} url={window.location.href} />
        </div>
      </div>

      <div className="px-4 py-5">
        {/* Title + price */}
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">{listing.title}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-3xl font-bold text-orange-500">{formatPrice(listing.price)}</p>
              {reduced && (
                <span className="text-base text-gray-400 line-through">{formatPrice(listing.previousPrice!)}</span>
              )}
            </div>
            {reduced && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 px-2 py-1 rounded-full mt-1">
                <TrendingDown className="w-3 h-3" /> {t("detail.priceDropped")}
              </span>
            )}
          </div>
          {(isOwner || isAdmin) && (
            <div className="flex items-center gap-1 mt-1">
              <button onClick={() => navigate(`/edit-listing/${listing.id}`)}
                className="text-gray-300 hover:text-orange-500 transition p-1" aria-label={t("common.edit")}>
                <Pencil className="w-5 h-5" />
              </button>
              <button onClick={deleteListing} disabled={deleting}
                className="text-gray-300 hover:text-red-500 transition p-1" aria-label={t("common.delete")}>
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Market indicator */}
        {market && (
          <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full mb-3 ${market.tone}`}>
            <TrendingDown className="w-3.5 h-3.5" />
            {market.label}
            {stats?.count ? <span className="opacity-70">· {t("market.basedOn", { count: stats.count })}</span> : null}
          </div>
        )}

        {/* Meta */}
        <div className="flex flex-wrap gap-3 mb-4 mt-1">
          <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
            <MapPin className="w-4 h-4" />
            {listing.city}{listing.area ? ` - ${listing.area}` : ""}
          </span>
          {listing.size ? (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <Ruler className="w-4 h-4" />{formatSize(listing.size)}
            </span>
          ) : null}
          {listing.bedrooms != null && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <BedDouble className="w-4 h-4" />{t("detail.bedroomsCount", { n: listing.bedrooms })}
            </span>
          )}
          {listing.bathrooms != null && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <Bath className="w-4 h-4" />{t("detail.bathroomsCount", { n: listing.bathrooms })}
            </span>
          )}
          {listing.buildYear != null && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <Calendar className="w-4 h-4" />{t("detail.builtIn", { year: listing.buildYear })}
            </span>
          )}
          {listing.carYear != null && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <Calendar className="w-4 h-4" />{t("detail.modelYearVal", { year: listing.carYear })}
            </span>
          )}
          {listing.mileage != null && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <Gauge className="w-4 h-4" />{formatMileage(listing.mileage)}
            </span>
          )}
          {listing.ownershipType ? (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
              <BadgeCheck className="w-4 h-4" />{listing.ownershipType}
            </span>
          ) : null}
          <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
            <Eye className="w-4 h-4" />{listing.views} {t("detail.views")}
          </span>
          <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
            <Clock className="w-4 h-4" />{timeAgo(listing.createdAt)}
          </span>
          {listing.latitude != null && listing.longitude != null && (
            <a href={mapsLink(listing.latitude, listing.longitude)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-emerald-600 text-sm font-medium hover:text-emerald-700 transition" dir="ltr">
              <Navigation className="w-4 h-4" />{formatCoords(listing.latitude, listing.longitude)}
            </a>
          )}
        </div>

        {/* Description */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4 shadow-sm border border-gray-50 dark:border-gray-800">
          <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-2">{t("detail.details")}</h3>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line text-sm">{listing.description}</p>
        </div>

        {/* Price history */}
        <PriceHistory listingId={listing.id} />

        {/* Mortgage calculator (real estate, for-sale only) */}
        {listing.category === "عقارات" && !isSold && <MortgageCalculator price={listing.price} />}

        {/* Contact us (broker model) */}
        {!isOwner && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-50 dark:border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-gray-800 dark:text-gray-100">{t("brand.full")}</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs">{t("detail.brokerTagline")}</p>
              </div>
            </div>

            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-3">
              {t("detail.brokerDesc")}
            </p>

            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900 rounded-xl px-3 py-2 mb-4">
              <BadgeCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-emerald-700 dark:text-emerald-300 text-xs font-medium">{t("detail.freeConsult")}</p>
            </div>

            <button onClick={contactUs} disabled={chatLoading || isSold}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition text-sm disabled:opacity-60 mb-2">
              <MessageCircle className="w-5 h-5" />
              {isSold ? t("common.sold") : chatLoading ? t("common.loading") : t("detail.contactUs")}
            </button>

            {/* Book a viewing (broker model) */}
            {!isSold && <BookViewing listingId={listing.id} />}

            {/* Offer / bid box */}
            {!isSold && (
              <>
                {!offerOpen ? (
                  <button onClick={() => setOfferOpen(true)}
                    className="w-full flex items-center justify-center gap-2 border-2 border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 py-2.5 rounded-xl font-bold hover:bg-orange-50 dark:hover:bg-orange-950 transition text-sm">
                    <HandCoins className="w-5 h-5" />
                    {t("detail.makeOfferBtn")}
                  </button>
                ) : (
                  <div className="border-2 border-orange-200 dark:border-orange-900 rounded-xl p-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{t("detail.offerLabel")}</p>
                    <div className="flex gap-2">
                      <input
                        value={offer}
                        onChange={(e) => setOffer(e.target.value)}
                        type="number"
                        placeholder={t("detail.offerPlaceholder", { amount: Math.round(listing.price * 0.9) })}
                        className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-3 py-2 text-right text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                      <button onClick={submitOffer} disabled={offerSending || !offer}
                        className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white px-4 rounded-xl text-sm font-bold transition">
                        {offerSending ? "..." : t("common.send")}
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{t("detail.offerHint")}</p>
                  </div>
                )}
              </>
            )}

            {/* Report */}
            <button onClick={() => setShowReport(true)}
              className="w-full flex items-center justify-center gap-1.5 text-gray-400 hover:text-red-500 transition text-xs mt-3">
              <Flag className="w-3.5 h-3.5" />
              {t("detail.reportListing")}
            </button>
          </div>
        )}

        {isOwner && (
          <div className="bg-orange-50 dark:bg-orange-950 border border-orange-100 dark:border-orange-900 rounded-2xl p-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {t("detail.ownerNotice")}
          </div>
        )}

        {/* Similar listings */}
        {similar.length > 0 && (
          <div className="mt-8">
            <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-3">{t("detail.similar")}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {similar.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
          </div>
        )}
      </div>

      {showReport && <ReportModal listingId={listing.id} onClose={() => setShowReport(false)} />}
    </div>
  );
}
