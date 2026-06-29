import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPinned } from "lucide-react";
import { useLeafletStreetView } from "@/components/maps/LeafletStreetView";

export interface GeoPoint {
  id: string;
  address: string;
  lat: number;
  lng: number;
  resolved?: string | null;
  source?: string | null;
}

const SAT_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
// Esri reference labels (streets, places, POIs) — identical overlay to the
// Coverage Evaluation satellite map (the Stamen toner endpoint is dead).
const LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

// A pleasant categorical palette assigned per data source.
const PALETTE = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

function sourceColorMap(sources: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  sources.forEach((s, i) => { map[s] = PALETTE[i % PALETTE.length]; });
  return map;
}

export default function GeocodingMap({ points }: { points: GeoPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const { attach: attachSv, panel: streetViewPanel } = useLeafletStreetView();

  const sources = useMemo(
    () => Array.from(new Set(points.map((p) => p.source || "Unknown"))),
    [points],
  );
  const colors = useMemo(() => sourceColorMap(sources), [sources]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [9.082, 8.6753], zoom: 6, zoomControl: false });
    L.tileLayer(SAT_URL, { attribution: "Tiles &copy; Esri — World Imagery", maxZoom: 23, maxNativeZoom: 19, detectRetina: true, crossOrigin: true }).addTo(map);
    L.tileLayer(LABELS_URL, { maxZoom: 23, maxNativeZoom: 19, opacity: 0.85, pane: "overlayPane" }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Recalculate tile layout once the container is sized / resized.
    const fixSize = () => map.invalidateSize({ animate: false });
    const t0 = window.setTimeout(fixSize, 0);
    const t1 = window.setTimeout(fixSize, 300);
    const ro = new ResizeObserver(fixSize);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", fixSize);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      ro.disconnect();
      window.removeEventListener("resize", fixSize);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Render markers + fit to the country/data extent.
  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    if (points.length === 0) return;

    const latlngs: L.LatLngExpression[] = [];
    points.forEach((p) => {
      const color = colors[p.source || "Unknown"];
      latlngs.push([p.lat, p.lng]);
      const glow = L.circleMarker([p.lat, p.lng], {
        radius: 12, color: "transparent", fillColor: color, fillOpacity: 0.18,
      });
      const dot = L.circleMarker([p.lat, p.lng], {
        radius: 6, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 1,
      });
      dot.bindPopup(
        `<div style="min-width:180px">
           <strong>${escapeHtml(p.address || "Point")}</strong><br/>
           <span style="font-size:11px;color:#666">
             ${p.resolved ? `${escapeHtml(p.resolved)}<br/>` : ""}
             ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}<br/>
             <span style="color:${color};font-weight:600">${escapeHtml(p.source || "Unknown")}</span>
           </span>
         </div>`,
      );
      glow.addTo(group);
      dot.addTo(group);
    });

    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
  }, [points, colors]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-primary" /> Geocoded points map
        </CardTitle>
        <CardDescription>
          Satellite view auto-zoomed to the extent of your data, with each point coloured by its source.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative overflow-hidden rounded-xl border border-border">
          <div ref={containerRef} style={{ height: 460, width: "100%" }} />
          {points.length > 0 && (
            <Badge variant="secondary" className="absolute left-3 top-3 z-[1000] gap-1.5 shadow-lg">
              <MapPinned className="h-3.5 w-3.5" /> {points.length} point{points.length === 1 ? "" : "s"}
            </Badge>
          )}
          {points.length === 0 && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-background/70 backdrop-blur-sm">
              <p className="text-sm text-muted-foreground">Geocode some addresses to plot them here.</p>
            </div>
          )}
        </div>

        {/* Legend */}
        {sources.length > 0 && points.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Legend</span>
            {sources.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-xs">
                <span
                  className="inline-block h-3 w-3 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: colors[s] }}
                />
                {s}
                <span className="text-muted-foreground">
                  ({points.filter((p) => (p.source || "Unknown") === s).length})
                </span>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&#39;", '"': "&quot;" }[c]!));
}
