import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import "leaflet.heat";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Home, MapPin, Loader2, Play, Pause, SkipForward, SkipBack,
  Flame, Download, FileImage, FileText, FileSpreadsheet, RotateCcw, X, ListFilter,
  Layers, Satellite, Eye,

} from "lucide-react";
import StreetViewPanel from "@/components/CoverageEvaluation/StreetViewPanel";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { fetchAllRowsKeyset } from "@/lib/fetchAllRowsKeyset";
import { linkedCommunityKey } from "@/lib/mda/dashboardData";

/**
 * Household Coverage Survey Map
 * ────────────────────────────────────────────────────────────────────────
 * Plots every household visit captured in the Coverage Evaluation 3D workflow
 * (`ces_household_visits`) at its exact GPS coordinate, using the same outcome
 * iconography as the survey screen. Features:
 *   • Marker clustering with automatic declustering on zoom (handles 1000s).
 *   • Visit-sweep animation with play/pause, speed, step-by-step and time sync.
 *   • Optional treated / not-treated density heatmap overlay.
 *   • Accessible, keyboard-navigable legend that doubles as an outcome filter.
 *   • One-click PNG / PDF export of the current view with legend + filters.
 */

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const stripTags = (s: unknown) => String(s ?? "").replace(/<[^>]*>/g, "").trim();

interface Outcome {
  key: string;
  label: string;
  color: string;
  /** Inline SVG glyph (white stroke/fill) drawn inside the coloured pin. */
  glyph: string;
}

const OUTCOMES: Record<string, Outcome> = {
  treated: {
    key: "treated", label: "Treated", color: "#16a34a",
    glyph: '<path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  not_treated: {
    key: "not_treated", label: "Not Treated", color: "#dc2626",
    glyph: '<circle cx="10" cy="10" r="6.2" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M7.6 7.6l4.8 4.8M12.4 7.6l-4.8 4.8" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>',
  },
  absent: {
    key: "absent", label: "Absent", color: "#64748b",
    glyph: '<path d="M10 4.5c-2.6 0-4.7 2.1-4.7 4.7 0 3.3 4.7 7.3 4.7 7.3s4.7-4 4.7-7.3C14.7 6.6 12.6 4.5 10 4.5z" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="10" cy="9.2" r="1.7" fill="#fff"/>',
  },
  refused: {
    key: "refused", label: "Refused", color: "#991b1b",
    glyph: '<path d="M10 4l4.5 1.8v3.4c0 3-2 5.3-4.5 6.3-2.5-1-4.5-3.3-4.5-6.3V5.8L10 4z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>',
  },
  ineligible: {
    key: "ineligible", label: "Ineligible", color: "#f59e0b",
    glyph: '<path d="M10 4.5l5.5 9.6H4.5L10 4.5z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 8.4v3.1M10 13.2v0.1" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
  },
};

const OTHER: Outcome = { key: "other", label: "Other", color: "#7c3aed", glyph: '<circle cx="10" cy="10" r="3" fill="#fff"/>' };

const OUTCOME_ALIASES: Record<string, Outcome> = Object.fromEntries(
  Object.values(OUTCOMES).flatMap((o) => [[norm(o.key), o], [norm(o.label), o]]),
);
const outcomeFor = (status?: string | null): Outcome => OUTCOME_ALIASES[norm(status)] || OTHER;

const URL_KEYS = {
  outcomes: "hcs_outcomes",
  visit: "hcs_visit",
  lga: "hcs_lga",
  community: "hcs_community",
  state: "hcs_state",
  center: "hcs_center",
  zoom: "hcs_zoom",
  basemap: "hcs_basemap",
} as const;

const stateKeys = (value: unknown) => {
  const n = norm(value);
  const keys = new Set<string>(n ? [n] : []);
  if (["fct", "abuja", "fctabuja", "federalcapital", "federalcapitalterritory"].includes(n)) {
    keys.add("fct");
    keys.add("abuja");
    keys.add("federalcapitalterritory");
  }
  return keys;
};

const readUrl = (key: string) => {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) || "";
};

const writeUrl = (updates: Record<string, string | null | undefined>) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
};

function pinIcon(o: Outcome): L.DivIcon {
  return L.divIcon({
    className: "hcs-pin",
    html: `<div class="hcs-pin-wrap">
      <svg width="30" height="38" viewBox="0 0 30 38" role="img" aria-label="${o.label}">
        <path d="M15 37C15 37 28 22.5 28 14C28 6.3 22.2 1 15 1C7.8 1 2 6.3 2 14C2 22.5 15 37 15 37Z"
          fill="${o.color}" stroke="#ffffff" stroke-width="2"/>
        <g transform="translate(5,3)">${o.glyph}</g>
      </svg>
    </div>`,
    iconSize: [30, 38],
    iconAnchor: [15, 37],
    popupAnchor: [0, -34],
  });
}

interface VisitPoint {
  id: string;
  surveyId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  status: string;
  commodity: string | null;
  hh: string;
  community: string;
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  settlement: string;
  segment: string | null;
  eligible: number | null;
  treated: number | null;
  notes: string | null;
  at: string | null;
}

