import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Segment, LatLng } from "@/lib/ces/kmeansSegments";

export interface ExclusionZones {
  roads: { lat: number; lng: number; bufferM: number }[];
  waterways: { lat: number; lng: number; bufferM: number }[];
  nonResidential: { lat: number; lng: number; bufferM: number }[];
}

export interface SurveyHousehold {
  id: string;
  hh_number: string;
  lat: number;
  lng: number;
  coverage_status: string;
  segment_id?: string | null;
  eligible_persons?: number;
  treated_persons?: number;
}


interface CESSurveyMapProps {
  centerLat: number;
  centerLng: number;
  perimeter?: LatLng[];
  segments: Segment[];
  selectedSegmentIds: string[]; // labels
  households: SurveyHousehold[];
  routeTo?: { lat: number; lng: number } | null;
  basemap?: "satellite" | "hybrid" | "street" | "terrain";
  onMapTap?: (lat: number, lng: number) => void;
  onHouseholdClick?: (id: string) => void;
  height?: string;
  exclusionZones?: ExclusionZones | null;
  showExclusions?: boolean;
  residentialBuildings?: LatLng[] | null;
  showResidential?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  treated: "#16a34a",
  not_treated: "#dc2626",
  absent: "#94a3b8",
  refused: "#dc2626",
  ineligible: "#eab308",
  unassessed: "#64748b",
};

const STATUS_SYMBOL: Record<string, string> = {
  treated: "✓",
  not_treated: "✕",
  absent: "○",
  refused: "⛔",
  ineligible: "▲",
  unassessed: "?",
};

const TILE_LAYERS: Record<string, { url: string; attribution: string }> = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — World Imagery",
  },
  hybrid: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — World Imagery + Reference",
  },
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenTopoMap (CC-BY-SA)",
  },
};

// Esri reference labels (streets, places, POIs) — used as overlay on satellite/hybrid
const ESRI_LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

