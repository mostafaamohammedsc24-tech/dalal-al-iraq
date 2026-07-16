import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  if (price >= 1_000_000_000) return `${(price / 1_000_000_000).toFixed(1)} مليار د.ع`;
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(0)} مليون د.ع`;
  if (price >= 1_000) return `${(price / 1_000).toFixed(0)} ألف د.ع`;
  return `${price} د.ع`;
}

export function timeAgo(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return `منذ ${Math.floor(days / 30)} شهر`;
  if (days > 0) return `منذ ${days} يوم`;
  if (hours > 0) return `منذ ${hours} ساعة`;
  if (minutes > 0) return `منذ ${minutes} دقيقة`;
  return "الآن";
}

export const CITIES = [
  "بغداد","البصرة","الموصل","أربيل","النجف","كربلاء",
  "كركوك","الحلة","الناصرية","العمارة","السماوة","الديوانية",
  "الكوت","الرمادي","الفلوجة","تكريت","دهوك","السليمانية",
];

export const REAL_ESTATE_TYPES = [
  "شقة","بيت","فيلا","أرض","محل تجاري","مكتب","مزرعة","مستودع",
];

export const CAR_BRANDS = [
  "تويوتا","كيا","هيونداي","نيسان","هوندا","مرسيدس","بي ام دبليو",
  "اودي","شيفروليه","فورد","ميتسوبيشي","سوزوكي","بيجو","رينو","فولكس فاغن",
  "لكزس","انفينيتي","جيب","لاندروفر","بنتلي",
];

export const LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;

export const SIZE_OPTIONS = [
  50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 750, 800, 900,
  1000, 1250, 1500, 1750, 2000, 2500, 3000, 3500, 4000, 4500, 5000,
  6000, 7000, 8000, 9000, 10000,
];

export const SIZE_FILTERS: { label: string; min: string; max: string }[] = [
  { label: "حتى 100 م²", min: "", max: "100" },
  { label: "100 - 200 م²", min: "100", max: "200" },
  { label: "200 - 300 م²", min: "200", max: "300" },
  { label: "300 - 500 م²", min: "300", max: "500" },
  { label: "500 - 1000 م²", min: "500", max: "1000" },
  { label: "1000 - 5000 م²", min: "1000", max: "5000" },
  { label: "أكثر من 5000 م²", min: "5000", max: "" },
];

export const OWNERSHIP_TYPES = ["طابو صرف", "زراعي"];

export const DEAL_TYPES = ["للبيع", "للايجار", "مباع"];

export function formatSize(size?: number | null): string {
  if (size == null) return "";
  return `${size % 1 === 0 ? size : size.toFixed(1)} م²`;
}

export interface Coords {
  lat: number;
  lng: number;
}

export function getCurrentLocation(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("تم رفض إذن الوصول إلى الموقع"));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("انتهت مهلة تحديد الموقع، حاول مجدداً"));
        } else {
          reject(new Error("تعذر تحديد موقعك الحالي"));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export function formatCoords(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null) return "";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function mapsLink(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null) return "";
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function dealTypeStyle(dealType?: string | null): string {
  switch (dealType) {
    case "مباع":
      return "bg-gray-700 text-white";
    case "للايجار":
      return "bg-blue-500 text-white";
    default:
      return "bg-emerald-500 text-white";
  }
}

export function fileToCompressedDataUrl(
  file: File,
  maxSize = 1200,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("تعذر معالجة الصورة"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("صورة غير صالحة"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

// ---- Marketplace feature helpers (added for advanced features) ----

export const CAR_YEARS: number[] = (() => {
  const y = new Date().getFullYear();
  const arr: number[] = [];
  for (let i = y + 1; i >= 1990; i--) arr.push(i);
  return arr;
})();

export const BEDROOM_OPTIONS = [1, 2, 3, 4, 5, 6];
export const BATHROOM_OPTIONS = [1, 2, 3, 4, 5];

export const MILEAGE_FILTERS: { label: string; max: string }[] = [
  { label: "حتى 20 ألف كم", max: "20000" },
  { label: "حتى 50 ألف كم", max: "50000" },
  { label: "حتى 100 ألف كم", max: "100000" },
  { label: "حتى 150 ألف كم", max: "150000" },
  { label: "حتى 200 ألف كم", max: "200000" },
];

export function formatMileage(km?: number | null): string {
  if (km == null) return "";
  if (km >= 1000) return `${(km / 1000).toFixed(km % 1000 === 0 ? 0 : 1)} ألف كم`;
  return `${km} كم`;
}

export function isNewListing(createdAt: string | Date): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 3 * 24 * 60 * 60 * 1000;
}

// ---- Recently viewed (localStorage) ----
const RECENT_KEY = "dalal_recent_listings";
export function addRecentlyViewed(id: string) {
  try {
    const arr = getRecentlyViewed().filter((x) => x !== id);
    arr.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 12)));
  } catch {
    /* ignore */
  }
}
export function getRecentlyViewed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ---- Compare (localStorage, max 4) ----
const COMPARE_KEY = "dalal_compare_listings";
export const COMPARE_MAX = 4;
export function getCompare(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function isInCompare(id: string): boolean {
  return getCompare().includes(id);
}
function saveCompare(arr: string[]) {
  try {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("compare-change"));
}
export function toggleCompare(id: string): { inCompare: boolean; full: boolean } {
  const arr = getCompare();
  if (arr.includes(id)) {
    saveCompare(arr.filter((x) => x !== id));
    return { inCompare: false, full: false };
  }
  if (arr.length >= COMPARE_MAX) return { inCompare: false, full: true };
  arr.push(id);
  saveCompare(arr);
  return { inCompare: true, full: false };
}
export function removeFromCompare(id: string) {
  saveCompare(getCompare().filter((x) => x !== id));
}
export function clearCompare() {
  saveCompare([]);
}

// ---- Share helpers ----
export async function shareListing(opts: {
  title: string;
  text?: string;
  url: string;
}): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
    try {
      await (navigator as Navigator).share(opts);
      return "shared";
    } catch {
      return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(opts.url);
    return "copied";
  } catch {
    return "failed";
  }
}
export function whatsappShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}
export function facebookShareUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}
export function telegramShareUrl(text: string, url: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

// ---- Market position indicator ----
export function marketPosition(
  price: number,
  avg: number | null | undefined,
): { label: string; tone: string } | null {
  if (!avg || avg <= 0 || !price) return null;
  const diff = (price - avg) / avg;
  if (diff <= -0.1)
    return {
      label: `أقل من متوسط السوق بـ ${Math.round(-diff * 100)}%`,
      tone: "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950",
    };
  if (diff >= 0.1)
    return {
      label: `أعلى من متوسط السوق بـ ${Math.round(diff * 100)}%`,
      tone: "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950",
    };
  return {
    label: "ضمن متوسط أسعار السوق",
    tone: "text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-800",
  };
}
