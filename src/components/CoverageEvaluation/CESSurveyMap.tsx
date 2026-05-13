import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Segment, LatLng } from "@/lib/ces/kmeansSegments";
import type { FeatureGeometry } from "./utils/residentialMask";

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
  basemap?: "satellite" | "hybrid" | "street" | "terrain" | "google" | "google-sat";
  onMapTap?: (lat: number, lng: number) => void;
  onHouseholdClick?: (id: string) => void;
  height?: string;
  exclusionZones?: ExclusionZones | null;
  showExclusions?: boolean;
  residentialBuildings?: LatLng[] | null;
  showResidential?: boolean;
  /** Rich feature geometry (footprints + road/water polylines) to render. */
  mapFeatures?: FeatureGeometry | null;
  /** When true, render building footprints + road/water lines on the map. */
  showFeatures?: boolean;
  /** Optional LQAS validity overlay state for the walked perimeter. */
  lqas?: {
    closureM: number | null;
    selfIntersects: boolean;
    ready: boolean;
    areaM2: number | null;
  } | null;
  /** Live device GPS position; used to draw the live closure line. */
  livePosition?: LatLng | null;
  /** When true, map clicks add vertices to a draft polygon (manual draw mode). */
  drawMode?: boolean;
  /** Draft polygon points being drawn manually (rendered as dashed). */
  draftPolygon?: LatLng[];
  /** When true, perimeter vertices are rendered as draggable handles. */
  editablePerimeter?: boolean;
  /** Fired when a perimeter vertex is dragged to a new location. */
  onVertexMove?: (index: number, lat: number, lng: number) => void;
  /** Fired when a perimeter vertex marker is right-clicked / long-pressed (for delete). */
  onVertexDelete?: (index: number) => void;
  /** Optional GPS breadcrumb trail to render as a faint blue polyline. */
  gpsTrail?: LatLng[];
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

