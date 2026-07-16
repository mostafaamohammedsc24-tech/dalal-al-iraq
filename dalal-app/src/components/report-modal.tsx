import { useState } from "react";
import { X, Flag } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { useLocation } from "wouter";

const REASONS = [
  "احتيال أو نصب",
  "تم البيع",
  "محتوى غير لائق",
  "معلومات خاطئة",
  "محتوى مكرر",
  "أخرى",
];

export function ReportModal({
  listingId,
  onClose,
}: {
  listingId: string;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!getUser()) {
      navigate("/login");
      return;
    }
    if (!reason) {
      setError("اختر سبب البلاغ");
      return;
    }
    setSending(true);
    setError("");
    try {
      await api.post(`/reports`, { listingId, reason, note: details });
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال البلاغ");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-500" /> الإبلاغ عن إعلان
          </h3>
          <button onClick={onClose} aria-label="إغلاق" className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-gray-700 dark:text-gray-200 font-medium">تم استلام بلاغك، شكراً لك</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                    reason === r
                      ? "border-orange-400 bg-orange-50 dark:bg-orange-950"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-orange-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-200">{r}</span>
                </label>
              ))}
            </div>

            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="تفاصيل إضافية (اختياري)"
              rows={3}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm text-gray-800 dark:text-gray-100 mb-3 resize-none"
            />

            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={sending}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-medium py-3 rounded-xl transition"
            >
              {sending ? "جارِ الإرسال..." : "إرسال البلاغ"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
