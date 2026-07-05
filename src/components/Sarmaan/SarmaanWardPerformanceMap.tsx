// SARMAAN ACSM — Ward Performance Map.
// ---------------------------------------------------------------------------
// A real Leaflet map of Kano State showing the State outline and every LGA
// boundary (bundled GeoJSON). Each LGA polygon is shaded by the average ACSM
// performance of the wards supervised inside it (choropleth). Supervised wards
// are plotted as performance-coloured dots at their mean supervision GPS, so
// the map shows State → LGA → Ward performance in a single view.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface LgaScore {
  /** normalised lga name (lowercase) */
  key: string;
  name: string;
  score: number;
  color: string;
  wards: number;
}

export interface WardPoint {
  lat: number;
  lng: number;
  ward: string;
  lga: string;
  score: number;
  color: string;
}

interface Props {
  lgaScores: LgaScore[];
  wardPoints: WardPoint[];
}

const KANO_CENTER: [number, number] = [11.75, 8.55];
const clean = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export default function SarmaanWardPerformanceMap({ lgaScores, wardPoints }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lgaLayerRef = useRef<L.GeoJSON | null>(null);
  const markerRef = useRef<L.LayerGroup | null>(null);
  const scoreRef = useRef<Map<string, LgaScore>>(new Map());

  // Keep latest scores available to the style callback.
  scoreRef.current = new Map(lgaScores.map((l) => [l.key, l]));

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      center: KANO_CENTER, zoom: 8, scrollWheelZoom: false, attributionControl: false,
    });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, opacity: 0.55 }).addTo(map);
    markerRef.current = L.layerGroup().addTo(map);

    fetch("/data/sarmaan/kano_boundaries.json")
      .then((r) => r.json())
      .then((b) => {
        if (!mapRef.current) return;
        const lgaLayer = L.geoJSON(b.lgas, {
          style: (f) => {
            const sc = scoreRef.current.get(clean(f?.properties?.name));
            return {
              color: "#0B5E30",
              weight: 1,
              fillColor: sc ? sc.color : "#E2E8F0",
              fillOpacity: sc ? 0.78 : 0.12,
            };
          },
          onEachFeature: (f, layer) => {
            const name = f.properties?.name || "LGA";
            const sc = scoreRef.current.get(clean(name));
            layer.bindTooltip(
              sc
                ? `<b>${name} LGA</b><br/>Avg performance: <b>${sc.score}%</b><br/>${sc.wards} ward(s) supervised`
                : `<b>${name} LGA</b><br/>No supervision yet`,
              { sticky: true, direction: "top" },
            );
          },
        }).addTo(map);
        lgaLayerRef.current = lgaLayer;
        L.geoJSON(b.state, { style: { color: "#0B5E30", weight: 3, fill: false } }).addTo(map);
        try { map.fitBounds(lgaLayer.getBounds(), { padding: [10, 10] }); } catch { /* noop */ }
        plotWards();
      })
      .catch(() => { /* boundaries optional */ });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plotWards = () => {
    const layer = markerRef.current;
    if (!layer) return;
    layer.clearLayers();
    wardPoints.forEach((w) => {
      L.circleMarker([w.lat, w.lng], {
        radius: 7, color: "#ffffff", weight: 2, fillColor: w.color, fillOpacity: 1,
      })
        .bindTooltip(`<b>${w.ward}</b> · ${w.lga} LGA<br/>Ward performance: <b>${w.score}%</b>`, { direction: "top" })
        .addTo(layer);
    });
  };

  // Recolour polygons + re-plot ward dots on data change.
  useEffect(() => {
    if (lgaLayerRef.current) {
      lgaLayerRef.current.setStyle((f: any) => {
        const sc = scoreRef.current.get(clean(f?.properties?.name));
        return { fillColor: sc ? sc.color : "#E2E8F0", fillOpacity: sc ? 0.78 : 0.12 };
      });
    }
    plotWards();
    setTimeout(() => mapRef.current?.invalidateSize(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lgaScores, wardPoints]);

  return <div ref={elRef} className="h-full w-full rounded-xl" style={{ minHeight: 340 }} />;
}
