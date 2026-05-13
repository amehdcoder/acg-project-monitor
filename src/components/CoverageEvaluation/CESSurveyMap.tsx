import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Segment, LatLng } from "@/lib/ces/kmeansSegments";
import type { FeatureGeometry } from "./utils/residentialMask";
import { polygonAreaM2, pointInPolygon } from "./utils/residentialMask";

export type FeatureLabelRequest = {
  id: string;
  type: "building" | "road" | "waterway";
  originalLabel: string;
  confidence: number;
  geometry: unknown;
};

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
  /** Per-feature layer visibility toggles. */
  featureLayers?: { buildings: boolean; roads: boolean; waterways: boolean };
  /** Highlight low-confidence features with QA styling. */
  qaOverlay?: boolean;
  /** Filter to only features below the QA confidence threshold. */
  showUncertainOnly?: boolean;
  /** Enables click-to-confirm/correct labels for supervised training. */
  labelMode?: boolean;
  /** User-confirmed/corrected labels keyed by classifier feature id. */
  correctedLabels?: Record<string, string>;
  onFeatureLabel?: (feature: FeatureLabelRequest) => void;
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
  /** Red sampling pins (e.g. building centroids) drawn over rooftops in Step 3. */
  samplingPins?: LatLng[];
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
  featureLayers = { buildings: true, roads: true, waterways: true },
  qaOverlay = false,
  showUncertainOnly = false,
  labelMode = false,
  correctedLabels = {},
  onFeatureLabel,
  lqas = null,
  livePosition = null,
  drawMode = false,
  draftPolygon = [],
  editablePerimeter = false,
  onVertexMove,
  onVertexDelete,
  gpsTrail = [],
  samplingPins = [],
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
      maxZoom: 23,
      maxNativeZoom: mode === "google" || mode === "google-sat" ? 21 : 19,
      detectRetina: true,
      crossOrigin: true,
      ...(tl.subdomains ? { subdomains: tl.subdomains } : {}),
    } as L.TileLayerOptions).addTo(map);
    // Esri reference label overlay only for the Esri basemaps; Google "hybrid"
    // already includes its own labels so no overlay is needed there.
    if (mode === "satellite" || mode === "hybrid") {
      labelsRef.current = L.tileLayer(ESRI_LABELS_URL, {
        maxZoom: 23,
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
      maxZoom: 23,
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

    // ---- Rich feature geometry: building footprints + road/water polylines ----
    // This replaces the old centroid-buffer "exclusion" overlay so the map
    // shows actual roof outlines and named roads, like Google Maps.
    if ((showFeatures || showResidential || showExclusions) && mapFeatures) {
      const qaThreshold = 0.7;
      const isUncertain = (confidence?: number) => (confidence ?? 1) < qaThreshold;
      const shouldRender = (confidence?: number) => !showUncertainOnly || isUncertain(confidence);
      // Building footprints (roofs) — single uniform style; no residential
      // vs non-residential distinction. Sized by k-means cluster.
      const buildingsCap = 4000;
      const sizeStyle: Record<string, { fill: string; stroke: string }> = {
        small: { fill: "#fde68a", stroke: "#b45309" },
        medium: { fill: "#fcd34d", stroke: "#92400e" },
        large: { fill: "#fbbf24", stroke: "#78350f" },
      };
      for (const b of (featureLayers.buildings ? mapFeatures.buildings : []).slice(0, buildingsCap)) {
        if (!shouldRender(b.confidence)) continue;
        const st = sizeStyle[b.sizeClass] ?? sizeStyle.medium;
        const uncertain = isUncertain(b.confidence);
        const poly = L.polygon(b.ring.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], {
          color: qaOverlay && uncertain ? "hsl(0 84% 60%)" : st.stroke,
          weight: qaOverlay && uncertain ? 3 : 1,
          opacity: qaOverlay && uncertain ? 1 : 0.9,
          fillColor: st.fill,
          fillOpacity: qaOverlay && uncertain ? 0.72 : 0.55,
          dashArray: uncertain ? "6 3" : b.inferred ? "2 2" : undefined,
        }).addTo(lg);
        const label = correctedLabels[b.id] ?? (b.name ? `Building · ${b.name}` : `Building (${b.sizeClass})`);
        poly.bindTooltip(`${uncertain ? "QA · " : ""}${label} · ${Math.round((b.confidence ?? 0) * 100)}%`, { sticky: true });
        poly.bindPopup(
          `<div style="font-size:12px;min-width:160px">
            <div style="font-weight:700;margin-bottom:4px">${label}</div>
            <div><strong>Confidence:</strong> ${Math.round((b.confidence ?? 0) * 100)}%</div>
            <div><strong>Footprint:</strong> ${Math.round(b.areaM2)} m²</div>
            <div><strong>Class:</strong> ${b.sizeClass} (k-means)</div>
            <div style="opacity:.7;margin-top:2px">${b.inferred ? "Inferred (unsupervised)" : "OSM-tagged"}</div>
          </div>`,
        );
        if (labelMode && onFeatureLabel) poly.on("click", () => onFeatureLabel({ id: b.id, type: "building", originalLabel: label, confidence: b.confidence, geometry: { ring: b.ring, center: b.center, areaM2: b.areaM2 } }));
      }

      // Road centrelines — single red palette; line weight from class. Named
      // roads ("Rd"/"Road"/"Street") get a permanent label tooltip.
      const roadWidth: Record<string, number> = {
        motorway: 5, trunk: 5, primary: 4, secondary: 3.5, tertiary: 3,
        residential: 2.5, service: 2, track: 2, unclassified: 2.5, path: 1.5,
      };
      for (const r of (featureLayers.roads ? mapFeatures.roads : []).slice(0, 2000)) {
        if (r.points.length < 2) continue;
        if (!shouldRender(r.confidence)) continue;
        const uncertain = isUncertain(r.confidence);
        const line = L.polyline(r.points.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], {
          color: qaOverlay && uncertain ? "hsl(0 84% 60%)" : "#dc2626",
          weight: (roadWidth[r.cls] ?? 2.5) + (qaOverlay && uncertain ? 2 : 0),
          opacity: uncertain ? 1 : 0.85,
          dashArray: uncertain ? "7 4" : r.inferred ? "5 4" : undefined,
        }).addTo(lg);
        const display = correctedLabels[r.id] ?? r.name ?? r.ref ?? `${r.cls} road`;
        line.bindTooltip(`${display} · ${Math.round((r.confidence ?? 0) * 100)}%`, { sticky: !r.name, permanent: !!r.name && (roadWidth[r.cls] ?? 0) >= 2.5, direction: "center", className: "ces-road-label" });
        line.bindPopup(
          `<div style="font-size:12px;min-width:160px">
            <div style="font-weight:700;margin-bottom:4px">${display}</div>
            <div><strong>Confidence:</strong> ${Math.round((r.confidence ?? 0) * 100)}%</div>
            <div><strong>Class:</strong> ${r.cls}</div>
            <div><strong>Buffer:</strong> ${r.bufferM} m</div>
            <div style="opacity:.7;margin-top:2px">${r.inferred ? "Inferred from line geometry (ML)" : "OSM-tagged"}</div>
          </div>`,
        );
        if (labelMode && onFeatureLabel) line.on("click", () => onFeatureLabel({ id: r.id, type: "road", originalLabel: display, confidence: r.confidence, geometry: { points: r.points, class: r.cls, name: r.name ?? null, ref: r.ref ?? null } }));
      }

      // Waterways — blue lines for rivers/streams, filled polygons for lakes.
      for (const w of (featureLayers.waterways ? mapFeatures.waterways : []).slice(0, 800)) {
        if (w.points.length < 2) continue;
        if (!shouldRender(w.confidence)) continue;
        const uncertain = isUncertain(w.confidence);
        const opts: L.PathOptions = {
          color: qaOverlay && uncertain ? "hsl(0 84% 60%)" : "#1d4ed8",
          weight: (w.cls === "river" ? 4 : w.cls === "canal" ? 3 : 2) + (qaOverlay && uncertain ? 2 : 0),
          opacity: uncertain ? 1 : 0.9,
          fillColor: "#3b82f6",
          fillOpacity: w.isPolygon ? (uncertain ? 0.5 : 0.35) : 0,
          dashArray: uncertain ? "7 4" : undefined,
        };
        const layer = w.isPolygon
          ? L.polygon(w.points.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], opts)
          : L.polyline(w.points.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], opts);
        layer.addTo(lg);
        const label = correctedLabels[w.id] ?? w.name ?? `Waterway (${w.cls})`;
        layer.bindTooltip(`${label} · ${Math.round((w.confidence ?? 0) * 100)}%`, { sticky: true });
        if (labelMode && onFeatureLabel) layer.on("click", () => onFeatureLabel({ id: w.id, type: "waterway", originalLabel: label, confidence: w.confidence, geometry: { points: w.points, class: w.cls, isPolygon: w.isPolygon } }));
      }
    }

    // segments — selected = GREEN, others = RED. Always draw a polygon
    // (or a small circle for tiny clusters) so every segment is visibly fenced.
    for (const seg of segments) {
      const isSelected = selectedSegmentIds.includes(seg.label);
      const stroke = isSelected ? "#16a34a" : "#dc2626"; // green / red
      const fill = isSelected ? "#16a34a" : "#dc2626";
      if (seg.polygon.length >= 3) {
        L.polygon(seg.polygon.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], {
          color: stroke,
          weight: isSelected ? 4 : 2,
          fillColor: fill,
          fillOpacity: isSelected ? 0.28 : 0.14,
          dashArray: isSelected ? undefined : "4 4",
        })
          .bindTooltip(`${seg.label} • ${seg.count} HH`, { permanent: false })
          .addTo(lg);
      } else {
        // Tiny cluster (1–2 buildings) — render a small circle so it's still fenced.
        L.circle([seg.centroid.lat, seg.centroid.lng], {
          radius: 18,
          color: stroke,
          weight: isSelected ? 4 : 2,
          fillColor: fill,
          fillOpacity: isSelected ? 0.28 : 0.14,
          dashArray: isSelected ? undefined : "4 4",
        }).bindTooltip(`${seg.label} • ${seg.count} HH`, { permanent: false }).addTo(lg);
      }
      // label at centroid (S1, S2, …)
      L.marker([seg.centroid.lat, seg.centroid.lng], {
        icon: L.divIcon({
          className: "ces-seg-label",
          html: `<div style="background:${stroke};color:#fff;border-radius:9999px;padding:2px 8px;font-weight:800;font-size:11px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${seg.label}</div>`,
          iconSize: [28, 18],
        }),
      }).addTo(lg);
    }

    // Sampling pins (red map pins over building rooftops where sampling should occur)
    for (const p of samplingPins) {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:18px;height:24px;position:relative">
                   <div style="position:absolute;top:0;left:0;width:18px;height:18px;border-radius:9999px 9999px 9999px 1px;background:#dc2626;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);transform:rotate(-45deg);transform-origin:50% 50%"></div>
                 </div>`,
          iconSize: [18, 24],
          iconAnchor: [9, 22],
        }),
      }).bindTooltip("Sample this building", { sticky: true }).addTo(lg);
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
  }, [perimeter, segments, selectedSegmentIds, households, routeTo, centerLat, centerLng, onHouseholdClick, exclusionZones, showExclusions, residentialBuildings, showResidential, mapFeatures, showFeatures, featureLayers, qaOverlay, showUncertainOnly, labelMode, correctedLabels, onFeatureLabel, lqas, livePosition, draftPolygon, editablePerimeter, onVertexMove, onVertexDelete, gpsTrail, samplingPins]);

  return <div ref={containerRef} style={{ height, width: "100%" }} className="rounded-lg overflow-hidden border border-border" />;
};

export default CESSurveyMap;
