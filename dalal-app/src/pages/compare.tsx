import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { X, GitCompareArrows, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  formatPrice,
  formatSize,
  formatMileage,
  getCompare,
  removeFromCompare,
  clearCompare,
} from "@/lib/utils";
import { MediaCarousel } from "@/components/media-carousel";
import type { ListingItem } from "@/components/listing-card";

interface FullListing extends ListingItem {
  description?: string;
  buildYear?: number | null;
  area?: string | null;
  ownershipType?: string | null;
}

const ROWS: { label: string; render: (l: FullListing) => string }[] = [
  { label: "السعر", render: (l) => formatPrice(l.price) },
  { label: "القسم", render: (l) => l.category },
  { label: "النوع", render: (l) => l.type },
  { label: "المدينة", render: (l) => l.city + (l.area ? ` - ${l.area}` : "") },
  { label: "نوع العرض", render: (l) => l.dealType || "للبيع" },
  { label: "المساحة", render: (l) => (l.size ? formatSize(l.size) : "—") },
  { label: "غرف النوم", render: (l) => (l.bedrooms != null ? String(l.bedrooms) : "—") },
  { label: "الحمامات", render: (l) => (l.bathrooms != null ? String(l.bathrooms) : "—") },
  { label: "سنة البناء", render: (l) => (l.buildYear != null ? String(l.buildYear) : "—") },
  { label: "نوع الملكية", render: (l) => l.ownershipType || "—" },
  { label: "سنة الصنع", render: (l) => (l.carYear != null ? String(l.carYear) : "—") },
  { label: "المسافة", render: (l) => (l.mileage != null ? formatMileage(l.mileage) : "—") },
  { label: "المشاهدات", render: (l) => String(l.views) },
];

export default function ComparePage() {
  const [, navigate] = useLocation();
  const [ids, setIds] = useState<string[]>(getCompare());
  const [items, setItems] = useState<FullListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sync = () => setIds(getCompare());
    window.addEventListener("compare-change", sync);
    return () => window.removeEventListener("compare-change", sync);
  }, []);

  useEffect(() => {
    let active = true;
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      ids.map((id) => api.get<FullListing>(`/listings/${id}`).catch(() => null)),
    ).then((res) => {
      if (!active) return;
      setItems(res.filter((x): x is FullListing => x !== null));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ids]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="h-8 w-40 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse mb-4" />
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400 px-4">
        <GitCompareArrows className="w-14 h-14 mx-auto mb-4 opacity-20" />
        <p className="text-lg font-bold mb-1">لا توجد إعلانات للمقارنة</p>
        <p className="text-sm mb-4">أضف إعلانات من خلال زر المقارنة على البطاقات</p>
        <button onClick={() => navigate("/listings")} className="text-orange-500 hover:underline text-sm">
          تصفح الإعلانات
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <GitCompareArrows className="w-6 h-6 text-orange-500" />
          مقارنة الإعلانات
        </h1>
        <button
          onClick={clearCompare}
          className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600"
        >
          <Trash2 className="w-4 h-4" /> مسح الكل
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800">
        <table className="w-full border-collapse bg-white dark:bg-gray-900 text-sm">
          <thead>
            <tr>
              <th className="p-2 sticky right-0 bg-gray-50 dark:bg-gray-800 z-10" />
              {items.map((l) => (
                <th key={l.id} className="p-3 min-w-[160px] align-top">
                  <div className="relative">
                    <button
                      onClick={() => removeFromCompare(l.id)}
                      aria-label="إزالة"
                      className="absolute -top-1 left-0 bg-white dark:bg-gray-800 rounded-full shadow p-1 text-gray-400 hover:text-red-500 z-10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <Link href={`/listings/${l.id}`} className="block">
                      <MediaCarousel
                        images={l.images}
                        video={l.video}
                        category={l.category}
                        heightClass="h-24"
                        rounded
                      />
                      <p className="font-bold text-gray-800 dark:text-gray-100 text-xs mt-2 line-clamp-2 text-right">
                        {l.title}
                      </p>
                    </Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => (
              <tr key={row.label} className={ri % 2 ? "bg-gray-50/60 dark:bg-gray-800/40" : ""}>
                <td className="p-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap sticky right-0 bg-inherit">
                  {row.label}
                </td>
                {items.map((l) => (
                  <td key={l.id} className="p-3 text-center text-gray-800 dark:text-gray-100">
                    {row.render(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
