import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadNigeriaGeo, resolveFromMap } from "./lgaGeo";

export interface ChoroCell {
  fill: string;
  /** Optional fill opacity override (default 0.72). */
  opacity?: number;
  /** Pre-rendered HTML for the boundary popup. */
  popupHtml?: string;
}

interface NigeriaChoroplethProps {
  /** Keyed by lgaKey(state, lga). */
  cells: Map<string, ChoroCell>;
  height?: number;
  selectedState?: string;
  selectedLga?: string;
  /** Reference basemap labels on/off. */
  showBasemap?: boolean;
  className?: string;
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/**
 * Reusable Nigeria LGA choropleth used by the concordance map and the
 * per-disease achievement maps. Loads the cached boundary file once and recolours
 * fills whenever `cells` changes — no duplicated Leaflet plumbing per map.
 */
export default function NigeriaChoropleth({
  cells,
  height = 420,
  selectedState = "All",
  selectedLga = "All",
  showBasemap = true,
  className,
}: NigeriaChoroplethProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const [geo, setGeo] = useState<any | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadNigeriaGeo().then((d) => { if (!cancelled) setGeo(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Initialise the Leaflet map once the container has real dimensions.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const init = () => {
      try {
        const map = L.map(container, { zoomControl: true, attributionControl: false, minZoom: 5 });
        if (showBasemap) {
          L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
            subdomains: "abcd", maxZoom: 19, opacity: 0.9,
          }).addTo(map);
        }
        map.setView([9.082, 8.6753], 6);
        mapRef.current = map;
        setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 0);
        setTick((t) => t + 1);
      } catch (e) { console.warn("Choropleth init failed", e); }
    };
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      const ro = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0 && !mapRef.current) {
          init();
          ro.disconnect();
        }
      });
      ro.observe(container);
      return () => ro.disconnect();
    }
    init();
  }, [showBasemap]);

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }, []);

  // (Re)draw the thematic layer whenever the data or scope changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo) return;

    if (layerRef.current) { try { map.removeLayer(layerRef.current); } catch { /* noop */ } layerRef.current = null; }

    const dataBounds = L.latLngBounds([]);
    const scopeBounds = L.latLngBounds([]);

    const layer = L.geoJSON(geo, {
      filter: (feature: any) => {
        const st = feature?.properties?.state || "";
        const lg = feature?.properties?.lga || "";
        if (selectedState !== "All" && norm(st) !== norm(selectedState)) return false;
        if (selectedLga !== "All" && norm(lg) !== norm(selectedLga)) return false;
        return true;
      },
      style: (feature: any) => {
        const cell = resolveFromMap(cells, feature?.properties?.state, feature?.properties?.lga);
        return {
          fillColor: cell?.fill ?? "#e2e8f0",
          fillOpacity: cell ? (cell.opacity ?? 0.72) : 0.18,
          color: cell ? "#ffffff" : "#cbd5e1",
          weight: cell ? 1.2 : 0.5,
          opacity: 1,
        } as L.PathOptions;
      },
      onEachFeature: (feature: any, lyr: L.Layer) => {
        const cell = resolveFromMap(cells, feature?.properties?.state, feature?.properties?.lga);
        if (cell?.popupHtml) (lyr as L.Path).bindPopup(cell.popupHtml, { maxWidth: 280 });
        lyr.on({
          mouseover: () => { try { (lyr as L.Path).setStyle({ weight: 2.4, color: "#0f172a" }); (lyr as any).bringToFront?.(); } catch { /* noop */ } },
          mouseout: () => { try { layer.resetStyle(lyr as any); } catch { /* noop */ } },
        });
        try { if (cell) dataBounds.extend((lyr as any).getBounds()); } catch { /* noop */ }
        try { scopeBounds.extend((lyr as any).getBounds()); } catch { /* noop */ }
      },
    });
    layer.addTo(map);
    layerRef.current = layer;

    const target = dataBounds.isValid() ? dataBounds : scopeBounds;
    requestAnimationFrame(() => {
      try {
        map.invalidateSize();
        if (target.isValid()) {
          map.fitBounds(target, { padding: [18, 18], maxZoom: selectedLga !== "All" ? 11 : selectedState !== "All" ? 9 : 7 });
          map.setMaxBounds(scopeBounds.isValid() ? scopeBounds.pad(0.1) : target.pad(0.1));
        } else {
          map.setView([9.082, 8.6753], 6);
        }
      } catch { /* noop */ }
    });
  }, [geo, cells, selectedState, selectedLga, tick]);

  // Keep the canvas sized when the panel becomes visible / window resizes.
  useEffect(() => {
    const fix = () => { try { mapRef.current?.invalidateSize(); } catch { /* noop */ } };
    const timers = [setTimeout(fix, 150), setTimeout(fix, 600), setTimeout(fix, 1500)];
    window.addEventListener("resize", fix);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("resize", fix); };
  }, [geo]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height }} />;
}
