import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatPrice } from "@/lib/utils";

const IRAQ_CENTER: [number, number] = [33.3152, 44.3661];

export interface MapListing {
  id: string;
  title: string;
  price: number;
  category?: string;
  latitude?: number | null;
  longitude?: number | null;
}

function priceIcon(price: number, category?: string) {
  const emoji = category === "عقارات" ? "🏠" : "🚗";
  const label = formatPrice(price);
  return L.divIcon({
    className: "dalal-price-pin",
    html: `<div style="display:flex;align-items:center;gap:4px;background:#f97316;color:#fff;font-family:Cairo,sans-serif;font-weight:700;font-size:12px;padding:4px 8px;border-radius:9999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid #fff">${emoji}<span>${label}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function ListingsMap({
  listings,
  basePath = "",
  heightClass = "h-[70vh]",
}: {
  listings: MapListing[];
  basePath?: string;
  heightClass?: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { attributionControl: true }).setView(IRAQ_CENTER, 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const pts: [number, number][] = [];
    for (const l of listings) {
      if (l.latitude == null || l.longitude == null) continue;
      const lat = l.latitude;
      const lng = l.longitude;
      pts.push([lat, lng]);
      const m = L.marker([lat, lng], { icon: priceIcon(l.price, l.category) });
      const href = `${basePath}listings/${l.id}`;
      m.bindPopup(
        `<div dir="rtl" style="font-family:Cairo,sans-serif;min-width:140px"><div style="font-weight:700;margin-bottom:4px">${l.title}</div><div style="color:#f97316;font-weight:700;margin-bottom:6px">${formatPrice(l.price)}</div><a href="${href}" style="color:#2563eb;font-size:13px">عرض التفاصيل ←</a></div>`,
      );
      m.addTo(layer);
    }
    if (pts.length === 1) map.setView(pts[0], 14);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.2));
  }, [listings, basePath]);

  const withCoords = listings.filter((l) => l.latitude != null && l.longitude != null).length;

  return (
    <div className="relative">
      <div ref={mapEl} className={`w-full ${heightClass} rounded-2xl overflow-hidden z-0`} />
      {withCoords === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 rounded-2xl pointer-events-none">
          <p className="text-gray-500 dark:text-gray-300 text-sm">لا توجد إعلانات بموقع محدد</p>
        </div>
      )}
    </div>
  );
}
