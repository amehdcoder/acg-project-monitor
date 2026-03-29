import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Map, ZoomIn, BarChart3, Maximize2, Minimize2, FileText, Loader2, Settings2, Focus, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface MicroplanEntry {
  id: string;
  community_name: string;
  settlement_name: string | null;
  flhf_name: string;
  state: string;
  lga: string;
  ward: string;
  community_latitude: number | null;
  community_longitude: number | null;
  settlement_latitude: number | null;
  settlement_longitude: number | null;
  flhf_latitude: number | null;
  flhf_longitude: number | null;
  estimated_total_population: number | null;
  estimated_children_0_4?: number | null;
  estimated_children_5_14?: number | null;
  estimated_adults_15_plus?: number | null;
  number_of_households?: number | null;
  accessibility: string | null;
  terrain_type: string | null;
  security_clearance: string | null;
  community_distance_to_flhf_km: number | null;
  settlement_distance_to_flhf_km: number | null;
  cdd_from_community: boolean | null;
  cdd_names: string | null;
  year_of_microplanning?: number | null;
  campaign_type?: string | null;
}

interface MicroplanMapProps {
  entries: MicroplanEntry[];
  onEntryClick?: (id: string) => void;
}

type ThematicLayer = "none" | "flhf_catchment" | "distance" | "accessibility" | "security" | "terrain" | "cdd_origin" | "population" | "pop_density" | "distance_choropleth" | "coverage_gap" | "catchment_buffers";

// ─── GRID3-Style Color Palettes ───
const FLHF_COLORS = [
  "#2E86AB", "#A23B72", "#F18F01", "#C73E1D", "#3B1F2B",
  "#44BBA4", "#E94F37", "#393E41", "#8D6A9F", "#44AF69",
  "#F8961E", "#577590", "#43AA8B", "#F94144", "#90BE6D",
  "#F3722C", "#277DA1", "#F9C74F", "#4D908E", "#F9844A",
  "#43AA8B", "#F8961E", "#577590", "#90BE6D",
];

const TERRAIN_ICONS: Record<string, { emoji: string; color: string }> = {
  flat: { emoji: "🌾", color: "#22C55E" },
  hilly: { emoji: "⛰️", color: "#A3A3A3" },
  mountainous: { emoji: "🏔️", color: "#78716C" },
  riverine: { emoji: "🌊", color: "#3B82F6" },
  swampy: { emoji: "🏝️", color: "#065F46" },
  desert: { emoji: "🏜️", color: "#D97706" },
  forest: { emoji: "🌲", color: "#15803D" },
};

const ACCESS_COLORS: Record<string, { color: string; label: string }> = {
  accessible: { color: "#059669", label: "Accessible" },
  hard_to_reach: { color: "#D97706", label: "Hard to Reach" },
  inaccessible: { color: "#DC2626", label: "Inaccessible" },
  seasonal: { color: "#7C3AED", label: "Seasonal" },
};

const SECURITY_COLORS: Record<string, { color: string; label: string }> = {
  cleared: { color: "#059669", label: "Cleared" },
  partial: { color: "#D97706", label: "Partial" },
  not_cleared: { color: "#DC2626", label: "Not Cleared" },
  unknown: { color: "#6B7280", label: "Unknown" },
};

const DISTANCE_BANDS = [
  { max: 2, color: "#065F46", label: "< 2 km" },
  { max: 5, color: "#059669", label: "2–5 km" },
  { max: 10, color: "#D97706", label: "5–10 km" },
  { max: 20, color: "#EA580C", label: "10–20 km" },
  { max: Infinity, color: "#DC2626", label: "> 20 km" },
];

const CATCHMENT_BUFFERS = [
  { radiusKm: 2, color: "#059669", opacity: 0.10, label: "2 km", dash: "4 6" },
  { radiusKm: 5, color: "#2563EB", opacity: 0.06, label: "5 km", dash: "6 8" },
  { radiusKm: 10, color: "#D97706", opacity: 0.03, label: "10 km", dash: "8 10" },
];

const POP_DENSITY_CLASSES = [
  { max: 1000, color: "#D1FAE5", label: "< 1k" },
  { max: 3000, color: "#6EE7B7", label: "1k–3k" },
  { max: 5000, color: "#FBBF24", label: "3k–5k" },
  { max: 8000, color: "#EA580C", label: "5k–8k" },
  { max: Infinity, color: "#B91C1C", label: "> 8k" },
];

const getDistanceColor = (km: number | null) => {
  if (km == null) return "#6B7280";
  for (const b of DISTANCE_BANDS) if (km <= b.max) return b.color;
  return "#DC2626";
};
const getDensityColor = (pop: number) => {
  for (const c of POP_DENSITY_CLASSES) if (pop <= c.max) return c.color;
  return "#B91C1C";
};
const getCoverageGapColor = (score: number) => {
  if (score < 20) return "#065F46";
  if (score < 40) return "#059669";
  if (score < 60) return "#FBBF24";
  if (score < 80) return "#EA580C";
  return "#B91C1C";
};
const getPopulationColor = (pop: number | null, maxPop: number) => {
  if (!pop || maxPop === 0) return "#6B7280";
  const r = Math.min(pop / maxPop, 1);
  if (r < 0.25) return "#059669";
  if (r < 0.5) return "#D97706";
  if (r < 0.75) return "#EA580C";
  return "#DC2626";
};

const DISAGGREGATION_FIELDS: { key: string; label: string; field: keyof MicroplanEntry }[] = [
  { key: "children_0_4", label: "Children 0–4 yrs", field: "estimated_children_0_4" },
  { key: "children_5_14", label: "Children 5–14 yrs", field: "estimated_children_5_14" },
  { key: "adults_15_plus", label: "Adults 15+ yrs", field: "estimated_adults_15_plus" },
  { key: "trachoma_0_5m", label: "Trachoma 0–5 months", field: "trachoma_0_5_months" as keyof MicroplanEntry },
  { key: "trachoma_6m_6y", label: "Trachoma 6m–6 yrs", field: "trachoma_6m_6y" as keyof MicroplanEntry },
  { key: "trachoma_7_14y", label: "Trachoma 7–14 yrs", field: "trachoma_7_14y" as keyof MicroplanEntry },
  { key: "trachoma_15_plus", label: "Trachoma 15+ yrs", field: "trachoma_15_plus" as keyof MicroplanEntry },
];

