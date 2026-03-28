import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Map, ZoomIn, BarChart3, Maximize2, Minimize2 } from "lucide-react";

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
}

interface MicroplanMapProps {
  entries: MicroplanEntry[];
  onEntryClick?: (id: string) => void;
}

type ThematicLayer = "none" | "flhf_catchment" | "distance" | "accessibility" | "security" | "terrain" | "cdd_origin" | "population" | "pop_density" | "distance_choropleth" | "coverage_gap" | "catchment_buffers";

// ─── Color Palettes ───
const FLHF_COLORS = [
  "#A8D5BA", "#F5CBA7", "#AED6F1", "#D7BDE2", "#F9E79F", "#A3E4D7",
  "#F1948A", "#85C1E9", "#D5DBDB", "#EDBB99", "#C39BD3", "#82E0AA",
  "#F7DC6F", "#73C6B6", "#F0B27A", "#7FB3D8", "#BB8FCE", "#76D7C4",
  "#E59866", "#5DADE2", "#AF7AC5", "#48C9B0", "#EB984E", "#85929E",
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
  accessible: { color: "#10B981", label: "Accessible" },
  hard_to_reach: { color: "#F59E0B", label: "Hard to Reach" },
  inaccessible: { color: "#EF4444", label: "Inaccessible" },
  seasonal: { color: "#8B5CF6", label: "Seasonal" },
};

const SECURITY_COLORS: Record<string, { color: string; label: string }> = {
  cleared: { color: "#10B981", label: "Cleared" },
  partial: { color: "#F59E0B", label: "Partial" },
  not_cleared: { color: "#EF4444", label: "Not Cleared" },
  unknown: { color: "#6B7280", label: "Unknown" },
};

const DISTANCE_BANDS = [
  { max: 2, color: "#059669", label: "< 2 km" },
  { max: 5, color: "#10B981", label: "2–5 km" },
  { max: 10, color: "#FBBF24", label: "5–10 km" },
  { max: 20, color: "#F97316", label: "10–20 km" },
  { max: Infinity, color: "#EF4444", label: "> 20 km" },
];

const CATCHMENT_BUFFERS = [
  { radiusKm: 2, color: "#10B981", opacity: 0.12, label: "2 km", dash: "4 6" },
  { radiusKm: 5, color: "#3B82F6", opacity: 0.07, label: "5 km", dash: "6 8" },
  { radiusKm: 10, color: "#F59E0B", opacity: 0.04, label: "10 km", dash: "8 10" },
];

const POP_DENSITY_CLASSES = [
  { max: 500, color: "#D1FAE5", label: "< 500" },
  { max: 2000, color: "#6EE7B7", label: "500–2k" },
  { max: 5000, color: "#F59E0B", label: "2k–5k" },
  { max: 10000, color: "#F97316", label: "5k–10k" },
  { max: Infinity, color: "#DC2626", label: "> 10k" },
];

const getDistanceColor = (km: number | null) => {
  if (km == null) return "#6B7280";
  for (const b of DISTANCE_BANDS) if (km <= b.max) return b.color;
  return "#EF4444";
};
const getDensityColor = (pop: number) => {
  for (const c of POP_DENSITY_CLASSES) if (pop <= c.max) return c.color;
  return "#DC2626";
};
const getCoverageGapColor = (score: number) => {
  if (score < 20) return "#059669";
  if (score < 40) return "#10B981";
  if (score < 60) return "#FBBF24";
  if (score < 80) return "#F97316";
  return "#DC2626";
};
const getPopulationColor = (pop: number | null, maxPop: number) => {
  if (!pop || maxPop === 0) return "#6B7280";
  const r = Math.min(pop / maxPop, 1);
  if (r < 0.25) return "#22C55E";
  if (r < 0.5) return "#EAB308";
  if (r < 0.75) return "#F97316";
  return "#EF4444";
};

