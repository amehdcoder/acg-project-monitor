import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Gauge } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Segment, LatLng } from "@/lib/ces/kmeansSegments";
import type { FeatureGeometry } from "./utils/residentialMask";
import { polygonAreaM2, pointInPolygon } from "./utils/residentialMask";
import {
  CES_MAP_TILE_CACHE,
  buildCesTileRequests,
  putCesTileInCache,
  validateCesTileCache,
  waitForCesTileFrame,
  type CesTileSource,
} from "@/lib/ces/tileCacheValidation";

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
  segment_label?: string | null;
  eligible_persons?: number;
  treated_persons?: number;
}


type CesBasemap = "satellite" | "hybrid" | "street" | "terrain" | "google" | "google-sat";

interface CESSurveyMapProps {
  centerLat: number;
  centerLng: number;
  perimeter?: LatLng[];
  segments: Segment[];
  selectedSegmentIds: string[]; // labels
  households: SurveyHousehold[];
  routeTo?: { lat: number; lng: number } | null;
  basemap?: CesBasemap;
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
  /** Tooltip for the center marker; defaults to live GPS wording for capture screens. */
  centerLabel?: string;
  /** Initial/current zoom. Coarse fallback centres use lower zooms so imagery paints immediately. */
  zoom?: number;
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

const TILE_LAYERS: Record<CesBasemap, { url: string; attribution: string; subdomains?: string }> = {
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

const getCesLayerBudget = () => {
  const nav = typeof navigator !== "undefined" ? navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } } : null;
  const lowPower = (nav?.hardwareConcurrency ?? 4) <= 4 || (nav?.deviceMemory ?? 4) <= 4 || nav?.connection?.saveData === true;
  return {
    buildings: lowPower ? 900 : 1800,
    roads: lowPower ? 450 : 900,
    waterways: lowPower ? 180 : 360,
    samplingPins: lowPower ? 700 : 1400,
    households: lowPower ? 900 : 1800,
    batchSize: lowPower ? 45 : 90,
    frameMs: lowPower ? 5 : 8,
  };
};

const isCoarsePointer = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

