import { useState } from "react";
import { Share2, Copy, Check, MessageCircle } from "lucide-react";
import {
  shareListing,
  whatsappShareUrl,
  telegramShareUrl,
  facebookShareUrl,
  cn,
} from "@/lib/utils";

export function ShareButton({
  title,
  text,
  url,
  className,
}: {
  title: string;
  text?: string;
  url: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleNative() {
    const r = await shareListing({ title, text, url });
    if (r === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    if (r === "shared") setOpen(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
            handleNative();
          } else {
            setOpen((o) => !o);
          }
        }}
        aria-label="مشاركة"
        className={cn(
          "flex items-center justify-center rounded-full bg-white/90 dark:bg-gray-900/90 backdrop-blur shadow-sm hover:scale-110 transition p-2",
          className,
        )}
      >
        <Share2 className="w-5 h-5 text-gray-600 dark:text-gray-300" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 z-50 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 p-2 w-44">
            <a
              href={whatsappShareUrl(text || title, url)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-700 dark:text-gray-200"
            >
              <MessageCircle className="w-4 h-4 text-green-500" /> واتساب
            </a>
            <a
              href={telegramShareUrl(text || title, url)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-700 dark:text-gray-200"
            >
              <Share2 className="w-4 h-4 text-sky-500" /> تيليجرام
            </a>
            <a
              href={facebookShareUrl(url)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-700 dark:text-gray-200"
            >
              <Share2 className="w-4 h-4 text-blue-600" /> فيسبوك
            </a>
            <button
              type="button"
              onClick={copy}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-700 dark:text-gray-200"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-gray-400" />
              )}
              {copied ? "تم النسخ" : "نسخ الرابط"}
            </button>
          </div>
        </>
      )}

      {copied && !open && (
        <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 text-[11px] bg-gray-900 text-white px-2 py-0.5 rounded whitespace-nowrap">
          تم النسخ
        </span>
      )}
    </div>
  );
}
