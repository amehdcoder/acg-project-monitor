import { useEffect, useRef, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Map, Eye, Layers, ZoomIn, Circle } from "lucide-react";

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

type ThematicLayer = "distance" | "terrain" | "accessibility" | "security" | "cdd_origin" | "population" | "catchment" | "pop_density" | "distance_choropleth" | "coverage_gap";

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
  { max: 5, color: "#10B981", label: "< 5 km" },
  { max: 10, color: "#3B82F6", label: "5–10 km" },
  { max: 20, color: "#F59E0B", label: "10–20 km" },
  { max: Infinity, color: "#EF4444", label: "> 20 km" },
];

// Catchment buffer radii in km
const CATCHMENT_BUFFERS = [
  { radiusKm: 2, color: "#10B981", opacity: 0.12, label: "2 km" },
  { radiusKm: 5, color: "#3B82F6", opacity: 0.08, label: "5 km" },
  { radiusKm: 10, color: "#F59E0B", opacity: 0.05, label: "10 km" },
];

// Ward color palette inspired by the reference images
const WARD_COLORS = [
  "#E8D5B7", "#C8B8A0", "#D4E6C3", "#B5CDA3", "#C3D5E8", "#A3B5CD",
  "#E8C3D5", "#CDA3B5", "#D5E8C3", "#B5CDA3", "#E8E4C3", "#CDC8A3",
  "#C3E8E4", "#A3CDC8", "#E8D5E4", "#CDB5C8", "#D5C3E8", "#B5A3CD",
  "#C3E8D5", "#A3CDB5", "#E8C3C3", "#CDA3A3", "#C3D5D5", "#A3B5B5",
];

// Population heat gradient
const getPopulationColor = (pop: number | null, maxPop: number) => {
  if (!pop || maxPop === 0) return "#6B7280";
  const ratio = Math.min(pop / maxPop, 1);
  if (ratio < 0.25) return "#22C55E";
  if (ratio < 0.5) return "#EAB308";
  if (ratio < 0.75) return "#F97316";
  return "#EF4444";
};

// Population density choropleth: 5-class Jenks-inspired
const DENSITY_CLASSES = [
  { max: 500, color: "#D1FAE5", label: "< 500" },
  { max: 2000, color: "#6EE7B7", label: "500–2k" },
  { max: 5000, color: "#F59E0B", label: "2k–5k" },
  { max: 10000, color: "#F97316", label: "5k–10k" },
  { max: Infinity, color: "#DC2626", label: "> 10k" },
];
const getDensityColor = (pop: number) => {
  for (const c of DENSITY_CLASSES) if (pop <= c.max) return c.color;
  return "#DC2626";
};

// Distance-to-FLHF choropleth classes
const DIST_CHOROPLETH = [
  { max: 2, color: "#059669", label: "< 2 km (Easy)" },
  { max: 5, color: "#10B981", label: "2–5 km" },
  { max: 10, color: "#FBBF24", label: "5–10 km" },
  { max: 20, color: "#F97316", label: "10–20 km" },
  { max: Infinity, color: "#DC2626", label: "> 20 km (Critical)" },
];
const getDistChoroplethColor = (km: number) => {
  for (const c of DIST_CHOROPLETH) if (km <= c.max) return c.color;
  return "#DC2626";
};

// Coverage gap scoring
const getCoverageGapColor = (score: number) => {
  // score 0-100, higher = worse coverage
  if (score < 20) return "#059669"; // well covered
  if (score < 40) return "#10B981";
  if (score < 60) return "#FBBF24";
  if (score < 80) return "#F97316";
  return "#DC2626"; // critical gap
};

const getDistanceColor = (km: number | null) => {
  if (km == null) return "#6B7280";
  for (const b of DISTANCE_BANDS) if (km <= b.max) return b.color;
  return "#EF4444";
};

