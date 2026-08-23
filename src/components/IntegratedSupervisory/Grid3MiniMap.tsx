/**
 * Mini map preview for a GRID3 coordinate-accuracy exception.
 *
 * Plots BOTH the supervisor-captured fix and the matched GRID3 registry
 * settlement on high-resolution satellite imagery, joins them with a dashed
 * separation line and labels the computed Haversine distance, so the analyst
 * can see the discrepancy rather than read it.
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Pt { lat: number; lng: number; label: string }

const fmt = (m: number | null) =>
  m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;

const pin = (color: string) =>
  L.divIcon({
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></span>`,
  });

export default function Grid3MiniMap({
  capture, registry, distanceM, radiusKm,
}: {
  capture: Pt | null;
  registry: Pt | null;
  distanceM: number | null;
  radiusKm: number;
}) {
  const div = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = div.current;
    if (!el || !capture) return;
    const map = L.map(el, { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 22, maxNativeZoom: 19 },
    ).addTo(map);

    L.marker([capture.lat, capture.lng], { icon: pin("#E11D48") })
      .addTo(map)
      .bindTooltip(`Captured — ${capture.label}`, { direction: "top", offset: [0, -8] });

    if (registry) {
      L.marker([registry.lat, registry.lng], { icon: pin("#10B981") })
        .addTo(map)
        .bindTooltip(`GRID3 registry — ${registry.label}`, { direction: "top", offset: [0, -8] });
      L.polyline(
        [[capture.lat, capture.lng], [registry.lat, registry.lng]],
        { color: "#F59E0B", weight: 2, dashArray: "6 6" },
      ).addTo(map);
      L.circle([registry.lat, registry.lng], {
        radius: radiusKm * 1000, color: "#38BDF8", weight: 1, fillOpacity: 0.06,
      }).addTo(map);
      map.fitBounds(
        L.latLngBounds([[capture.lat, capture.lng], [registry.lat, registry.lng]]),
        { padding: [36, 36], maxZoom: 18 },
      );
    } else {
      map.setView([capture.lat, capture.lng], 17);
    }

    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => { clearTimeout(t); map.remove(); };
  }, [capture, registry, radiusKm]);

  if (!capture) return null;

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10.5px]">
        <span className="inline-flex items-center gap-1 font-semibold">
          <MapPin className="h-3 w-3 text-rose-600" /> Captured vs GRID3 registry
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-600" /> captured fix
        </span>
        {registry && (
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> registry point
          </span>
        )}
        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
          separation {fmt(distanceM)}
        </span>
        <span className="text-muted-foreground">· {radiusKm} km standard</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 text-[10px]"
          onClick={() =>
            window.open(
              registry
                ? `https://www.google.com/maps/dir/?api=1&origin=${capture.lat},${capture.lng}&destination=${registry.lat},${registry.lng}`
                : `https://www.google.com/maps/search/?api=1&query=${capture.lat},${capture.lng}`,
              "_blank", "noopener",
            )
          }
        >
          <ExternalLink className="mr-1 h-3 w-3" /> Open in Google Maps
        </Button>
      </div>
      <div ref={div} className="h-[220px] w-full bg-slate-900" />
    </div>
  );
}
