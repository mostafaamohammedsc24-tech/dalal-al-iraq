import { useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Video as VideoIcon } from "lucide-react";
import { mediaUrl } from "@/lib/api";

type Slide = { type: "video" | "image"; src: string };

interface MediaCarouselProps {
  images?: string[];
  video?: string | null;
  category?: string;
  linkHref?: string;
  heightClass?: string;
  rounded?: boolean;
}

export function MediaCarousel({
  images = [],
  video,
  category,
  linkHref,
  heightClass = "h-40",
  rounded = false,
}: MediaCarouselProps) {
  const slides: Slide[] = [];
  if (video) slides.push({ type: "video", src: mediaUrl(video) });
  for (const img of images) slides.push({ type: "image", src: mediaUrl(img) });

  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);
  const count = slides.length;
  const go = (next: number) => setIdx((i) => (count ? (next + count) % count : 0));

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (count === 0) {
    const fallback = (
      <div
        className={`w-full ${heightClass} bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center ${rounded ? "rounded-2xl" : ""}`}
      >
        <span className="text-5xl text-orange-300">{category === "عقارات" ? "🏠" : "🚗"}</span>
      </div>
    );
    return linkHref ? <Link href={linkHref} className="block">{fallback}</Link> : fallback;
  }

  return (
    <div dir="ltr" className={`relative overflow-hidden bg-gray-100 ${heightClass} ${rounded ? "rounded-2xl" : ""}`}>
      <div
        className="flex h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${idx * 100}%)` }}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? idx + 1 : idx - 1);
          touchX.current = null;
        }}
      >
        {slides.map((s, i) => (
          <div key={i} className={`w-full flex-shrink-0 ${heightClass}`}>
            {s.type === "video" ? (
              <video
                src={s.src}
                controls
                playsInline
                preload="metadata"
                onClick={stop}
                className="w-full h-full object-cover bg-black"
              />
            ) : linkHref ? (
              <Link href={linkHref} className="block w-full h-full">
                <img src={s.src} alt="" className="w-full h-full object-cover" loading="lazy" />
              </Link>
            ) : (
              <img src={s.src} alt="" className="w-full h-full object-cover" loading="lazy" />
            )}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              go(idx - 1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white p-1.5 rounded-full hover:bg-black/60 transition"
            aria-label="السابق"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              go(idx + 1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white p-1.5 rounded-full hover:bg-black/60 transition"
            aria-label="التالي"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  stop(e);
                  setIdx(i);
                }}
                className={`w-1.5 h-1.5 rounded-full transition ${i === idx ? "bg-white" : "bg-white/50"}`}
                aria-label={`شريحة ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {video && (
        <span className="absolute top-2 right-2 bg-black/55 text-white text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
          <VideoIcon className="w-3 h-3" />
          فيديو
        </span>
      )}
    </div>
  );
}
