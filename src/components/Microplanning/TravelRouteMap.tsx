import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Navigation, MapPin, Route, Clock, Maximize2, Minimize2, Focus } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface RouteEntry {
  id: string;
  state: string;
  lga: string;
  ward: string;
  flhf_name: string;
  community_name: string;
  settlement_name: string | null;
  community_latitude: number | null;
  community_longitude: number | null;
  settlement_latitude: number | null;
  settlement_longitude: number | null;
  flhf_latitude: number | null;
  flhf_longitude: number | null;
  community_distance_to_flhf_km: number | null;
  settlement_distance_to_flhf_km: number | null;
  accessibility: string | null;
  terrain_type: string | null;
  estimated_total_population: number | null;
  estimated_children_5_14: number | null;
  estimated_adults_15_plus: number | null;
}

interface TravelRouteMapProps {
  entries: RouteEntry[];
}

// Haversine distance
const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Nearest-neighbor TSP approximation
const optimizeRoute = (
  flhf: [number, number],
  communities: { id: string; coords: [number, number]; name: string; dist: number }[]
): typeof communities => {
  if (communities.length <= 1) return communities;
  const remaining = [...communities];
  const ordered: typeof communities = [];
  let current = flhf;

  while (remaining.length > 0) {
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(current[0], current[1], remaining[i].coords[0], remaining[i].coords[1]);
      if (d < nearestDist) { nearestDist = d; nearest = i; }
    }
    ordered.push(remaining[nearest]);
    current = remaining[nearest].coords;
    remaining.splice(nearest, 1);
  }
  return ordered;
};

const ROUTE_COLORS = [
  "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed",
  "#db2777", "#0891b2", "#65a30d", "#ea580c", "#6366f1",
];

