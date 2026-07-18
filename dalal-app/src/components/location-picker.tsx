import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, LocateFixed, Loader2, MapPin, X, Check } from "lucide-react";
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

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  // Coordinates are STAGED here first; they are only shared with the parent form
  // when the user presses "موافق" (confirm). This prevents the picker from
  // resetting the surrounding flow and makes selection explicit.
  const [pending, setPending] = useState<Coords | null>(value);
  const [latInput, setLatInput] = useState(value ? String(value.lat) : "");
  const [lngInput, setLngInput] = useState(value ? String(value.lng) : "");

  const confirmed = value != null;
  const dirty =
    pending != null &&
    (!value || Math.abs(value.lat - pending.lat) > 1e-9 || Math.abs(value.lng - pending.lng) > 1e-9);

  function stage(lat: number, lng: number, fly = true) {
    setPending({ lat, lng });
    setLatInput(String(lat));
    setLngInput(String(lng));
    setError("");
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const m = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        setPending({ lat: p.lat, lng: p.lng });
        setLatInput(String(p.lat));
        setLngInput(String(p.lng));
      });
      markerRef.current = m;
    }
    if (fly) map.flyTo([lat, lng], Math.max(map.getZoom(), 16));
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
      stage(e.latlng.lat, e.latlng.lng, false);
    });
    mapRef.current = map;
    if (hasValue) {
      const m = L.marker(start, { icon: pinIcon, draggable: true }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        setPending({ lat: p.lat, lng: p.lng });
        setLatInput(String(p.lat));
        setLngInput(String(p.lng));
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
      setPending(null);
      setLatInput("");
      setLngInput("");
    }
  }, [value]);

  async function runSearch() {
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
      stage(parseFloat(data[0]!.lat), parseFloat(data[0]!.lon));
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
      stage(c.lat, c.lng);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديد الموقع");
    } finally {
      setLocating(false);
    }
  }

  function applyManualCoords() {
    const lat = parseFloat(latInput.replace(/[^\d.\-]/g, ""));
    const lng = parseFloat(lngInput.replace(/[^\d.\-]/g, ""));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError("إحداثيات غير صالحة (خط العرض -90..90، خط الطول -180..180)");
      return;
    }
    stage(lat, lng);
  }

  function confirmLocation() {
    if (!pending) return;
    onChange({ lat: pending.lat, lng: pending.lng });
    setError("");
  }

  function onKeyDownNoSubmit(e: React.KeyboardEvent, fn: () => void) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      fn();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => onKeyDownNoSubmit(e, runSearch)}
            placeholder="ابحث عن نقطة دالة (مثال: جامع، ساحة، مول)"
            className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searching}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-500 disabled:opacity-50"
            title="بحث"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>
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

      {/* Manual coordinate entry with an explicit confirm — no page reset. */}
      <div className="flex gap-2">
        <input
          value={latInput}
          onChange={(e) => setLatInput(e.target.value)}
          onKeyDown={(e) => onKeyDownNoSubmit(e, applyManualCoords)}
          inputMode="decimal"
          placeholder="خط العرض (lat)"
          dir="ltr"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <input
          value={lngInput}
          onChange={(e) => setLngInput(e.target.value)}
          onKeyDown={(e) => onKeyDownNoSubmit(e, applyManualCoords)}
          inputMode="decimal"
          placeholder="خط الطول (lng)"
          dir="ltr"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <button
          type="button"
          onClick={applyManualCoords}
          className="px-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition whitespace-nowrap"
        >
          وضع الدبوس
        </button>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <div
        ref={mapEl}
        className="w-full h-60 rounded-xl overflow-hidden border border-gray-200 z-0"
        style={{ direction: "ltr" }}
      />

      <p className="text-gray-400 text-xs">انقر على الخريطة أو اسحب الدبوس أو أدخل الإحداثيات، ثم اضغط «موافق» لتثبيت الموقع</p>

      {pending && (
        <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          <p className="flex items-center gap-1.5 text-emerald-700 text-xs font-medium" dir="ltr">
            <MapPin className="w-3.5 h-3.5" /> {formatCoords(pending.lat, pending.lng)}
            {confirmed && !dirty && <Check className="w-3.5 h-3.5" />}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirmLocation}
              disabled={confirmed && !dirty}
              className="flex items-center gap-1 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-emerald-600 transition disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" /> {confirmed && !dirty ? "تم التثبيت" : "موافق"}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-emerald-500 hover:text-red-500 transition"
              title="إزالة الموقع"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
