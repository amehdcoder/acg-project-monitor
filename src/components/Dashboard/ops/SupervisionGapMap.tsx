import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadNigeriaGeo } from "./lgaGeo";

export interface GapPoint {
  lat: number;
  lng: number;
  visited: boolean;
  name: string;
  sub?: string;
}

interface SupervisionGapMapProps {
  points: GapPoint[];
  height?: number;
  className?: string;
}

const circleHtml = (color: string) =>
  `<div style="width:12px;height:12px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>`;

// Fixed bounding box of the whole of Nigeria (SW + NE corners). Used as a
// guaranteed fallback so the map ALWAYS shows the full country extent even
// before the boundary GeoJSON has finished loading or when the marker cluster
// would otherwise crop the view.
const NIGERIA_BOUNDS = L.latLngBounds([3.9, 2.6], [14.0, 14.8]);

/**
 * Supervision Coverage Gap map — plots every microplanned community as a marker
 * coloured by whether MDA supervision actually reached it (green) or not (red).
 */
export default function SupervisionGapMap({ points, height = 360, className }: SupervisionGapMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const boundaryRef = useRef<L.GeoJSON | null>(null);
  const fullBoundsRef = useRef<L.LatLngBounds | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const init = () => {
      try {
        const map = L.map(container, { zoomControl: true, attributionControl: false, minZoom: 3, maxZoom: 14 });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
          subdomains: "abcd", maxZoom: 19, opacity: 0.9,
        }).addTo(map);
        mapRef.current = map;
        // Seed with the fixed Nigeria extent immediately so the whole country is
        // visible from the very first paint (before the boundary file loads).
        fullBoundsRef.current = NIGERIA_BOUNDS;
        map.fitBounds(NIGERIA_BOUNDS, { padding: [8, 8] });
        map.setMaxBounds(NIGERIA_BOUNDS.pad(0.4));
        // Draw a faint full-Nigeria boundary so the whole country stays visible.
        loadNigeriaGeo().then((geo) => {
          try {
            const boundary = L.geoJSON(geo, {
              style: { fillColor: "#eef2f7", fillOpacity: 0.4, color: "#94a3b8", weight: 0.6, opacity: 0.9 } as L.PathOptions,
            }).addTo(map);
            boundaryRef.current = boundary;
            const b = boundary.getBounds();
            // Union the real boundary with the fixed box so we never under-fit.
            const full = b.isValid() ? b.extend(NIGERIA_BOUNDS) : NIGERIA_BOUNDS;
            fullBoundsRef.current = full;
            map.setMaxBounds(full.pad(0.4));
            map.fitBounds(full, { padding: [8, 8] });
          } catch { /* noop */ }
        }).catch(() => {});
        setTimeout(() => { try { map.invalidateSize(); map.fitBounds(fullBoundsRef.current ?? NIGERIA_BOUNDS, { padding: [8, 8] }); } catch { /* noop */ } }, 0);
      } catch (e) { console.warn("Gap map init failed", e); }
    };
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      const ro = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0 && !mapRef.current) { init(); ro.disconnect(); }
      });
      ro.observe(container);
      return () => ro.disconnect();
    }
    init();
  }, []);

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) { try { map.removeLayer(layerRef.current); } catch { /* noop */ } layerRef.current = null; }

    const group = L.layerGroup();
    const bounds = L.latLngBounds([]);
    points.forEach((p) => {
      if (p.lat == null || p.lng == null || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
      const color = p.visited ? "#16a34a" : "#dc2626";
      const icon = L.divIcon({
        className: "",
        html: circleHtml(color),
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const m = L.marker([p.lat, p.lng], { icon });
      m.bindPopup(
        `<div style="font-family:inherit;min-width:160px;padding:2px;">
           <div style="font-weight:900;font-size:13px;color:#0f172a;">${p.name}</div>
           ${p.sub ? `<div style="font-size:10px;color:#64748b;margin-bottom:4px;">${p.sub}</div>` : ""}
           <div style="font-size:11px;font-weight:800;color:${color};">${p.visited ? "Visited during supervision" : "Not visited during supervision"}</div>
         </div>`,
      );
      group.addLayer(m);
      bounds.extend([p.lat, p.lng]);
    });
    group.addTo(map);
    layerRef.current = group;

    requestAnimationFrame(() => {
      try {
        map.invalidateSize();
        // Always keep the full country in view rather than cropping to markers.
        // Union any out-of-box markers with the fixed Nigeria extent so nothing
        // is ever clipped, regardless of how densely the map is populated.
        const target = L.latLngBounds(NIGERIA_BOUNDS.getSouthWest(), NIGERIA_BOUNDS.getNorthEast());
        if (fullBoundsRef.current?.isValid()) target.extend(fullBoundsRef.current);
        if (bounds.isValid()) target.extend(bounds);
        map.setMaxBounds(target.pad(0.4));
        map.fitBounds(target, { padding: [8, 8] });
      } catch { /* noop */ }
    });

  }, [points]);

  useEffect(() => {
    const fix = () => { try { mapRef.current?.invalidateSize(); } catch { /* noop */ } };
    const timers = [setTimeout(fix, 150), setTimeout(fix, 600), setTimeout(fix, 1500)];
    window.addEventListener("resize", fix);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("resize", fix); };
  }, []);

  return <div ref={containerRef} className={className} style={{ width: "100%", height }} />;
}