interface Props {
  projectId?: string | null;
  formName?: string;
  /**
   * Community-identity keys (state|lga|ward|community, alnum-normalized via
   * `linkedCommunityKey`) for the communities present in the dashboard's current
   * checklist submissions. When provided, ONLY household visits belonging to one
   * of these communities are plotted — so stale/orphaned Coverage Evaluation 3D
   * data never lingers on the map after MDA submissions are cleared, and the map
   * stays in exact sync with the dashboard data.
   */
  linkedCommunityKeys?: string[];
  /** Optional state filter coming from the dashboard filter bar. */
  stateFilter?: string | null;
  /** State to show when the dashboard is not actively filtered but the project is state-specific. */
  defaultState?: string | null;
  /** Optional date-time range (ISO strings) synced from dashboard filters. */
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Fired when a household marker is clicked — filters the drilldown table to its community. */
  onSelectCommunity?: (community: string, state?: string | null) => void;
  /** Fired when an LGA polygon is clicked — filters the drilldown table to that LGA. */
  onSelectLga?: (lga: string, state?: string | null) => void;
}

const SPEEDS = [0.5, 1, 2, 4];

export default function HouseholdCoverageSurveyMap({ projectId, formName, linkedCommunityKeys, stateFilter, defaultState, dateFrom, dateTo, onSelectCommunity, onSelectLga }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<any>(null);
  const plainLayerRef = useRef<L.LayerGroup | null>(null);
  const lightTileRef = useRef<L.TileLayer | null>(null);
  const satTileRef = useRef<L.TileLayer | null>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const heatRef = useRef<any>(null);
  const liveRef = useRef<L.Marker | null>(null);
  const geoRef = useRef<any[] | null>(null);
  // Cached extent of the drawn state boundary so marker redraws can fit the view
  // without rebuilding the (expensive) LGA polygon layers on every filter change.
  const stateBoundsRef = useRef<L.LatLngBounds | null>(null);
  // Signature of the last boundary we drew — skip re-drawing identical polygons.
  const boundarySigRef = useRef<string>("");
  const sweepTimer = useRef<number | null>(null);
  const restoredSelectionRef = useRef("");
  // True once the saved viewport (center/zoom) has been applied, or the user has
  // manually moved the map — suppresses auto-fitBounds so shared links / manual
  // panning are respected on refresh.
  const viewLockedRef = useRef(false);

  // Marker clustering toggle (#7) and basemap (#8 — satellite on focus).
  const [clustered, setClustered] = useState(true);
  const [basemap, setBasemap] = useState<"light" | "satellite">(() =>
    readUrl(URL_KEYS.basemap) === "satellite" ? "satellite" : "light",
  );

  const [points, setPoints] = useState<VisitPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Animation state
  const [animate, setAnimate] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [sweepIndex, setSweepIndex] = useState(0);

  // Heatmap state
  const [heatOn, setHeatOn] = useState(false);
  const [heatMetric, setHeatMetric] = useState<"all" | "treated" | "not_treated">("all");

  // Legend / outcome filter (keyboard accessible)
  const [activeOutcomes, setActiveOutcomes] = useState<Set<string>>(() => {
    const raw = readUrl(URL_KEYS.outcomes);
    if (!raw) return new Set();
    const allowed = new Set([...Object.keys(OUTCOMES), OTHER.key]);
    return new Set(raw.split(",").map((s) => s.trim()).filter((s) => allowed.has(s)));
  });

  // Internal visit time-window (index into chronological sequence)
  const [timeWindow, setTimeWindow] = useState<[number, number] | null>(null);

  const [exporting, setExporting] = useState(false);

  // Marker details panel (GPS + outcome data for the clicked household visit)
  const [selectedVisit, setSelectedVisit] = useState<VisitPoint | null>(null);
  const [selectedLga, setSelectedLga] = useState(() => readUrl(URL_KEYS.lga));
  // Street-level imagery (Mapillary — community-contributed, no external API key)
  const [streetView, setStreetView] = useState<{ lat: number; lng: number; accuracy?: number | null } | null>(null);

  // ── Load household visits (project-scoped, joined to survey geography) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const surveys = await fetchAllRowsKeyset<any>((limit, afterId) => {
          let sq = supabase
            .from("ces_surveys" as any)
            .select("id,state,lga,ward,flhf_name,community_name,settlement_name,project_id");
          if (projectId) sq = sq.eq("project_id", projectId);
          if (afterId) sq = sq.gt("id", afterId);
          return sq.order("id", { ascending: true }).limit(limit);
        });
        const meta = new Map<string, { state: string; lga: string; ward: string; flhf: string; community: string; settlement: string }>();
        for (const s of (surveys as any[]) || []) {
          meta.set(s.id, {
            state: stripTags(s.state),
            lga: stripTags(s.lga),
            ward: stripTags(s.ward),
            flhf: stripTags(s.flhf_name),
            community: stripTags(s.community_name),
            settlement: stripTags(s.settlement_name),
          });
        }
        const ids = [...meta.keys()];
        if (ids.length === 0) { if (!cancelled) { setPoints([]); setLoading(false); } return; }

        const collected: VisitPoint[] = [];
        const CHUNK = 200;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const visits = await fetchAllRowsKeyset<any>((limit, afterId) => {
            let vq = supabase
              .from("ces_household_visits" as any)
              .select("id,survey_id,latitude,longitude,gps_accuracy,coverage_status,commodity,hh_number,visited_at,eligible_persons,treated_persons,notes,segment_label")
              .in("survey_id", slice);
            if (afterId) vq = vq.gt("id", afterId);
            return vq.order("id", { ascending: true }).limit(limit);
          });
          for (const v of (visits as any[]) || []) {
            const lat = Number(v.latitude), lng = Number(v.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
            const m = meta.get(v.survey_id) || { state: "", lga: "", ward: "", flhf: "", community: "", settlement: "" };
            collected.push({
              id: v.id,
              surveyId: v.survey_id,
              lat,
              lng,
              accuracy: Number.isFinite(Number(v.gps_accuracy)) ? Number(v.gps_accuracy) : null,
              status: v.coverage_status,
              commodity: v.commodity,
              hh: v.hh_number || "HH",
              community: m.community,
              state: m.state,
              lga: m.lga,
              ward: m.ward,
              flhf: m.flhf,
              settlement: m.settlement,
              segment: v.segment_label || null,
              eligible: Number.isFinite(Number(v.eligible_persons)) ? Number(v.eligible_persons) : null,
              treated: Number.isFinite(Number(v.treated_persons)) ? Number(v.treated_persons) : null,
              notes: v.notes || null,
              at: v.visited_at,
            });
          }
        }
        if (!cancelled) { setPoints(collected); setLoading(false); }
      } catch (e) {
        console.warn("Household coverage map load failed", e);
        if (!cancelled) { setPoints([]); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    writeUrl({ [URL_KEYS.outcomes]: activeOutcomes.size ? [...activeOutcomes].sort().join(",") : null });
  }, [activeOutcomes]);

  // Set of supervised-community keys to constrain the map to linked data only.
  // `undefined` ⇒ no linkage constraint (legacy/standalone use). An EMPTY set
  // (dashboard supplied it but there are no checklist communities) ⇒ show
  // nothing, so deleting all submissions instantly clears the map.
  const linkedKeySet = useMemo(
    () => (linkedCommunityKeys ? new Set(linkedCommunityKeys) : null),
    [linkedCommunityKeys],
  );

  // Apply linkage + state + dashboard date filters + legend outcome filter
  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() : null;
    return points.filter((p) => {
      if (linkedKeySet) {
        const key = linkedCommunityKey(p.state, p.lga, p.ward, p.community);
        if (!linkedKeySet.has(key)) return false;
      }
      if (stateFilter && norm(p.state) !== norm(stateFilter)) return false;
      if (activeOutcomes.size && !activeOutcomes.has(outcomeFor(p.status).key)) return false;
      if (fromTs || toTs) {
        const t = p.at ? new Date(p.at).getTime() : null;
        if (t == null) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      return true;
    });
  }, [points, linkedKeySet, stateFilter, activeOutcomes, dateFrom, dateTo]);


  // Chronological sequence used by the sweep + time window slider
  const sequence = useMemo(
    () => [...filtered].sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()),
    [filtered],
  );

  // Reset the internal time window whenever the data set changes
  useEffect(() => {
    setTimeWindow(sequence.length ? [0, sequence.length - 1] : null);
    setSweepIndex(0);
  }, [sequence.length]);

  // Points visible after the internal time-window is applied
  const windowed = useMemo(() => {
    if (!timeWindow) return sequence;
    const [a, b] = timeWindow;
    return sequence.slice(a, b + 1);
  }, [sequence, timeWindow]);

  const statesPresent = useMemo(() => {
    const set = new Set(windowed.map((p) => norm(p.state)).filter(Boolean));
    // Always show the selected/default project state's map even if it has no visits yet.
    if (stateFilter) stateKeys(stateFilter).forEach((key) => set.add(key));
    else if (defaultState) stateKeys(defaultState).forEach((key) => set.add(key));
    return set;
  }, [windowed, stateFilter, defaultState]);

  useEffect(() => {
    const key = `${points.length}:${readUrl(URL_KEYS.visit)}:${readUrl(URL_KEYS.lga)}:${readUrl(URL_KEYS.community)}:${readUrl(URL_KEYS.state)}`;
    if (restoredSelectionRef.current === key || points.length === 0) return;
    restoredSelectionRef.current = key;
    const visitId = readUrl(URL_KEYS.visit);
    const lga = readUrl(URL_KEYS.lga);
    const community = readUrl(URL_KEYS.community);
    const state = readUrl(URL_KEYS.state);
    if (visitId) {
      const visit = points.find((p) => p.id === visitId);
      if (visit) {
        setSelectedVisit(visit);
        setSelectedLga("");
        onSelectCommunity?.(visit.community, visit.state);
        const map = mapRef.current;
        if (map) map.setView([visit.lat, visit.lng], Math.max(map.getZoom(), 14), { animate: false });
      }
    } else if (lga) {
      setSelectedVisit(null);
      setSelectedLga(lga);
      onSelectLga?.(lga, state || stateFilter || defaultState || null);
    } else if (community) {
      setSelectedVisit(null);
      onSelectCommunity?.(community, state || stateFilter || defaultState || null);
    }
  }, [points, onSelectCommunity, onSelectLga, stateFilter, defaultState]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of windowed) { const k = outcomeFor(p.status).key; c[k] = (c[k] || 0) + 1; }
    return c;
  }, [windowed]);

  // All outcome rows for the legend (known outcomes + any "other" present)
  const legendItems = useMemo(() => {
    const base = Object.values(OUTCOMES);
    return counts[OTHER.key] ? [...base, OTHER] : base;
  }, [counts]);

  // ── Load Nigeria LGA boundaries once (for state outline) ──
  useEffect(() => {
    if (geoRef.current) { redraw(); return; }
    fetch("/nigeria-lga.geojson")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { geoRef.current = d.features || []; redraw(); })
      .catch((e) => console.warn("Boundaries failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Init map once ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { zoomControl: true, attributionControl: false });
    // Clean light "state map" basemap (matches the LGA Supervision Map) so the
    // coloured household-outcome pins read clearly against the state boundary —
    // no satellite imagery underneath.
    const lightTile = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 19, keepBuffer: 6, updateWhenIdle: false, crossOrigin: true,
    });
    const satTile = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 21, keepBuffer: 6, updateWhenIdle: false, crossOrigin: true,
    });
    lightTileRef.current = lightTile;
    satTileRef.current = satTile;
    (basemap === "satellite" ? satTile : lightTile).addTo(map);
    map.setView([9.6, 8.1], 6);

    // Restore a saved viewport (center + zoom) from the URL so shared links and
    // page refreshes reopen to the exact same view.
    const savedCenter = readUrl(URL_KEYS.center);
    const savedZoom = readUrl(URL_KEYS.zoom);
    if (savedCenter) {
      const [latS, lngS] = savedCenter.split(",");
      const lat = Number(latS), lng = Number(lngS), z = Number(savedZoom);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        map.setView([lat, lng], Number.isFinite(z) ? z : map.getZoom(), { animate: false });
        viewLockedRef.current = true;
      }
    }

    // Persist viewport on user-driven pan/zoom; mark the view as locked so the
    // auto-fit in redraw() no longer overrides the user's chosen view.
    const persistView = () => {
      const c = map.getCenter();
      viewLockedRef.current = true;
      writeUrl({
        [URL_KEYS.center]: `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`,
        [URL_KEYS.zoom]: String(map.getZoom()),
      });
    };
    map.on("moveend", persistView);
    map.on("zoomend", persistView);

    // Clustering group with an outcome-aware cluster icon.
    const cluster = (L as any).markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 55,
      iconCreateFunction: (c: any) => {
        const children = c.getAllChildMarkers();
        const tally: Record<string, number> = {};
        for (const m of children) { const k = (m as any).__outcome || OTHER.key; tally[k] = (tally[k] || 0) + 1; }
        const total = children.length;
        const dim = total > 100 ? 56 : total > 25 ? 46 : 38;
        // Build a conic-gradient ring proportional to outcome mix.
        let acc = 0;
        const segs = Object.entries(tally).map(([k, n]) => {
          const o = OUTCOMES[k] || OTHER;
          const start = (acc / total) * 360; acc += n;
          const end = (acc / total) * 360;
          return `${o.color} ${start}deg ${end}deg`;
        });
        return L.divIcon({
          html: `<div class="hcs-cluster" style="width:${dim}px;height:${dim}px;background:conic-gradient(${segs.join(",")})">
            <span class="hcs-cluster-core">${total}</span>
          </div>`,
          className: "hcs-cluster-wrap",
          iconSize: L.point(dim, dim),
        });
      },
    });
    cluster.addTo(map);
    clusterRef.current = cluster;
    // Plain (unclustered) marker layer — used when the cluster toggle is off.
    plainLayerRef.current = L.layerGroup();

    mapRef.current = map;
    setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 60);
    redraw();
    return () => { try { map.remove(); } catch { /* noop */ } mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boundary polygons rebuild only on state/LGA change; markers redraw on every
  // filter/sweep change without touching the (memoized) boundary layers (#10).
  useEffect(() => { drawBoundary(); drawMarkers(); }, [statesPresent, selectedLga]);
  useEffect(() => { drawMarkers(); }, [windowed, clustered]);

  // ── Basemap switching (light ↔ satellite) with URL persistence (#8) ──
  useEffect(() => {
    const map = mapRef.current;
    const light = lightTileRef.current;
    const sat = satTileRef.current;
    if (!map || !light || !sat) return;
    if (basemap === "satellite") {
      if (map.hasLayer(light)) map.removeLayer(light);
      if (!map.hasLayer(sat)) sat.addTo(map);
    } else {
      if (map.hasLayer(sat)) map.removeLayer(sat);
      if (!map.hasLayer(light)) light.addTo(map);
    }
    writeUrl({ [URL_KEYS.basemap]: basemap === "satellite" ? "satellite" : null });
  }, [basemap]);

  // Pan/zoom to a visit, instantly switch to satellite view, persist viewport.
  const focusVisit = (p: VisitPoint) => {
    setSelectedVisit(p);
    setSelectedLga("");
    setBasemap("satellite");
    const map = mapRef.current;
    if (map) {
      viewLockedRef.current = true;
      map.setView([p.lat, p.lng], Math.max(map.getZoom(), 18), { animate: true });
    }
    writeUrl({
      [URL_KEYS.visit]: p.id,
      [URL_KEYS.community]: p.community || null,
      [URL_KEYS.state]: p.state || null,
      [URL_KEYS.lga]: null,
      [URL_KEYS.basemap]: "satellite",
    });
    if (p.community) onSelectCommunity?.(p.community, p.state);
  };

  // ── Draw (memoized) state/LGA boundary polygons (#10) ──
  // Rebuilds only when the set of present states or the selected LGA changes —
  // marker/filter/sweep updates no longer re-tessellate the (expensive) polygons.
  function drawBoundary() {
    const map = mapRef.current;
    if (!map) return;
    // Include GeoJSON readiness (feature count) in the signature so the redraw
    // that fires once boundaries finish loading is NOT skipped by memoization —
    // the pre-load draw caches an empty layer with the same state/LGA signature.
    const feats0 = geoRef.current;
    const sig = `${[...statesPresent].sort().join("|")}::${norm(selectedLga)}::${feats0 ? feats0.length : 0}`;
    if (sig === boundarySigRef.current && boundaryLayerRef.current) return;
    boundarySigRef.current = sig;

    if (boundaryLayerRef.current) { try { map.removeLayer(boundaryLayerRef.current); } catch { /* noop */ } }
    const bGroup = L.layerGroup();
    const stateBounds = L.latLngBounds([]);
    const feats = geoRef.current;
    if (feats && statesPresent.size) {
      const stateFeats = feats.filter((f: any) => statesPresent.has(norm(f?.properties?.state)));
      if (stateFeats.length) {
        // Individual LGA fills (light) so the internal LGA divisions read clearly,
        // matching the LGA Supervision Map reference.
        const lgas = L.geoJSON({ type: "FeatureCollection", features: stateFeats } as any, {
          style: (feature: any) => {
            const active = selectedLga && norm(feature?.properties?.lga) === norm(selectedLga);
            return {
              color: active ? "#0f766e" : "#14b8a6",
              weight: active ? 2.8 : 1,
              opacity: active ? 1 : 0.7,
              fillColor: active ? "#2dd4bf" : "#99f6e4",
              fillOpacity: active ? 0.42 : 0.18,
            };
          },
          onEachFeature: (f: any, lyr) => {
            const name = f?.properties?.lga;
            const st = f?.properties?.state;
            if (name) {
              lyr.bindTooltip(String(name), { sticky: true, direction: "top", className: "hcs-lga-tip" });
              lyr.on("click", () => {
                setSelectedVisit(null);
                setSelectedLga(String(name));
                writeUrl({
                  [URL_KEYS.lga]: String(name),
                  [URL_KEYS.state]: st ? String(st) : null,
                  [URL_KEYS.visit]: null,
                  [URL_KEYS.community]: null,
                });
                onSelectLga?.(String(name), st);
              });
              lyr.on("mouseover", () => (lyr as any).setStyle?.({ fillOpacity: 0.34, weight: 1.6 }));
              lyr.on("mouseout", () => {
                const active = selectedLga && norm(name) === norm(selectedLga);
                (lyr as any).setStyle?.({ fillOpacity: active ? 0.42 : 0.18, weight: active ? 2.8 : 1 });
              });
            }
            try { stateBounds.extend((lyr as any).getBounds()); } catch { /* noop */ }
          },
        });
        // Bold outer state outline + soft glow.
        const glow = L.geoJSON({ type: "FeatureCollection", features: stateFeats } as any, {
          style: () => ({ color: "#0d9488", weight: 7, opacity: 0.22, fill: false }),
        });
        const outline = L.geoJSON({ type: "FeatureCollection", features: stateFeats } as any, {
          style: () => ({ color: "#0d9488", weight: 2.6, opacity: 0.95, fill: false }),
        });
        bGroup.addLayer(glow);
        bGroup.addLayer(lgas);
        bGroup.addLayer(outline);
      }
    }
    bGroup.addTo(map);
    boundaryLayerRef.current = bGroup;
    stateBoundsRef.current = stateBounds.isValid() ? stateBounds : null;
  }

  // ── Draw household outcome markers (clustered or plain, per toggle #7) ──
  function drawMarkers() {
    const map = mapRef.current;
    if (!map) return;
    const bounds = L.latLngBounds([]);
    if (stateBoundsRef.current?.isValid()) bounds.extend(stateBoundsRef.current);

    const cluster = clusterRef.current;
    const plain = plainLayerRef.current;
    // Detach whichever layer is inactive so toggling is clean.
    if (cluster) cluster.clearLayers();
    if (plain) plain.clearLayers();
    if (cluster && map.hasLayer(cluster) && !clustered) map.removeLayer(cluster);
    if (cluster && !map.hasLayer(cluster) && clustered) cluster.addTo(map);
    if (plain && map.hasLayer(plain) && clustered) map.removeLayer(plain);
    if (plain && !map.hasLayer(plain) && !clustered) plain.addTo(map);

    const target = clustered ? cluster : plain;
    if (target) {
      const markers: L.Marker[] = [];
      for (const p of windowed) {
        const o = outcomeFor(p.status);
        const m = L.marker([p.lat, p.lng], { icon: pinIcon(o), riseOnHover: true, keyboard: true });
        (m as any).__outcome = o.key;
        m.bindTooltip(`${p.hh} — ${o.label}${p.community ? ` · ${p.community}` : ""}`, { direction: "top", offset: [0, -32] });
        m.bindPopup(
          `<div style="font-size:12px;min-width:140px">
            <strong>${p.hh}</strong> · <span style="color:${o.color};font-weight:600">${o.label}</span><br/>
            ${p.community ? `<span>${p.community}</span><br/>` : ""}
            ${p.commodity ? `<span>Commodity: ${p.commodity}</span><br/>` : ""}
            <span style="color:#64748b">${p.at ? new Date(p.at).toLocaleString() : ""}</span><br/>
            <span style="color:#64748b">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
          </div>`,
        );
        // Clicking a marker pans/zooms and switches to satellite (#8).
        m.on("click", () => focusVisit(p));
        markers.push(m);
        try { bounds.extend([p.lat, p.lng]); } catch { /* noop */ }
      }
      // Cluster plugin chunk-loads internally; for the plain layer we batch-add
      // so very large sets don't block the main thread in one synchronous pass.
      if (clustered && cluster) cluster.addLayers(markers);
      else if (plain) {
        const batch = 400;
        const addBatch = (start: number) => {
          for (let i = start; i < Math.min(start + batch, markers.length); i++) markers[i].addTo(plain);
          if (start + batch < markers.length) requestAnimationFrame(() => addBatch(start + batch));
        };
        addBatch(0);
      }
    }

    // Auto-fit so EVERY household marker is visible. `bounds` already contains
    // both the state extent (when available) and every plotted marker — markers
    // can fall outside their recorded state (e.g. blank/captured-only geography),
    // so we must never fit to the state polygon alone or those pins land
    // off-screen. Skip the auto-fit entirely once the viewport is locked by a
    // restored/shared URL view or a manual pan/zoom.
    if (!viewLockedRef.current) {
      try {
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
      } catch { /* noop */ }
    }
  }

  function redraw() { drawBoundary(); drawMarkers(); }


  // ── Heatmap overlay ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (heatRef.current) { try { map.removeLayer(heatRef.current); } catch { /* noop */ } heatRef.current = null; }
    if (!heatOn) return;
    const pts = windowed
      .filter((p) => heatMetric === "all" || outcomeFor(p.status).key === heatMetric)
      .map((p) => [p.lat, p.lng, 0.8] as [number, number, number]);
    if (!pts.length) return;
    const gradient =
      heatMetric === "not_treated"
        ? { 0.2: "#fee2e2", 0.5: "#f87171", 1: "#b91c1c" }
        : heatMetric === "treated"
        ? { 0.2: "#dcfce7", 0.5: "#4ade80", 1: "#15803d" }
        : { 0.2: "#dbeafe", 0.5: "#fbbf24", 1: "#ef4444" };
    heatRef.current = (L as any).heatLayer(pts, { radius: 28, blur: 22, maxZoom: 15, gradient });
    heatRef.current.addTo(map);
    return () => { if (heatRef.current) { try { map.removeLayer(heatRef.current); } catch { /* noop */ } heatRef.current = null; } };
  }, [heatOn, heatMetric, windowed]);

  // ── Visit sweep: glowing pulse that walks the chronological sequence ──
  const placePulse = useCallback((idx: number) => {
    const map = mapRef.current;
    if (!map || !windowed.length) return;
    const p = windowed[Math.min(idx, windowed.length - 1)];
    if (!p) return;
    if (!liveRef.current) {
      liveRef.current = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "hcs-live", html: '<div class="hcs-live-ring"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
        interactive: false, zIndexOffset: 600,
      }).addTo(map);
    } else {
      liveRef.current.setLatLng([p.lat, p.lng]);
    }
  }, [windowed]);

  useEffect(() => {
    const map = mapRef.current;
    if (sweepTimer.current) { clearInterval(sweepTimer.current); sweepTimer.current = null; }
    if (!map || !animate || windowed.length === 0) {
      if (!animate && liveRef.current) { try { map?.removeLayer(liveRef.current); } catch { /* noop */ } liveRef.current = null; }
      return;
    }
    placePulse(sweepIndex);
    sweepTimer.current = window.setInterval(() => {
      setSweepIndex((i) => {
        const next = (i + 1) % windowed.length;
        placePulse(next);
        return next;
      });
    }, Math.max(120, 1100 / speed));
    return () => { if (sweepTimer.current) { clearInterval(sweepTimer.current); sweepTimer.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, speed, windowed]);

  const step = (dir: 1 | -1) => {
    setAnimate(false);
    setSweepIndex((i) => {
      const n = (i + dir + windowed.length) % Math.max(1, windowed.length);
      placePulse(n);
      const p = windowed[n];
      if (p && mapRef.current) mapRef.current.panTo([p.lat, p.lng]);
      return n;
    });
  };

  const toggleOutcome = (key: string) => {
    setActiveOutcomes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}`);
    }
  };

  const openCommunityRow = (visit: VisitPoint) => {
    writeUrl({
      [URL_KEYS.visit]: visit.id,
      [URL_KEYS.community]: visit.community || null,
      [URL_KEYS.state]: visit.state || null,
      [URL_KEYS.lga]: null,
    });
    onSelectCommunity?.(visit.community, visit.state);
  };

  // ── Export current view (with legend + filters) to PNG / PDF ──
  const exportView = async (format: "png" | "pdf") => {
    if (!captureRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
      });
      const stamp = Date.now();
      const base = `household-coverage-map-${stamp}`;
      if (format === "png") {
        const link = document.createElement("a");
        link.download = `${base}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? "landscape" : "portrait",
          unit: "px", format: [canvas.width, canvas.height],
        });
        pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
        pdf.save(`${base}.pdf`);
      }
      toast.success(`Map exported as ${format.toUpperCase()}`);
    } catch (e) {
      console.error("Map export failed", e);
      toast.error("Failed to export map view");
    } finally {
      setExporting(false);
    }
  };

  // ── Export the currently filtered household visits to CSV (#9) ──
  const exportCsv = () => {
    const rows = windowed;
    if (!rows.length) { toast.error("No household visits to export"); return; }
    const esc = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      "Household", "Outcome", "Commodity", "State", "LGA", "Ward", "FLHF",
      "Community", "Settlement", "Latitude", "Longitude", "GPS Accuracy (m)",
      "Eligible", "Treated", "Visited At",
    ];
    const lines = [headers.join(",")];
    for (const p of rows) {
      lines.push([
        p.hh, outcomeFor(p.status).label, p.commodity || "", p.state, p.lga, p.ward,
        p.flhf, p.community, p.settlement, p.lat.toFixed(6), p.lng.toFixed(6),
        p.accuracy ?? "", p.eligible ?? "", p.treated ?? "",
        p.at ? new Date(p.at).toISOString() : "",
      ].map(esc).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `household-visits-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} household visit(s) to CSV`);
  };

  const currentVisit = windowed[Math.min(sweepIndex, Math.max(0, windowed.length - 1))];

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-sm">
              <Home className="h-4 w-4 text-primary" /> Household Coverage Survey Map
            </CardTitle>
            <CardDescription className="text-xs">
              {formName ? `${formName} — ` : ""}Every household visit from Coverage Evaluation 3D, plotted on the state map at its captured GPS with its outcome icon.
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting} aria-label="Export map view">
                {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportView("png")}>
                <FileImage className="h-4 w-4 mr-2" /> Export as PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportView("pdf")}>
                <FileText className="h-4 w-4 mr-2" /> Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportCsv}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Export visits as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Summary badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <MapPin className="h-3 w-3" />{windowed.length} household{windowed.length === 1 ? "" : "s"}
          </Badge>
          {(stateFilter || dateFrom || dateTo) && (
            <Badge variant="outline" className="gap-1 text-[11px]">
              Filters: {[stateFilter, dateFrom && `from ${new Date(dateFrom).toLocaleDateString()}`, dateTo && `to ${new Date(dateTo).toLocaleDateString()}`].filter(Boolean).join(" · ")}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant={clustered ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={() => setClustered((v) => !v)}
              aria-pressed={clustered}
              title={clustered ? "Markers are clustered — click to show individual markers" : "Markers are individual — click to cluster"}
            >
              <Layers className="h-3.5 w-3.5" /> {clustered ? "Clustered" : "Unclustered"}
            </Button>
            <Button
              variant={basemap === "satellite" ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={() => setBasemap((b) => (b === "satellite" ? "light" : "satellite"))}
              aria-pressed={basemap === "satellite"}
              title="Toggle satellite imagery"
            >
              <Satellite className="h-3.5 w-3.5" /> {basemap === "satellite" ? "Satellite" : "Map"}
            </Button>
          </div>
        </div>

        {/* Accessible, keyboard-navigable legend (also acts as outcome filter) */}
        <div role="group" aria-label="Household outcome legend and filters" className="flex flex-wrap items-center gap-2">
          {legendItems.map((o) => {
            const active = activeOutcomes.size === 0 || activeOutcomes.has(o.key);
            const n = counts[o.key] || 0;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => toggleOutcome(o.key)}
                aria-pressed={activeOutcomes.has(o.key)}
                aria-label={`${o.label}: ${n} household${n === 1 ? "" : "s"}. ${activeOutcomes.has(o.key) ? "Active filter, activate to remove." : "Activate to filter by this outcome."}`}
                title={`${o.label} · ${n}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${active ? "" : "opacity-40"}`}
                style={{ borderColor: `${o.color}66`, color: o.color, background: `${o.color}12` }}
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full" style={{ background: o.color }}>
                  <svg width="12" height="12" viewBox="2 2 16 16" aria-hidden="true">{<g dangerouslySetInnerHTML={{ __html: o.glyph }} />}</svg>
                </span>
                {o.label}
                <span className="rounded-full bg-background/70 px-1.5 font-semibold tabular-nums">{n}</span>
              </button>
            );
          })}
          {activeOutcomes.size > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setActiveOutcomes(new Set())}>
              <RotateCcw className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Animation + heatmap controls */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => step(-1)} aria-label="Previous visit" disabled={!windowed.length}>
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnimate((v) => !v)} aria-label={animate ? "Pause visit replay" : "Play visit replay"} disabled={!windowed.length}>
              {animate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => step(1)} aria-label="Next visit" disabled={!windowed.length}>
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5" role="group" aria-label="Replay speed">
            <span className="text-[11px] font-medium text-muted-foreground">Speed</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${speed === s ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`}
              >
                {s}×
              </button>
            ))}
          </div>

          {currentVisit && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              Step {Math.min(sweepIndex + 1, windowed.length)} / {windowed.length}
              {currentVisit.at ? ` · ${new Date(currentVisit.at).toLocaleString()}` : ""}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Flame className={`h-3.5 w-3.5 ${heatOn ? "text-orange-500" : "text-muted-foreground"}`} />
            <span className="text-[11px] font-medium">Heatmap</span>
            <Switch checked={heatOn} onCheckedChange={setHeatOn} aria-label="Toggle density heatmap" />
            {heatOn && (
              <div className="flex items-center gap-1" role="group" aria-label="Heatmap metric">
                {(["all", "treated", "not_treated"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setHeatMetric(m)}
                    aria-pressed={heatMetric === m}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${heatMetric === m ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`}
                  >
                    {m === "all" ? "Density" : m === "treated" ? "Treated" : "Not Treated"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Visit time-window slider (synced with the chronological sequence) */}
        {sequence.length > 1 && timeWindow && (
          <div className="space-y-1 px-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{sequence[timeWindow[0]]?.at ? new Date(sequence[timeWindow[0]].at!).toLocaleDateString() : "Start"}</span>
              <span>Visit time window</span>
              <span>{sequence[timeWindow[1]]?.at ? new Date(sequence[timeWindow[1]].at!).toLocaleDateString() : "End"}</span>
            </div>
            <Slider
              min={0}
              max={sequence.length - 1}
              step={1}
              value={timeWindow}
              onValueChange={(v) => setTimeWindow([v[0], v[1] ?? v[0]] as [number, number])}
              aria-label="Visit time window"
            />
          </div>
        )}

        {/* Captured area: map + overlaid legend so exports include it */}
        <div ref={captureRef} className="relative rounded-xl overflow-hidden border border-border">
          <div ref={containerRef} style={{ height: 520, width: "100%" }} />
          {/* On-map legend overlay (always captured in export) */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-border bg-card/95 p-2 shadow-card backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Outcomes</p>
            <ul className="space-y-0.5">
              {legendItems.map((o) => (
                <li key={o.key} className="flex items-center gap-1.5 text-[11px]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />
                  <span className="text-foreground">{o.label}</span>
                  <span className="ml-auto font-semibold tabular-nums text-muted-foreground">{counts[o.key] || 0}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Household visit details panel (opens on marker click) */}
          {selectedVisit && (() => {
            const o = outcomeFor(selectedVisit.status);
            return (
              <div className="absolute right-3 top-3 z-[600] w-64 rounded-lg border border-border bg-card/97 p-3 shadow-card backdrop-blur-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ background: o.color }}>
                      <svg width="13" height="13" viewBox="2 2 16 16" aria-hidden="true">{<g dangerouslySetInnerHTML={{ __html: o.glyph }} />}</svg>
                    </span>
                    <span className="text-sm font-semibold">{selectedVisit.hh}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Close details" onClick={() => {
                    setSelectedVisit(null);
                    writeUrl({ [URL_KEYS.visit]: null, [URL_KEYS.community]: null });
                  }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mb-2 rounded-md border border-border bg-muted/40 p-2 text-[11px]">
                  <p className="font-semibold text-foreground">Submission summary</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {selectedVisit.community || "Community not recorded"}{selectedVisit.settlement ? ` · ${selectedVisit.settlement}` : ""}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">Visit {selectedVisit.id.slice(0, 8)} · Survey {selectedVisit.surveyId.slice(0, 8)}</p>
                </div>
                <dl className="space-y-1 text-[11px]">
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Outcome</dt><dd className="font-semibold" style={{ color: o.color }}>{o.label}</dd></div>
                  {selectedVisit.lga && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">LGA</dt><dd className="font-medium text-right">{selectedVisit.lga}</dd></div>}
                  {selectedVisit.ward && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Ward</dt><dd className="font-medium text-right">{selectedVisit.ward}</dd></div>}
                  {selectedVisit.flhf && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">FLHF</dt><dd className="font-medium text-right">{selectedVisit.flhf}</dd></div>}
                  {selectedVisit.community && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Community</dt><dd className="font-medium text-right">{selectedVisit.community}</dd></div>}
                  {selectedVisit.settlement && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Settlement</dt><dd className="font-medium text-right">{selectedVisit.settlement}</dd></div>}
                  {selectedVisit.state && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">State</dt><dd className="font-medium text-right">{selectedVisit.state}</dd></div>}
                  {selectedVisit.segment && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Segment</dt><dd className="font-medium text-right">{selectedVisit.segment}</dd></div>}
                  {selectedVisit.commodity && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Commodity</dt><dd className="font-medium text-right">{selectedVisit.commodity}</dd></div>}
                  {(selectedVisit.eligible !== null || selectedVisit.treated !== null) && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Treated / eligible</dt><dd className="font-medium text-right">{selectedVisit.treated ?? 0} / {selectedVisit.eligible ?? 0}</dd></div>}
                  {selectedVisit.at && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Visited</dt><dd className="font-medium text-right">{new Date(selectedVisit.at).toLocaleString()}</dd></div>}
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Accuracy</dt><dd className="font-medium text-right">{selectedVisit.accuracy != null ? `±${Math.round(selectedVisit.accuracy)}m` : "—"}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">GPS</dt><dd className="font-mono tabular-nums">{selectedVisit.lat.toFixed(6)}, {selectedVisit.lng.toFixed(6)}</dd></div>
                </dl>
                {selectedVisit.notes && <p className="mt-2 rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">{selectedVisit.notes}</p>}
                <Button
                  size="sm"
                  className="mt-2.5 h-8 w-full text-[11px] font-semibold"
                  onClick={() => setStreetView({ lat: selectedVisit.lat, lng: selectedVisit.lng, accuracy: selectedVisit.accuracy })}
                >
                  <Eye className="h-3.5 w-3.5 mr-1.5" /> Zoom to street view
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2.5 h-7 w-full text-[11px]"
                  onClick={() => copyText(`${selectedVisit.lat.toFixed(6)}, ${selectedVisit.lng.toFixed(6)}`, "GPS coordinate")}
                >
                  Copy GPS coordinate
                </Button>
                {selectedVisit.community && onSelectCommunity && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2.5 h-7 w-full text-[11px]"
                    onClick={() => openCommunityRow(selectedVisit)}
                  >
                    <ListFilter className="h-3 w-3 mr-1.5" /> Open matching community row
                  </Button>
                )}
              </div>
            );
          })()}
        </div>


        {!loading && windowed.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            No household visits captured yet for this project / filters. They appear here as soon as Coverage Evaluation 3D surveys are submitted.
          </p>
        )}
        {loading && (
          <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading household visits…
          </p>
        )}
      </CardContent>

      <StreetViewPanel
        open={!!streetView}
        onOpenChange={(o) => !o && setStreetView(null)}
        lat={streetView?.lat ?? null}
        lng={streetView?.lng ?? null}
        accuracy={streetView?.accuracy ?? null}
      />
    </Card>
  );
}
