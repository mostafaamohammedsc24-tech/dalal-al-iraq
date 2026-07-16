import { useState } from "react";
import { Calculator } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function MortgageCalculator({ price }: { price: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [downPct, setDownPct] = useState(20);
  const [years, setYears] = useState(15);
  const [rate, setRate] = useState(8);

  const down = Math.round((price * downPct) / 100);
  const loan = Math.max(0, price - down);
  const monthlyRate = rate / 100 / 12;
  const n = years * 12;
  const monthly =
    monthlyRate > 0
      ? (loan * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n))
      : loan / n;
  const totalPay = monthly * n + down;
  const totalInterest = monthly * n - loan;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4 shadow-sm border border-gray-50 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between"
      >
        <span className="flex items-center gap-2 font-bold text-gray-800 dark:text-gray-100">
          <Calculator className="w-5 h-5 text-orange-500" />
          {t("mortgage.title")}
        </span>
        <span className="text-orange-500 text-sm">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
              <span>{t("mortgage.downPayment")}: {downPct}%</span>
              <span className="font-medium">{formatPrice(down)}</span>
            </div>
            <input
              type="range" min={0} max={90} step={5} value={downPct}
              onChange={(e) => setDownPct(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
              <span>{t("mortgage.years")}</span>
              <span className="font-medium">{years}</span>
            </div>
            <input
              type="range" min={1} max={30} step={1} value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
              <span>{t("mortgage.rate")}</span>
              <span className="font-medium">{rate}%</span>
            </div>
            <input
              type="range" min={1} max={20} step={0.5} value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>

          <div className="bg-orange-50 dark:bg-orange-950 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("mortgage.monthly")}</p>
            <p className="text-2xl font-bold text-orange-500">{formatPrice(Math.round(monthly))}</p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-2">
              <p className="text-[10px] text-gray-400">{t("mortgage.loanAmount")}</p>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{formatPrice(loan)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-2">
              <p className="text-[10px] text-gray-400">{t("mortgage.totalInterest")}</p>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{formatPrice(Math.round(totalInterest))}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-2">
              <p className="text-[10px] text-gray-400">{t("mortgage.totalPayment")}</p>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{formatPrice(Math.round(totalPay))}</p>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">{t("mortgage.disclaimer")}</p>
        </div>
      )}
    </div>
  );
}
