import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Navigation, MapPin, Clock, Maximize2, Minimize2, ArrowDownUp,
  Car, Bike, Footprints, LocateFixed, Share2, X,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import PegmanControl from "@/components/MapVisualization/PegmanControl";
import StreetViewPanel from "@/components/MapVisualization/StreetViewPanel";

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
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

interface LocationOption {
  id: string;
  name: string;
  type: "flhf" | "community" | "settlement";
  lat: number;
  lng: number;
  meta: {
    state: string;
    lga: string;
    ward: string;
    flhf_name?: string;
    accessibility?: string;
    terrain?: string;
    population?: number;
  };
}

type TravelMode = "drive" | "bike" | "walk";

const TRAVEL_SPEEDS: Record<TravelMode, { speed: number; label: string; icon: typeof Car }> = {
  drive: { speed: 40, label: "Drive", icon: Car },
  bike: { speed: 15, label: "Bike", icon: Bike },
  walk: { speed: 5, label: "Walk", icon: Footprints },
};

const formatDuration = (hours: number): string => {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m}`;
};

const TravelRouteMap = ({ entries }: TravelRouteMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  const [originId, setOriginId] = useState<string>("");
  const [destId, setDestId] = useState<string>("");
  const [travelMode, setTravelMode] = useState<TravelMode>("drive");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [originSearch, setOriginSearch] = useState("");
  const [destSearch, setDestSearch] = useState("");
  const [originFocused, setOriginFocused] = useState(false);
  const [destFocused, setDestFocused] = useState(false);
  const [streetViewActive, setStreetViewActive] = useState(false);
  const [streetViewCoords, setStreetViewCoords] = useState<{ lat: number; lng: number } | null>(null);
  const originRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);

  // Build unique location options from entries
  const allLocations = useMemo(() => {
    const locMap = new Map<string, LocationOption>();

    entries.forEach((e) => {
      // FLHFs
      if (e.flhf_latitude && e.flhf_longitude) {
        const key = `flhf-${e.flhf_name}-${e.flhf_latitude}-${e.flhf_longitude}`;
        if (!locMap.has(key)) {
          locMap.set(key, {
            id: key,
            name: e.flhf_name,
            type: "flhf",
            lat: e.flhf_latitude,
            lng: e.flhf_longitude,
            meta: { state: e.state, lga: e.lga, ward: e.ward },
          });
        }
      }

      // Communities
      if (e.community_latitude && e.community_longitude) {
        const key = `comm-${e.community_name}-${e.community_latitude}-${e.community_longitude}`;
        if (!locMap.has(key)) {
          locMap.set(key, {
            id: key,
            name: e.community_name,
            type: "community",
            lat: e.community_latitude,
            lng: e.community_longitude,
            meta: {
              state: e.state,
              lga: e.lga,
              ward: e.ward,
              flhf_name: e.flhf_name,
              accessibility: e.accessibility || undefined,
              terrain: e.terrain_type || undefined,
              population: (e.estimated_children_5_14 || 0) + (e.estimated_adults_15_plus || 0) || e.estimated_total_population || undefined,
            },
          });
        }
      }

      // Settlements
      if (e.settlement_name && e.settlement_latitude && e.settlement_longitude) {
        const key = `sett-${e.settlement_name}-${e.settlement_latitude}-${e.settlement_longitude}`;
        if (!locMap.has(key)) {
          locMap.set(key, {
            id: key,
            name: e.settlement_name,
            type: "settlement",
            lat: e.settlement_latitude,
            lng: e.settlement_longitude,
            meta: {
              state: e.state,
              lga: e.lga,
              ward: e.ward,
              flhf_name: e.flhf_name,
              accessibility: e.accessibility || undefined,
              terrain: e.terrain_type || undefined,
              population: (e.estimated_children_5_14 || 0) + (e.estimated_adults_15_plus || 0) || e.estimated_total_population || undefined,
            },
          });
        }
      }
    });

    return Array.from(locMap.values());
  }, [entries]);

  // Separate FLHF list for "Your location" and destination options
  const flhfLocations = useMemo(() => allLocations.filter((l) => l.type === "flhf"), [allLocations]);
  const destinationLocations = useMemo(
    () => allLocations.filter((l) => l.id !== originId),
    [allLocations, originId]
  );
  const originLocations = useMemo(
    () => allLocations.filter((l) => l.id !== destId),
    [allLocations, destId]
  );

  const origin = useMemo(() => allLocations.find((l) => l.id === originId) || null, [allLocations, originId]);
  const destination = useMemo(() => allLocations.find((l) => l.id === destId) || null, [allLocations, destId]);

  // Route calculation
  const routeInfo = useMemo(() => {
    if (!origin || !destination) return null;
    const dist = haversine(origin.lat, origin.lng, destination.lat, destination.lng);
    const speed = TRAVEL_SPEEDS[travelMode].speed;
    // Add 30% for road winding factor
    const roadDist = dist * 1.3;
    const duration = roadDist / speed;
    return { distKm: Math.round(roadDist * 10) / 10, durationHrs: duration, straightDist: Math.round(dist * 10) / 10 };
  }, [origin, destination, travelMode]);

  // Swap origin & destination
  const handleSwap = () => {
    const o = originId;
    const d = destId;
    setOriginId(d);
    setDestId(o);
  };

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    });

    // Google Maps-like tile layer
    L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      maxZoom: 20,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

    routeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Default view Nigeria
    map.setView([9.06, 7.49], 6);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw route when origin/destination change
  useEffect(() => {
    if (!mapRef.current || !routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();

    if (!origin || !destination) {
      // Show ALL geotagged locations when no route selected
      allLocations.forEach((loc) => {
        const color = loc.type === "flhf" ? "#4285F4" : loc.type === "community" ? "#34A853" : "#FBBC05";
        const emoji = loc.type === "flhf" ? "🏥" : loc.type === "community" ? "🏘️" : "🏠";
        const label = loc.type === "flhf" ? "Health Facility" : loc.type === "community" ? "Community" : "Settlement";
        L.marker([loc.lat, loc.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="
              display:flex;align-items:center;justify-content:center;
              width:32px;height:32px;
              background:${color};border-radius:50%;
              border:3px solid white;
              box-shadow:0 2px 8px rgba(0,0,0,0.3);
              font-size:14px;
            ">${emoji}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
        })
          .bindPopup(
            `<div style="font-family:system-ui;min-width:160px;">
              <p style="font-weight:700;font-size:14px;margin:0 0 4px;">${loc.name}</p>
              <p style="font-size:11px;color:#5f6368;margin:0;">${label}</p>
              <p style="font-size:11px;color:#5f6368;margin:2px 0 0;">${loc.meta.lga}, ${loc.meta.state}</p>
              ${loc.meta.population ? `<p style="font-size:11px;color:#5f6368;margin:2px 0 0;">Pop: ${loc.meta.population.toLocaleString()}</p>` : ""}
            </div>`
          )
          .addTo(routeLayerRef.current!);
      });

      if (allLocations.length > 0) {
        const bounds = allLocations.map((l) => [l.lat, l.lng] as L.LatLngTuple);
        mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 12 });
      }
      return;
    }

    const map = mapRef.current;
    const layer = routeLayerRef.current;

    // --- Origin marker (blue dot like Google's "Your location") ---
    L.marker([origin.lat, origin.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="position:relative;">
          <div style="
            width:20px;height:20px;
            background:#4285F4;
            border-radius:50%;
            border:3px solid white;
            box-shadow:0 2px 8px rgba(66,133,244,0.5);
          "></div>
          <div style="
            position:absolute;top:-3px;left:-3px;
            width:26px;height:26px;
            border-radius:50%;
            border:2px solid rgba(66,133,244,0.3);
            animation: pulse-ring 2s ease-out infinite;
          "></div>
        </div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
      zIndexOffset: 1000,
    })
      .bindPopup(
        `<div style="font-family:system-ui;min-width:180px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <div style="width:10px;height:10px;background:#4285F4;border-radius:50%;"></div>
            <span style="font-weight:700;font-size:13px;">Your location</span>
          </div>
          <p style="font-weight:600;font-size:14px;margin:4px 0 2px;">${origin.name}</p>
          <p style="font-size:11px;color:#5f6368;margin:0;">${origin.type === "flhf" ? "Health Facility" : origin.type === "community" ? "Community" : "Settlement"}</p>
          <p style="font-size:11px;color:#5f6368;margin:2px 0 0;">${origin.meta.lga}, ${origin.meta.state}</p>
        </div>`
      )
      .addTo(layer);

    // --- Destination marker (red pin like Google Maps) ---
    L.marker([destination.lat, destination.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="position:relative;width:28px;height:40px;">
          <svg width="28" height="40" viewBox="0 0 28 40" fill="none">
            <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 40 14 40S28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="#EA4335"/>
            <circle cx="14" cy="14" r="6" fill="#B31412"/>
            <circle cx="14" cy="14" r="4" fill="white"/>
          </svg>
        </div>`,
        iconSize: [28, 40],
        iconAnchor: [14, 40],
        popupAnchor: [0, -36],
      }),
      zIndexOffset: 999,
    })
      .bindPopup(
        `<div style="font-family:system-ui;min-width:180px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <svg width="12" height="16" viewBox="0 0 28 40"><path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 40 14 40S28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="#EA4335"/></svg>
            <span style="font-weight:700;font-size:13px;">Destination</span>
          </div>
          <p style="font-weight:600;font-size:14px;margin:4px 0 2px;">${destination.name}</p>
          <p style="font-size:11px;color:#5f6368;margin:0;">${destination.type === "flhf" ? "Health Facility" : destination.type === "community" ? "Community" : "Settlement"}</p>
          <p style="font-size:11px;color:#5f6368;margin:2px 0 0;">${destination.meta.lga}, ${destination.meta.state}</p>
          ${destination.meta.population ? `<p style="font-size:11px;color:#5f6368;margin:2px 0 0;">Population: ${destination.meta.population.toLocaleString()}</p>` : ""}
        </div>`
      )
      .addTo(layer);

    // --- Route polyline (Google Maps blue route) ---
    // Create a realistic-looking curved path between origin and destination
    const points = generateRoutePath(
      [origin.lat, origin.lng],
      [destination.lat, destination.lng]
    );

    // Glow/shadow line
    L.polyline(points, {
      color: "#4285F4",
      weight: 10,
      opacity: 0.2,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layer);

    // Outer stroke
    L.polyline(points, {
      color: "#1a73e8",
      weight: 6,
      opacity: 0.5,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layer);

    // Main route line
    L.polyline(points, {
      color: "#4285F4",
      weight: 4,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layer);

    // Distance label at midpoint
    if (routeInfo) {
      const mid = points[Math.floor(points.length / 2)];
      L.marker(mid, {
        icon: L.divIcon({
          className: "",
          html: `<div style="
            background:#1a73e8;
            color:white;
            padding:4px 10px;
            border-radius:16px;
            font-size:12px;
            font-weight:700;
            font-family:system-ui;
            white-space:nowrap;
            box-shadow:0 2px 8px rgba(26,115,232,0.4);
            display:flex;align-items:center;gap:4px;
          ">${formatDuration(routeInfo.durationHrs)}&nbsp;&nbsp;🔵</div>`,
          iconSize: [120, 28],
          iconAnchor: [60, 14],
        }),
        interactive: false,
      }).addTo(layer);
    }

    // Fit bounds
    const bounds: L.LatLngTuple[] = [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ];
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
  }, [origin, destination, routeInfo, allLocations]);

  // Generate a curved path between two points to simulate road routing
  const generateRoutePath = (
    start: [number, number],
    end: [number, number]
  ): L.LatLngTuple[] => {
    const points: L.LatLngTuple[] = [];
    const steps = 20;
    const dLat = end[0] - start[0];
    const dLng = end[1] - start[1];

    // Add slight curve with perpendicular offset
    const perpLat = -dLng * 0.08;
    const perpLng = dLat * 0.08;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Quadratic bezier with control point offset
      const ct = Math.sin(t * Math.PI); // curve factor (0 at ends, 1 at middle)
      const lat = start[0] + dLat * t + perpLat * ct * 0.4;
      const lng = start[1] + dLng * t + perpLng * ct * 0.4;
      // Add tiny jitter for road-like feel
      const jitterLat = (Math.sin(t * 47) * 0.001 + Math.sin(t * 23) * 0.0005) * Math.min(Math.abs(dLat), 0.5);
      const jitterLng = (Math.cos(t * 31) * 0.001 + Math.cos(t * 17) * 0.0005) * Math.min(Math.abs(dLng), 0.5);
      points.push([lat + jitterLat, lng + jitterLng]);
    }
    return points;
  };

  const toggleFullscreen = () => {
    const el = mapContainerRef.current?.parentElement?.parentElement;
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

  // Invalidate map size on fullscreen change
  useEffect(() => {
    setTimeout(() => mapRef.current?.invalidateSize(), 300);
  }, [isFullscreen]);

  const clearRoute = () => {
    setOriginId("");
    setDestId("");
  };

  const typeIcon = (type: string) => {
    if (type === "flhf") return "🏥";
    if (type === "community") return "🏘️";
    return "🏠";
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (originRef.current && !originRef.current.contains(e.target as Node)) setOriginFocused(false);
      if (destRef.current && !destRef.current.contains(e.target as Node)) setDestFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filterLocs = (locs: LocationOption[], q: string) => {
    if (!q.trim()) return locs;
    const s = q.toLowerCase();
    return locs.filter(l =>
      l.name.toLowerCase().includes(s) ||
      l.meta.lga.toLowerCase().includes(s) ||
      l.meta.state.toLowerCase().includes(s) ||
      l.meta.ward.toLowerCase().includes(s) ||
      (l.meta.flhf_name && l.meta.flhf_name.toLowerCase().includes(s))
    );
  };

  const renderSearchableSelector = (
    value: string,
    onSelect: (id: string) => void,
    locations: LocationOption[],
    search: string,
    setSearch: (s: string) => void,
    focused: boolean,
    setFocused: (b: boolean) => void,
    containerRef: React.RefObject<HTMLDivElement>,
    placeholder: string,
  ) => {
    const selected = allLocations.find(l => l.id === value);
    const filtered = filterLocs(locations, search);
    const flhfs = filtered.filter(l => l.type === "flhf");
    const comms = filtered.filter(l => l.type === "community");
    const setts = filtered.filter(l => l.type === "settlement");
    const total = filtered.length;
    const showList = focused;

    return (
      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-1.5 h-11 bg-muted/40 rounded-lg px-3 focus-within:ring-2 focus-within:ring-primary/30">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            type="text"
            value={focused ? search : (selected ? `${typeIcon(selected.type)} ${selected.name} — ${selected.meta.lga}` : "")}
            onChange={e => { setSearch(e.target.value); if (!focused) setFocused(true); }}
            onFocus={() => { setFocused(true); setSearch(""); }}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none text-sm font-medium placeholder:text-muted-foreground min-w-0"
          />
          {value && !focused && (
            <button onClick={() => { onSelect(""); setSearch(""); }} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {showList && (
          <div className="absolute left-0 right-0 top-full mt-1 z-[9999] bg-popover border border-border rounded-xl shadow-2xl max-h-[280px] overflow-y-auto">
            {total === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No locations match "{search}"
              </div>
            ) : (
              <>
                {flhfs.length > 0 && (
                  <>
                    <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/5 border-b border-border/50">
                      🏥 Health Facilities ({flhfs.length})
                    </div>
                    {flhfs.map(l => (
                      <button key={l.id} onClick={() => { onSelect(l.id); setFocused(false); setSearch(""); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent/50 active:bg-accent transition-colors flex items-center gap-2.5 border-b border-border/20 last:border-0">
                        <span className="text-base shrink-0">🏥</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate text-foreground">{l.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{l.meta.ward} · {l.meta.lga}, {l.meta.state}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
                {comms.length > 0 && (
                  <>
                    <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-b border-border/50">
                      🏘️ Communities ({comms.length})
                    </div>
                    {comms.map(l => (
                      <button key={l.id} onClick={() => { onSelect(l.id); setFocused(false); setSearch(""); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent/50 active:bg-accent transition-colors flex items-center gap-2.5 border-b border-border/20 last:border-0">
                        <span className="text-base shrink-0">🏘️</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate text-foreground">{l.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{l.meta.flhf_name ? `${l.meta.flhf_name} · ` : ""}{l.meta.lga}, {l.meta.state}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
                {setts.length > 0 && (
                  <>
                    <div className="sticky top-0 z-10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-b border-border/50">
                      🏠 Settlements ({setts.length})
                    </div>
                    {setts.map(l => (
                      <button key={l.id} onClick={() => { onSelect(l.id); setFocused(false); setSearch(""); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent/50 active:bg-accent transition-colors flex items-center gap-2.5 border-b border-border/20 last:border-0">
                        <span className="text-base shrink-0">🏠</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate text-foreground">{l.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{l.meta.lga}, {l.meta.state}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0 relative">
      {/* Google Maps-style Directions Card */}
      <Card className="border-0 shadow-lg rounded-xl overflow-visible">
        {/* Direction inputs header */}
        <div className="bg-white dark:bg-card">
          <div className="flex items-stretch">
            {/* Route dots */}
            <div className="flex flex-col items-center justify-center px-3 py-4 gap-0.5">
              <div className="w-3 h-3 rounded-full bg-[#4285F4] border-2 border-white shadow" />
              <div className="w-0.5 flex-1 bg-border min-h-[20px]" />
              <div className="w-3 h-3 rounded-full bg-[#EA4335] border-2 border-white shadow" />
            </div>

            {/* Inputs */}
            <div className="flex-1 py-3 pr-2 space-y-1.5">
              {/* Origin searchable selector */}
              {renderSearchableSelector(originId, setOriginId, originLocations, originSearch, setOriginSearch, originFocused, setOriginFocused, originRef as React.RefObject<HTMLDivElement>, "Search origin location...")}

              {/* Destination searchable selector */}
              {renderSearchableSelector(destId, setDestId, destinationLocations, destSearch, setDestSearch, destFocused, setDestFocused, destRef as React.RefObject<HTMLDivElement>, "Search destination...")}
            </div>

            {/* Swap & actions */}
            <div className="flex flex-col items-center justify-center px-2 gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-muted"
                onClick={handleSwap}
                disabled={!originId && !destId}
              >
                <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
              </Button>
              {(originId || destId) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full hover:bg-muted"
                  onClick={clearRoute}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>

          {/* Travel mode tabs */}
          <div className="flex items-center border-t border-border/50 px-3">
            {(Object.entries(TRAVEL_SPEEDS) as [TravelMode, typeof TRAVEL_SPEEDS["drive"]][]).map(([mode, config]) => {
              const Icon = config.icon;
              const isActive = travelMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setTravelMode(mode)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${
                    isActive
                      ? "border-[#4285F4] text-[#4285F4]"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{config.label}</span>
                  {routeInfo && isActive && (
                    <span className="ml-1 text-[10px] font-bold">{formatDuration(routeInfo.durationHrs)}</span>
                  )}
                </button>
              );
            })}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Map */}
        <div className="relative">
          <div
            ref={mapContainerRef}
            style={{ height: isFullscreen ? "calc(100vh - 200px)" : "480px", width: "100%" }}
            onClick={(e) => {
              if (streetViewActive && mapRef.current) {
                const rect = mapContainerRef.current?.getBoundingClientRect();
                if (rect) {
                  const point = mapRef.current.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top]);
                  setStreetViewCoords({ lat: point.lat, lng: point.lng });
                }
              }
            }}
          />

          {/* Pegman control */}
          <PegmanControl
            isActive={streetViewActive}
            onActivate={() => {
              if (streetViewActive) {
                setStreetViewActive(false);
                setStreetViewCoords(null);
              } else {
                setStreetViewActive(true);
              }
            }}
          />

          {/* My location button */}
          <button
            onClick={() => mapRef.current && origin && mapRef.current.setView([origin.lat, origin.lng], 13, { animate: true })}
            className="absolute bottom-20 right-3 z-[1000] w-10 h-10 bg-background rounded-full shadow-lg flex items-center justify-center hover:bg-muted transition-colors"
            title="Go to origin"
            style={{ bottom: streetViewCoords ? "370px" : undefined }}
          >
            <LocateFixed className="h-5 w-5 text-muted-foreground" />
          </button>

          {/* Street View Panel */}
          {streetViewCoords && (
            <StreetViewPanel
              lat={streetViewCoords.lat}
              lng={streetViewCoords.lng}
              onClose={() => {
                setStreetViewCoords(null);
                setStreetViewActive(false);
              }}
            />
          )}
        </div>

        {/* Route info panel - Google Maps bottom sheet style */}
        {routeInfo && origin && destination && (
          <div className="border-t border-border bg-white dark:bg-card">
            {/* Drag handle */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-center py-1.5"
            >
              <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
            </button>

            {/* Travel mode summary */}
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-foreground">{formatDuration(routeInfo.durationHrs)}</span>
                    <span className="text-sm text-muted-foreground">({routeInfo.distKm} km)</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Estimated · via {travelMode === "drive" ? "road" : travelMode === "bike" ? "cycling" : "walking"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={async () => {
                      const shareUrl = `https://www.google.com/maps/dir/${origin.lat},${origin.lng}/${destination.lat},${destination.lng}`;
                      const shareText = `Route: ${origin.name} → ${destination.name} (${routeInfo.distKm} km, ~${formatDuration(routeInfo.durationHrs)} by ${travelMode})`;
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            title: `Route: ${origin.name} → ${destination.name}`,
                            text: shareText,
                            url: shareUrl,
                          });
                        } catch (err) {
                          // User cancelled share — ignore
                        }
                      } else {
                        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                        // Using a simple DOM approach since toast import may vary
                        const el = document.createElement("div");
                        el.textContent = "Route link copied to clipboard!";
                        el.className = "fixed bottom-4 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-lg text-sm font-medium z-[10000] shadow-lg";
                        document.body.appendChild(el);
                        setTimeout(() => el.remove(), 2500);
                      }
                    }}
                    title="Share route"
                  >
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              {/* All travel modes comparison */}
              {showDetails && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(TRAVEL_SPEEDS) as [TravelMode, typeof TRAVEL_SPEEDS["drive"]][]).map(([mode, config]) => {
                      const Icon = config.icon;
                      const dur = (routeInfo.distKm) / config.speed;
                      const isActive = travelMode === mode;
                      return (
                        <button
                          key={mode}
                          onClick={() => setTravelMode(mode)}
                          className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                            isActive
                              ? "bg-[#E8F0FE] dark:bg-primary/10 border border-[#4285F4]/30"
                              : "bg-muted/30 hover:bg-muted/50 border border-transparent"
                          }`}
                        >
                          <Icon className={`h-5 w-5 ${isActive ? "text-[#4285F4]" : "text-muted-foreground"}`} />
                          <span className={`text-sm font-bold ${isActive ? "text-[#4285F4]" : "text-foreground"}`}>
                            {formatDuration(dur)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{config.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Route details */}
                  <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#4285F4]" />
                      <span className="font-medium flex-1">{origin.name}</span>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                        {origin.type === "flhf" ? "FLHF" : origin.type === "community" ? "Community" : "Settlement"}
                      </Badge>
                    </div>
                    <div className="ml-1 border-l-2 border-[#4285F4]/30 pl-4 py-1">
                      <p className="text-[11px] text-muted-foreground">
                        {routeInfo.distKm} km · {formatDuration(routeInfo.durationHrs)} by {travelMode}
                      </p>
                      {destination.meta.accessibility && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Accessibility: <span className="font-medium capitalize">{destination.meta.accessibility.replace(/_/g, " ")}</span>
                        </p>
                      )}
                      {destination.meta.terrain && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Terrain: <span className="font-medium capitalize">{destination.meta.terrain}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#EA4335]" />
                      <span className="font-medium flex-1">{destination.name}</span>
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                        {destination.type === "flhf" ? "FLHF" : destination.type === "community" ? "Community" : "Settlement"}
                      </Badge>
                    </div>
                    {destination.meta.population && (
                      <div className="ml-4 text-[11px] text-muted-foreground">
                        Target population: <span className="font-semibold text-foreground">{destination.meta.population.toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Open in Google Maps */}
                  <a
                    href={`https://www.google.com/maps/dir/${origin.lat},${origin.lng}/${destination.lat},${destination.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#4285F4] hover:bg-[#3367d6] text-white font-medium text-sm transition-colors"
                  >
                    <Navigation className="h-4 w-4" />
                    Open in Google Maps
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Empty state */}
      {allLocations.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Navigation className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No geotagged locations</p>
          <p className="text-xs mt-1">
            Add GPS coordinates for FLHFs, communities, and settlements to enable route navigation.
          </p>
        </div>
      )}

      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default TravelRouteMap;