// ─── Multi-select dropdown component ───
const MultiSelectDropdown = ({ values, onChange, options, placeholder, disabled }: {
  values: string[];
  onChange: (v: string[]) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (val: string) => {
    onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);
  };

  const label = values.length === 0 ? `All ${placeholder}s` : values.length === 1 ? values[0] : `${values.length} ${placeholder}s`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(p => !p)}
        disabled={disabled}
        className="h-7 text-[10px] px-1.5 border border-border rounded bg-background text-foreground min-w-0 w-full disabled:opacity-40 flex items-center justify-between gap-1 text-left"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-50" />
      </button>
      {open && options.length > 0 && (
        <div className="absolute z-[9999] mt-1 w-full min-w-[160px] max-h-[200px] overflow-auto bg-popover border border-border rounded-md shadow-lg p-1">
          <button
            className="w-full text-left text-[10px] px-2 py-1 hover:bg-muted rounded text-muted-foreground font-medium"
            onClick={() => { onChange([]); setOpen(false); }}
          >
            ✕ Clear all
          </button>
          <button
            className="w-full text-left text-[10px] px-2 py-1 hover:bg-muted rounded text-muted-foreground font-medium"
            onClick={() => { onChange([...options]); }}
          >
            ✓ Select all ({options.length})
          </button>
          <div className="border-t border-border my-1" />
          {options.map(o => (
            <label key={o} className="flex items-center gap-1.5 text-[10px] px-2 py-1 hover:bg-muted rounded cursor-pointer">
              <Checkbox checked={values.includes(o)} onCheckedChange={() => toggle(o)} className="h-3 w-3" />
              <span className="truncate">{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Component ───
const MicroplanMap = ({ entries, onEntryClick }: MicroplanMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any>(null);
  const exportContainerRef = useRef<HTMLDivElement>(null);
  const [activeTheme, setActiveTheme] = useState<ThematicLayer>("flhf_catchment");
  const [showBufferZones, setShowBufferZones] = useState(true);
  const [showDistanceLines, setShowDistanceLines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showSummaryPanel, setShowSummaryPanel] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  // Target Pop disaggregation config
  const [targetPopFields, setTargetPopFields] = useState<string[]>(["children_0_4", "children_5_14"]);

  const calcTargetPop = useCallback((entry: MicroplanEntry) => {
    return targetPopFields.reduce((sum, key) => {
      const fieldDef = DISAGGREGATION_FIELDS.find(f => f.key === key);
      if (!fieldDef) return sum;
      return sum + ((entry[fieldDef.field] as number) || 0);
    }, 0);
  }, [targetPopFields]);

  const targetPopLabel = useMemo(() => {
    if (targetPopFields.length === 0) return "None selected";
    if (targetPopFields.length === DISAGGREGATION_FIELDS.length) return "All Disaggregations";
    return targetPopFields.map(k => DISAGGREGATION_FIELDS.find(f => f.key === k)?.label || k).join(" + ");
  }, [targetPopFields]);

  // ─── Multi-select cascading filters ───
  const [selStates, setSelStates] = useState<string[]>([]);
  const [selLgas, setSelLgas] = useState<string[]>([]);
  const [selWards, setSelWards] = useState<string[]>([]);
  const [selFlhfs, setSelFlhfs] = useState<string[]>([]);
  const [selYears, setSelYears] = useState<string[]>([]);
  const [selCampaigns, setSelCampaigns] = useState<string[]>([]);

  // Available options — cascading
  const allStates = useMemo(() => [...new Set(entries.map(e => e.state).filter(Boolean))].sort(), [entries]);
  const allYears = useMemo(() => [...new Set(entries.map(e => e.year_of_microplanning).filter(Boolean))].map(String).sort(), [entries]);
  const allCampaigns = useMemo(() => [...new Set(entries.map(e => e.campaign_type).filter(Boolean) as string[])].sort(), [entries]);

  const lgaOptions = useMemo(() => {
    const src = selStates.length > 0 ? entries.filter(e => selStates.includes(e.state)) : entries;
    return [...new Set(src.map(e => e.lga).filter(Boolean))].sort();
  }, [entries, selStates]);

  const wardOptions = useMemo(() => {
    let src = entries;
    if (selStates.length > 0) src = src.filter(e => selStates.includes(e.state));
    if (selLgas.length > 0) src = src.filter(e => selLgas.includes(e.lga));
    return [...new Set(src.map(e => e.ward).filter(Boolean))].sort();
  }, [entries, selStates, selLgas]);

  const flhfOptions = useMemo(() => {
    let src = entries;
    if (selStates.length > 0) src = src.filter(e => selStates.includes(e.state));
    if (selLgas.length > 0) src = src.filter(e => selLgas.includes(e.lga));
    if (selWards.length > 0) src = src.filter(e => selWards.includes(e.ward));
    return [...new Set(src.map(e => e.flhf_name).filter(Boolean))].sort();
  }, [entries, selStates, selLgas, selWards]);

  // Cascade resets
  const handleStatesChange = useCallback((v: string[]) => {
    setSelStates(v);
    setSelLgas([]);
    setSelWards([]);
    setSelFlhfs([]);
  }, []);
  const handleLgasChange = useCallback((v: string[]) => {
    setSelLgas(v);
    setSelWards([]);
    setSelFlhfs([]);
  }, []);
  const handleWardsChange = useCallback((v: string[]) => {
    setSelWards(v);
    setSelFlhfs([]);
  }, []);

  // Filtered entries — responsive to ALL filters
  const cascadedEntries = useMemo(() => {
    let e = entries;
    if (selStates.length > 0) e = e.filter(x => selStates.includes(x.state));
    if (selLgas.length > 0) e = e.filter(x => selLgas.includes(x.lga));
    if (selWards.length > 0) e = e.filter(x => selWards.includes(x.ward));
    if (selFlhfs.length > 0) e = e.filter(x => selFlhfs.includes(x.flhf_name));
    if (selYears.length > 0) e = e.filter(x => x.year_of_microplanning != null && selYears.includes(String(x.year_of_microplanning)));
    if (selCampaigns.length > 0) e = e.filter(x => x.campaign_type != null && selCampaigns.includes(x.campaign_type));
    return e;
  }, [entries, selStates, selLgas, selWards, selFlhfs, selYears, selCampaigns]);

  const hasFilters = selStates.length > 0 || selLgas.length > 0 || selWards.length > 0 || selFlhfs.length > 0 || selYears.length > 0 || selCampaigns.length > 0;

  const resetZoom = () => { setSelStates([]); setSelLgas([]); setSelWards([]); setSelFlhfs([]); setSelYears([]); setSelCampaigns([]); };

  // ─── FLHF-level aggregation ───
  const flhfAggregates = useMemo(() => {
    const agg: Record<string, {
      name: string; ward: string; lga: string; state: string;
      lat: number; lng: number; totalPop: number; targetPop: number;
      communities: string[]; count: number; avgDist: number;
      points: [number, number][]; color: string;
      households: number; accessible: number; hardToReach: number;
    }> = {};
    const flhfList = [...new Set(cascadedEntries.map(e => e.flhf_name))].sort();
    cascadedEntries.forEach(e => {
      const key = e.flhf_name;
      if (!agg[key]) {
        const idx = flhfList.indexOf(key);
        agg[key] = {
          name: key, ward: e.ward, lga: e.lga, state: e.state,
          lat: e.flhf_latitude || 0, lng: e.flhf_longitude || 0,
          totalPop: 0, targetPop: 0, communities: [], count: 0, avgDist: 0,
          points: [], color: FLHF_COLORS[idx % FLHF_COLORS.length],
          households: 0, accessible: 0, hardToReach: 0,
        };
      }
      const a = agg[key];
      a.totalPop += e.estimated_total_population || 0;
      a.targetPop += calcTargetPop(e);
      a.households += (e as any).number_of_households || 0;
      a.avgDist += e.community_distance_to_flhf_km || 0;
      a.count++;
      if (!a.communities.includes(e.community_name)) a.communities.push(e.community_name);
      if (e.community_latitude && e.community_longitude) {
        a.points.push([e.community_latitude, e.community_longitude]);
      }
      if (e.flhf_latitude && e.flhf_longitude) {
        a.lat = e.flhf_latitude;
        a.lng = e.flhf_longitude;
      }
      if (e.accessibility === "accessible") a.accessible++;
      if (e.accessibility === "hard_to_reach" || e.accessibility === "inaccessible") a.hardToReach++;
    });
    Object.values(agg).forEach(a => { a.avgDist = a.count ? a.avgDist / a.count : 0; });
    return agg;
  }, [cascadedEntries, calcTargetPop]);

  // Ward aggregation for choropleth
  const wardAggregates = useMemo(() => {
    const agg: Record<string, { totalPop: number; avgDist: number; count: number; points: [number, number][]; gapScore: number }> = {};
    cascadedEntries.forEach(e => {
      if (!agg[e.ward]) agg[e.ward] = { totalPop: 0, avgDist: 0, count: 0, points: [], gapScore: 0 };
      const w = agg[e.ward];
      w.totalPop += e.estimated_total_population || 0;
      w.avgDist += e.community_distance_to_flhf_km || 0;
      w.count++;
      if (e.community_latitude && e.community_longitude) w.points.push([e.community_latitude, e.community_longitude]);
    });
    Object.entries(agg).forEach(([ward, w]) => {
      w.avgDist = w.count ? w.avgDist / w.count : 0;
      const distScore = Math.min(w.avgDist * 5, 40);
      const we = cascadedEntries.filter(e => e.ward === ward);
      const htr = we.filter(e => e.accessibility === "hard_to_reach" || e.accessibility === "inaccessible").length;
      const nc = we.filter(e => e.security_clearance === "not_cleared" || e.security_clearance === "partial").length;
      w.gapScore = Math.min(distScore + (w.count ? (htr / w.count) * 30 : 0) + (w.count ? (nc / w.count) * 30 : 0), 100);
    });
    return agg;
  }, [cascadedEntries]);

  const maxPop = useMemo(() => Math.max(...cascadedEntries.map(e => e.estimated_total_population || 0), 1), [cascadedEntries]);

  // CDD Stats
  const cddStats = useMemo(() => {
    const withCdd = cascadedEntries.filter(e => e.cdd_names && e.cdd_names.trim() && e.cdd_names !== "—");
    const from = withCdd.filter(e => e.cdd_from_community === true).length;
    const ext = withCdd.filter(e => e.cdd_from_community === false).length;
    const t = withCdd.length;
    return { from, ext, unknown: t - from - ext, total: t, pctFrom: t ? Math.round((from / t) * 100) : 0 };
  }, [cascadedEntries]);

  // State-level aggregation for the summary
  const stateAggregates = useMemo(() => {
    const agg: Record<string, { totalPop: number; targetPop: number; communities: number; flhfs: Set<string>; avgDist: number; distCount: number }> = {};
    cascadedEntries.forEach(e => {
      if (!agg[e.state]) agg[e.state] = { totalPop: 0, targetPop: 0, communities: 0, flhfs: new Set(), avgDist: 0, distCount: 0 };
      const s = agg[e.state];
      s.totalPop += e.estimated_total_population || 0;
      s.targetPop += calcTargetPop(e);
      s.communities++;
      s.flhfs.add(e.flhf_name);
      if (e.community_distance_to_flhf_km != null) {
        s.avgDist += e.community_distance_to_flhf_km;
        s.distCount++;
      }
    });
    return Object.entries(agg).map(([state, s]) => ({
      state,
      totalPop: s.totalPop,
      targetPop: s.targetPop,
      communities: s.communities,
      flhfs: s.flhfs.size,
      avgDist: s.distCount ? s.avgDist / s.distCount : 0,
    })).sort((a, b) => b.totalPop - a.totalPop);
  }, [cascadedEntries, calcTargetPop]);

  // ─── Initialize Map ───
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map(mapRef.current, { zoomControl: true, zoomSnap: 0.5 }).setView([9.0, 8.0], 6);
    mapInstanceRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 18,
    }).addTo(map);
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  // ─── Zoom to extent ───
  const zoomToExtent = useCallback(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;
    const bounds: [number, number][] = [];
    cascadedEntries.forEach(e => {
      if (e.community_latitude && e.community_longitude) bounds.push([e.community_latitude, e.community_longitude]);
      if (e.flhf_latitude && e.flhf_longitude) bounds.push([e.flhf_latitude, e.flhf_longitude]);
      if (e.settlement_latitude && e.settlement_longitude) bounds.push([e.settlement_latitude, e.settlement_longitude]);
    });
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [cascadedEntries]);

  // ─── Inject CSS for animated distance lines ───
  useEffect(() => {
    const styleId = "mp-distance-line-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes mp-dash-flow {
        to { stroke-dashoffset: -24; }
      }
      .mp-dist-line {
        animation: mp-dash-flow 1.2s linear infinite;
      }
      .mp-dist-line-glow {
        filter: drop-shadow(0 0 4px var(--glow-color, #3B82F6));
      }
      .flhf-pulse-ring {
        animation: flhf-pulse 2s ease-in-out infinite;
      }
      @keyframes flhf-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.15; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ─── Render All Layers ───
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    if (layersRef.current) layersRef.current.clearLayers();
    const group = L.layerGroup().addTo(map);
    layersRef.current = group;

    const bounds: [number, number][] = [];
    const flhfDrawn = new Set<string>();

    // ── Collect points per FLHF for catchment polygons ──
    const flhfPolygons: Record<string, [number, number][]> = {};
    const wardPolygons: Record<string, [number, number][]> = {};
    cascadedEntries.forEach(e => {
      if (e.community_latitude && e.community_longitude) {
        const key = e.flhf_name;
        if (!flhfPolygons[key]) flhfPolygons[key] = [];
        flhfPolygons[key].push([e.community_latitude, e.community_longitude]);
        if (e.flhf_latitude && e.flhf_longitude) {
          const fPt: [number, number] = [e.flhf_latitude, e.flhf_longitude];
          if (!flhfPolygons[key].some(p => p[0] === fPt[0] && p[1] === fPt[1])) {
            flhfPolygons[key].push(fPt);
          }
        }
        if (!wardPolygons[e.ward]) wardPolygons[e.ward] = [];
        wardPolygons[e.ward].push([e.community_latitude, e.community_longitude]);
      }
    });

    // ── FLHF Catchment Areas ──
    if (activeTheme === "flhf_catchment") {
      Object.entries(flhfPolygons).forEach(([flhf, points]) => {
        const agg = flhfAggregates[flhf];
        if (!agg) return;
        const color = agg.color;
        if (points.length >= 3) {
          const hull = computeConvexHull(points);
          const expanded = expandPolygon(hull, 0.012);
          if (expanded.length >= 3) {
            L.polygon(expanded, {
              color, weight: 2.5, opacity: 0.9, fillColor: color, fillOpacity: 0.20,
              dashArray: agg.hardToReach > 0 ? "8 4" : undefined,
            }).addTo(group).bindTooltip(
              `<div style="font-family:system-ui;min-width:180px;padding:4px">
                <strong style="font-size:13px;color:${color}">${flhf}</strong><br/>
                <span style="font-size:11px;color:#6B7280">${agg.ward}, ${agg.lga}, ${agg.state}</span>
                <hr style="margin:4px 0;border-color:#E5E7EB"/>
                <table style="font-size:11px;width:100%">
                  <tr><td style="color:#6B7280">Communities</td><td style="text-align:right;font-weight:700">${agg.count}</td></tr>
                  <tr><td style="color:#6B7280">Total Pop</td><td style="text-align:right;font-weight:700">${agg.totalPop.toLocaleString()}</td></tr>
                  <tr><td style="color:#6B7280">Target Pop</td><td style="text-align:right;font-weight:700;color:#2563EB">${agg.targetPop.toLocaleString()}</td></tr>
                  <tr><td style="color:#6B7280">Avg Distance</td><td style="text-align:right;font-weight:700">${agg.avgDist.toFixed(1)} km</td></tr>
                </table>
              </div>`,
              { direction: "top", sticky: true }
            );
          }
        } else if (points.length >= 1) {
          const center = points[0];
          L.circle(center, {
            radius: 4000, color, weight: 2.5, fillColor: color, fillOpacity: 0.18,
          }).addTo(group);
        }
      });
    }

    // ── Ward-level choropleth ──
    if (["pop_density", "distance_choropleth", "coverage_gap"].includes(activeTheme)) {
      Object.entries(wardPolygons).forEach(([ward, points]) => {
        if (points.length < 3) return;
        const hull = computeConvexHull(points);
        const expanded = expandPolygon(hull, 0.008);
        if (expanded.length < 3) return;
        const wagg = wardAggregates[ward];
        if (!wagg) return;
        let fillColor = "#6B7280";
        let tip = ward;
        if (activeTheme === "pop_density") {
          fillColor = getDensityColor(wagg.totalPop);
          tip = `<div style="font-family:system-ui"><b>${ward}</b><br/>Population: <b>${wagg.totalPop.toLocaleString()}</b><br/>${wagg.count} communities</div>`;
        } else if (activeTheme === "distance_choropleth") {
          fillColor = getDistanceColor(wagg.avgDist);
          tip = `<div style="font-family:system-ui"><b>${ward}</b><br/>Avg Distance: <b>${wagg.avgDist.toFixed(1)} km</b><br/>${wagg.count} communities</div>`;
        } else if (activeTheme === "coverage_gap") {
          fillColor = getCoverageGapColor(wagg.gapScore);
          tip = `<div style="font-family:system-ui"><b>${ward}</b><br/>Gap Score: <b>${Math.round(wagg.gapScore)}/100</b><br/>Pop: ${wagg.totalPop.toLocaleString()}</div>`;
        }
        L.polygon(expanded, {
          color: fillColor, weight: 2.5, opacity: 0.9, fillColor, fillOpacity: 0.35,
        }).addTo(group).bindTooltip(tip, { direction: "center", sticky: true });
        if (showLabels) {
          const centroid = hull.reduce((a, p) => [a[0] + p[0] / hull.length, a[1] + p[1] / hull.length] as [number, number], [0, 0] as [number, number]);
          L.marker(centroid, {
            icon: L.divIcon({
              className: "choropleth-label",
              html: `<div style="font-size:9px;font-weight:800;color:#1F2937;text-shadow:0 0 4px #fff,0 0 4px #fff,0 0 6px #fff;white-space:nowrap;text-align:center">${ward}</div>`,
              iconSize: [100, 16], iconAnchor: [50, 8],
            }), interactive: false,
          }).addTo(group);
        }
      });
    }

    // ── Plot entries ──
    cascadedEntries.forEach(entry => {
      const cLat = entry.community_latitude;
      const cLng = entry.community_longitude;
      const fLat = entry.flhf_latitude;
      const fLng = entry.flhf_longitude;
      const sLat = entry.settlement_latitude;
      const sLng = entry.settlement_longitude;

      let mColor = "#2563EB";
      let mEmoji = "";
      const flhfAgg = flhfAggregates[entry.flhf_name];
      if (activeTheme === "flhf_catchment" && flhfAgg) mColor = flhfAgg.color;
      else if (activeTheme === "distance") mColor = getDistanceColor(entry.community_distance_to_flhf_km);
      else if (activeTheme === "accessibility" && entry.accessibility) mColor = ACCESS_COLORS[entry.accessibility]?.color || mColor;
      else if (activeTheme === "security" && entry.security_clearance) mColor = SECURITY_COLORS[entry.security_clearance]?.color || "#6B7280";
      else if (activeTheme === "terrain" && entry.terrain_type) {
        mColor = TERRAIN_ICONS[entry.terrain_type]?.color || mColor;
        mEmoji = TERRAIN_ICONS[entry.terrain_type]?.emoji || "";
      }
      else if (activeTheme === "cdd_origin") mColor = entry.cdd_from_community === true ? "#059669" : entry.cdd_from_community === false ? "#DC2626" : "#6B7280";
      else if (activeTheme === "population") mColor = getPopulationColor(entry.estimated_total_population, maxPop);

      const radius = entry.estimated_total_population
        ? Math.max(5, Math.min(18, Math.sqrt(entry.estimated_total_population) / 6))
        : 5;

      // Community marker
      if (cLat && cLng) {
        const popLabel = entry.estimated_total_population ? entry.estimated_total_population.toLocaleString() : "";
        if (activeTheme === "terrain" && mEmoji) {
          L.marker([cLat, cLng], {
            icon: L.divIcon({
              className: "mp-terrain",
              html: `<div style="font-size:16px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">${mEmoji}</div>`,
              iconSize: [22, 22], iconAnchor: [11, 11],
            }),
          }).addTo(group).bindPopup(buildPopup(entry));
        } else if (activeTheme === "population") {
          const pR = entry.estimated_total_population ? Math.max(6, Math.min(24, Math.sqrt(entry.estimated_total_population) / 4)) : 6;
          L.circleMarker([cLat, cLng], {
            radius: pR, fillColor: mColor, color: "#fff", weight: 1.5, fillOpacity: 0.55, opacity: 0.9,
          }).addTo(group).bindPopup(buildPopup(entry));
        } else {
          L.marker([cLat, cLng], {
            icon: L.divIcon({
              className: "comm-icon",
              html: `<div style="
                width:${radius * 2}px;height:${radius * 2}px;
                background:${mColor};
                border:2px solid #fff;
                border-radius:3px;
                transform:rotate(45deg);
                box-shadow:0 2px 6px rgba(0,0,0,0.35);
                position:relative;
              "><div style="
                position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                transform:rotate(-45deg);font-size:${Math.max(8, radius - 2)}px;color:#fff;font-weight:700;line-height:1;
              ">🏘</div></div>`,
              iconSize: [radius * 2, radius * 2],
              iconAnchor: [radius, radius],
              popupAnchor: [0, -radius],
            }),
            zIndexOffset: 500,
          }).addTo(group).bindPopup(buildPopup(entry));
          if (showLabels) {
            L.marker([cLat, cLng], {
              icon: L.divIcon({
                className: "comm-lbl",
                html: `<div style="font-size:9px;font-weight:600;color:#1E293B;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 5px #fff;white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis;text-align:center">${entry.community_name}${popLabel ? ` <span style='color:#6B7280;font-weight:400'>(${popLabel})</span>` : ""}</div>`,
                iconSize: [100, 14], iconAnchor: [50, -radius - 4],
              }), interactive: false,
            }).addTo(group);
          }
        }
        bounds.push([cLat, cLng]);

        // ── Beautiful distance lines ──
        if (showDistanceLines && fLat && fLng) {
          const dk = entry.community_distance_to_flhf_km;
          const lc = activeTheme === "distance" ? getDistanceColor(dk) : (activeTheme === "flhf_catchment" && flhfAgg ? flhfAgg.color : "#3B82F6");

          // Glow/shadow line underneath
          L.polyline([[cLat, cLng], [fLat, fLng]], {
            color: lc, weight: 6, opacity: 0.15,
            lineCap: "round",
            className: "mp-dist-line-glow",
          }).addTo(group);

          // Main animated dashed line
          L.polyline([[cLat, cLng], [fLat, fLng]], {
            color: lc,
            weight: activeTheme === "distance" ? 3 : 2,
            dashArray: "8 12",
            opacity: activeTheme === "distance" ? 0.95 : 0.6,
            lineCap: "round",
            className: "mp-dist-line",
          }).addTo(group);

          // Small dot at community end
          L.circleMarker([cLat, cLng], {
            radius: 3, fillColor: lc, color: "#fff", weight: 1, fillOpacity: 0.9,
          }).addTo(group);

          // Distance label pill at midpoint
          if (dk != null) {
            const mLat = (cLat + fLat) / 2, mLng = (cLng + fLng) / 2;
            L.marker([mLat, mLng], {
              icon: L.divIcon({
                className: "dist-lbl",
                html: `<div style="
                  background:${lc};color:#fff;font-size:9px;padding:2px 6px;
                  border-radius:10px;font-weight:700;white-space:nowrap;
                  box-shadow:0 2px 8px rgba(0,0,0,0.35),0 0 0 2px rgba(255,255,255,0.6);
                  letter-spacing:0.3px;
                ">${dk} km</div>`,
                iconSize: [50, 18], iconAnchor: [25, 9],
              }), interactive: false,
            }).addTo(group);
          }
        }
      }

      // FLHF marker
      if (fLat && fLng) {
        const fKey = `${fLat.toFixed(4)},${fLng.toFixed(4)}`;
        if (!flhfDrawn.has(fKey)) {
          flhfDrawn.add(fKey);
          if (showBufferZones || activeTheme === "catchment_buffers") {
            CATCHMENT_BUFFERS.slice().reverse().forEach(buf => {
              L.circle([fLat, fLng], {
                radius: buf.radiusKm * 1000, color: buf.color, weight: 1.5,
                opacity: 0.5, fillColor: buf.color, fillOpacity: buf.opacity, dashArray: buf.dash,
              }).addTo(group).bindTooltip(`${entry.flhf_name} — ${buf.label}`, { direction: "center" });
            });
          }
          const bgColor = (activeTheme === "flhf_catchment" && flhfAgg) ? flhfAgg.color : "#DC2626";
          const commCount = flhfAgg?.count || 0;
          const totalPop = flhfAgg?.totalPop || 0;
          L.circleMarker([fLat, fLng], {
            radius: 18, fillColor: bgColor, color: bgColor, weight: 2,
            fillOpacity: 0.12, opacity: 0.4,
            className: "flhf-pulse-ring",
          }).addTo(group);
          L.marker([fLat, fLng], {
            icon: L.divIcon({
              className: "flhf-icon",
              html: `<div style="
                background:${bgColor};color:#fff;width:32px;height:32px;
                border-radius:6px;display:flex;align-items:center;justify-content:center;
                font-size:16px;font-weight:bold;
                border:3px solid #fff;
                box-shadow:0 3px 12px rgba(0,0,0,0.5),0 0 0 2px ${bgColor}40;
                position:relative;
              "><span style="filter:drop-shadow(0 1px 1px rgba(0,0,0,0.3))">🏥</span></div>`,
              iconSize: [32, 32], iconAnchor: [16, 16],
              popupAnchor: [0, -18],
            }), zIndexOffset: 2000,
          }).addTo(group).bindPopup(buildFlhfPopup(entry, flhfAgg));
          if (showLabels) {
            L.marker([fLat, fLng], {
              icon: L.divIcon({
                className: "flhf-lbl",
                html: `<div style="
                  background:${bgColor};color:#fff;font-size:10px;font-weight:700;
                  padding:2px 8px;border-radius:10px;white-space:nowrap;
                  box-shadow:0 2px 6px rgba(0,0,0,0.3);text-align:center;
                  max-width:140px;overflow:hidden;text-overflow:ellipsis;
                ">${entry.flhf_name}<span style="font-weight:400;opacity:0.85;margin-left:4px">(${commCount}c / ${totalPop.toLocaleString()}p)</span></div>`,
                iconSize: [140, 18], iconAnchor: [70, -20],
              }), interactive: false,
            }).addTo(group);
          }
          bounds.push([fLat, fLng]);
        }
      }

      // Settlement marker
      if (sLat && sLng) {
        let sC = "#8B5CF6";
        if (activeTheme === "distance") sC = getDistanceColor(entry.settlement_distance_to_flhf_km);
        if (activeTheme === "accessibility" && entry.accessibility) sC = ACCESS_COLORS[entry.accessibility]?.color || sC;
        if (activeTheme === "flhf_catchment" && flhfAgg) sC = flhfAgg.color;
        L.marker([sLat, sLng], {
          icon: L.divIcon({
            className: "settle-icon",
            html: `<div style="
              width:0;height:0;
              border-left:7px solid transparent;
              border-right:7px solid transparent;
              border-top:12px solid ${sC};
              filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35));
              position:relative;
            "><div style="
              position:absolute;top:-14px;left:-4px;width:8px;height:3px;
              background:${sC};border-radius:1px;
            "></div></div>`,
            iconSize: [14, 15], iconAnchor: [7, 15],
            popupAnchor: [0, -15],
          }),
          zIndexOffset: 300,
        }).addTo(group).bindPopup(buildPopup(entry, "settlement"));
        if (showLabels && entry.settlement_name) {
          L.marker([sLat, sLng], {
            icon: L.divIcon({
              className: "settle-lbl",
              html: `<div style="font-size:8px;color:#7C3AED;font-style:italic;text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;text-align:center">${entry.settlement_name}</div>`,
              iconSize: [80, 12], iconAnchor: [40, -4],
            }), interactive: false,
          }).addTo(group);
        }
        bounds.push([sLat, sLng]);
      }
    });

    // Fit to data extent
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [cascadedEntries, activeTheme, showBufferZones, showDistanceLines, showLabels, flhfAggregates, wardAggregates, maxPop]);

  // ─── Popup builders ───
  const buildPopup = (e: MicroplanEntry, type: "community" | "settlement" = "community") => {
    const name = type === "community" ? e.community_name : (e.settlement_name || "Settlement");
    const dist = type === "community" ? e.community_distance_to_flhf_km : e.settlement_distance_to_flhf_km;
    const typeBadge = type === "community"
      ? `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:9px;font-weight:700;background:#2563EB20;color:#2563EB;margin-bottom:4px">🏘 COMMUNITY</span>`
      : `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:9px;font-weight:700;background:#8B5CF620;color:#8B5CF6;margin-bottom:4px">▼ SETTLEMENT</span>`;
    const ab = e.accessibility ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:${ACCESS_COLORS[e.accessibility]?.color || '#6B7280'}20;color:${ACCESS_COLORS[e.accessibility]?.color || '#6B7280'}">${e.accessibility.replace(/_/g, " ")}</span>` : "";
    const sb = e.security_clearance ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:${SECURITY_COLORS[e.security_clearance]?.color || '#6B7280'}20;color:${SECURITY_COLORS[e.security_clearance]?.color || '#6B7280'}">${e.security_clearance.replace(/_/g, " ")}</span>` : "";
    return `<div style="min-width:240px;font-family:system-ui;font-size:12px">
      ${typeBadge}
      <div style="font-size:15px;font-weight:700;margin-bottom:2px">${name}</div>
      ${type === "community" && e.settlement_name ? `<span style="color:#666;font-size:11px">Settlement: ${e.settlement_name}</span><br/>` : ""}
      <hr style="margin:6px 0;border-color:#eee"/>
      <div style="line-height:1.8">
        <b>FLHF:</b> 🏥 ${e.flhf_name}<br/>
        <b>Location:</b> ${e.ward}, ${e.lga}, ${e.state}<br/>
        ${e.estimated_total_population ? `<b>Pop:</b> <span style="font-weight:700;color:#2563EB">${e.estimated_total_population.toLocaleString()}</span>` : ""}
        ${(e as any).number_of_households ? ` · <b>HH:</b> ${(e as any).number_of_households.toLocaleString()}` : ""}<br/>
        ${dist != null ? `<b>Dist to FLHF:</b> <span style="font-weight:600">${dist} km</span><br/>` : ""}
        ${ab ? `<div style="margin:3px 0">${ab}</div>` : ""}
        ${e.terrain_type ? `<b>Terrain:</b> ${TERRAIN_ICONS[e.terrain_type]?.emoji || ""} ${e.terrain_type}<br/>` : ""}
        ${sb ? `<div style="margin:3px 0">${sb}</div>` : ""}
        ${e.cdd_from_community != null ? `<b>CDD Local:</b> <span style="color:${e.cdd_from_community ? '#059669' : '#DC2626'};font-weight:600">${e.cdd_from_community ? "Yes ✓" : "No ✗"}</span>` : ""}
        ${e.year_of_microplanning ? `<br/><b>Year:</b> ${e.year_of_microplanning}` : ""}
        ${e.campaign_type ? ` · <b>Campaign:</b> ${e.campaign_type}` : ""}
      </div></div>`;
  };

  const buildFlhfPopup = (e: MicroplanEntry, agg: any) => {
    return `<div style="min-width:260px;font-family:system-ui">
      <span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:9px;font-weight:700;background:#DC262620;color:#DC2626;margin-bottom:4px">🏥 HEALTH FACILITY</span>
      <div style="font-size:16px;font-weight:800;margin-bottom:2px">${e.flhf_name}</div>
      <div style="font-size:11px;color:#6B7280;margin-bottom:6px">${e.ward} · ${e.lga} · ${e.state}</div>
      <hr style="margin:4px 0;border-color:#eee"/>
      ${agg ? `<table style="font-size:12px;width:100%;line-height:2">
        <tr><td style="color:#6B7280">Communities served</td><td style="text-align:right;font-weight:700">${agg.count}</td></tr>
        <tr><td style="color:#6B7280">Total population</td><td style="text-align:right;font-weight:700">${agg.totalPop.toLocaleString()}</td></tr>
        <tr><td style="color:#6B7280">Target pop</td><td style="text-align:right;font-weight:700;color:#2563EB">${agg.targetPop.toLocaleString()}</td></tr>
        <tr><td style="color:#6B7280">Households</td><td style="text-align:right;font-weight:700">${agg.households.toLocaleString()}</td></tr>
        <tr><td style="color:#6B7280">Avg distance</td><td style="text-align:right;font-weight:700">${agg.avgDist.toFixed(1)} km</td></tr>
        <tr><td style="color:#6B7280">Hard to reach</td><td style="text-align:right;font-weight:700;color:${agg.hardToReach > 0 ? '#DC2626' : '#059669'}">${agg.hardToReach} / ${agg.count}</td></tr>
      </table>` : ""}
    </div>`;
  };

  // ─── PDF Export ───
  const handleExportPDF = async () => {
    if (!mapRef.current) return;
    setExportingPDF(true);
    try {
      const mapCanvas = await html2canvas(mapRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
      });

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;

      // ─── PAGE 1: Header + Map ───
      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, pageW, 16, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("Geo-Enabled Microplanning Report", margin, 10);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      const filterParts = [];
      if (selStates.length) filterParts.push(`States: ${selStates.join(", ")}`);
      if (selLgas.length) filterParts.push(`LGAs: ${selLgas.join(", ")}`);
      if (selWards.length) filterParts.push(`Wards: ${selWards.join(", ")}`);
      if (selFlhfs.length) filterParts.push(`FLHFs: ${selFlhfs.join(", ")}`);
      if (selYears.length) filterParts.push(`Years: ${selYears.join(", ")}`);
      if (selCampaigns.length) filterParts.push(`Campaigns: ${selCampaigns.join(", ")}`);
      const filterLabel = filterParts.length > 0 ? filterParts.join(" → ") : "All Locations";
      pdf.text(`${filterLabel}  |  ${cascadedEntries.length} entries  |  ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, margin, 14);
      const themeLabel = themeButtons.find(t => t.key === activeTheme)?.label || activeTheme;
      pdf.text(`Active Layer: ${themeLabel}`, pageW - margin, 14, { align: "right" });

      const mapImgData = mapCanvas.toDataURL("image/png");
      const mapAspect = mapCanvas.width / mapCanvas.height;
      const mapW = pageW - margin * 2;
      const mapH = Math.min(mapW / mapAspect, pageH - 50);
      pdf.addImage(mapImgData, "PNG", margin, 18, mapW, mapH);

      const legendY = 18 + mapH + 3;
      if (legendY < pageH - 10) {
        pdf.setFontSize(7);
        pdf.setTextColor(107, 114, 128);
        pdf.text("◆ Community   🏥 FLHF   ▼ Settlement   --- Distance Line", margin, legendY);
        pdf.text("Generated by ACG Collect — Geo-Microplanning Module", pageW - margin, legendY, { align: "right" });
      }

      // ─── PAGE 2: FLHF Summary Table ───
      pdf.addPage("a4", "landscape");
      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, pageW, 14, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text("Health Facility Summary", margin, 9);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(filterLabel, pageW - margin, 9, { align: "right" });

      let y = 20;
      const kpiW = (pageW - margin * 2) / 4;
      const kpis = [
        { label: "Total Population", value: summaryTotals.pop.toLocaleString(), color: [37, 99, 235] },
        { label: `Target Population (${targetPopFields.length} fields)`, value: summaryTotals.target.toLocaleString(), color: [5, 150, 105] },
        { label: "Communities", value: String(summaryTotals.communities), color: [217, 119, 6] },
        { label: "Health Facilities", value: String(flhfSummaryData.length), color: [220, 38, 38] },
      ];
      kpis.forEach((kpi, i) => {
        const x = margin + i * kpiW;
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(x, y, kpiW - 3, 14, 2, 2, "F");
        pdf.setTextColor(107, 114, 128);
        pdf.setFontSize(7);
        pdf.text(kpi.label, x + 3, y + 5);
        pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text(kpi.value, x + 3, y + 12);
        pdf.setFont("helvetica", "normal");
      });

      y += 20;
      const cols = [
        { header: "Health Facility", width: 55 },
        { header: "State", width: 28 },
        { header: "LGA", width: 30 },
        { header: "Ward", width: 32 },
        { header: "Communities", width: 22 },
        { header: "Total Pop", width: 25 },
        { header: "Target Pop", width: 25 },
        { header: "Households", width: 22 },
        { header: "Avg Dist (km)", width: 25 },
        { header: "Accessible", width: 20 },
      ];

      pdf.setFillColor(30, 41, 59);
      const tableW = cols.reduce((s, c) => s + c.width, 0);
      const tableX = margin;
      pdf.rect(tableX, y, tableW, 7, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(6.5);
      pdf.setFont("helvetica", "bold");
      let cx = tableX;
      cols.forEach(col => { pdf.text(col.header, cx + 1.5, y + 4.5); cx += col.width; });
      y += 7;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      const maxRowsPerPage = Math.floor((pageH - y - 10) / 5.5);
      let rowCount = 0;

      flhfSummaryData.forEach((a, idx) => {
        if (rowCount >= maxRowsPerPage) {
          pdf.addPage("a4", "landscape");
          y = 10; rowCount = 0;
          pdf.setFillColor(30, 41, 59);
          pdf.rect(tableX, y, tableW, 7, "F");
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(6.5);
          pdf.setFont("helvetica", "bold");
          cx = tableX;
          cols.forEach(col => { pdf.text(col.header, cx + 1.5, y + 4.5); cx += col.width; });
          y += 7;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6.5);
        }

        if (idx % 2 === 0) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(tableX, y, tableW, 5.5, "F");
        }
        const rgb = hexToRgb(a.color);
        pdf.setFillColor(rgb.r, rgb.g, rgb.b);
        pdf.rect(tableX + 1, y + 1, 2, 3.5, "F");

        pdf.setTextColor(30, 41, 59);
        const rowData = [
          a.name.length > 28 ? a.name.slice(0, 26) + "…" : a.name,
          a.state,
          a.lga.length > 14 ? a.lga.slice(0, 12) + "…" : a.lga,
          a.ward.length > 16 ? a.ward.slice(0, 14) + "…" : a.ward,
          String(a.count),
          a.totalPop.toLocaleString(),
          a.targetPop.toLocaleString(),
          String(a.households),
          a.avgDist.toFixed(1),
          `${a.accessible}/${a.count}`,
        ];
        cx = tableX;
        rowData.forEach((val, ci) => {
          pdf.text(val, cx + (ci === 0 ? 5 : 1.5), y + 4);
          cx += cols[ci].width;
        });
        y += 5.5; rowCount++;
      });

      pdf.setFillColor(226, 232, 240);
      pdf.rect(tableX, y, tableW, 6, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(15, 23, 42);
      cx = tableX;
      const totals = ["TOTAL", "", "", "", String(summaryTotals.communities), summaryTotals.pop.toLocaleString(), summaryTotals.target.toLocaleString(), String(summaryTotals.hh), "", ""];
      totals.forEach((val, ci) => { pdf.text(val, cx + (ci === 0 ? 5 : 1.5), y + 4.5); cx += cols[ci].width; });

      // ─── PAGE 3: State-Level Summary ───
      if (selStates.length !== 1 && stateAggregates.length > 1) {
        pdf.addPage("a4", "landscape");
        pdf.setFillColor(15, 23, 42);
        pdf.rect(0, 0, pageW, 14, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text("State-Level Summary", margin, 9);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.text(`${stateAggregates.length} States/FCT`, pageW - margin, 9, { align: "right" });

        y = 20;
        const stateCols = [
          { header: "State", width: 35 },
          { header: "FLHFs", width: 20 },
          { header: "Communities", width: 25 },
          { header: "Total Pop", width: 30 },
          { header: "Target Pop", width: 35 },
          { header: "Avg Dist (km)", width: 28 },
        ];
        const stateTableW = stateCols.reduce((s, c) => s + c.width, 0);
        pdf.setFillColor(30, 41, 59);
        pdf.rect(tableX, y, stateTableW, 7, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "bold");
        cx = tableX;
        stateCols.forEach(col => { pdf.text(col.header, cx + 2, y + 4.5); cx += col.width; });
        y += 7;

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        stateAggregates.forEach((sa, idx) => {
          if (idx % 2 === 0) {
            pdf.setFillColor(248, 250, 252);
            pdf.rect(tableX, y, stateTableW, 5.5, "F");
          }
          pdf.setTextColor(30, 41, 59);
          cx = tableX;
          const sRow = [sa.state, String(sa.flhfs), String(sa.communities), sa.totalPop.toLocaleString(), sa.targetPop.toLocaleString(), sa.avgDist.toFixed(1)];
          sRow.forEach((val, ci) => { pdf.text(val, cx + 2, y + 4); cx += stateCols[ci].width; });
          y += 5.5;
        });

        pdf.setFillColor(226, 232, 240);
        pdf.rect(tableX, y, stateTableW, 6, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(15, 23, 42);
        cx = tableX;
        const grandTotals = ["TOTAL", String(stateAggregates.reduce((s, a) => s + a.flhfs, 0)), String(stateAggregates.reduce((s, a) => s + a.communities, 0)), stateAggregates.reduce((s, a) => s + a.totalPop, 0).toLocaleString(), stateAggregates.reduce((s, a) => s + a.targetPop, 0).toLocaleString(), ""];
        grandTotals.forEach((val, ci) => { pdf.text(val, cx + 2, y + 4.5); cx += stateCols[ci].width; });
      }

      pdf.save(`Microplan-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF report exported successfully");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error("Failed to export PDF report");
    } finally {
      setExportingPDF(false);
    }
  };

  // ─── Theme Buttons ───
  const themeButtons: { key: ThematicLayer; label: string; icon: string }[] = [
    { key: "flhf_catchment", label: "FLHF Areas", icon: "🏥" },
    { key: "catchment_buffers", label: "Buffers", icon: "🎯" },
    { key: "distance", label: "Distance", icon: "📏" },
    { key: "pop_density", label: "Pop Density", icon: "🗺️" },
    { key: "distance_choropleth", label: "Dist Map", icon: "📐" },
    { key: "coverage_gap", label: "Coverage Gap", icon: "🔍" },
    { key: "accessibility", label: "Access", icon: "🚧" },
    { key: "security", label: "Security", icon: "🛡️" },
    { key: "terrain", label: "Terrain", icon: "⛰️" },
    { key: "population", label: "Population", icon: "👥" },
    { key: "cdd_origin", label: "CDD Origin", icon: "👤" },
  ];

  // ─── FLHF Summary Table ───
  const flhfSummaryData = useMemo(() =>
    Object.values(flhfAggregates).sort((a, b) => b.totalPop - a.totalPop),
    [flhfAggregates]
  );
  const summaryTotals = useMemo(() => ({
    pop: flhfSummaryData.reduce((s, a) => s + a.totalPop, 0),
    target: flhfSummaryData.reduce((s, a) => s + a.targetPop, 0),
    communities: flhfSummaryData.reduce((s, a) => s + a.count, 0),
    hh: flhfSummaryData.reduce((s, a) => s + a.households, 0),
  }), [flhfSummaryData]);

  const mapHeight = isFullscreen ? "h-[calc(100vh-220px)]" : mapExpanded ? "h-[700px] md:h-[800px]" : "h-[400px] md:h-[550px]";

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const el = fullscreenRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(t);
  }, [mapExpanded, isFullscreen, showSummaryPanel]);

  return (
    <Card className={`border-border/50 overflow-hidden ${isFullscreen ? "rounded-none border-0 h-screen overflow-auto bg-background" : ""}`} ref={(el) => { (exportContainerRef as any).current = el; (fullscreenRef as any).current = el; }}>
      <CardHeader className="pb-2 px-3 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Map className="h-4 w-4 text-primary" />
            Geo-enabled Microplan Map
            <Badge variant="outline" className="text-[9px] ml-1">{cascadedEntries.length} entries</Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={zoomToExtent} title="Zoom to full extent">
              <Focus className="h-3.5 w-3.5 mr-1" />
              Extent
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={handleExportPDF} disabled={exportingPDF} title="Export as PDF report">
              {exportingPDF ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
              PDF Report
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSummaryPanel(p => !p)} title="Toggle summary panel">
              <BarChart3 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMapExpanded(p => !p)} title="Expand map">
              {mapExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleFullscreen} title="Fullscreen">
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5 text-primary" /> : <Maximize2 className="h-3.5 w-3.5 text-primary" />}
            </Button>
          </div>
        </div>

        {/* Thematic layer buttons */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {themeButtons.map(t => (
            <Button
              key={t.key}
              variant={activeTheme === t.key ? "default" : "outline"}
              size="sm"
              className="text-[10px] h-7 px-2 flex-shrink-0 min-h-[28px]"
              onClick={() => setActiveTheme(prev => prev === t.key ? "none" : t.key)}
            >
              {t.icon} {t.label}
            </Button>
          ))}
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <Switch checked={showBufferZones} onCheckedChange={setShowBufferZones} className="scale-75" />
            Buffer Zones
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <Switch checked={showDistanceLines} onCheckedChange={setShowDistanceLines} className="scale-75" />
            Distance Lines
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <Switch checked={showLabels} onCheckedChange={setShowLabels} className="scale-75" />
            Labels
          </label>
          {/* Target Pop config */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1 ml-auto">
                <Settings2 className="h-3 w-3" />
                Target Pop: <span className="font-semibold text-primary max-w-[120px] truncate">{targetPopFields.length} field{targetPopFields.length !== 1 ? "s" : ""}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-foreground">Target Population = sum of:</div>
                <p className="text-[10px] text-muted-foreground leading-tight">Select which disaggregation fields should aggregate into the Target Pop metric.</p>
                <div className="space-y-1.5 pt-1">
                  {DISAGGREGATION_FIELDS.map(f => (
                    <label key={f.key} className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1">
                      <Checkbox
                        checked={targetPopFields.includes(f.key)}
                        onCheckedChange={(checked) => {
                          setTargetPopFields(prev =>
                            checked ? [...prev, f.key] : prev.filter(k => k !== f.key)
                          );
                        }}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-foreground">{f.label}</span>
                    </label>
                  ))}
                </div>
                <div className="border-t border-border pt-2 mt-2 flex items-center justify-between">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setTargetPopFields(["children_0_4", "children_5_14"])}>Reset Default</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setTargetPopFields(DISAGGREGATION_FIELDS.map(f => f.key))}>Select All</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Multi-select cascading filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1.5">
          <MultiSelectDropdown values={selStates} onChange={handleStatesChange} options={allStates} placeholder="State" />
          <MultiSelectDropdown values={selLgas} onChange={handleLgasChange} options={lgaOptions} placeholder="LGA" disabled={allStates.length === 0} />
          <MultiSelectDropdown values={selWards} onChange={handleWardsChange} options={wardOptions} placeholder="Ward" disabled={lgaOptions.length === 0} />
          <MultiSelectDropdown values={selFlhfs} onChange={setSelFlhfs} options={flhfOptions} placeholder="FLHF" disabled={flhfOptions.length === 0} />
          {allYears.length > 0 && (
            <MultiSelectDropdown values={selYears} onChange={setSelYears} options={allYears} placeholder="Year" />
          )}
          {allCampaigns.length > 0 && (
            <MultiSelectDropdown values={selCampaigns} onChange={setSelCampaigns} options={allCampaigns} placeholder="Campaign" />
          )}
        </div>
        {hasFilters && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] w-fit" onClick={resetZoom}>
              <X className="h-3 w-3 mr-1" />
              Clear All Filters
            </Button>
            {selStates.map(s => <Badge key={s} variant="secondary" className="text-[9px] h-5 gap-1 cursor-pointer" onClick={() => setSelStates(p => p.filter(v => v !== s))}>{s} <X className="h-2.5 w-2.5" /></Badge>)}
            {selLgas.map(s => <Badge key={s} variant="secondary" className="text-[9px] h-5 gap-1 cursor-pointer" onClick={() => setSelLgas(p => p.filter(v => v !== s))}>{s} <X className="h-2.5 w-2.5" /></Badge>)}
            {selWards.map(s => <Badge key={s} variant="secondary" className="text-[9px] h-5 gap-1 cursor-pointer" onClick={() => setSelWards(p => p.filter(v => v !== s))}>{s} <X className="h-2.5 w-2.5" /></Badge>)}
            {selFlhfs.map(s => <Badge key={s} variant="secondary" className="text-[9px] h-5 gap-1 cursor-pointer" onClick={() => setSelFlhfs(p => p.filter(v => v !== s))}>{s} <X className="h-2.5 w-2.5" /></Badge>)}
            {selYears.map(s => <Badge key={s} variant="outline" className="text-[9px] h-5 gap-1 cursor-pointer" onClick={() => setSelYears(p => p.filter(v => v !== s))}>{s} <X className="h-2.5 w-2.5" /></Badge>)}
            {selCampaigns.map(s => <Badge key={s} variant="outline" className="text-[9px] h-5 gap-1 cursor-pointer" onClick={() => setSelCampaigns(p => p.filter(v => v !== s))}>{s} <X className="h-2.5 w-2.5" /></Badge>)}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {/* CDD Analytics */}
        <div className="px-3 py-1.5 border-b border-border/30 flex items-center gap-3 flex-wrap text-[10px]">
          <span className="font-semibold text-muted-foreground">👤 CDD:</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
            Local: <b>{cddStats.from}</b> ({cddStats.pctFrom}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-600 inline-block" />
            External: <b>{cddStats.ext}</b>
          </span>
          {cddStats.total > 0 && (
            <div className="flex-1 min-w-[60px] max-w-[140px] h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full flex">
                <div className="bg-emerald-600 h-full" style={{ width: `${cddStats.pctFrom}%` }} />
                <div className="bg-red-600 h-full" style={{ width: `${100 - cddStats.pctFrom - (cddStats.total ? (cddStats.unknown / cddStats.total) * 100 : 0)}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Map + Summary Panel */}
        <div className={`flex ${showSummaryPanel ? "flex-col lg:flex-row" : ""}`}>
          <div ref={mapRef} className={`${mapHeight} ${showSummaryPanel ? "lg:flex-1" : "w-full"} relative z-0`} />

          {/* Summary panel */}
          {showSummaryPanel && (
            <div className="lg:w-[320px] border-t lg:border-t-0 lg:border-l border-border/30 overflow-auto max-h-[400px] lg:max-h-none bg-background">
              <div className="p-3 space-y-3">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-foreground">
                    {selWards.length === 1 ? selWards[0] : selLgas.length === 1 ? selLgas[0] : selStates.length === 1 ? selStates[0] : "Nigeria Overview"}
                  </h3>
                  {hasFilters && <p className="text-[10px] text-muted-foreground">
                    {[selStates.join(", "), selLgas.join(", "), selWards.join(", ")].filter(Boolean).join(" → ")}
                    {selYears.length > 0 && ` | Year: ${selYears.join(", ")}`}
                    {selCampaigns.length > 0 && ` | ${selCampaigns.join(", ")}`}
                  </p>}
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <div className="bg-muted/30 rounded p-2">
                      <p className="text-[9px] text-muted-foreground">Total Pop</p>
                      <p className="text-sm font-bold text-primary">{summaryTotals.pop.toLocaleString()}</p>
                    </div>
                    <div className="bg-muted/30 rounded p-2" title={targetPopLabel}>
                      <p className="text-[9px] text-muted-foreground">Target Pop <span className="opacity-60">({targetPopFields.length}f)</span></p>
                      <p className="text-sm font-bold text-emerald-600">{summaryTotals.target.toLocaleString()}</p>
                    </div>
                    <div className="bg-muted/30 rounded p-2">
                      <p className="text-[9px] text-muted-foreground">Communities</p>
                      <p className="text-sm font-bold">{summaryTotals.communities}</p>
                    </div>
                    <div className="bg-muted/30 rounded p-2">
                      <p className="text-[9px] text-muted-foreground">Health Facilities</p>
                      <p className="text-sm font-bold">{flhfSummaryData.length}</p>
                    </div>
                  </div>
                </div>

                {/* FLHF Breakdown Table */}
                <div>
                  <h4 className="text-[10px] font-semibold text-muted-foreground mb-1">Health Facility Breakdown</h4>
                  <div className="border border-border/50 rounded overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-[9px] py-1 px-1.5 h-auto">FLHF</TableHead>
                          <TableHead className="text-[9px] py-1 px-1.5 h-auto text-right">Pop</TableHead>
                          <TableHead className="text-[9px] py-1 px-1.5 h-auto text-right">Target</TableHead>
                          <TableHead className="text-[9px] py-1 px-1.5 h-auto text-right">Comm</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {flhfSummaryData.map(a => (
                          <TableRow key={a.name} className="text-[10px] hover:bg-muted/20 cursor-pointer" onClick={() => { setSelFlhfs([a.name]); if (selWards.length === 0) setSelWards([a.ward]); if (selLgas.length === 0) setSelLgas([a.lga]); if (selStates.length === 0) setSelStates([a.state]); }}>
                            <TableCell className="py-1 px-1.5 font-medium">
                              <span className="inline-block w-2 h-2 rounded-sm mr-1 flex-shrink-0" style={{ background: a.color }} />
                              <span className="truncate max-w-[100px] inline-block align-middle">{a.name}</span>
                            </TableCell>
                            <TableCell className="py-1 px-1.5 text-right tabular-nums">{a.totalPop.toLocaleString()}</TableCell>
                            <TableCell className="py-1 px-1.5 text-right tabular-nums">{a.targetPop.toLocaleString()}</TableCell>
                            <TableCell className="py-1 px-1.5 text-right">{a.count}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/40 font-bold text-[10px]">
                          <TableCell className="py-1 px-1.5">Total</TableCell>
                          <TableCell className="py-1 px-1.5 text-right tabular-nums">{summaryTotals.pop.toLocaleString()}</TableCell>
                          <TableCell className="py-1 px-1.5 text-right tabular-nums">{summaryTotals.target.toLocaleString()}</TableCell>
                          <TableCell className="py-1 px-1.5 text-right">{summaryTotals.communities}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Distance distribution */}
                <div>
                  <h4 className="text-[10px] font-semibold text-muted-foreground mb-1">Distance to FLHF Distribution</h4>
                  <div className="space-y-1">
                    {DISTANCE_BANDS.map(band => {
                      const count = cascadedEntries.filter(e => {
                        const d = e.community_distance_to_flhf_km;
                        if (d == null) return false;
                        const prev = DISTANCE_BANDS[DISTANCE_BANDS.indexOf(band) - 1];
                        const min = prev ? prev.max : 0;
                        return d > min && d <= band.max;
                      }).length;
                      const pct = cascadedEntries.length ? (count / cascadedEntries.length) * 100 : 0;
                      return (
                        <div key={band.label} className="flex items-center gap-1.5 text-[10px]">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: band.color }} />
                          <span className="w-[55px] flex-shrink-0">{band.label}</span>
                          <div className="flex-1 h-3 bg-muted/40 rounded overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${pct}%`, background: band.color, minWidth: count > 0 ? 4 : 0 }} />
                          </div>
                          <span className="w-[35px] text-right tabular-nums font-medium">{pct.toFixed(0)}%</span>
                          <span className="w-[20px] text-right text-muted-foreground">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Accessibility breakdown */}
                <div>
                  <h4 className="text-[10px] font-semibold text-muted-foreground mb-1">Accessibility Breakdown</h4>
                  <div className="space-y-1">
                    {Object.entries(ACCESS_COLORS).map(([key, { color, label }]) => {
                      const count = cascadedEntries.filter(e => e.accessibility === key).length;
                      const pct = cascadedEntries.length ? (count / cascadedEntries.length) * 100 : 0;
                      return (
                        <div key={key} className="flex items-center gap-1.5 text-[10px]">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="w-[70px] flex-shrink-0">{label}</span>
                          <div className="flex-1 h-3 bg-muted/40 rounded overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${pct}%`, background: color, minWidth: count > 0 ? 4 : 0 }} />
                          </div>
                          <span className="w-[25px] text-right tabular-nums font-medium">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Legend */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 text-[9px] text-muted-foreground flex-wrap border-t border-border/30 bg-muted/10">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-600 inline-block border border-white" style={{ borderRadius: "2px", transform: "rotate(45deg)" }} /> Community</span>
          <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-red-700 inline-block text-center leading-[14px] text-[9px] text-white font-bold border-2 border-white shadow-sm">🏥</span> FLHF</span>
          <span className="flex items-center gap-1"><span className="inline-block" style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "8px solid #8B5CF6" }} /> Settlement</span>
          <span className="border-l border-border/50 pl-2 ml-0.5" />

          {activeTheme === "flhf_catchment" && flhfSummaryData.slice(0, 8).map(a => (
            <span key={a.name} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: a.color }} />
              <span className="max-w-[60px] truncate">{a.name}</span>
            </span>
          ))}
          {activeTheme === "distance" && DISTANCE_BANDS.map(b => (
            <span key={b.label} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: b.color }} /> {b.label}</span>
          ))}
          {activeTheme === "accessibility" && Object.entries(ACCESS_COLORS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: v.color }} /> {v.label}</span>
          ))}
          {activeTheme === "security" && Object.entries(SECURITY_COLORS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: v.color }} /> {v.label}</span>
          ))}
          {activeTheme === "terrain" && Object.entries(TERRAIN_ICONS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1">{v.emoji} {k}</span>
          ))}
          {activeTheme === "population" && (
            <>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#059669" }} /> Low</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#D97706" }} /> Med</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#EA580C" }} /> High</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#DC2626" }} /> V.High</span>
            </>
          )}
          {activeTheme === "pop_density" && POP_DENSITY_CLASSES.map(c => (
            <span key={c.label} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c.color }} /> {c.label}</span>
          ))}
          {activeTheme === "distance_choropleth" && DISTANCE_BANDS.map(b => (
            <span key={b.label} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: b.color }} /> {b.label}</span>
          ))}
          {activeTheme === "coverage_gap" && (
            <>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#065F46" }} /> Good</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#FBBF24" }} /> Moderate</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#B91C1C" }} /> Critical</span>
            </>
          )}
          {(activeTheme === "catchment_buffers" || showBufferZones) && (
            <>
              <span className="border-l border-border/50 pl-2 ml-0.5" />
              {CATCHMENT_BUFFERS.map(b => (
                <span key={b.label} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border inline-block" style={{ borderColor: b.color }} /> {b.label}</span>
              ))}
            </>
          )}
          {activeTheme === "cdd_origin" && (
            <>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Local</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> External</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Geometry Helpers ───

function computeConvexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

function expandPolygon(hull: [number, number][], amount: number): [number, number][] {
  if (hull.length < 3) return hull;
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([lat, lng]) => {
    const dx = lat - cx, dy = lng - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return [lat + (dx / dist) * amount, lng + (dy / dist) * amount] as [number, number];
  });
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 0, b: 0 };
}

export default MicroplanMap;
