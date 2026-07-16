import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Star, MapPin, Phone, Clock, MessageCircle, ShieldCheck } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

interface Office {
  id: string;
  name: string;
  city: string;
  area: string | null;
  phone: string;
  address: string | null;
  description: string | null;
  workingHours: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  rating: number;
  reviewCount: number;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  userName: string | null;
}

function Stars({ value, size = "w-4 h-4" }: { value: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${size} ${i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600"}`}
        />
      ))}
    </div>
  );
}

export default function OfficeDetailPage() {
  const [, params] = useRoute("/offices/:id");
  const [, navigate] = useLocation();
  const id = params?.id;

  const [office, setOffice] = useState<Office | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    if (!id) return;
    api
      .get<{ office: Office; reviews: Review[] }>(`/offices/${id}`)
      .then((d) => {
        setOffice(d.office);
        setReviews(d.reviews);
      })
      .catch(() => setOffice(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submitReview() {
    if (!getUser()) {
      navigate("/login");
      return;
    }
    if (rating < 1) {
      setError("اختر تقييماً من 1 إلى 5 نجوم");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/offices/${id}/reviews`, { rating, comment });
      setComment("");
      setRating(0);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال التقييم");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse mb-4" />
        <div className="h-48 bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!office) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-xl font-bold mb-2">المكتب غير موجود</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 bg-orange-100 dark:bg-orange-950 rounded-2xl flex items-center justify-center text-orange-600 dark:text-orange-400 flex-shrink-0">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{office.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Stars value={office.rating} />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {office.rating > 0 ? office.rating.toFixed(1) : "جديد"}
                {office.reviewCount > 0 ? ` (${office.reviewCount} تقييم)` : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-4 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {office.city}
            {office.area ? ` - ${office.area}` : ""}
          </span>
          {office.workingHours && (
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {office.workingHours}
            </span>
          )}
        </div>

        {office.address && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{office.address}</p>
        )}

        {office.description && (
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-3 whitespace-pre-line">
            {office.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <a
            href={`tel:${office.phone}`}
            className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl text-sm font-bold transition"
          >
            <Phone className="w-4 h-4" /> اتصال
          </a>
          <a
            href={`https://wa.me/${office.phone.replace(/[^0-9]/g, "").replace(/^0/, "964")}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-bold transition"
          >
            <MessageCircle className="w-4 h-4" /> واتساب
          </a>
        </div>
      </div>

      {/* Write review */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 mb-4">
        <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-3">أضف تقييمك</h3>
        <div className="flex items-center gap-1 mb-3" dir="ltr">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" onClick={() => setRating(i)} aria-label={`${i} نجوم`}>
              <Star
                className={`w-7 h-7 transition ${i <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600 hover:text-amber-300"}`}
              />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="شاركنا تجربتك مع هذا المكتب (اختياري)"
          rows={3}
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm text-gray-800 dark:text-gray-100 mb-3 resize-none"
        />
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <button
          type="button"
          onClick={submitReview}
          disabled={submitting}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition"
        >
          {submitting ? "جارِ الإرسال..." : "إرسال التقييم"}
        </button>
      </div>

      {/* Reviews */}
      <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-3">
        التقييمات {reviews.length > 0 ? `(${reviews.length})` : ""}
      </h3>
      {reviews.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6">لا توجد تقييمات بعد، كن أول من يقيّم</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-800 dark:text-gray-100 text-sm">
                  {r.userName || "مستخدم"}
                </span>
                <span className="text-xs text-gray-400">{timeAgo(r.createdAt)}</span>
              </div>
              <Stars value={r.rating} size="w-3.5 h-3.5" />
              {r.comment && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">{r.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
