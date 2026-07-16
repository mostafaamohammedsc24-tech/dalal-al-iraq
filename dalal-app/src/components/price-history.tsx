import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp, History } from "lucide-react";
import { api } from "@/lib/api";
import { formatPrice, timeAgo } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface PriceChange {
  id: string;
  oldPrice: number;
  newPrice: number;
  createdAt: string;
}

export function PriceHistory({ listingId }: { listingId: string }) {
  const t = useT();
  const [history, setHistory] = useState<PriceChange[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<{ history: PriceChange[] }>(`/listings/${listingId}/price-history`)
      .then((d) => setHistory(d.history))
      .catch(() => setHistory([]))
      .finally(() => setLoaded(true));
  }, [listingId]);

  if (!loaded || history.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4 shadow-sm border border-gray-50 dark:border-gray-800">
      <h3 className="flex items-center gap-2 font-bold text-gray-800 dark:text-gray-100 mb-3">
        <History className="w-5 h-5 text-orange-500" />
        {t("priceHistory.title")}
      </h3>
      <ul className="space-y-2">
        {[...history].reverse().map((h) => {
          const dropped = h.newPrice < h.oldPrice;
          const pct = Math.round((Math.abs(h.newPrice - h.oldPrice) / h.oldPrice) * 100);
          return (
            <li key={h.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1 font-bold ${dropped ? "text-emerald-600" : "text-red-500"}`}>
                  {dropped ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                  {pct}%
                </span>
                <span className="text-gray-400 line-through text-xs">{formatPrice(h.oldPrice)}</span>
                <span className="text-gray-700 dark:text-gray-200 font-medium">{formatPrice(h.newPrice)}</span>
              </div>
              <span className="text-xs text-gray-400">{timeAgo(h.createdAt)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
