import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, LocateFixed, Loader2, MapPin, X } from "lucide-react";
import { getCurrentLocation, formatCoords, type Coords } from "@/lib/utils";

const IRAQ_CENTER: [number, number] = [33.3152, 44.3661];

const pinIcon = L.divIcon({
  className: "dalal-pin",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 24 24" fill="#f97316" stroke="#ffffff" stroke-width="1.5" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#ffffff" stroke="none"/></svg>`,
  iconSize: [34, 42],
  iconAnchor: [17, 42],
});

interface Props {
  value: Coords | null;
  onChange: (c: Coords | null) => void;
}

export function LocationPicker({ value, onChange }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  function placeMarker(lat: number, lng: number, fly = true) {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const m = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      markerRef.current = m;
    }
    if (fly) map.flyTo([lat, lng], Math.max(map.getZoom(), 16));
    onChangeRef.current({ lat, lng });
  }

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const hasValue = value != null;
    const start: [number, number] = hasValue ? [value!.lat, value!.lng] : IRAQ_CENTER;
    const map = L.map(mapEl.current, { attributionControl: true }).setView(start, hasValue ? 16 : 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      placeMarker(e.latlng.lat, e.latlng.lng, false);
    });
    mapRef.current = map;
    if (hasValue) {
      const m = L.marker(start, { icon: pinIcon, draggable: true }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      markerRef.current = m;
    }
    setTimeout(() => map.invalidateSize(), 120);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value == null && markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  }, [value]);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError("");
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
        `&accept-language=ar&countrycodes=iq&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        setError(res.status === 429 ? "كثرة الطلبات، انتظر قليلاً ثم حاول" : "تعذر البحث، حاول مجدداً");
        return;
      }
      const data: Array<{ lat: string; lon: string }> = await res.json();
      if (!data.length) {
        setError("لم يتم العثور على المكان، جرّب اسماً أوضح");
        return;
      }
      placeMarker(parseFloat(data[0].lat), parseFloat(data[0].lon));
    } catch {
      setError("تعذر البحث، حاول مجدداً");
    } finally {
      setSearching(false);
    }
  }

  async function useMyLocation() {
    setLocating(true);
    setError("");
    try {
      const c = await getCurrentLocation();
      placeMarker(c.lat, c.lng);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديد الموقع");
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <form onSubmit={runSearch} className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن نقطة دالة (مثال: جامع، ساحة، مول)"
            className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            type="submit"
            disabled={searching}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-500 disabled:opacity-50"
            title="بحث"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </form>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="flex items-center gap-1.5 px-3 rounded-xl border-2 border-orange-300 bg-orange-50 text-orange-600 text-sm font-medium hover:bg-orange-100 transition disabled:opacity-60 whitespace-nowrap"
          title="موقعي الحالي"
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
        </button>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <div
        ref={mapEl}
        className="w-full h-60 rounded-xl overflow-hidden border border-gray-200 z-0"
        style={{ direction: "ltr" }}
      />

      <p className="text-gray-400 text-xs">انقر على الخريطة أو اسحب الدبوس لتحديد الموقع بدقة</p>

      {value && (
        <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          <p className="flex items-center gap-1.5 text-emerald-700 text-xs font-medium" dir="ltr">
            <MapPin className="w-3.5 h-3.5" /> {formatCoords(value.lat, value.lng)}
          </p>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-emerald-500 hover:text-red-500 transition"
            title="إزالة الموقع"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