// ─── Component ───
const MicroplanMap = ({ entries, onEntryClick }: MicroplanMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any>(null);
  const [activeTheme, setActiveTheme] = useState<ThematicLayer>("flhf_catchment");
  const [showBufferZones, setShowBufferZones] = useState(true);
  const [showDistanceLines, setShowDistanceLines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showSummaryPanel, setShowSummaryPanel] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(false);

  // Cascading zoom filters
  const [zoomState, setZoomState] = useState("");
  const [zoomLga, setZoomLga] = useState("");
  const [zoomWard, setZoomWard] = useState("");
  const [zoomFlhf, setZoomFlhf] = useState("");

  const cascadedEntries = useMemo(() => {
    let e = entries;
    if (zoomState) e = e.filter(x => x.state === zoomState);
    if (zoomLga) e = e.filter(x => x.lga === zoomLga);
    if (zoomWard) e = e.filter(x => x.ward === zoomWard);
    if (zoomFlhf) e = e.filter(x => x.flhf_name === zoomFlhf);
    return e;
  }, [entries, zoomState, zoomLga, zoomWard, zoomFlhf]);

  const uniqueVals = useCallback((key: keyof MicroplanEntry, src?: MicroplanEntry[]) =>
    [...new Set((src || cascadedEntries).map(e => e[key] as string).filter(Boolean))].sort(), [cascadedEntries]);

  const stateOptions = uniqueVals("state", entries);
  const lgaOptions = uniqueVals("lga", entries.filter(e => !zoomState || e.state === zoomState));
  const wardOptions = uniqueVals("ward", entries.filter(e => (!zoomState || e.state === zoomState) && (!zoomLga || e.lga === zoomLga)));
  const flhfOptions = uniqueVals("flhf_name", entries.filter(e => (!zoomState || e.state === zoomState) && (!zoomLga || e.lga === zoomLga) && (!zoomWard || e.ward === zoomWard)));

  // ─── FLHF-level aggregation (for GRID3-style catchment areas) ───
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
      a.targetPop += (e.estimated_children_0_4 || 0) + (e.estimated_children_5_14 || 0);
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
  }, [cascadedEntries]);

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
        // Include FLHF point for better polygon
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

    // ── FLHF Catchment Areas (GRID3-style) ──
    if (activeTheme === "flhf_catchment") {
      Object.entries(flhfPolygons).forEach(([flhf, points]) => {
        const agg = flhfAggregates[flhf];
        if (!agg) return;
        const color = agg.color;
        if (points.length >= 3) {
          const hull = computeConvexHull(points);
          // Expand hull slightly for visual buffer
          const expanded = expandPolygon(hull, 0.008);
          if (expanded.length >= 3) {
            L.polygon(expanded, {
              color, weight: 2.5, opacity: 0.85, fillColor: color, fillOpacity: 0.25,
              dashArray: agg.hardToReach > 0 ? "8 4" : undefined,
            }).addTo(group).bindTooltip(
              `<div style="font-family:system-ui;min-width:160px">
                <strong>${flhf}</strong><br/>
                <span style="font-size:11px">
                  Ward: ${agg.ward} | LGA: ${agg.lga}<br/>
                  Communities: ${agg.count}<br/>
                  Total Pop: <b>${agg.totalPop.toLocaleString()}</b><br/>
                  Target Pop: <b>${agg.targetPop.toLocaleString()}</b><br/>
                  Avg Dist: ${agg.avgDist.toFixed(1)} km
                </span>
              </div>`,
              { direction: "top", sticky: true }
            );
          }
        } else if (points.length >= 1) {
          // Single/dual point — draw circle
          const center = points[0];
          L.circle(center, {
            radius: 3000, color, weight: 2, fillColor: color, fillOpacity: 0.2,
          }).addTo(group);
        }
      });
    }

    // ── Ward-level choropleth ──
    if (["pop_density", "distance_choropleth", "coverage_gap"].includes(activeTheme)) {
      Object.entries(wardPolygons).forEach(([ward, points]) => {
        if (points.length < 3) return;
        const hull = computeConvexHull(points);
        const expanded = expandPolygon(hull, 0.006);
        if (expanded.length < 3) return;
        const wagg = wardAggregates[ward];
        if (!wagg) return;
        let fillColor = "#6B7280";
        let tip = ward;
        if (activeTheme === "pop_density") {
          fillColor = getDensityColor(wagg.totalPop);
          tip = `<b>${ward}</b><br/>Pop: ${wagg.totalPop.toLocaleString()}<br/>${wagg.count} communities`;
        } else if (activeTheme === "distance_choropleth") {
          fillColor = getDistanceColor(wagg.avgDist);
          tip = `<b>${ward}</b><br/>Avg Dist: ${wagg.avgDist.toFixed(1)} km<br/>${wagg.count} communities`;
        } else if (activeTheme === "coverage_gap") {
          fillColor = getCoverageGapColor(wagg.gapScore);
          tip = `<b>${ward}</b><br/>Gap Score: ${Math.round(wagg.gapScore)}/100<br/>Pop: ${wagg.totalPop.toLocaleString()}`;
        }
        L.polygon(expanded, {
          color: fillColor, weight: 2.5, opacity: 0.9, fillColor, fillOpacity: 0.4,
        }).addTo(group).bindTooltip(tip, { direction: "center", sticky: true });
        // Ward name label
        if (showLabels) {
          const centroid = hull.reduce((a, p) => [a[0] + p[0] / hull.length, a[1] + p[1] / hull.length] as [number, number], [0, 0] as [number, number]);
          L.marker(centroid, {
            icon: L.divIcon({
              className: "choropleth-label",
              html: `<div style="font-size:10px;font-weight:700;color:#1F2937;text-shadow:0 0 4px #fff,0 0 4px #fff;white-space:nowrap;text-align:center">${ward}</div>`,
              iconSize: [90, 16], iconAnchor: [45, 8],
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

      // Marker color by theme
      let mColor = "#3B82F6";
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
      else if (activeTheme === "cdd_origin") mColor = entry.cdd_from_community === true ? "#10B981" : entry.cdd_from_community === false ? "#EF4444" : "#6B7280";
      else if (activeTheme === "population") mColor = getPopulationColor(entry.estimated_total_population, maxPop);

      const radius = entry.estimated_total_population
        ? Math.max(5, Math.min(20, Math.sqrt(entry.estimated_total_population) / 5))
        : 6;

      // Community marker
      if (cLat && cLng) {
        if (activeTheme === "terrain" && mEmoji) {
          L.marker([cLat, cLng], {
            icon: L.divIcon({
              className: "mp-terrain",
              html: `<div style="font-size:16px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">${mEmoji}</div>`,
              iconSize: [22, 22], iconAnchor: [11, 11],
            }),
          }).addTo(group).bindPopup(buildPopup(entry));
        } else if (activeTheme === "population") {
          const pR = entry.estimated_total_population ? Math.max(7, Math.min(28, Math.sqrt(entry.estimated_total_population) / 3.5)) : 7;
          L.circleMarker([cLat, cLng], {
            radius: pR, fillColor: mColor, color: mColor, weight: 2, fillOpacity: 0.5, opacity: 0.8,
          }).addTo(group).bindPopup(buildPopup(entry));
          if (showLabels && entry.estimated_total_population && entry.estimated_total_population > 100) {
            L.marker([cLat, cLng], {
              icon: L.divIcon({
                className: "pop-lbl",
                html: `<div style="font-size:8px;font-weight:700;color:${mColor};text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap">${entry.estimated_total_population.toLocaleString()}</div>`,
                iconSize: [55, 12], iconAnchor: [27, -3],
              }), interactive: false,
            }).addTo(group);
          }
        } else {
          L.circleMarker([cLat, cLng], {
            radius, fillColor: mColor, color: "#fff", weight: 1.5, fillOpacity: 0.85,
          }).addTo(group).bindPopup(buildPopup(entry));
          // Community name labels at higher zoom
          if (showLabels) {
            L.marker([cLat, cLng], {
              icon: L.divIcon({
                className: "comm-lbl",
                html: `<div style="font-size:8px;color:#374151;text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis">${entry.community_name}</div>`,
                iconSize: [80, 12], iconAnchor: [40, -radius - 2],
              }), interactive: false,
            }).addTo(group);
          }
        }
        bounds.push([cLat, cLng]);

        // Distance lines
        if (showDistanceLines && fLat && fLng) {
          const dk = entry.community_distance_to_flhf_km;
          const lc = activeTheme === "distance" ? getDistanceColor(dk) : (activeTheme === "flhf_catchment" && flhfAgg ? flhfAgg.color : "#94A3B8");
          L.polyline([[cLat, cLng], [fLat, fLng]], {
            color: lc, weight: activeTheme === "distance" ? 2 : 1, dashArray: "4 4",
            opacity: activeTheme === "distance" ? 0.85 : 0.35,
          }).addTo(group);
          if (dk != null && activeTheme === "distance") {
            const mLat = (cLat + fLat) / 2, mLng = (cLng + fLng) / 2;
            L.marker([mLat, mLng], {
              icon: L.divIcon({
                className: "dist-lbl",
                html: `<div style="background:${lc};color:#fff;font-size:9px;padding:1px 4px;border-radius:6px;font-weight:600;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.3)">${dk} km</div>`,
                iconSize: [44, 14], iconAnchor: [22, 7],
              }), interactive: false,
            }).addTo(group);
          }
        }
      }

      // FLHF marker (deduplicated) + catchment buffers
      if (fLat && fLng) {
        const fKey = `${fLat.toFixed(4)},${fLng.toFixed(4)}`;
        if (!flhfDrawn.has(fKey)) {
          flhfDrawn.add(fKey);
          // Buffers
          if (showBufferZones || activeTheme === "catchment_buffers") {
            CATCHMENT_BUFFERS.slice().reverse().forEach(buf => {
              L.circle([fLat, fLng], {
                radius: buf.radiusKm * 1000, color: buf.color, weight: 1.5,
                opacity: 0.5, fillColor: buf.color, fillOpacity: buf.opacity, dashArray: buf.dash,
              }).addTo(group).bindTooltip(`${entry.flhf_name} — ${buf.label}`, { direction: "center" });
            });
          }
          // FLHF icon
          const bgColor = (activeTheme === "flhf_catchment" && flhfAgg) ? flhfAgg.color : "#DC2626";
          L.marker([fLat, fLng], {
            icon: L.divIcon({
              className: "flhf-icon",
              html: `<div style="background:${bgColor};color:#fff;width:26px;height:26px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)">🏥</div>`,
              iconSize: [26, 26], iconAnchor: [13, 13],
            }), zIndexOffset: 1000,
          }).addTo(group).bindPopup(buildFlhfPopup(entry, flhfAgg));
          bounds.push([fLat, fLng]);
        }
      }

      // Settlement marker
      if (sLat && sLng) {
        let sC = "#F59E0B";
        if (activeTheme === "distance") sC = getDistanceColor(entry.settlement_distance_to_flhf_km);
        if (activeTheme === "accessibility" && entry.accessibility) sC = ACCESS_COLORS[entry.accessibility]?.color || sC;
        if (activeTheme === "flhf_catchment" && flhfAgg) sC = flhfAgg.color;
        L.circleMarker([sLat, sLng], {
          radius: 4, fillColor: sC, color: "#fff", weight: 1, fillOpacity: 0.8,
        }).addTo(group).bindPopup(buildPopup(entry, "settlement"));
        bounds.push([sLat, sLng]);
      }
    });

    // Fit to data extent
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [cascadedEntries, activeTheme, showBufferZones, showDistanceLines, showLabels, flhfAggregates, wardAggregates, maxPop]);

  // ─── Popup builders ───
  const buildPopup = (e: MicroplanEntry, type: "community" | "settlement" = "community") => {
    const name = type === "community" ? e.community_name : (e.settlement_name || "Settlement");
    const dist = type === "community" ? e.community_distance_to_flhf_km : e.settlement_distance_to_flhf_km;
    const ab = e.accessibility ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:${ACCESS_COLORS[e.accessibility]?.color || '#6B7280'}20;color:${ACCESS_COLORS[e.accessibility]?.color || '#6B7280'}">${e.accessibility.replace(/_/g, " ")}</span>` : "";
    const sb = e.security_clearance ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:${SECURITY_COLORS[e.security_clearance]?.color || '#6B7280'}20;color:${SECURITY_COLORS[e.security_clearance]?.color || '#6B7280'}">${e.security_clearance.replace(/_/g, " ")}</span>` : "";
    return `<div style="min-width:220px;font-family:system-ui;font-size:12px">
      <strong style="font-size:14px">${name}</strong>
      ${type === "community" && e.settlement_name ? `<br/><span style="color:#666;font-size:11px">Settlement: ${e.settlement_name}</span>` : ""}
      <hr style="margin:4px 0;border-color:#eee"/>
      <div style="line-height:1.7">
        <b>FLHF:</b> ${e.flhf_name}<br/>
        <b>Location:</b> ${e.ward}, ${e.lga}, ${e.state}<br/>
        ${e.estimated_total_population ? `<b>Pop:</b> <span style="font-weight:700;color:#3B82F6">${e.estimated_total_population.toLocaleString()}</span><br/>` : ""}
        ${dist != null ? `<b>Dist to FLHF:</b> ${dist} km<br/>` : ""}
        ${ab ? `<div style="margin:3px 0">${ab}</div>` : ""}
        ${e.terrain_type ? `<b>Terrain:</b> ${TERRAIN_ICONS[e.terrain_type]?.emoji || ""} ${e.terrain_type}<br/>` : ""}
        ${sb ? `<div style="margin:3px 0">${sb}</div>` : ""}
        ${e.cdd_from_community != null ? `<b>CDD Local:</b> <span style="color:${e.cdd_from_community ? '#10B981' : '#EF4444'};font-weight:600">${e.cdd_from_community ? "Yes ✓" : "No ✗"}</span>` : ""}
      </div></div>`;
  };

  const buildFlhfPopup = (e: MicroplanEntry, agg: any) => {
    return `<div style="min-width:200px;font-family:system-ui">
      <strong style="font-size:14px">🏥 ${e.flhf_name}</strong>
      <hr style="margin:4px 0;border-color:#eee"/>
      <div style="font-size:12px;line-height:1.7">
        <b>Ward:</b> ${e.ward} | <b>LGA:</b> ${e.lga} | <b>State:</b> ${e.state}<br/>
        ${agg ? `<b>Communities:</b> ${agg.count}<br/><b>Total Pop:</b> ${agg.totalPop.toLocaleString()}<br/><b>Target Pop (0-14):</b> ${agg.targetPop.toLocaleString()}<br/><b>Avg Dist:</b> ${agg.avgDist.toFixed(1)} km` : ""}
      </div></div>`;
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

  const CascadeSelect = ({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean }) => (
    <select
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="h-7 text-[10px] px-1.5 border border-border rounded bg-background text-foreground min-w-0 w-full disabled:opacity-40"
    >
      <option value="">All {placeholder}s</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const resetZoom = () => { setZoomState(""); setZoomLga(""); setZoomWard(""); setZoomFlhf(""); };

  // ─── FLHF Summary Table (GRID3-style panel) ───
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

  const mapHeight = mapExpanded ? "h-[700px] md:h-[800px]" : "h-[400px] md:h-[550px]";

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader className="pb-2 px-3 pt-3 space-y-2">
        {/* Title + expand */}
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Map className="h-4 w-4 text-primary" />
            Geo-enabled Microplan Map
            <Badge variant="outline" className="text-[9px] ml-1">{cascadedEntries.length} entries</Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSummaryPanel(p => !p)} title="Toggle summary panel">
              <BarChart3 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMapExpanded(p => !p)} title="Expand map">
              {mapExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Thematic layer buttons — scrollable on mobile */}
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
        </div>

        {/* Cascading zoom */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
          <CascadeSelect value={zoomState} onChange={v => { setZoomState(v); setZoomLga(""); setZoomWard(""); setZoomFlhf(""); }} options={stateOptions} placeholder="State" />
          <CascadeSelect value={zoomLga} onChange={v => { setZoomLga(v); setZoomWard(""); setZoomFlhf(""); }} options={lgaOptions} placeholder="LGA" disabled={!zoomState} />
          <CascadeSelect value={zoomWard} onChange={v => { setZoomWard(v); setZoomFlhf(""); }} options={wardOptions} placeholder="Ward" disabled={!zoomLga} />
          <CascadeSelect value={zoomFlhf} onChange={v => setZoomFlhf(v)} options={flhfOptions} placeholder="FLHF" disabled={!zoomWard} />
        </div>
        {zoomState && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] w-fit" onClick={resetZoom}>✕ Clear Filters</Button>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {/* CDD Analytics */}
        <div className="px-3 py-1.5 border-b border-border/30 flex items-center gap-3 flex-wrap text-[10px]">
          <span className="font-semibold text-muted-foreground">👤 CDD:</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Local: <b>{cddStats.from}</b> ({cddStats.pctFrom}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            External: <b>{cddStats.ext}</b>
          </span>
          {cddStats.total > 0 && (
            <div className="flex-1 min-w-[60px] max-w-[140px] h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full flex">
                <div className="bg-emerald-500 h-full" style={{ width: `${cddStats.pctFrom}%` }} />
                <div className="bg-red-500 h-full" style={{ width: `${100 - cddStats.pctFrom - (cddStats.total ? (cddStats.unknown / cddStats.total) * 100 : 0)}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Map + Summary Panel */}
        <div className={`flex ${showSummaryPanel ? "flex-col lg:flex-row" : ""}`}>
          <div ref={mapRef} className={`${mapHeight} ${showSummaryPanel ? "lg:flex-1" : "w-full"} relative z-0`} />

          {/* GRID3-style summary panel */}
          {showSummaryPanel && (
            <div className="lg:w-[320px] border-t lg:border-t-0 lg:border-l border-border/30 overflow-auto max-h-[400px] lg:max-h-none bg-background">
              <div className="p-3 space-y-3">
                {/* Summary header */}
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-foreground">
                    {zoomWard || zoomLga || zoomState || "Overview"}
                  </h3>
                  {zoomState && <p className="text-[10px] text-muted-foreground">{[zoomState, zoomLga, zoomWard].filter(Boolean).join(" → ")}</p>}
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <div className="bg-muted/30 rounded p-2">
                      <p className="text-[9px] text-muted-foreground">Total Pop</p>
                      <p className="text-sm font-bold">{summaryTotals.pop.toLocaleString()}</p>
                    </div>
                    <div className="bg-muted/30 rounded p-2">
                      <p className="text-[9px] text-muted-foreground">Target Pop</p>
                      <p className="text-sm font-bold">{summaryTotals.target.toLocaleString()}</p>
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
                          <TableRow key={a.name} className="text-[10px] hover:bg-muted/20 cursor-pointer" onClick={() => { setZoomFlhf(a.name); if (!zoomWard) setZoomWard(a.ward); if (!zoomLga) setZoomLga(a.lga); if (!zoomState) setZoomState(a.state); }}>
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
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Legend */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 text-[9px] text-muted-foreground flex-wrap border-t border-border/30 bg-muted/10">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Community</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-600 inline-block text-center leading-[10px] text-[7px]">+</span> FLHF</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Settlement</span>
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
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#22C55E" }} /> Low</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#EAB308" }} /> Med</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#F97316" }} /> High</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#EF4444" }} /> V.High</span>
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
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#059669" }} /> Good</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#FBBF24" }} /> Moderate</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#DC2626" }} /> Critical</span>
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
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Local</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> External</span>
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

// Expand polygon outward from centroid for visual buffer
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

export default MicroplanMap;