const TravelRouteMap = ({ entries }: TravelRouteMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [filterLga, setFilterLga] = useState<string>("all");
  const [selectedFlhf, setSelectedFlhf] = useState<string>("all");
  const [showAllRoutes, setShowAllRoutes] = useState(true);
  const [showDistLabels, setShowDistLabels] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Geotagged entries with FLHF coords
  const geoEntries = useMemo(() =>
    entries.filter(e => e.community_latitude && e.community_longitude && e.flhf_latitude && e.flhf_longitude),
    [entries]
  );

  const allLgas = useMemo(() => [...new Set(geoEntries.map(e => e.lga))].sort(), [geoEntries]);
  const filteredEntries = useMemo(() => {
    let e = geoEntries;
    if (filterLga !== "all") e = e.filter(x => x.lga === filterLga);
    if (selectedFlhf !== "all") e = e.filter(x => x.flhf_name === selectedFlhf);
    return e;
  }, [geoEntries, filterLga, selectedFlhf]);

  const availableFlhfs = useMemo(() => {
    const base = filterLga !== "all" ? geoEntries.filter(e => e.lga === filterLga) : geoEntries;
    return [...new Set(base.map(e => e.flhf_name))].sort();
  }, [geoEntries, filterLga]);

  useEffect(() => { setSelectedFlhf("all"); }, [filterLga]);

  // Group by FLHF
  const flhfGroups = useMemo(() => {
    const groups = new Map<string, { flhf: [number, number]; communities: { id: string; coords: [number, number]; name: string; dist: number; settlement?: string; accessibility?: string; terrain?: string; pop: number }[] }>();
    filteredEntries.forEach(e => {
      const key = e.flhf_name;
      if (!groups.has(key)) {
        groups.set(key, { flhf: [e.flhf_latitude!, e.flhf_longitude!], communities: [] });
      }
      const d = haversine(e.flhf_latitude!, e.flhf_longitude!, e.community_latitude!, e.community_longitude!);
      groups.get(key)!.communities.push({
        id: e.id,
        coords: [e.community_latitude!, e.community_longitude!],
        name: e.community_name,
        dist: Math.round(d * 10) / 10,
        settlement: e.settlement_name || undefined,
        accessibility: e.accessibility || undefined,
        terrain: e.terrain_type || undefined,
        pop: ((e.estimated_children_5_14 || 0) + (e.estimated_adults_15_plus || 0)) || (e.estimated_total_population || 0),
      });
    });
    return groups;
  }, [filteredEntries]);

  // Route stats
  const routeStats = useMemo(() => {
    let totalDist = 0;
    let totalStops = 0;
    flhfGroups.forEach((group) => {
      const ordered = optimizeRoute(group.flhf, group.communities);
      totalStops += ordered.length;
      let prev: [number, number] = group.flhf;
      ordered.forEach(c => {
        totalDist += haversine(prev[0], prev[1], c.coords[0], c.coords[1]);
        prev = c.coords;
      });
      // Return to FLHF
      if (ordered.length > 0) {
        totalDist += haversine(prev[0], prev[1], group.flhf[0], group.flhf[1]);
      }
    });
    return { totalDist: Math.round(totalDist * 10) / 10, totalStops, routeCount: flhfGroups.size };
  }, [flhfGroups]);

  // Render map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    // Custom zoom control
    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;

    const allBounds: L.LatLngTuple[] = [];
    let colorIdx = 0;

    flhfGroups.forEach((group, flhfName) => {
      const color = ROUTE_COLORS[colorIdx % ROUTE_COLORS.length];
      colorIdx++;
      const ordered = optimizeRoute(group.flhf, group.communities);

      // FLHF marker
      allBounds.push(group.flhf as L.LatLngTuple);
      L.marker(group.flhf as L.LatLngTuple, {
        icon: L.divIcon({
          className: "route-flhf-icon",
          html: `<div style="
            background: ${color};
            color: white;
            width: 28px; height: 28px;
            border-radius: 6px;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; font-weight: 800;
            border: 3px solid white;
            box-shadow: 0 3px 12px rgba(0,0,0,0.35);
          ">🏥</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).bindPopup(`
        <div style="min-width:180px;">
          <div style="font-weight:700;font-size:14px;color:${color};margin-bottom:4px;">🏥 ${flhfName}</div>
          <div style="font-size:11px;color:#6b7280;">Health Facility · Route Start</div>
          <div style="margin-top:6px;padding:6px 8px;background:#f3f4f6;border-radius:6px;font-size:11px;">
            <b>${ordered.length}</b> communities · <b>${ordered.reduce((s, c) => s + c.dist, 0).toFixed(1)}</b> km total
          </div>
        </div>
      `).addTo(map);

      // Draw optimized route path
      if (ordered.length > 0) {
        const routePoints: L.LatLngTuple[] = [group.flhf as L.LatLngTuple];
        ordered.forEach(c => routePoints.push(c.coords as L.LatLngTuple));
        routePoints.push(group.flhf as L.LatLngTuple); // return

        // Glow line
        L.polyline(routePoints, {
          color,
          weight: 8,
          opacity: 0.15,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map);

        // Main route line
        L.polyline(routePoints, {
          color,
          weight: 3.5,
          opacity: 0.85,
          dashArray: "10, 6",
          lineCap: "round",
          lineJoin: "round",
          className: "route-animated-line",
        }).addTo(map);

        // Direction arrows along route
        for (let i = 0; i < routePoints.length - 1; i++) {
          const p1 = routePoints[i];
          const p2 = routePoints[i + 1];
          const midLat = (p1[0] + p2[0]) / 2;
          const midLng = (p1[1] + p2[1]) / 2;
          const angle = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI;
          const segDist = haversine(p1[0], p1[1], p2[0], p2[1]);

          // Arrow marker
          L.marker([midLat, midLng], {
            icon: L.divIcon({
              className: "route-arrow",
              html: `<div style="
                color: ${color};
                font-size: 14px;
                font-weight: 900;
                transform: rotate(${-angle + 90}deg);
                text-shadow: 0 0 3px white, 0 0 3px white;
              ">▲</div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            }),
            interactive: false,
          }).addTo(map);

          // Distance label
          if (showDistLabels && segDist > 0.3) {
            L.marker([midLat + 0.002, midLng + 0.002], {
              icon: L.divIcon({
                className: "route-dist-label",
                html: `<div style="
                  background: ${color};
                  color: white;
                  padding: 1px 6px;
                  border-radius: 10px;
                  font-size: 9px;
                  font-weight: 700;
                  white-space: nowrap;
                  box-shadow: 0 1px 4px rgba(0,0,0,0.25);
                ">${segDist.toFixed(1)} km</div>`,
                iconSize: [50, 16],
                iconAnchor: [25, 8],
              }),
              interactive: false,
            }).addTo(map);
          }
        }
      }

      // Community markers with stop numbers
      ordered.forEach((c, idx) => {
        allBounds.push(c.coords as L.LatLngTuple);

        const accColor = c.accessibility === "hard_to_reach" ? "#f59e0b"
          : c.accessibility === "inaccessible" ? "#ef4444"
          : c.accessibility === "seasonal" ? "#8b5cf6"
          : "#10b981";

        L.marker(c.coords as L.LatLngTuple, {
          icon: L.divIcon({
            className: "route-community-icon",
            html: `<div style="
              position: relative;
              width: 24px; height: 24px;
            ">
              <div style="
                background: ${accColor};
                width: 20px; height: 20px;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                border: 2px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                position: absolute;
                top: 0; left: 2px;
              "></div>
              <div style="
                position: absolute;
                top: -8px; right: -8px;
                background: ${color};
                color: white;
                width: 16px; height: 16px;
                border-radius: 50%;
                font-size: 8px;
                font-weight: 800;
                display: flex; align-items: center; justify-content: center;
                border: 1.5px solid white;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
              ">${idx + 1}</div>
            </div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -20],
          }),
        }).bindPopup(`
          <div style="min-width:200px;font-family:inherit;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <div style="background:${color};color:white;width:20px;height:20px;border-radius:50%;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;">
                ${idx + 1}
              </div>
              <div style="font-weight:700;font-size:14px;">${c.name}</div>
            </div>
            ${c.settlement ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Settlement: ${c.settlement}</div>` : ""}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;">
              <div style="background:#f3f4f6;padding:4px 6px;border-radius:6px;text-align:center;">
                <div style="font-size:9px;color:#6b7280;">Distance</div>
                <div style="font-size:13px;font-weight:700;">${c.dist} km</div>
              </div>
              <div style="background:#f3f4f6;padding:4px 6px;border-radius:6px;text-align:center;">
                <div style="font-size:9px;color:#6b7280;">Population</div>
                <div style="font-size:13px;font-weight:700;">${c.pop.toLocaleString()}</div>
              </div>
            </div>
            ${c.accessibility ? `
              <div style="margin-top:6px;display:flex;gap:4px;">
                <span style="background:${accColor}22;color:${accColor};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;">${c.accessibility.replace(/_/g, " ")}</span>
                ${c.terrain ? `<span style="background:#f3f4f6;padding:2px 8px;border-radius:10px;font-size:10px;">${c.terrain}</span>` : ""}
              </div>
            ` : ""}
          </div>
        `).addTo(map);
      });
    });

    if (allBounds.length > 0) {
      map.fitBounds(allBounds, { padding: [50, 50], maxZoom: 13 });
    } else {
      map.setView([9.06, 7.49], 6);
    }

    return () => { map.remove(); mapRef.current = null; };
  }, [flhfGroups, showDistLabels]);

  const handleFocus = useCallback(() => {
    if (!mapRef.current || filteredEntries.length === 0) return;
    const bounds: L.LatLngTuple[] = [];
    filteredEntries.forEach(e => {
      if (e.community_latitude && e.community_longitude) bounds.push([e.community_latitude, e.community_longitude]);
      if (e.flhf_latitude && e.flhf_longitude) bounds.push([e.flhf_latitude, e.flhf_longitude]);
    });
    if (bounds.length > 0) mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 13, animate: true });
  }, [filteredEntries]);

  const toggleFullscreen = () => {
    const el = mapContainerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div className="space-y-4">
      {/* Route KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/50 bg-gradient-to-br from-blue-50 to-background dark:from-blue-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Route className="h-4 w-4 text-blue-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Optimized Routes</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-blue-600">{routeStats.routeCount}</p>
            <p className="text-[10px] text-muted-foreground">from {routeStats.routeCount} health facilities</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-emerald-50 to-background dark:from-emerald-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-emerald-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Total Stops</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-emerald-600">{routeStats.totalStops}</p>
            <p className="text-[10px] text-muted-foreground">communities to visit</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-amber-50 to-background dark:from-amber-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Navigation className="h-4 w-4 text-amber-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Total Distance</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-amber-600">{routeStats.totalDist.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">km (round-trip)</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterLga} onValueChange={setFilterLga}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All LGAs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All LGAs</SelectItem>
            {allLgas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedFlhf} onValueChange={setSelectedFlhf}>
          <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="All FLHFs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Health Facilities</SelectItem>
            {availableFlhfs.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 ml-2">
          <Switch checked={showDistLabels} onCheckedChange={setShowDistLabels} className="scale-75" />
          <span className="text-[10px] text-muted-foreground">Distance labels</span>
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleFocus}>
          <Focus className="h-3.5 w-3.5" /> Focus
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Map */}
      <Card className="border-border/50 overflow-hidden">
        <div ref={mapContainerRef} style={{ height: isFullscreen ? "100vh" : "550px", width: "100%" }} className="rounded-t-lg" />

        {/* Legend */}
        <div className="p-3 border-t border-border bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Route Map Legend</p>
            <Badge variant="secondary" className="text-[9px]">Nearest-Neighbor Optimization</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground mb-1">Facilities & Stops</p>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <div className="w-4 h-4 rounded flex items-center justify-center text-[8px]" style={{ background: "#2563eb", color: "white" }}>🏥</div>
                  <span>Health Facility (FLHF)</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <div className="w-3.5 h-3.5 rounded-full" style={{ background: "#10b981", border: "2px solid white", boxShadow: "0 0 0 1px #ccc" }} />
                  <span>Community Stop</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold" style={{ background: "#2563eb", color: "white" }}>1</div>
                  <span>Visit Order Number</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground mb-1">Route Lines</p>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <div className="w-6 h-0.5" style={{ background: "#2563eb", borderTop: "2px dashed #2563eb" }} />
                  <span>Optimized Path</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <div className="text-[10px] font-bold" style={{ color: "#2563eb" }}>▲</div>
                  <span>Direction Arrow</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <div className="px-1.5 py-0.5 rounded-full text-[7px] font-bold text-white" style={{ background: "#2563eb" }}>2.4 km</div>
                  <span>Segment Distance</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground mb-1">Accessibility</p>
              <div className="space-y-1">
                {[
                  { color: "#10b981", label: "Accessible" },
                  { color: "#f59e0b", label: "Hard to Reach" },
                  { color: "#ef4444", label: "Inaccessible" },
                  { color: "#8b5cf6", label: "Seasonal" },
                ].map(a => (
                  <div key={a.label} className="flex items-center gap-1.5 text-[11px]">
                    <div className="w-3 h-3 rounded-full" style={{ background: a.color }} />
                    <span>{a.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground mb-1">How to Read</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Each colored route starts from a health facility, visits communities in optimized order (numbered stops), and returns. Dashed lines show travel path with directional arrows.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Route Table */}
      {flhfGroups.size > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">Route</th>
                    <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">FLHF</th>
                    <th className="px-3 py-2.5 text-center font-semibold border-r border-primary/70">Stop #</th>
                    <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">Community</th>
                    <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">Accessibility</th>
                    <th className="px-3 py-2.5 text-right font-semibold border-r border-primary/70">Dist. from FLHF</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Population</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(flhfGroups.entries()).map(([flhfName, group], groupIdx) => {
                    const ordered = optimizeRoute(group.flhf, group.communities);
                    const color = ROUTE_COLORS[groupIdx % ROUTE_COLORS.length];
                    return ordered.map((c, idx) => (
                      <tr key={c.id} className={`border-b border-border/30 ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-muted/40 transition-colors`}>
                        {idx === 0 && (
                          <td rowSpan={ordered.length} className="px-3 py-2 border-r border-border/30 align-top">
                            <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
                          </td>
                        )}
                        {idx === 0 && (
                          <td rowSpan={ordered.length} className="px-3 py-2 border-r border-border/30 font-medium align-top">
                            {flhfName}
                          </td>
                        )}
                        <td className="px-3 py-2 text-center border-r border-border/30">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold text-white" style={{ background: color }}>{idx + 1}</span>
                        </td>
                        <td className="px-3 py-2 border-r border-border/30 font-medium">{c.name}</td>
                        <td className="px-3 py-2 border-r border-border/30">
                          {c.accessibility && (
                            <Badge variant="outline" className={`text-[9px] ${
                              c.accessibility === "accessible" ? "border-green-300 text-green-700" :
                              c.accessibility === "hard_to_reach" ? "border-amber-300 text-amber-700" :
                              c.accessibility === "inaccessible" ? "border-red-300 text-red-700" :
                              "border-purple-300 text-purple-700"
                            }`}>{c.accessibility.replace(/_/g, " ")}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right border-r border-border/30 tabular-nums">{c.dist} km</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.pop.toLocaleString()}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {geoEntries.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Navigation className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No geotagged entries with FLHF coordinates</p>
          <p className="text-xs mt-1">Add GPS coordinates for both communities and health facilities to generate optimized travel routes.</p>
        </div>
      )}

      <style>{`
        .route-animated-line {
          animation: route-dash-flow 1.5s linear infinite;
        }
        @keyframes route-dash-flow {
          to { stroke-dashoffset: -32; }
        }
      `}</style>
    </div>
  );
};

export default TravelRouteMap;