// Tile-quality presets. All keep the deepest zoom available (maxZoom 24) so a
// "smooth" choice never loses the ability to zoom in — it only changes how many
// tiles are kept resident and how aggressively they refresh, which is what
// actually strains low-end devices.
export type CesTileQuality = "high" | "balanced" | "smooth";
const TILE_QUALITY_PRESETS: Record<CesTileQuality, {
  keepBuffer: number; updateWhenZooming: boolean; updateWhenIdle: boolean; nativeZoomDelta: number; label: string;
}> = {
  high:     { keepBuffer: 8, updateWhenZooming: true,  updateWhenIdle: false, nativeZoomDelta: 0,  label: "High detail" },
  balanced: { keepBuffer: 4, updateWhenZooming: true,  updateWhenIdle: false, nativeZoomDelta: 0,  label: "Balanced" },
  smooth:   { keepBuffer: 2, updateWhenZooming: false, updateWhenIdle: true,  nativeZoomDelta: -2, label: "Smooth (low-end)" },
};
const TILE_QUALITY_KEY = "ces.tileQuality.v1";
const readStoredTileQuality = (): CesTileQuality => {
  try {
    const v = localStorage.getItem(TILE_QUALITY_KEY);
    if (v === "high" || v === "balanced" || v === "smooth") return v;
  } catch { /* ignore */ }
  // Auto-pick a lighter default on constrained devices.
  const nav = typeof navigator !== "undefined" ? navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } } : null;
  const lowPower = (nav?.hardwareConcurrency ?? 4) <= 4 || (nav?.deviceMemory ?? 4) <= 4 || nav?.connection?.saveData === true;
  return lowPower ? "smooth" : "high";
};

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
  centerLabel = "Current device GPS",
  zoom = 17,
}: CESSurveyMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tileQuality, setTileQuality] = useState<CesTileQuality>(readStoredTileQuality);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const tileQualityRef = useRef<CesTileQuality>(tileQuality);
  tileQualityRef.current = tileQuality;
  const tileRef = useRef<L.TileLayer | null>(null);
  const labelsRef = useRef<L.TileLayer | null>(null);
  const staticLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const boundaryLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const featureLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const sampleLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const liveLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const tapHandlerRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const destroyedRef = useRef(false);
  const [isNearViewport, setIsNearViewport] = useState(true);
  const boundaryRenderKeyRef = useRef<string>("");
  const featureRenderKeyRef = useRef<string>("");
  const sampleRenderKeyRef = useRef<string>("");
  const gpsLedPanUntilRef = useRef(0);
  // Active tile config (url + native zoom + subdomains) used by the offline
  // prefetcher to download the exact same imagery the map is currently showing.
  const activeTileRef = useRef<{ mode: CesBasemap; sources: CesTileSource[] }>({
    mode: "satellite",
    sources: [{ url: TILE_LAYERS.satellite.url, maxNativeZoom: 19, subdomains: "abc", requestMode: "cors", label: "Esri satellite" }],
  });
  const staticLayerBudget = useMemo(getCesLayerBudget, []);

  useEffect(() => {
    // The CES workflow must show satellite imagery as soon as the page loads.
    // Do not lazy-mount behind IntersectionObserver: GPS/fallback centering and
    // tile requests should begin immediately, even if the map is slightly below
    // the current fold on Android.
    setIsNearViewport(true);
  }, []);

  const applyBasemap = (map: L.Map, mode: CesBasemap) => {
    if (tileRef.current) { map.removeLayer(tileRef.current); tileRef.current = null; }
    if (labelsRef.current) { map.removeLayer(labelsRef.current); labelsRef.current = null; }
    const tl = TILE_LAYERS[mode] ?? TILE_LAYERS.satellite;
    const isGoogle = mode === "google" || mode === "google-sat";
    const baseNativeZoom = mode === "google" || mode === "google-sat" ? 21 : 19;
    const quality = TILE_QUALITY_PRESETS[tileQualityRef.current] ?? TILE_QUALITY_PRESETS.high;
    // Lower native zoom on "smooth" → fewer/lighter tile fetches, while maxZoom
    // stays 24 so the user can still zoom all the way in (overzoomed imagery).
    const nativeZoom = Math.max(12, baseNativeZoom + quality.nativeZoomDelta);
    const sources: CesTileSource[] = [{
      url: tl.url,
      maxNativeZoom: nativeZoom,
      subdomains: tl.subdomains ?? "abc",
      // Google tiles must stay no-cors; setting crossOrigin causes tile errors
      // on many Android/WebView installs and forces slow/mismatched fallbacks.
      requestMode: isGoogle ? "no-cors" : "cors",
      label: tl.attribution,
    }];
    if (mode === "satellite" || mode === "hybrid") {
      sources.push({ url: ESRI_LABELS_URL, maxNativeZoom: 19, subdomains: "abc", requestMode: "no-cors", label: "Esri reference labels" });
    }
    activeTileRef.current = { mode, sources };

    const commonTileOptions: L.TileLayerOptions = {
      attribution: tl.attribution,
      maxZoom: 24,
      maxNativeZoom: nativeZoom,
      // Deterministic tile URLs are essential for offline: detectRetina silently
      // requests different z/x/y tiles on high-DPR phones, so prefetched imagery
      // no longer matches what Leaflet asks for when the device is offline.
      detectRetina: false,
      // Keep enough surrounding satellite imagery resident that first paint,
      // small pans, and GPS refinements do not reveal gray tile gaps.
      keepBuffer: quality.keepBuffer,
      updateWhenIdle: quality.updateWhenIdle,
      updateWhenZooming: quality.updateWhenZooming,
      ...(tl.subdomains ? { subdomains: tl.subdomains } : {}),
      ...(isGoogle ? {} : { crossOrigin: true as const }),
    };

    const primary = L.tileLayer(tl.url, commonTileOptions).addTo(map);

    tileRef.current = primary;
    // Resilience: if Google tiles fail (region block, throttling, offline cache miss),
    // automatically swap in Esri World Imagery so satellite imagery NEVER disappears.
    let fellBack = false;
    primary.on("tileerror", () => {
      if (fellBack) return;
      if (mode !== "google" && mode !== "google-sat") return;
      // Do not swap to a different provider offline. If the user downloaded
      // Google tiles, replacing the whole layer with uncached Esri tiles makes
      // the offline map look incomplete/different from the saved online view.
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      fellBack = true;
      try {
        activeTileRef.current = {
          mode: "satellite",
          sources: [{ url: TILE_LAYERS.satellite.url, maxNativeZoom: 19, subdomains: "abc", requestMode: "cors", label: "Esri satellite fallback" }],
        };
        const fb = L.tileLayer(TILE_LAYERS.satellite.url, {
          attribution: TILE_LAYERS.satellite.attribution,
          maxZoom: 24,
          maxNativeZoom: 19,
          detectRetina: false,
          crossOrigin: true,
          keepBuffer: 8,
          updateWhenIdle: false,
          updateWhenZooming: true,
        } as L.TileLayerOptions).addTo(map);

        // Keep a reference so it gets cleaned up on next basemap change
        tileRef.current = fb;
        try { map.removeLayer(primary); } catch {}
      } catch {}
    });
    // Esri reference label overlay only for the Esri basemaps; Google "hybrid"
    // already includes its own labels so no overlay is needed there.
    if (mode === "satellite" || mode === "hybrid") {
      labelsRef.current = L.tileLayer(ESRI_LABELS_URL, {
        maxZoom: 24,
        maxNativeZoom: 19,
        detectRetina: false,
        opacity: mode === "hybrid" ? 1 : 0.85,
        pane: "overlayPane",
      } as L.TileLayerOptions).addTo(map);
    }
  };

  // init map
  useEffect(() => {
    if (!isNearViewport || !containerRef.current || mapRef.current) return;
    destroyedRef.current = false;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      preferCanvas: true,
      // On Android, Leaflet touch-dragging hijacks the page's vertical scroll
      // when users swipe across the map. Keep the map tap/zoom-control friendly
      // but disable one-finger map dragging on coarse pointers for freeze-free
      // page scrolling through long CES forms.
      dragging: !isCoarsePointer(),
      touchZoom: true,
      scrollWheelZoom: false,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 80,
      wheelDebounceTime: 80,
      maxZoom: 24,
    }).setView([centerLat, centerLng], zoom);
    applyBasemap(map, basemap);
    staticLayerGroupRef.current = L.layerGroup().addTo(map);
    boundaryLayerGroupRef.current = L.layerGroup().addTo(staticLayerGroupRef.current);
    featureLayerGroupRef.current = L.layerGroup().addTo(staticLayerGroupRef.current);
    sampleLayerGroupRef.current = L.layerGroup().addTo(staticLayerGroupRef.current);
    liveLayerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const fixSize = () => map.invalidateSize({ animate: false });
    const t0 = window.setTimeout(fixSize, 0);
    const t1 = window.setTimeout(fixSize, 300);
    const ro = new ResizeObserver(fixSize);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", fixSize);

    // Single click handler that delegates to whatever the latest onMapTap is
    // (kept fresh via tapHandlerRef so toggling drawMode never detaches the listener).
    map.on("click", (e: L.LeafletMouseEvent) => {
      const h = tapHandlerRef.current;
      if (h) h(e.latlng.lat, e.latlng.lng);
    });

    // Offline-map download control. Pre-fetches every tile covering the current
    // view across all zoom levels up to street-level detail so the satellite map
    // renders FULLY with no network later. Tiles land in the Workbox
    // "map-tiles-cache" (CacheFirst), so a downloaded area works 100% offline.
    const DownloadControl = L.Control.extend({
      options: { position: "topleft" as L.ControlPosition },
      onAdd: () => {
        const btn = L.DomUtil.create("a", "leaflet-bar leaflet-control ces-offline-dl");
        btn.href = "#";
        btn.title = "Download this area for offline use";
        btn.setAttribute("role", "button");
        btn.setAttribute("aria-label", "Download this area for offline use");
        btn.innerHTML = "⬇";
        btn.style.cssText =
          "width:34px;height:34px;line-height:34px;text-align:center;font-size:18px;font-weight:700;background:#fff;color:#1656BA;cursor:pointer;";
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, "click", (ev) => {
          L.DomEvent.preventDefault(ev);
          void prefetchOfflineTiles(btn);
        });
        return btn;
      },
    });
    map.addControl(new DownloadControl());

    let warmTimer: number | null = null;
    let warmIdle: number | null = null;
    const scheduleWarm = () => {
      // GPS-follow panning can fire many moveend events while walking. Do not
      // start cache I/O from those moves; the visible tile layer will render,
      // and manual/off-idle validation remains available without scroll jank.
      if (Date.now() < gpsLedPanUntilRef.current) return;
      if (warmTimer !== null) window.clearTimeout(warmTimer);
      if (warmIdle !== null && "cancelIdleCallback" in window) {
        (window as any).cancelIdleCallback(warmIdle);
        warmIdle = null;
      }
      warmTimer = window.setTimeout(() => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        const run = () => void prefetchOfflineTiles(undefined, { maxTiles: 32, zoomAhead: 1, zoomBack: 0, padRatio: 0.02, quiet: true, concurrency: 1 });
        if ("requestIdleCallback" in window) {
          warmIdle = (window as any).requestIdleCallback(run, { timeout: 2500 });
        } else {
          run();
        }
      }, 5000);
    };
    map.on("moveend zoomend", scheduleWarm);
    scheduleWarm();

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      if (warmTimer !== null) window.clearTimeout(warmTimer);
      if (warmIdle !== null && "cancelIdleCallback" in window) (window as any).cancelIdleCallback(warmIdle);
      ro.disconnect();
      window.removeEventListener("resize", fixSize);
      map.off("moveend zoomend", scheduleWarm);
      destroyedRef.current = true;
      map.remove();
      mapRef.current = null;
      staticLayerGroupRef.current = null;
      boundaryLayerGroupRef.current = null;
      featureLayerGroupRef.current = null;
      sampleLayerGroupRef.current = null;
      liveLayerGroupRef.current = null;
    };
    // eslint-disable-next-line
  }, [isNearViewport]);

  // Fullscreen: re-flow the Leaflet canvas and enable full drag interaction so
  // every tool (draw, zoom, pan) is responsive while expanded. Also lock body
  // scroll so the immersive map never fights the page underneath.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (isFullscreen) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
    } else {
      if (isCoarsePointer()) map.dragging.disable();
      map.scrollWheelZoom.disable();
    }
    const prevOverflow = document.body.style.overflow;
    if (isFullscreen) document.body.style.overflow = "hidden";
    const ids = [0, 80, 220, 400].map((d) =>
      window.setTimeout(() => {
        try { map.invalidateSize({ animate: false }); } catch { /* noop */ }
      }, d),
    );
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      ids.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);


  // Pre-fetch all tiles covering the current map view across zoom levels so the
    // imagery is fully available offline. Caps total tile count to protect the
    // device while matching the enlarged Workbox tile cache budget.
    const prefetchOfflineTiles = async (
    btn?: HTMLElement,
    opts: { maxTiles?: number; zoomAhead?: number; zoomBack?: number; padRatio?: number; quiet?: boolean; concurrency?: number } = {},
  ) => {
    const map = mapRef.current;
    if (!map) return;
    const { sources } = activeTileRef.current;
    const bounds = map.getBounds().pad(opts.padRatio ?? 0.3);
    const currentZoom = Math.max(1, Math.round(map.getZoom()));
    // Deterministic z/x/y URL generation is shared with validation so the
    // offline cache is checked against exactly what Leaflet will request later.
    const requests = buildCesTileRequests(
      { west: bounds.getWest(), east: bounds.getEast(), north: bounds.getNorth(), south: bounds.getSouth() },
      sources,
      {
        currentZoom,
        zoomBack: opts.zoomBack ?? 1,
        zoomAhead: opts.zoomAhead ?? 4,
        maxTiles: opts.maxTiles ?? 12000,
      },
    );

    if (btn) { btn.innerHTML = "…"; btn.style.pointerEvents = "none"; }
    let done = 0;
    let saved = 0;
    const CONCURRENCY = Math.max(1, Math.min(opts.concurrency ?? 4, 4));
    let idx = 0;
    const cache = "caches" in window ? await caches.open(CES_MAP_TILE_CACHE).catch(() => null) : null;
    const worker = async () => {
      while (idx < requests.length) {
        const i = idx++;
        try {
          if (await putCesTileInCache(cache, requests[i])) saved++;
        } catch { /* offline / blocked tiles are skipped */ }
        done++;
        if (btn) btn.title = `Caching offline map… ${done}/${requests.length}`;
        // Yield regularly so large offline downloads never lock scrolling/taps.
        if (done % 12 === 0) await waitForCesTileFrame();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    const validation = cache
      ? await validateCesTileCache(requests, { sampleLimit: opts.quiet ? 96 : undefined }).catch(() => null)
      : null;
    if (btn) {
      const ok = validation?.complete ?? saved === requests.length;
      btn.innerHTML = ok ? "✓" : "!";
      btn.title = validation
        ? `Offline map validation: ${validation.present}/${validation.checked} checked (${validation.coveragePct.toFixed(1)}%). ${validation.complete ? "Ready" : "Missing tiles will be retried when online."}`
        : `Saved ${saved}/${requests.length} map tiles for offline use`;
      btn.style.color = ok ? "#16a34a" : "#d97706";
      btn.style.pointerEvents = "";
      window.setTimeout(() => { btn.innerHTML = "⬇"; btn.style.color = "#1656BA"; }, 4000);
    }
  };

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
      const map = mapRef.current;
      const next = L.latLng(centerLat, centerLng);
      const current = map.getCenter();
      // Avoid tile churn from 1–5 m GPS jitter. The marker still moves every
      // update; the expensive basemap only recentres after meaningful movement.
      const shouldZoom = Math.abs(map.getZoom() - zoom) > 0.1;
      if (!current || current.distanceTo(next) > 25 || shouldZoom) {
        gpsLedPanUntilRef.current = Date.now() + 6000;
        if (shouldZoom) map.setView(next, zoom, { animate: false });
        else map.panTo(next, { animate: false });
      }
    }
  }, [centerLat, centerLng, zoom]);

  // Static overlays. Kept separate from the live GPS marker/route so frequent
  // location updates don't rebuild thousands of rooftop/road/household layers.
  useEffect(() => {
    if (!isNearViewport) return;
    if (!mapRef.current || !boundaryLayerGroupRef.current || !featureLayerGroupRef.current || !sampleLayerGroupRef.current) return;
    const boundaryLg = boundaryLayerGroupRef.current;
    const featureLg = featureLayerGroupRef.current;
    const sampleLg = sampleLayerGroupRef.current;
    const coordsKey = (pts: LatLng[]) => pts.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(";");
    const boundaryKey = [
      coordsKey(perimeter),
      coordsKey(draftPolygon),
      editablePerimeter ? "edit" : "view",
      drawMode ? "draw" : "static",
      lqas?.selfIntersects ? "bad" : lqas?.ready ? "ready" : "progress",
      Math.round(lqas?.areaM2 ?? -1),
    ].join("|");
    const fg = mapFeatures;
    const correctedKey = Object.entries(correctedLabels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join("|");
    const featureKey = [
      showFeatures, showResidential, showExclusions,
      featureLayers.buildings, featureLayers.roads, featureLayers.waterways,
      qaOverlay, showUncertainOnly, labelMode,
      fg?.buildings.length ?? 0, fg?.roads.length ?? 0, fg?.waterways.length ?? 0,
      fg?.buildings[0]?.id ?? "", fg?.buildings[(fg?.buildings.length ?? 0) - 1]?.id ?? "",
      fg?.roads[0]?.id ?? "", fg?.roads[(fg?.roads.length ?? 0) - 1]?.id ?? "",
      fg?.waterways[0]?.id ?? "", fg?.waterways[(fg?.waterways.length ?? 0) - 1]?.id ?? "",
      correctedKey,
    ].join("|");
    const householdSummary = households.reduce((acc, h) => {
      acc[h.coverage_status] = (acc[h.coverage_status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const sampleKey = [
      segments.map((s) => `${s.label}:${s.polygon.length}:${s.centroid.lat.toFixed(6)},${s.centroid.lng.toFixed(6)}`).join("|"),
      selectedSegmentIds.join(","),
      samplingPins.length,
      samplingPins[0] ? `${samplingPins[0].lat.toFixed(6)},${samplingPins[0].lng.toFixed(6)}` : "",
      samplingPins[samplingPins.length - 1] ? `${samplingPins[samplingPins.length - 1].lat.toFixed(6)},${samplingPins[samplingPins.length - 1].lng.toFixed(6)}` : "",
      households.length,
      households[0] ? `${households[0].id}:${households[0].coverage_status}:${households[0].lat.toFixed(6)},${households[0].lng.toFixed(6)}` : "",
      households[households.length - 1] ? `${households[households.length - 1].id}:${households[households.length - 1].coverage_status}:${households[households.length - 1].lat.toFixed(6)},${households[households.length - 1].lng.toFixed(6)}` : "",
      Object.entries(householdSummary).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(","),
    ].join("|");
    const boundaryDirty = boundaryKey !== boundaryRenderKeyRef.current;
    const featureDirty = featureKey !== featureRenderKeyRef.current;
    const sampleDirty = sampleKey !== sampleRenderKeyRef.current;
    if (!boundaryDirty && !featureDirty && !sampleDirty) return;
    let cancelled = false;
    let frame = 0;
    const deferredLayers: Array<() => void> = [];
    let deferredIndex = 0;
    const deferLayer = (fn: () => void) => deferredLayers.push(fn);
    const markComplete = () => {
      if (cancelled || destroyedRef.current) return;
      if (boundaryDirty) boundaryRenderKeyRef.current = boundaryKey;
      if (featureDirty) featureRenderKeyRef.current = featureKey;
      if (sampleDirty) sampleRenderKeyRef.current = sampleKey;
    };
    const flushDeferredLayers = () => {
      if (cancelled || destroyedRef.current) return;
      const start = typeof performance !== "undefined" ? performance.now() : Date.now();
      let processed = 0;
      while (deferredIndex < deferredLayers.length && processed < staticLayerBudget.batchSize) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - start > staticLayerBudget.frameMs) break;
        deferredLayers[deferredIndex++]?.();
        processed++;
      }
      if (deferredIndex < deferredLayers.length) frame = window.requestAnimationFrame(flushDeferredLayers);
      else markComplete();
    };

    // perimeter — LQAS-aware styling: green when the lot boundary passes WHO
    // criteria, amber while still in progress, red when the polygon crosses
    // itself (invalid LQAS lot).
    if (boundaryDirty) {
    boundaryLg.clearLayers();
    const lg = boundaryLg;
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
        // While drawing, overlays must NOT capture taps or the map click handler
        // (which records vertices) never fires.
        interactive: !drawMode,
      }).addTo(lg);

      const polygonLayer = L.polygon(perimeter.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], {
        color: lineColor,
        weight: 2,
        fillColor,
        fillOpacity: lqasState === "ready" ? 0.12 : 0.05,
        interactive: !drawMode,
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
            interactive: !drawMode,
          })
            .bindTooltip(i === 0 ? "Start vertex" : i === perimeter.length - 1 ? "Latest live vertex" : `Vertex ${i + 1}`, { permanent: false })
            .addTo(lg);
        }
      });
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
          interactive: false,
        }).addTo(lg);
      }
      if (draftPolygon.length >= 3) {
        L.polyline(
          [[draftPolygon[draftPolygon.length - 1].lat, draftPolygon[draftPolygon.length - 1].lng],
           [draftPolygon[0].lat, draftPolygon[0].lng]] as L.LatLngExpression[],
          { color: "hsl(38 92% 50%)", weight: 2, opacity: 0.6, dashArray: "2 4", interactive: false },
        ).addTo(lg);
        L.polygon(pts, {
          color: "hsl(38 92% 50%)",
          weight: 1,
          fillColor: "hsl(38 92% 50%)",
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(lg);
      }
      draftPolygon.forEach((p, i) => {
        // Draft vertices are display-only. They MUST be non-interactive so that
        // tapping on/near the start vertex still reaches the map click handler
        // (which closes the polygon) instead of being swallowed by the marker.
        L.circleMarker([p.lat, p.lng], {
          radius: i === 0 ? 7 : 5,
          color: "#fff",
          weight: 2,
          fillColor: i === 0 ? "hsl(0 84% 60%)" : "hsl(38 92% 50%)",
          fillOpacity: 1,
          interactive: false,
        }).addTo(lg);
      });
    }
    }

    // ---- Rich feature geometry: building footprints + road/water polylines ----
    // This replaces the old centroid-buffer "exclusion" overlay so the map
    // shows actual roof outlines and named roads, like Google Maps.
    if (featureDirty) {
    featureLg.clearLayers();
    const lg = featureLg;
    if ((showFeatures || showResidential || showExclusions) && mapFeatures) {
      const qaThreshold = 0.7;
      const isUncertain = (confidence?: number) => (confidence ?? 1) < qaThreshold;
      const shouldRender = (confidence?: number) => !showUncertainOnly || isUncertain(confidence);
      // Building footprints (roofs) — single uniform style; no residential
      // vs non-residential distinction. Sized by k-means cluster.
      const buildingsCap = staticLayerBudget.buildings;
      const sizeStyle: Record<string, { fill: string; stroke: string }> = {
        small: { fill: "#fde68a", stroke: "#b45309" },
        medium: { fill: "#fcd34d", stroke: "#92400e" },
        large: { fill: "#fbbf24", stroke: "#78350f" },
      };
      for (const b of (featureLayers.buildings ? mapFeatures.buildings : []).slice(0, buildingsCap)) {
        if (!shouldRender(b.confidence)) continue;
        deferLayer(() => {
          if (cancelled || destroyedRef.current) return;
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
        });
      }

      // Road centrelines — single red palette; line weight from class. Named
      // roads ("Rd"/"Road"/"Street") get a permanent label tooltip.
      const roadWidth: Record<string, number> = {
        motorway: 5, trunk: 5, primary: 4, secondary: 3.5, tertiary: 3,
        residential: 2.5, service: 2, track: 2, unclassified: 2.5, path: 1.5,
      };
      for (const r of (featureLayers.roads ? mapFeatures.roads : []).slice(0, staticLayerBudget.roads)) {
        if (r.points.length < 2) continue;
        if (!shouldRender(r.confidence)) continue;
        deferLayer(() => {
          if (cancelled || destroyedRef.current) return;
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
        });
      }

      // Waterways — blue lines for rivers/streams, filled polygons for lakes.
      for (const w of (featureLayers.waterways ? mapFeatures.waterways : []).slice(0, staticLayerBudget.waterways)) {
        if (w.points.length < 2) continue;
        if (!shouldRender(w.confidence)) continue;
        deferLayer(() => {
          if (cancelled || destroyedRef.current) return;
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
        });
      }
    }
    }

    // segments — selected = GREEN, others = RED. Always draw a polygon
    // (or a small circle for tiny clusters) so every segment is visibly fenced.
    if (sampleDirty) {
    sampleLg.clearLayers();
    const lg = sampleLg;
    for (const seg of segments) {
      const isSelected = selectedSegmentIds.includes(seg.label);
      // Selected = thick green; others = thick oxblood. Both solid, no dashes,
      // so equal segment boundaries are unmistakable on the satellite imagery.
      const stroke = isSelected ? "#16a34a" : "#7d1d1d";
      const fill   = isSelected ? "#16a34a" : "#7d1d1d";
      const weight = isSelected ? 6 : 5;
      const areaM2 = seg.polygon.length >= 3 ? polygonAreaM2(seg.polygon) : 0;
      const areaKm2 = areaM2 / 1_000_000;
      const tooltipText = `${seg.label} • ${areaKm2 > 0.01 ? areaKm2.toFixed(2) + " km²" : (areaM2 > 0 ? areaM2.toFixed(0) + " m²" : "—")}`;
      deferLayer(() => {
        if (cancelled || destroyedRef.current) return;
        if (seg.polygon.length >= 3) {
          L.polygon(seg.polygon.map((p) => [p.lat, p.lng]) as L.LatLngExpression[], {
            color: stroke,
            weight,
            opacity: 1,
            fillColor: fill,
            fillOpacity: isSelected ? 0.28 : 0.10,
          })
            .bindTooltip(tooltipText, { permanent: false })
            .addTo(lg);
        } else {
          L.circle([seg.centroid.lat, seg.centroid.lng], {
            radius: 18,
            color: stroke,
            weight,
            opacity: 1,
            fillColor: fill,
            fillOpacity: isSelected ? 0.28 : 0.10,
          }).bindTooltip(tooltipText, { permanent: false }).addTo(lg);
        }
        // label at centroid (S1, S2, …)
        L.marker([seg.centroid.lat, seg.centroid.lng], {
          icon: L.divIcon({
            className: "ces-seg-label",
            html: `<div style="background:${stroke};color:#fff;border-radius:9999px;padding:2px 8px;font-weight:800;font-size:11px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${seg.label}</div>`,
            iconSize: [28, 18],
          }),
        }).addTo(lg);
      });
    }

    // Sampling pins (red map pins over building rooftops where sampling should occur)
    for (const p of samplingPins.slice(0, staticLayerBudget.samplingPins)) {
      deferLayer(() => {
        if (cancelled || destroyedRef.current) return;
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
      });
    }

    // households
    for (const h of households.slice(0, staticLayerBudget.households)) {
      deferLayer(() => {
        if (cancelled || destroyedRef.current) return;
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
      });
    }
    }
    flushDeferredLayers();

    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      deferredLayers.length = 0;
    };
  }, [isNearViewport, perimeter, segments, selectedSegmentIds, households, onHouseholdClick, mapFeatures, showFeatures, showResidential, showExclusions, featureLayers, qaOverlay, showUncertainOnly, labelMode, correctedLabels, onFeatureLabel, lqas?.selfIntersects, lqas?.ready, lqas?.areaM2, draftPolygon, drawMode, editablePerimeter, onVertexMove, onVertexDelete, samplingPins, staticLayerBudget]);

  // Live overlays: cheap, rebuilt as GPS updates arrive.
  useEffect(() => {
    if (!isNearViewport) return;
    if (!mapRef.current || !liveLayerGroupRef.current) return;
    const lg = liveLayerGroupRef.current;
    lg.clearLayers();

    const closureM = lqas?.closureM != null ? `${Math.round(lqas.closureM)} m` : "—";
    const closureColor = lqas?.ready ? "hsl(142 71% 45%)" : "hsl(38 92% 50%)";
    if (livePosition && perimeter.length >= 3) {
      const start = perimeter[0];
      L.polyline(
        [[livePosition.lat, livePosition.lng], [start.lat, start.lng]] as L.LatLngExpression[],
        { color: closureColor, weight: 2, opacity: 0.85, dashArray: "4 6" },
      )
        .bindTooltip(`Closure: ${closureM} to start vertex`, { permanent: false, sticky: true })
        .addTo(lg);
    }

    if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
      L.circleMarker([centerLat, centerLng], {
        radius: 8,
        color: "hsl(var(--background))",
        weight: 3,
        fillColor: "hsl(0 84% 60%)",
        fillOpacity: 0.95,
      })
        .bindTooltip(centerLabel, { permanent: false })
        .addTo(lg);
    }

    // GPS breadcrumb trail — kept in the cheap live layer so moving in the
    // field does not redraw static rooftops, roads, segments or household pins.
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

    if (routeTo && Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
      L.polyline(
        [[centerLat, centerLng], [routeTo.lat, routeTo.lng]] as L.LatLngExpression[],
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
  }, [isNearViewport, centerLat, centerLng, centerLabel, livePosition, perimeter, lqas?.closureM, lqas?.ready, routeTo, gpsTrail]);

  return (
    <div
      ref={wrapperRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-[10000] bg-background"
          : "relative w-full"
      }
    >
      <div
        ref={containerRef}
        style={{
          height: isFullscreen ? "100dvh" : height,
          width: "100%",
          contain: "layout paint",
          touchAction: isFullscreen ? "none" : (isCoarsePointer() ? "pan-y pinch-zoom" : undefined),
        }}
        className={
          isFullscreen
            ? "ces-survey-map h-full w-full border-0"
            : "ces-survey-map rounded-lg overflow-hidden border border-border"
        }
      />
      <button
        type="button"
        onClick={() => setIsFullscreen((v) => !v)}
        aria-label={isFullscreen ? "Exit full screen map" : "Open full screen map"}
        className="absolute top-2 right-2 z-[1200] inline-flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-md ring-1 ring-border backdrop-blur hover:bg-background"
      >
        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        {isFullscreen ? "Exit" : "Full screen"}
      </button>
    </div>
  );
};

export default memo(CESSurveyMap);
