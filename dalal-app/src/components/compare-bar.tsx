import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { GitCompareArrows, X } from "lucide-react";
import { getCompare, clearCompare } from "@/lib/utils";

export function CompareBar() {
  const [ids, setIds] = useState<string[]>(getCompare());
  const [location, navigate] = useLocation();

  useEffect(() => {
    const sync = () => setIds(getCompare());
    sync();
    window.addEventListener("compare-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("compare-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (ids.length === 0 || location.startsWith("/compare")) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md">
      <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-xl flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={clearCompare}
          aria-label="مسح المقارنة"
          className="text-gray-400 hover:text-white p-1"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium flex-1 text-center">
          {ids.length} للمقارنة
        </span>
        <button
          type="button"
          onClick={() => navigate("/compare")}
          disabled={ids.length < 2}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold px-4 py-1.5 rounded-xl flex items-center gap-1.5 transition"
        >
          <GitCompareArrows className="w-4 h-4" />
          قارن
        </button>
      </div>
    </div>
  );
}
