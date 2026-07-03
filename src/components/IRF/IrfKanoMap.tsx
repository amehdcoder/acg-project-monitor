import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { buildLgaIndex, placePoints, type LgaIndex, type RawPoint } from "@/lib/irf/geoSnap";

interface PointT { id: string; lat: number; lng: number; reach: number; label: string; lga?: string | null }

interface Props {
  /** Full LGA name -> aggregated value (people reached). */
  lgaValues: Record<string, number>;
  points: PointT[];
}

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Fuzzy-match a geojson LGA (abbreviated) against report LGA names (full). */
function matchValue(geoName: string, values: Record<string, number>) {
  const g = norm(geoName);
  for (const [k, v] of Object.entries(values)) {
    const n = norm(k);
    if (!n || !g) continue;
    if (n === g || (n.length >= 4 && (n.startsWith(g) || g.startsWith(n)))) return v;
  }
  return 0;
}

function shade(v: number, max: number) {
  if (!v || max <= 0) return "#1e293b";
  const t = Math.min(1, v / max);
  // emerald ramp
  const stops = ["#064e3b", "#047857", "#10b981", "#34d399", "#a7f3d0"];
  const idx = Math.min(stops.length - 1, Math.floor(t * stops.length));
  return stops[idx];
}

export default function IrfKanoMap({ lgaValues, points }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [index, setIndex] = useState<LgaIndex | null>(null);

  const maxVal = useMemo(() => Math.max(1, ...Object.values(lgaValues)), [lgaValues]);

  // Correct/snap every marker to its authoritative LGA polygon once the
  // boundary index is available. Points outside their LGA (or off-map) are
  // relocated to a guaranteed-interior point of the correct LGA.
  const placed = useMemo(() => {
    if (!index) return null;
    return placePoints(points as RawPoint[], index);
  }, [index, points]);
  const correctedCount = useMemo(() => (placed ? placed.filter((p) => p.corrected).length : 0), [placed]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [11.9, 8.5], zoom: 8, attributionControl: false, scrollWheelZoom: false,
    });
    L.tileLayer(SAT, { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 150);

    fetch("/kano-lga.geojson").then((r) => r.json()).then((geo) => {
      if (!mapRef.current) return;
      setIndex(buildLgaIndex(geo));
      layerRef.current = L.geoJSON(geo, {
        style: (f: any) => ({
          color: "#fbbf24",
          weight: 1.2,
          fillColor: shade(matchValue(f.properties.lga, lgaValues), maxVal),
          fillOpacity: 0.72,
        }),
        onEachFeature: (f: any, lyr) => {
          const v = matchValue(f.properties.lga, lgaValues);
          lyr.bindTooltip(`<strong>${f.properties.lga}</strong><br/>${v.toLocaleString()} reached`, { sticky: true });
          lyr.on("mouseover", () => (lyr as any).setStyle({ weight: 2.5, color: "#fff" }));
          lyr.on("mouseout", () => layerRef.current?.resetStyle(lyr as any));
        },
      }).addTo(map);
      try { map.fitBounds(layerRef.current.getBounds(), { padding: [12, 12] }); } catch { /* ignore */ }
    });
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recolor on data change.
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.setStyle((f: any) => ({
      color: "#fbbf24", weight: 1.2,
      fillColor: shade(matchValue(f.properties.lga, lgaValues), maxVal), fillOpacity: 0.72,
    }));
  }, [lgaValues, maxVal]);

  // GPS markers (snapped to the correct LGA polygon).
  useEffect(() => {
    const grp = markersRef.current;
    if (!grp || !placed) return;
    grp.clearLayers();
    placed.forEach((p) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 5, color: "#fff", weight: 1.5,
        fillColor: p.corrected ? "#f59e0b" : "#ef4444", fillOpacity: 0.95,
      })
        .bindTooltip(
          `${p.label || "Report"} · ${p.reach.toLocaleString()} reached${p.corrected ? "<br/><em>Placed within reported LGA</em>" : ""}`,
        )
        .addTo(grp);
    });
  }, [placed]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      <div ref={containerRef} className="h-[420px] w-full" />
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-lg bg-background/85 px-3 py-2 text-[11px] shadow backdrop-blur">
        <p className="mb-1 font-semibold text-foreground">People reached</p>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Low</span>
          <span className="h-2.5 w-7 rounded-sm" style={{ background: "#064e3b" }} />
          <span className="h-2.5 w-7 rounded-sm" style={{ background: "#10b981" }} />
          <span className="h-2.5 w-7 rounded-sm" style={{ background: "#a7f3d0" }} />
          <span className="text-muted-foreground">High</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#ef4444" }} /> GPS</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} /> Placed in LGA</span>
        </div>
      </div>
      {correctedCount > 0 && (
        <div className="pointer-events-none absolute right-3 top-3 z-[400] rounded-lg bg-amber-500/90 px-2.5 py-1 text-[11px] font-medium text-white shadow">
          {correctedCount} marker{correctedCount === 1 ? "" : "s"} repositioned into reported LGA
        </div>
      )}
    </div>
  );
}
