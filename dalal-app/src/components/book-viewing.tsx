import { useState } from "react";
import { CalendarCheck, X } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useLocation } from "wouter";

export function BookViewing({ listingId, disabled }: { listingId: string; disabled?: boolean }) {
  const t = useT();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!getUser()) { navigate("/login"); return; }
    setSending(true);
    try {
      await api.post<{ ok: boolean; chatId: string }>(`/listings/${listingId}/viewing`, { date, note });
      setDone(true);
    } catch {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { if (!getUser()) { navigate("/login"); return; } setOpen(true); }}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 border-2 border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 py-2.5 rounded-xl font-bold hover:bg-orange-50 dark:hover:bg-orange-950 transition text-sm disabled:opacity-60 mt-2"
      >
        <CalendarCheck className="w-5 h-5" />
        {t("detail.bookViewing")}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-orange-500" />
                {t("viewing.title")}
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {done ? (
              <div className="text-center py-6">
                <CalendarCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-gray-700 dark:text-gray-200 font-medium">{t("viewing.success")}</p>
                <button
                  type="button"
                  onClick={() => { setOpen(false); navigate("/chat"); }}
                  className="mt-4 text-orange-500 hover:underline text-sm"
                >
                  {t("nav.chat")}
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{t("viewing.intro")}</p>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">{t("viewing.date")}</label>
                <input
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder={t("viewing.datePlaceholder")}
                  className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-800 dark:text-gray-100 mb-3 focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  {t("viewing.note")} <span className="text-gray-400">({t("common.optional")})</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-800 dark:text-gray-100 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={sending}
                  className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition text-sm disabled:opacity-60"
                >
                  {sending ? t("common.sending") : t("viewing.submit")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
