import { Link } from "wouter";
import { MapPin, Eye, Clock, Pin, Ruler, GitCompareArrows, BedDouble, Bath, Gauge, BadgeCheck, Star } from "lucide-react";
import {
  formatPrice,
  timeAgo,
  formatSize,
  dealTypeStyle,
  isNewListing,
  formatMileage,
  isInCompare,
  toggleCompare,
  cn,
} from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { MediaCarousel } from "@/components/media-carousel";
import { FavoriteButton } from "@/components/favorite-button";
import { useEffect, useState } from "react";

export interface ListingItem {
  id: string;
  title: string;
  price: number;
  previousPrice?: number | null;
  category: string;
  type: string;
  city: string;
  size?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  carYear?: number | null;
  mileage?: number | null;
  ownershipType?: string | null;
  dealType?: string | null;
  status?: string | null;
  pinned?: boolean;
  verified?: boolean;
  featured?: boolean;
  video?: string | null;
  images: string[];
  views: number;
  createdAt: string;
  bumpedAt?: string | null;
  user?: { name: string };
}

function CompareToggle({ id }: { id: string }) {
  const [active, setActive] = useState(isInCompare(id));
  useEffect(() => {
    const sync = () => setActive(isInCompare(id));
    window.addEventListener("compare-change", sync);
    return () => window.removeEventListener("compare-change", sync);
  }, [id]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = toggleCompare(id);
        if (r.full) {
          alert("يمكن مقارنة 4 إعلانات كحد أقصى");
          return;
        }
        setActive(r.inCompare);
      }}
      aria-label="إضافة للمقارنة"
      className={cn(
        "flex items-center justify-center rounded-full backdrop-blur shadow-sm hover:scale-110 transition p-2",
        active ? "bg-orange-500" : "bg-white/90 dark:bg-gray-900/90",
      )}
    >
      <GitCompareArrows
        className={cn("w-4 h-4", active ? "text-white" : "text-gray-500 dark:text-gray-300")}
      />
    </button>
  );
}

export function ListingCard({ listing }: { listing: ListingItem }) {
  const t = useT();
  const sold = listing.status === "sold";
  const reduced =
    listing.previousPrice != null && listing.previousPrice > listing.price;

  return (
    <div className="block bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-800 hover:border-orange-100 dark:hover:border-orange-900">
      <div className="relative">
        <MediaCarousel
          images={listing.images}
          video={listing.video}
          category={listing.category}
          linkHref={`/listings/${listing.id}`}
          heightClass="h-40"
        />
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end z-10 pointer-events-none">
          <span className={`text-xs font-bold px-2 py-1 rounded-full shadow-sm ${dealTypeStyle(listing.dealType)}`}>
            {listing.dealType || "للبيع"}
          </span>
          {listing.verified && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-sky-500 text-white flex items-center gap-1">
              <BadgeCheck className="w-3 h-3 fill-white text-sky-500" />
              {t("detail.verified")}
            </span>
          )}
          {listing.featured && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-amber-500 text-white flex items-center gap-1">
              <Star className="w-3 h-3 fill-white" />
              {t("detail.featured")}
            </span>
          )}
          {listing.pinned && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-orange-500 text-white flex items-center gap-1">
              <Pin className="w-3 h-3 fill-white" />
              {t("home.featured")}
            </span>
          )}
          {isNewListing(listing.createdAt) && !sold && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-emerald-500 text-white">
              {t("common.new")}
            </span>
          )}
          {reduced && !sold && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm bg-red-500 text-white">
              {t("priceHistory.dropped")}
            </span>
          )}
        </div>

        <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
          <FavoriteButton listingId={listing.id} size="sm" />
          <CompareToggle id={listing.id} />
        </div>

        {sold && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center z-10 pointer-events-none">
            <span className="bg-gray-900 text-white text-sm font-bold px-4 py-1.5 rounded-full -rotate-6">
              تم البيع
            </span>
          </div>
        )}
      </div>

      <Link href={`/listings/${listing.id}`} className="block p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
            listing.category === "عقارات"
              ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
              : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
          }`}>
            {listing.type}
          </span>
        </div>
        <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm line-clamp-2 mb-2 text-right leading-snug">{listing.title}</h3>
        <div className="text-right">
          <p className="text-orange-500 font-bold text-base">{formatPrice(listing.price)}</p>
          {reduced && (
            <p className="text-xs text-gray-400 line-through">{formatPrice(listing.previousPrice!)}</p>
          )}
        </div>

        {(listing.bedrooms != null || listing.bathrooms != null || listing.carYear != null || listing.mileage != null) && (
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            {listing.bedrooms != null && (
              <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" />{listing.bedrooms}</span>
            )}
            {listing.bathrooms != null && (
              <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{listing.bathrooms}</span>
            )}
            {listing.carYear != null && <span>{listing.carYear}</span>}
            {listing.mileage != null && (
              <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{formatMileage(listing.mileage)}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
          <div className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            <span>{listing.views}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span>{listing.city}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1 text-xs text-gray-400 dark:text-gray-500">
          {listing.size ? (
            <div className="flex items-center gap-1">
              <Ruler className="w-3 h-3" />
              <span>{formatSize(listing.size)}</span>
            </div>
          ) : <span />}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{timeAgo(listing.createdAt)}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}