const TILE_LAYERS: Record<string, { url: string; attribution: string; subdomains?: string }> = {
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
  // Google Hybrid (satellite imagery + roads, place labels, POIs) — rendered in-app, no redirect.
  google: {
    url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "Imagery © Google · Map data © Google",
    subdomains: "0123",
  },
  // Google Satellite (no labels)
  "google-sat": {
    url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "Imagery © Google",
    subdomains: "0123",
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
  mapFeatures = null,
  showFeatures = false,
  lqas = null,
  livePosition = null,
  drawMode = false,
  draftPolygon = [],
  editablePerimeter = false,
  onVertexMove,
  onVertexDelete,
  gpsTrail = [],
}: CESSurveyMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const labelsRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tapHandlerRef = useRef<((lat: number, lng: number) => void) | null>(null);

  const applyBasemap = (map: L.Map, mode: typeof basemap) => {
    if (tileRef.current) { map.removeLayer(tileRef.current); tileRef.current = null; }
    if (labelsRef.current) { map.removeLayer(labelsRef.current); labelsRef.current = null; }
    const tl = TILE_LAYERS[mode] ?? TILE_LAYERS.satellite;
    tileRef.current = L.tileLayer(tl.url, {
      attribution: tl.attribution,
      maxZoom: 22,
      maxNativeZoom: 19,
      detectRetina: true,
      crossOrigin: true,
      ...(tl.subdomains ? { subdomains: tl.subdomains } : {}),
    } as L.TileLayerOptions).addTo(map);
    // Esri reference label overlay only for the Esri basemaps; Google "hybrid"
    // already includes its own labels so no overlay is needed there.
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

    // Single click handler that delegates to whatever the latest onMapTap is
    // (kept fresh via tapHandlerRef so toggling drawMode never detaches the listener).
    map.on("click", (e: L.LeafletMouseEvent) => {
      const h = tapHandlerRef.current;
      if (h) h(e.latlng.lat, e.latlng.lng);
    });

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

  // keep tap handler fresh and toggle the crosshair cursor while drawing
  useEffect(() => {
    tapHandlerRef.current = onMapTap ?? null;
    if (mapRef.current) {
      const c = mapRef.current.getContainer();
      c.style.cursor = drawMode ? "crosshair" : "";
    }
  }, [onMapTap, drawMode]);

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

    // perimeter — LQAS-aware styling: green when the lot boundary passes WHO
    // criteria, amber while still in progress, red when the polygon crosses
    // itself (invalid LQAS lot).
    if (perimeter.length >= 2) {
      const lqasState: "ready" | "invalid" | "progress" =
        lqas?.selfIntersects ? "invalid"
        : lqas?.ready ? "ready"
        : "progress";
      const lineColor =
        lqasState === "ready" ? "hsl(142 71% 45%)"
        : lqasState === "invalid" ? "hsl(0 84% 60%)"
        : "hsl(217 91% 60%)";
      const fillColor =
        lqasState === "ready" ? "hsl(142 71% 45%)"
        : lqasState === "invalid" ? "hsl(0 84% 60%)"
        : "hsl(217 91% 60%)";

      const polylineLayer = L.polyline(perimeter.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], {
        color: lineColor,
        weight: 4,
        opacity: 0.9,
        dashArray: lqasState === "invalid" ? "6 4" : undefined,
      }).addTo(lg);

      const polygonLayer = L.polygon(perimeter.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], {
        color: lineColor,
        weight: 2,
        fillColor,
        fillOpacity: lqasState === "ready" ? 0.12 : 0.05,
      }).addTo(lg);

      const areaTxt = lqas?.areaM2 != null
        ? (lqas.areaM2 >= 10_000 ? `${(lqas.areaM2 / 10_000).toFixed(2)} ha` : `${Math.round(lqas.areaM2)} m²`)
        : "—";
      const closureTxt = lqas?.closureM != null ? `${Math.round(lqas.closureM)} m` : "—";
      const stateTxt = lqasState === "ready"
        ? "✓ Valid LQAS lot — meets WHO criteria"
        : lqasState === "invalid"
        ? "⚠ Invalid lot — boundary crosses itself"
        : "Walk in progress — boundary not yet closed";

      const popupHtml = `
        <div style="min-width:200px;font-family:inherit;font-size:11px;">
          <div style="font-weight:800;margin-bottom:4px;">${stateTxt}</div>
          <div style="display:flex;justify-content:space-between;"><span style="color:#64748b;">Vertices</span><span style="font-weight:700;">${perimeter.length}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:#64748b;">Area</span><span style="font-weight:700;">${areaTxt}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:#64748b;">Closure</span><span style="font-weight:700;">${closureTxt}</span></div>
        </div>
      `;
      polylineLayer.bindPopup(popupHtml);
      polygonLayer.bindPopup(popupHtml);

      // Live closure line — dashed segment from current GPS back to start vertex.
      if (livePosition && perimeter.length >= 3) {
        const start = perimeter[0];
        L.polyline(
          [[livePosition.lat, livePosition.lng], [start.lat, start.lng]] as L.LatLngExpression[],
          {
            color: lqasState === "ready" ? "hsl(142 71% 45%)" : "hsl(38 92% 50%)",
            weight: 2,
            opacity: 0.85,
            dashArray: "4 6",
          },
        )
          .bindTooltip(`Closure: ${closureTxt} to start vertex`, { permanent: false, sticky: true })
          .addTo(lg);
      }

      // Skip the duplicated closing vertex (last === first) when rendering handles
      // so we don't show two markers stacked at the start.
      const isClosed = perimeter.length >= 2
        && Math.abs(perimeter[0].lat - perimeter[perimeter.length - 1].lat) < 1e-9
        && Math.abs(perimeter[0].lng - perimeter[perimeter.length - 1].lng) < 1e-9;
      const renderMax = isClosed ? perimeter.length - 1 : perimeter.length;

      perimeter.slice(0, renderMax).forEach((p, i) => {
        if (editablePerimeter && onVertexMove) {
          // Draggable square handle — easy to grab on mobile.
          const handle = L.marker([p.lat, p.lng], {
            draggable: true,
            icon: L.divIcon({
              className: "",
              html: `<div style="width:14px;height:14px;border-radius:3px;background:${i === 0 ? "hsl(38 92% 50%)" : "#fff"};border:2px solid ${lineColor};box-shadow:0 1px 3px rgba(0,0,0,.5);cursor:grab;"></div>`,
              iconSize: [14, 14],
            }),
          })
            .bindTooltip(i === 0 ? "Drag to move start vertex (right-click to delete)" : `Drag to move vertex ${i + 1} (right-click to delete)`, { permanent: false })
            .addTo(lg);
          handle.on("dragend", (ev: any) => {
            const ll = ev.target.getLatLng();
            onVertexMove(i, ll.lat, ll.lng);
          });
          if (onVertexDelete) {
            handle.on("contextmenu", (ev: any) => {
              ev.originalEvent?.preventDefault?.();
              onVertexDelete(i);
            });
          }
        } else {
          L.circleMarker([p.lat, p.lng], {
            radius: i === 0 ? 6 : 4,
            color: i === 0 ? "hsl(38 92% 50%)" : "hsl(var(--background))",
            weight: 2,
            fillColor: i === perimeter.length - 1 ? "hsl(142 71% 45%)" : lineColor,
            fillOpacity: 0.95,
          })
            .bindTooltip(i === 0 ? "Start vertex" : i === perimeter.length - 1 ? "Latest live vertex" : `Vertex ${i + 1}`, { permanent: false })
            .addTo(lg);
        }
      });
    }

    // GPS breadcrumb trail — faint blue polyline showing where the surveyor walked.
    if (gpsTrail.length >= 2) {
      L.polyline(gpsTrail.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], {
        color: "hsl(217 91% 60%)",
        weight: 2,
        opacity: 0.55,
        dashArray: "1 4",
      })
        .bindTooltip(`GPS trail · ${gpsTrail.length} fixes`, { permanent: false, sticky: true })
        .addTo(lg);
    }

    // Draft polygon (manual draw mode) — dashed amber line + numbered vertices,
    // closing line back to the first vertex so the user sees the shape live.
    if (draftPolygon.length >= 1) {
      const pts = draftPolygon.map((p) => [p.lat, p.lng]) as L.LatLngExpression[];
      if (draftPolygon.length >= 2) {
        L.polyline(pts, {
          color: "hsl(38 92% 50%)",
          weight: 3,
          opacity: 0.95,
          dashArray: "6 4",
        }).addTo(lg);
      }
      if (draftPolygon.length >= 3) {
        L.polyline(
          [[draftPolygon[draftPolygon.length - 1].lat, draftPolygon[draftPolygon.length - 1].lng],
           [draftPolygon[0].lat, draftPolygon[0].lng]] as L.LatLngExpression[],
          { color: "hsl(38 92% 50%)", weight: 2, opacity: 0.6, dashArray: "2 4" },
        ).addTo(lg);
        L.polygon(pts, {
          color: "hsl(38 92% 50%)",
          weight: 1,
          fillColor: "hsl(38 92% 50%)",
          fillOpacity: 0.08,
        }).addTo(lg);
      }
      draftPolygon.forEach((p, i) => {
        L.circleMarker([p.lat, p.lng], {
          radius: i === 0 ? 7 : 5,
          color: "#fff",
          weight: 2,
          fillColor: i === 0 ? "hsl(0 84% 60%)" : "hsl(38 92% 50%)",
          fillOpacity: 1,
        })
          .bindTooltip(i === 0 ? "Start (tap here to close)" : `Vertex ${i + 1}`, { permanent: false })
          .addTo(lg);
      });
    }

    if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
      L.circleMarker([centerLat, centerLng], {
        radius: 8,
        color: "hsl(var(--background))",
        weight: 3,
        fillColor: "hsl(0 84% 60%)",
        fillOpacity: 0.95,
      })
        .bindTooltip("Current device GPS", { permanent: false })
        .addTo(lg);
    }

    // exclusion overlay (off by default) — clearly visible color-coded zones
    if (showExclusions && exclusionZones) {
      const cap = 400;
      const fmtCoord = (n: number) => n.toFixed(6);
      const drawCat = (
        pts: { lat: number; lng: number; bufferM: number }[],
        style: L.PathOptions,
        label: string,
        category: string,
        minRadius = 6,
      ) => {
        pts.slice(0, cap).forEach((p, idx) => {
          const radius = Math.max(p.bufferM, minRadius);
          const popupHtml = `
            <div style="font-size:12px;line-height:1.4;min-width:180px">
              <div style="font-weight:700;margin-bottom:4px">${label}</div>
              <div><strong>Category:</strong> ${category}</div>
              <div><strong>Buffer:</strong> ${p.bufferM} m (rendered ${radius.toFixed(0)} m)</div>
              <div><strong>Source:</strong> ${fmtCoord(p.lat)}, ${fmtCoord(p.lng)}</div>
              <div style="opacity:.7;margin-top:4px">OSM feature #${idx + 1}</div>
            </div>`;
          L.circle([p.lat, p.lng], {
            radius,
            ...style,
          })
            .bindTooltip(label, { permanent: false, sticky: true })
            .bindPopup(popupHtml)
            .addTo(lg);
        });
      };
      // Roads — red filled buffers
      drawCat(exclusionZones.roads, {
        color: "#dc2626", weight: 2, opacity: 0.95,
        fillColor: "#ef4444", fillOpacity: 0.28, dashArray: "4 3",
      }, "Excluded · Road", "Road");
      // Waterways — blue filled buffers
      drawCat(exclusionZones.waterways, {
        color: "#1d4ed8", weight: 2, opacity: 0.95,
        fillColor: "#3b82f6", fillOpacity: 0.32, dashArray: "2 3",
      }, "Excluded · Waterway", "Waterway");
      // Non-residential (schools, hospitals, etc.) — slate filled buffers
      drawCat(exclusionZones.nonResidential, {
        color: "#475569", weight: 2, opacity: 0.95,
        fillColor: "#64748b", fillOpacity: 0.30, dashArray: "1 3",
      }, "Excluded · Non-residential", "Non-residential");
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
  }, [perimeter, segments, selectedSegmentIds, households, routeTo, centerLat, centerLng, onHouseholdClick, exclusionZones, showExclusions, residentialBuildings, showResidential, lqas, livePosition, draftPolygon, editablePerimeter, onVertexMove, onVertexDelete, gpsTrail]);

  return <div ref={containerRef} style={{ height, width: "100%" }} className="rounded-lg overflow-hidden border border-border" />;
};

export default CESSurveyMap;
