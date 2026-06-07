import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

const houseSvg = (color: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="${color}" stroke="#ffffff" stroke-width="1.2"><path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z"/></svg>`;

/**
 * Supervision Coverage Gap map — plots every microplanned community as a marker
 * coloured by whether MDA supervision actually reached it (green) or not (red).
 */
export default function SupervisionGapMap({ points, height = 360, className }: SupervisionGapMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const init = () => {
      try {
        const map = L.map(container, { zoomControl: true, attributionControl: false, minZoom: 5 });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
          subdomains: "abcd", maxZoom: 19, opacity: 0.9,
        }).addTo(map);
        map.setView([9.082, 8.6753], 6);
        mapRef.current = map;
        setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 0);
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
        html: `<div style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));">${houseSvg(color)}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
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
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 9 });
        else map.setView([9.082, 8.6753], 6);
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