const CESSurveyMap = ({
  centerLat,
  centerLng,
  perimeter = [],
  segments,
  selectedSegmentIds,
  households,
  routeTo,
  basemap = "satellite",
  onMapTap,
  onHouseholdClick,
  height = "60vh",
  exclusionZones = null,
  showExclusions = false,
  residentialBuildings = null,
  showResidential = false,
}: CESSurveyMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const labelsRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const applyBasemap = (map: L.Map, mode: typeof basemap) => {
    if (tileRef.current) { map.removeLayer(tileRef.current); tileRef.current = null; }
    if (labelsRef.current) { map.removeLayer(labelsRef.current); labelsRef.current = null; }
    const tl = TILE_LAYERS[mode];
    tileRef.current = L.tileLayer(tl.url, {
      attribution: tl.attribution,
      maxZoom: 22,
      maxNativeZoom: 19,
      detectRetina: true,
      crossOrigin: true,
    } as L.TileLayerOptions).addTo(map);
    if (mode === "satellite" || mode === "hybrid") {
      labelsRef.current = L.tileLayer(ESRI_LABELS_URL, {
        maxZoom: 22,
        maxNativeZoom: 19,
        opacity: mode === "hybrid" ? 1 : 0.85,
        pane: "overlayPane",
      } as L.TileLayerOptions).addTo(map);
    }
  };

  // init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 80,
      maxZoom: 22,
    }).setView([centerLat, centerLng], 17);
    applyBasemap(map, basemap);
    layerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    if (onMapTap) {
      map.on("click", (e: L.LeafletMouseEvent) => onMapTap(e.latlng.lat, e.latlng.lng));
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line
  }, []);

  // basemap switch
  useEffect(() => {
    if (!mapRef.current) return;
    applyBasemap(mapRef.current, basemap);
  }, [basemap]);

  // recenter
  useEffect(() => {
    if (mapRef.current && Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
      mapRef.current.setView([centerLat, centerLng], mapRef.current.getZoom() || 17);
    }
  }, [centerLat, centerLng]);

  // overlays
  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current) return;
    layerGroupRef.current.clearLayers();
    const lg = layerGroupRef.current;

    // perimeter
    if (perimeter.length >= 2) {
      L.polygon(perimeter.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], {
        color: "#3b82f6",
        weight: 2,
        fillOpacity: 0.05,
      }).addTo(lg);
    }

    // exclusion overlay (off by default)
    if (showExclusions && exclusionZones) {
      const cap = 400;
      const drawCat = (
        pts: { lat: number; lng: number; bufferM: number }[],
        style: L.CircleMarkerOptions,
        label: string,
      ) => {
        for (const p of pts.slice(0, cap)) {
          L.circle([p.lat, p.lng], {
            radius: Math.max(p.bufferM, 3),
            ...style,
          }).bindTooltip(label, { permanent: false }).addTo(lg);
        }
      };
      drawCat(exclusionZones.roads, {
        color: "#dc2626", weight: 1, dashArray: "4 4", fillOpacity: 0,
      }, "Excluded · Road");
      drawCat(exclusionZones.waterways, {
        color: "#2563eb", weight: 1, dashArray: "2 4", fillOpacity: 0,
      }, "Excluded · Waterway");
      drawCat(exclusionZones.nonResidential, {
        color: "#64748b", weight: 1, dashArray: "1 3", fillOpacity: 0.12, fillColor: "#64748b",
      }, "Excluded · Non-residential");
    }

    // residential buildings (OSM-detected) — small green dots
    if (showResidential && residentialBuildings && residentialBuildings.length > 0) {
      const cap = 1500;
      for (const b of residentialBuildings.slice(0, cap)) {
        L.circleMarker([b.lat, b.lng], {
          radius: 3,
          color: "#16a34a",
          weight: 1,
          fillColor: "#22c55e",
          fillOpacity: 0.85,
        })
          .bindTooltip("Residential building (OSM)", { permanent: false })
          .addTo(lg);
      }
    }

    // segments
    for (const seg of segments) {
      const isSelected = selectedSegmentIds.includes(seg.label);
      if (seg.polygon.length >= 3) {
        L.polygon(seg.polygon.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], {
          color: isSelected ? "#1d4ed8" : seg.color,
          weight: isSelected ? 4 : 2,
          fillColor: seg.color,
          fillOpacity: isSelected ? 0.35 : 0.15,
          dashArray: isSelected ? undefined : "4 4",
        })
          .bindTooltip(`${seg.label} • ${seg.count} HH`, { permanent: false })
          .addTo(lg);
      }
      // label at centroid
      L.marker([seg.centroid.lat, seg.centroid.lng], {
        icon: L.divIcon({
          className: "ces-seg-label",
          html: `<div style="background:${seg.color};color:#fff;border-radius:9999px;padding:2px 8px;font-weight:700;font-size:11px;border:2px solid ${isSelected ? "#1d4ed8" : "#fff"};box-shadow:0 1px 3px rgba(0,0,0,.4)">${seg.label}</div>`,
          iconSize: [28, 18],
        }),
      }).addTo(lg);
    }

    // route
    if (routeTo) {
      L.polyline(
        [
          [centerLat, centerLng],
          [routeTo.lat, routeTo.lng],
        ],
        { color: "#1d4ed8", weight: 4, dashArray: "6 6" },
      ).addTo(lg);
      L.marker([routeTo.lat, routeTo.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="background:#1d4ed8;color:#fff;border-radius:9999px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff">⚑</div>`,
          iconSize: [24, 24],
        }),
      }).addTo(lg);
    }

    // households
    for (const h of households) {
      const color = STATUS_COLORS[h.coverage_status] ?? "#64748b";
      const sym = STATUS_SYMBOL[h.coverage_status] ?? "?";
      const m = L.marker([h.lat, h.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div title="${h.hh_number}" style="background:${color};color:#fff;border-radius:6px;padding:2px 4px;min-width:48px;text-align:center;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${sym} ${h.hh_number}</div>`,
          iconSize: [56, 22],
        }),
      }).addTo(lg);
      if (onHouseholdClick) m.on("click", () => onHouseholdClick(h.id));
    }
  }, [perimeter, segments, selectedSegmentIds, households, routeTo, centerLat, centerLng, onHouseholdClick, exclusionZones, showExclusions, residentialBuildings, showResidential]);

  return <div ref={containerRef} style={{ height, width: "100%" }} className="rounded-lg overflow-hidden border border-border" />;
};

export default CESSurveyMap;
