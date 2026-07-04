// SARMAAN ACSM — Kano supervision map.
// ---------------------------------------------------------------------------
// Renders Kano State + LGA administrative boundaries (bundled GeoJSON) on an
// OSM base map and plots every supervision visit that carries a GPS fix as a
// colour-coded medicine-bottle marker. Points are coloured by the visit's
// overall ACSM performance band so weak wards jump out on the map.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface VisitPoint {
  lat: number;
  lng: number;
  ward: string;
  lga: string;
  score: number;
  color: string;
}

interface Props {
  points: VisitPoint[];
}

const KANO_CENTER: [number, number] = [11.75, 8.55];

// Inline medicine-bottle SVG used as a Leaflet divIcon marker.
const bottleSvg = (color: string) => `
<div style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));transform:translate(-50%,-100%)">
  <svg width="30" height="38" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 30c0 0 9-9.5 9-16.5A9 9 0 1 0 3 13.5C3 20.5 12 30 12 30z" fill="${color}"/>
    <rect x="8" y="5.5" width="8" height="3" rx="1" fill="#ffffff"/>
    <rect x="8.8" y="8" width="6.4" height="9" rx="1.6" fill="#ffffff"/>
    <rect x="10.7" y="10" width="2.6" height="5" rx="0.6" fill="${color}"/>
    <rect x="9" y="11.6" width="6" height="1.8" fill="${color}"/>
  </svg>
</div>`;

export default function SarmaanKanoMap({ points }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  // Init map once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      center: KANO_CENTER,
      zoom: 8,
      scrollWheelZoom: false,
      attributionControl: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    const markers = L.layerGroup().addTo(map);
    markerLayerRef.current = markers;

    // Load bundled Kano boundaries.
    fetch("/data/sarmaan/kano_boundaries.json")
      .then((r) => r.json())
      .then((b) => {
        if (!mapRef.current) return;
        const lgaLayer = L.geoJSON(b.lgas, {
          style: {
            color: "#0E7A3B",
            weight: 1,
            fillColor: "#1E9E52",
            fillOpacity: 0.05,
          },
          onEachFeature: (f, layer) => {
            const name = f.properties?.name;
            if (name) layer.bindTooltip(name, { sticky: true, direction: "top", className: "sarmaan-lga-tip" });
          },
        }).addTo(map);
        L.geoJSON(b.state, {
          style: { color: "#0B5E30", weight: 3, fill: false },
        }).addTo(map);
        try { map.fitBounds(lgaLayer.getBounds(), { padding: [12, 12] }); } catch { /* noop */ }
      })
      .catch(() => { /* boundaries optional */ });

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  // Re-plot markers whenever visit points change (realtime updates).
  useEffect(() => {
    const layer = markerLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    points.forEach((p) => {
      const icon = L.divIcon({
        html: bottleSvg(p.color),
        className: "sarmaan-bottle-marker",
        iconSize: [30, 38],
        iconAnchor: [15, 38],
      });
      L.marker([p.lat, p.lng], { icon })
        .bindPopup(
          `<div style="font-family:system-ui;font-size:12px;min-width:130px">
             <b style="color:#0B5E30">${p.ward || "Ward"}</b><br/>
             <span style="color:#64748B">${p.lga || "LGA"}</span><br/>
             <span>ACSM score: <b>${p.score}%</b></span>
           </div>`,
        )
        .addTo(layer);
    });
    // keep view fitted to points when boundaries absent
    if (points.length > 0) {
      const b = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      // Only refit if all points sit outside current view.
      if (!map.getBounds().intersects(b)) {
        try { map.fitBounds(b, { padding: [30, 30], maxZoom: 11 }); } catch { /* noop */ }
      }
    }
    setTimeout(() => map.invalidateSize(), 100);
  }, [points]);

  return <div ref={elRef} className="h-full w-full rounded-xl" style={{ minHeight: 320 }} />;
}