const MicroplanMap = ({ entries, onEntryClick }: MicroplanMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any>(null);
  const [activeTheme, setActiveTheme] = useState<ThematicLayer | null>(null);
  const [showBufferZones, setShowBufferZones] = useState(false);
  const [showWardBoundaries, setShowWardBoundaries] = useState(false);

  // Cascading zoom filters
  const [zoomState, setZoomState] = useState("");
  const [zoomLga, setZoomLga] = useState("");
  const [zoomWard, setZoomWard] = useState("");
  const [zoomFlhf, setZoomFlhf] = useState("");
  const [zoomCommunity, setZoomCommunity] = useState("");
  const [zoomSettlement, setZoomSettlement] = useState("");

  const cascadedEntries = useMemo(() => {
    let e = entries;
    if (zoomState) e = e.filter(x => x.state === zoomState);
    if (zoomLga) e = e.filter(x => x.lga === zoomLga);
    if (zoomWard) e = e.filter(x => x.ward === zoomWard);
    if (zoomFlhf) e = e.filter(x => x.flhf_name === zoomFlhf);
    if (zoomCommunity) e = e.filter(x => x.community_name === zoomCommunity);
    if (zoomSettlement) e = e.filter(x => x.settlement_name === zoomSettlement);
    return e;
  }, [entries, zoomState, zoomLga, zoomWard, zoomFlhf, zoomCommunity, zoomSettlement]);

  const uniqueVals = (key: keyof MicroplanEntry, src?: MicroplanEntry[]) =>
    [...new Set((src || cascadedEntries).map(e => e[key] as string).filter(Boolean))].sort();

  const stateOptions = uniqueVals("state", entries);
  const lgaOptions = uniqueVals("lga", entries.filter(e => !zoomState || e.state === zoomState));
  const wardOptions = uniqueVals("ward", entries.filter(e => (!zoomState || e.state === zoomState) && (!zoomLga || e.lga === zoomLga)));
  const flhfOptions = uniqueVals("flhf_name", entries.filter(e => (!zoomState || e.state === zoomState) && (!zoomLga || e.lga === zoomLga) && (!zoomWard || e.ward === zoomWard)));
  const communityOptions = uniqueVals("community_name", cascadedEntries);
  const settlementOptions = uniqueVals("settlement_name", cascadedEntries);

  // CDD Analytics
  const cddStats = useMemo(() => {
    const withCdd = cascadedEntries.filter(e => e.cdd_names && e.cdd_names.trim());
    const fromComm = withCdd.filter(e => e.cdd_from_community === true).length;
    const notFromComm = withCdd.filter(e => e.cdd_from_community === false).length;
    const unknown = withCdd.length - fromComm - notFromComm;
    const total = withCdd.length;
    return { fromComm, notFromComm, unknown, total, pctFrom: total ? Math.round((fromComm / total) * 100) : 0, pctNot: total ? Math.round((notFromComm / total) * 100) : 0 };
  }, [cascadedEntries]);

  // Ward-level aggregation for choropleth layers
  const wardAggregates = useMemo(() => {
    const agg: Record<string, { totalPop: number; avgDist: number; count: number; points: [number, number][]; gapScore: number }> = {};
    cascadedEntries.forEach(e => {
      if (!agg[e.ward]) agg[e.ward] = { totalPop: 0, avgDist: 0, count: 0, points: [], gapScore: 0 };
      const w = agg[e.ward];
      w.totalPop += e.estimated_total_population || 0;
      w.avgDist += e.community_distance_to_flhf_km || 0;
      w.count++;
      if (e.community_latitude && e.community_longitude) {
        w.points.push([e.community_latitude, e.community_longitude]);
      }
    });
    // Compute averages and gap scores
    Object.values(agg).forEach(w => {
      w.avgDist = w.count ? w.avgDist / w.count : 0;
      // Gap score: composite of distance, accessibility issues, security issues
      const distScore = Math.min(w.avgDist * 5, 40); // 0-40 points
      const entries = cascadedEntries.filter(e => agg[e.ward] === w);
      const hardToReach = entries.filter(e => e.accessibility === "hard_to_reach" || e.accessibility === "inaccessible").length;
      const accessScore = w.count ? (hardToReach / w.count) * 30 : 0; // 0-30 points
      const notCleared = entries.filter(e => e.security_clearance === "not_cleared" || e.security_clearance === "partial").length;
      const secScore = w.count ? (notCleared / w.count) * 30 : 0; // 0-30 points
      w.gapScore = Math.min(distScore + accessScore + secScore, 100);
    });
    return agg;
  }, [cascadedEntries]);

  // Max population for relative sizing
  const maxPop = useMemo(() => {
    return Math.max(...cascadedEntries.map(e => e.estimated_total_population || 0), 1);
  }, [cascadedEntries]);

  // Ward color map
  const wardColorMap = useMemo(() => {
    const wards = [...new Set(cascadedEntries.map(e => e.ward).filter(Boolean))].sort();
    const map: Record<string, string> = {};
    wards.forEach((w, i) => { map[w] = WARD_COLORS[i % WARD_COLORS.length]; });
    return map;
  }, [cascadedEntries]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([9.0, 8.0], 6);
    mapInstanceRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  // Render layers
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    if (layersRef.current) { layersRef.current.clearLayers(); }
    const group = L.layerGroup().addTo(map);
    layersRef.current = group;

    const bounds: [number, number][] = [];
    const flhfDrawn = new Set<string>();
    const wardPolygons: Record<string, [number, number][]> = {};

    // Collect ward point clusters for convex hull approximation
    cascadedEntries.forEach(entry => {
      if (entry.community_latitude && entry.community_longitude) {
        if (!wardPolygons[entry.ward]) wardPolygons[entry.ward] = [];
        wardPolygons[entry.ward].push([entry.community_latitude, entry.community_longitude]);
      }
    });

    // Draw ward boundary approximations (convex hulls)
    if (showWardBoundaries && !["pop_density", "distance_choropleth", "coverage_gap"].includes(activeTheme || "")) {
      Object.entries(wardPolygons).forEach(([ward, points]) => {
        if (points.length < 3) return;
        const hull = computeConvexHull(points);
        if (hull.length < 3) return;
        const color = wardColorMap[ward] || "#94A3B8";
        L.polygon(hull, {
          color: color, weight: 2.5, opacity: 0.9, fillColor: color, fillOpacity: 0.2, dashArray: "6, 4",
        }).addTo(group).bindTooltip(ward, { permanent: false, direction: "center", className: "ward-label-tooltip" });
      });
    }

    // Choropleth layers — draw colored ward polygons
    if (activeTheme === "pop_density" || activeTheme === "distance_choropleth" || activeTheme === "coverage_gap") {
      Object.entries(wardPolygons).forEach(([ward, points]) => {
        if (points.length < 3) return;
        const hull = computeConvexHull(points);
        if (hull.length < 3) return;
        const agg = wardAggregates[ward];
        if (!agg) return;
        let fillColor = "#6B7280";
        let tooltipContent = ward;
        if (activeTheme === "pop_density") {
          fillColor = getDensityColor(agg.totalPop);
          tooltipContent = `${ward}\nPop: ${agg.totalPop.toLocaleString()} | ${agg.count} communities`;
        } else if (activeTheme === "distance_choropleth") {
          fillColor = getDistChoroplethColor(agg.avgDist);
          tooltipContent = `${ward}\nAvg Dist: ${agg.avgDist.toFixed(1)} km | ${agg.count} communities`;
        } else if (activeTheme === "coverage_gap") {
          fillColor = getCoverageGapColor(agg.gapScore);
          tooltipContent = `${ward}\nGap Score: ${Math.round(agg.gapScore)}/100\nPop: ${agg.totalPop.toLocaleString()} | Avg Dist: ${agg.avgDist.toFixed(1)} km`;
        }
        L.polygon(hull, {
          color: fillColor, weight: 2, opacity: 0.9, fillColor, fillOpacity: 0.45,
        }).addTo(group).bindTooltip(tooltipContent.replace(/\n/g, "<br/>"), {
          permanent: false, direction: "center", className: "ward-label-tooltip",
        });
        // Ward label
        const centroid = hull.reduce((acc, p) => [acc[0] + p[0] / hull.length, acc[1] + p[1] / hull.length] as [number, number], [0, 0] as [number, number]);
        const labelIcon = L.divIcon({
          className: "choropleth-label",
          html: `<div style="font-size:10px;font-weight:700;color:#1F2937;text-shadow:0 0 4px #fff,0 0 4px #fff,0 0 4px #fff;white-space:nowrap;text-align:center">${ward}</div>`,
          iconSize: [80, 16], iconAnchor: [40, 8],
        });
        L.marker(centroid, { icon: labelIcon, interactive: false }).addTo(group);
      });
    }

    cascadedEntries.forEach(entry => {
      const cLat = entry.community_latitude;
      const cLng = entry.community_longitude;
      const fLat = entry.flhf_latitude;
      const fLng = entry.flhf_longitude;
      const sLat = entry.settlement_latitude;
      const sLng = entry.settlement_longitude;

      // Determine marker color based on active theme
      let markerColor = "#3B82F6";
      let markerEmoji = "";
      if (activeTheme === "distance") {
        markerColor = getDistanceColor(entry.community_distance_to_flhf_km);
      } else if (activeTheme === "accessibility" && entry.accessibility) {
        markerColor = ACCESS_COLORS[entry.accessibility]?.color || "#3B82F6";
      } else if (activeTheme === "security" && entry.security_clearance) {
        markerColor = SECURITY_COLORS[entry.security_clearance]?.color || "#6B7280";
      } else if (activeTheme === "terrain" && entry.terrain_type) {
        markerColor = TERRAIN_ICONS[entry.terrain_type]?.color || "#3B82F6";
        markerEmoji = TERRAIN_ICONS[entry.terrain_type]?.emoji || "";
      } else if (activeTheme === "cdd_origin") {
        markerColor = entry.cdd_from_community === true ? "#10B981" : entry.cdd_from_community === false ? "#EF4444" : "#6B7280";
      } else if (activeTheme === "population") {
        markerColor = getPopulationColor(entry.estimated_total_population, maxPop);
      } else if (activeTheme === "catchment") {
        markerColor = "#3B82F6";
      }

      const radius = entry.estimated_total_population
        ? Math.max(6, Math.min(22, Math.sqrt(entry.estimated_total_population) / 4))
        : 8;

      // Community marker
      if (cLat && cLng) {
        if (activeTheme === "terrain" && markerEmoji) {
          const icon = L.divIcon({
            className: "microplan-terrain-icon",
            html: `<div style="font-size:18px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">${markerEmoji}</div>`,
            iconSize: [24, 24], iconAnchor: [12, 12],
          });
          L.marker([cLat, cLng], { icon }).addTo(group).bindPopup(buildPopup(entry, "community"));
        } else if (activeTheme === "population") {
          // Population proportional filled circle with gradient effect
          const popRadius = entry.estimated_total_population
            ? Math.max(8, Math.min(30, Math.sqrt(entry.estimated_total_population) / 3))
            : 8;
          L.circleMarker([cLat, cLng], {
            radius: popRadius,
            fillColor: markerColor,
            color: markerColor,
            weight: 2,
            fillOpacity: 0.55,
            opacity: 0.85,
          }).addTo(group).bindPopup(buildPopup(entry, "community"));

          // Population label
          if (entry.estimated_total_population && entry.estimated_total_population > 100) {
            const popLabel = L.divIcon({
              className: "pop-label",
              html: `<div style="font-size:9px;font-weight:700;color:${markerColor};text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap">${entry.estimated_total_population.toLocaleString()}</div>`,
              iconSize: [60, 14], iconAnchor: [30, -2],
            });
            L.marker([cLat, cLng], { icon: popLabel, interactive: false }).addTo(group);
          }
        } else {
          L.circleMarker([cLat, cLng], {
            radius, fillColor: markerColor, color: "#fff", weight: 2, fillOpacity: 0.85,
          }).addTo(group).bindPopup(buildPopup(entry, "community"));
        }
        bounds.push([cLat, cLng]);

        // Distance line to FLHF
        if (fLat && fLng) {
          const distKm = entry.community_distance_to_flhf_km;
          const lineColor = activeTheme === "distance" ? getDistanceColor(distKm) : "#94A3B8";
          L.polyline([[cLat, cLng], [fLat, fLng]], {
            color: lineColor, weight: activeTheme === "distance" ? 2.5 : 1.5,
            dashArray: activeTheme === "distance" ? undefined : "4 4",
            opacity: activeTheme === "distance" ? 0.9 : 0.5,
          }).addTo(group);

          if (distKm != null) {
            const midLat = (cLat + fLat) / 2;
            const midLng = (cLng + fLng) / 2;
            const labelIcon = L.divIcon({
              className: "distance-label",
              html: `<div style="background:${lineColor};color:#fff;font-size:10px;padding:1px 5px;border-radius:8px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${distKm} km</div>`,
              iconSize: [50, 16], iconAnchor: [25, 8],
            });
            L.marker([midLat, midLng], { icon: labelIcon, interactive: false }).addTo(group);
          }
        }
      }

      // FLHF marker (deduplicated) + buffer zones
      if (fLat && fLng) {
        const fKey = `${fLat},${fLng}`;
        if (!flhfDrawn.has(fKey)) {
          flhfDrawn.add(fKey);

          // Catchment buffer zones
          if (showBufferZones || activeTheme === "catchment") {
            CATCHMENT_BUFFERS.slice().reverse().forEach(buf => {
              L.circle([fLat, fLng], {
                radius: buf.radiusKm * 1000,
                color: buf.color,
                weight: 1.5,
                opacity: 0.6,
                fillColor: buf.color,
                fillOpacity: buf.opacity,
                dashArray: "5, 5",
              }).addTo(group).bindTooltip(`${entry.flhf_name} — ${buf.label} buffer`, { direction: "center" });
            });
          }

          const fIcon = L.divIcon({
            className: "flhf-icon",
            html: `<div style="background:#DC2626;color:#fff;width:28px;height:28px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)">🏥</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14],
          });
          L.marker([fLat, fLng], { icon: fIcon, zIndexOffset: 1000 }).addTo(group)
            .bindPopup(`
              <div style="min-width:200px;font-family:system-ui">
                <strong style="font-size:14px">🏥 ${entry.flhf_name}</strong>
                <hr style="margin:4px 0;border-color:#eee"/>
                <div style="font-size:12px;line-height:1.6">
                  <b>Ward:</b> ${entry.ward}<br/>
                  <b>LGA:</b> ${entry.lga}<br/>
                  <b>State:</b> ${entry.state}
                </div>
              </div>
            `);
          bounds.push([fLat, fLng]);
        }
      }

      // Settlement marker
      if (sLat && sLng) {
        let sColor = "#F59E0B";
        if (activeTheme === "distance") sColor = getDistanceColor(entry.settlement_distance_to_flhf_km);
        if (activeTheme === "accessibility" && entry.accessibility) sColor = ACCESS_COLORS[entry.accessibility]?.color || sColor;
        if (activeTheme === "security" && entry.security_clearance) sColor = SECURITY_COLORS[entry.security_clearance]?.color || sColor;
        
        L.circleMarker([sLat, sLng], {
          radius: 5, fillColor: sColor, color: "#fff", weight: 1.5, fillOpacity: 0.8,
        }).addTo(group).bindPopup(buildPopup(entry, "settlement"));
        bounds.push([sLat, sLng]);

        if (fLat && fLng && activeTheme === "distance") {
          L.polyline([[sLat, sLng], [fLat, fLng]], {
            color: sColor, weight: 1.5, dashArray: "3 3", opacity: 0.7,
          }).addTo(group);
          if (entry.settlement_distance_to_flhf_km != null) {
            const mLat = (sLat + fLat) / 2;
            const mLng = (sLng + fLng) / 2;
            const lbl = L.divIcon({
              className: "distance-label",
              html: `<div style="background:${sColor};color:#fff;font-size:9px;padding:1px 4px;border-radius:6px;font-weight:600;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.3)">${entry.settlement_distance_to_flhf_km} km</div>`,
              iconSize: [40, 14], iconAnchor: [20, 7],
            });
            L.marker([mLat, mLng], { icon: lbl, interactive: false }).addTo(group);
          }
        }
      }
    });

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [cascadedEntries, activeTheme, onEntryClick, showBufferZones, showWardBoundaries, wardColorMap, maxPop, wardAggregates]);

  const buildPopup = (e: MicroplanEntry, type: "community" | "settlement") => {
    const name = type === "community" ? e.community_name : (e.settlement_name || "Settlement");
    const dist = type === "community" ? e.community_distance_to_flhf_km : e.settlement_distance_to_flhf_km;
    
    const accessBadge = e.accessibility
      ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:${ACCESS_COLORS[e.accessibility]?.color || '#6B7280'}20;color:${ACCESS_COLORS[e.accessibility]?.color || '#6B7280'}">${e.accessibility.replace(/_/g, " ")}</span>`
      : "";
    const secBadge = e.security_clearance
      ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:${SECURITY_COLORS[e.security_clearance]?.color || '#6B7280'}20;color:${SECURITY_COLORS[e.security_clearance]?.color || '#6B7280'}">${e.security_clearance.replace(/_/g, " ")}</span>`
      : "";

    return `
      <div style="min-width:240px;font-family:system-ui">
        <strong style="font-size:14px">${name}</strong>
        ${type === "community" && e.settlement_name ? `<br/><span style="color:#666;font-size:11px">Settlement: ${e.settlement_name}</span>` : ""}
        <hr style="margin:6px 0;border-color:#eee"/>
        <div style="font-size:12px;line-height:1.8">
          <b>FLHF:</b> ${e.flhf_name}<br/>
          <b>Location:</b> ${e.state} → ${e.lga} → ${e.ward}<br/>
          ${e.estimated_total_population ? `<b>Population:</b> <span style="font-weight:700;color:#3B82F6">${e.estimated_total_population.toLocaleString()}</span><br/>` : ""}
          ${dist != null ? `<b>Distance to FLHF:</b> ${dist} km<br/>` : ""}
          ${accessBadge ? `<div style="margin:4px 0"><b>Accessibility:</b> ${accessBadge}</div>` : ""}
          ${e.terrain_type ? `<b>Terrain:</b> ${TERRAIN_ICONS[e.terrain_type]?.emoji || ""} ${e.terrain_type}<br/>` : ""}
          ${secBadge ? `<div style="margin:4px 0"><b>Security:</b> ${secBadge}</div>` : ""}
          ${e.cdd_from_community != null ? `<b>CDD from Community:</b> <span style="color:${e.cdd_from_community ? '#10B981' : '#EF4444'};font-weight:600">${e.cdd_from_community ? "Yes ✓" : "No ✗"}</span>` : ""}
        </div>
      </div>`;
  };

  const themeButtons: { key: ThematicLayer; label: string; icon: string }[] = [
    { key: "pop_density", label: "Density Map", icon: "🗺️" },
    { key: "distance_choropleth", label: "Dist. Map", icon: "📐" },
    { key: "coverage_gap", label: "Coverage Gap", icon: "🔍" },
    { key: "distance", label: "Distance", icon: "📏" },
    { key: "terrain", label: "Terrain", icon: "⛰️" },
    { key: "accessibility", label: "Access", icon: "🚧" },
    { key: "security", label: "Security", icon: "🛡️" },
    { key: "cdd_origin", label: "CDD Origin", icon: "👤" },
    { key: "population", label: "Population", icon: "👥" },
    { key: "catchment", label: "Catchment", icon: "🎯" },
  ];

  const CascadeSelect = ({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean }) => (
    <Select value={value || "all"} onValueChange={v => onChange(v === "all" ? "" : v)} disabled={disabled}>
      <SelectTrigger className="h-7 text-[10px] w-full min-w-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const resetZoom = () => { setZoomState(""); setZoomLga(""); setZoomWard(""); setZoomFlhf(""); setZoomCommunity(""); setZoomSettlement(""); };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 px-3 pt-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Map className="h-4 w-4 text-primary" />
            Geo-enabled Microplan Map
          </CardTitle>
          <div className="flex items-center gap-1 flex-wrap">
            {themeButtons.map(t => (
              <Button
                key={t.key}
                variant={activeTheme === t.key ? "default" : "outline"}
                size="sm"
                className="text-[10px] h-7 px-2"
                onClick={() => setActiveTheme(prev => prev === t.key ? null : t.key)}
              >
                {t.icon} {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Spatial toggles */}
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <Switch checked={showBufferZones} onCheckedChange={setShowBufferZones} className="scale-75" />
            Buffer Zones (2/5/10 km)
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <Switch checked={showWardBoundaries} onCheckedChange={setShowWardBoundaries} className="scale-75" />
            Ward Boundaries
          </label>
        </div>

        {/* Cascading zoom filters */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5 mt-2">
          <CascadeSelect value={zoomState} onChange={v => { setZoomState(v); setZoomLga(""); setZoomWard(""); setZoomFlhf(""); setZoomCommunity(""); setZoomSettlement(""); }} options={stateOptions} placeholder="State" />
          <CascadeSelect value={zoomLga} onChange={v => { setZoomLga(v); setZoomWard(""); setZoomFlhf(""); setZoomCommunity(""); setZoomSettlement(""); }} options={lgaOptions} placeholder="LGA" disabled={!zoomState} />
          <CascadeSelect value={zoomWard} onChange={v => { setZoomWard(v); setZoomFlhf(""); setZoomCommunity(""); setZoomSettlement(""); }} options={wardOptions} placeholder="Ward" disabled={!zoomLga} />
          <CascadeSelect value={zoomFlhf} onChange={v => { setZoomFlhf(v); setZoomCommunity(""); setZoomSettlement(""); }} options={flhfOptions} placeholder="FLHF" disabled={!zoomWard} />
          <CascadeSelect value={zoomCommunity} onChange={v => { setZoomCommunity(v); setZoomSettlement(""); }} options={communityOptions} placeholder="Community" disabled={!zoomFlhf} />
          <CascadeSelect value={zoomSettlement} onChange={v => setZoomSettlement(v)} options={settlementOptions} placeholder="Settlement" disabled={!zoomCommunity} />
        </div>
        {(zoomState || activeTheme) && (
          <div className="flex items-center gap-2 mt-1.5">
            {zoomState && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={resetZoom}>
                ✕ Clear Zoom
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {/* CDD Analytics Bar */}
        <div className="px-3 py-2 border-b border-border/30 flex items-center gap-4 flex-wrap text-[11px]">
          <span className="font-semibold text-muted-foreground flex items-center gap-1">👤 CDD Origin:</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            From Community: <strong>{cddStats.fromComm}</strong> ({cddStats.pctFrom}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            External: <strong>{cddStats.notFromComm}</strong> ({cddStats.pctNot}%)
          </span>
          {cddStats.unknown > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground inline-block" />
              Unknown: <strong>{cddStats.unknown}</strong>
            </span>
          )}
          {cddStats.total > 0 && (
            <div className="flex-1 min-w-[100px] max-w-[200px] h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full flex">
                <div className="bg-emerald-500 h-full" style={{ width: `${cddStats.pctFrom}%` }} />
                <div className="bg-red-500 h-full" style={{ width: `${cddStats.pctNot}%` }} />
              </div>
            </div>
          )}
        </div>

        <div ref={mapRef} className="h-[450px] md:h-[550px] w-full relative z-0" />

        {/* Dynamic Legend */}
        <div className="flex items-center gap-3 px-3 py-2 text-[10px] text-muted-foreground flex-wrap border-t border-border/30">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Community</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600 text-[8px] font-bold text-center leading-3 inline-block">🏥</span> FLHF</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Settlement</span>
          <span className="border-l border-border/50 pl-2 ml-1" />
          
          {activeTheme === "distance" && DISTANCE_BANDS.map(b => (
            <span key={b.label} className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: b.color }} /> {b.label}</span>
          ))}
          {activeTheme === "accessibility" && Object.entries(ACCESS_COLORS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: v.color }} /> {v.label}</span>
          ))}
          {activeTheme === "security" && Object.entries(SECURITY_COLORS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: v.color }} /> {v.label}</span>
          ))}
          {activeTheme === "terrain" && Object.entries(TERRAIN_ICONS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1">{v.emoji} {k}</span>
          ))}
          {activeTheme === "cdd_origin" && (
            <>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> From Community</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> External CDD</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-muted-foreground inline-block" /> Unknown</span>
            </>
          )}
          {activeTheme === "population" && (
            <>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: "#22C55E" }} /> Low</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: "#EAB308" }} /> Medium</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: "#F97316" }} /> High</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: "#EF4444" }} /> Very High</span>
              <span className="text-[9px] italic">(circle size = population)</span>
            </>
          )}
          {activeTheme === "pop_density" && (
            <>
              {DENSITY_CLASSES.map(c => (
                <span key={c.label} className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: c.color }} /> {c.label}</span>
              ))}
              <span className="text-[9px] italic">(ward-level total pop)</span>
            </>
          )}
          {activeTheme === "distance_choropleth" && (
            <>
              {DIST_CHOROPLETH.map(c => (
                <span key={c.label} className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: c.color }} /> {c.label}</span>
              ))}
              <span className="text-[9px] italic">(ward avg distance)</span>
            </>
          )}
          {activeTheme === "coverage_gap" && (
            <>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#059669" }} /> Well Covered</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#10B981" }} /> Adequate</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#FBBF24" }} /> Moderate Gap</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#F97316" }} /> Significant Gap</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#DC2626" }} /> Critical Gap</span>
              <span className="text-[9px] italic">(distance + access + security)</span>
            </>
          )}
          {activeTheme === "catchment" && CATCHMENT_BUFFERS.map(b => (
            <span key={b.label} className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: b.color, opacity: 0.5 }} /> {b.label}</span>
          ))}
          {(showBufferZones && activeTheme !== "catchment") && (
            <>
              <span className="border-l border-border/50 pl-2 ml-1" />
              {CATCHMENT_BUFFERS.map(b => (
                <span key={b.label} className="flex items-center gap-1"><span className="w-3 h-3 rounded-full border inline-block" style={{ borderColor: b.color }} /> {b.label}</span>
              ))}
            </>
          )}
          {showWardBoundaries && (
            <>
              <span className="border-l border-border/50 pl-2 ml-1" />
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded inline-block border-2 border-dashed" style={{ borderColor: "#94A3B8", background: "rgba(148,163,184,0.15)" }} />
                Ward Boundaries
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Simple convex hull computation (Graham scan)
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

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export default MicroplanMap;
