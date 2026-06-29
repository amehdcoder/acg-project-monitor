/**
 * LiveTrackingDashboard — Owner / Co-owner / Super Admin only.
 *
 * Online: a free Esri World Imagery satellite map via Leaflet (NO external API
 * key required). Each tracked user is a glowing circle marker that glides to its
 * new position via requestAnimationFrame LERP rather than teleporting, with a
 * polyline tracing its chronological path. New coordinates arrive over the
 * Supabase Realtime broadcast channel `live-tracking` (~5s cadence). Clicking a
 * user opens a live mini-profile (name, speed, battery). Geofence alerts fire
 * when a user enters/leaves a major city.
 *
 * Offline: satellite tiles are swapped for a clean dark SVG grid that keeps
 * animating from locally cached streaming state, so admins never lose the view.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cityContaining } from "@/lib/liveTracking/geofence";
import { getAllPaths, cacheServerPaths, type StoredPath } from "@/lib/locationOfflineQueue";
import { Satellite, Users, Battery, Gauge, X, MapPin, WifiOff } from "lucide-react";
import StreetViewPanel from "@/components/maps/GoogleStreetViewPanel";
import { attachStreetViewControl } from "@/lib/maps/leafletStreetViewControl";

const ANIM_DURATION = 5000;
const MAX_PATH = 500;

const SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
// Esri reference labels — identical overlay to the Coverage Evaluation satellite map.
const LABELS_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

interface UserState {
  user_id: string;
  name: string;
  dispLng: number;
  dispLat: number;
  fromLng: number;
  fromLat: number;
  toLng: number;
  toLat: number;
  animStart: number;
  speed: number | null;
  battery: number | null;
  heading: number | null;
  lastUpdate: number;
  lastCity: string | null;
  path: [number, number][]; // [lng, lat]
}

interface MarkerBundle {
  glow: L.CircleMarker;
  dot: L.CircleMarker;
  label: L.Marker;
  line: L.Polyline;
}

const LiveTrackingDashboard = () => {
  const { isOwner, isCoOwner, isSuperAdmin } = useAuth();
  const allowed = isOwner || isCoOwner || isSuperAdmin;

  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [selected, setSelected] = useState<string | null>(null);
  const [, force] = useState(0); // re-render trigger for the profile panel

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, MarkerBundle>>(new Map());
  const usersRef = useRef<Map<string, UserState>>(new Map());
  const namesRef = useRef<Map<string, string>>(new Map());
  const rafRef = useRef<number | null>(null);
  const mapReadyRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // --- connectivity ---
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // --- load names + history (and cache for offline) ---
  const loadInitial = useCallback(async () => {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email")
      .eq("location_tracking_enabled", true);
    (profs || []).forEach((p: any) => {
      const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "User";
      namesRef.current.set(p.user_id, name);
    });

    if (navigator.onLine) {
      const { data: rows } = await supabase
        .from("locations")
        .select("user_id, latitude, longitude, speed, heading, battery_level, recorded_at")
        .order("recorded_at", { ascending: true })
        .limit(20000);
      const grouped = new Map<string, any[]>();
      (rows || []).forEach((r: any) => {
        const arr = grouped.get(r.user_id) || [];
        arr.push(r);
        grouped.set(r.user_id, arr);
      });
      const toCache: StoredPath[] = [];
      grouped.forEach((arr, uid) => {
        const pts = arr.slice(-MAX_PATH);
        const last = pts[pts.length - 1];
        seedUser(uid, last, pts.map((p) => [p.longitude, p.latitude] as [number, number]));
        toCache.push({
          user_id: uid,
          points: pts.map((p) => ({ lat: p.latitude, lng: p.longitude, t: p.recorded_at })),
          updated_at: last?.recorded_at || new Date().toISOString(),
        });
      });
      cacheServerPaths(toCache).catch(() => {});
    } else {
      const cached = await getAllPaths();
      cached.forEach((c) => {
        const last = c.points[c.points.length - 1];
        if (!last) return;
        seedUser(
          c.user_id,
          { latitude: last.lat, longitude: last.lng, speed: null, heading: null, battery_level: null },
          c.points.slice(-MAX_PATH).map((p) => [p.lng, p.lat] as [number, number])
        );
      });
    }
    refreshSources();
  }, []);

  const seedUser = (uid: string, last: any, path: [number, number][]) => {
    if (!last) return;
    usersRef.current.set(uid, {
      user_id: uid,
      name: namesRef.current.get(uid) || "User",
      dispLng: last.longitude,
      dispLat: last.latitude,
      fromLng: last.longitude,
      fromLat: last.latitude,
      toLng: last.longitude,
      toLat: last.latitude,
      animStart: performance.now(),
      speed: last.speed ?? null,
      battery: last.battery_level ?? null,
      heading: last.heading ?? null,
      lastUpdate: Date.now(),
      lastCity: cityContaining(last.latitude, last.longitude),
      path: path.length ? path : [[last.longitude, last.latitude]],
    });
  };

  // --- incoming broadcast position ---
  const onPosition = useCallback((payload: any) => {
    const uid = payload.user_id as string;
    if (!uid) return;
    const lng = payload.longitude as number;
    const lat = payload.latitude as number;
    const existing = usersRef.current.get(uid);
    const name = namesRef.current.get(uid) || existing?.name || "User";

    if (existing) {
      existing.fromLng = existing.dispLng;
      existing.fromLat = existing.dispLat;
      existing.toLng = lng;
      existing.toLat = lat;
      existing.animStart = performance.now();
      existing.speed = payload.speed ?? existing.speed;
      existing.battery = payload.battery_level ?? existing.battery;
      existing.heading = payload.heading ?? existing.heading;
      existing.lastUpdate = Date.now();
      existing.name = name;
      existing.path.push([lng, lat]);
      if (existing.path.length > MAX_PATH) existing.path = existing.path.slice(-MAX_PATH);
      const city = cityContaining(lat, lng);
      if (city !== existing.lastCity) {
        if (city) toast({ title: "📍 Geofence entered", description: `${name} entered ${city}.` });
        else if (existing.lastCity)
          toast({ title: "🚪 Geofence left", description: `${name} left ${existing.lastCity}.` });
        existing.lastCity = city;
      }
    } else {
      seedUser(uid, { longitude: lng, latitude: lat, speed: payload.speed, heading: payload.heading, battery_level: payload.battery_level }, [[lng, lat]]);
    }
  }, []);

  // --- realtime subscription ---
  useEffect(() => {
    if (!allowed) return;
    loadInitial();
    const channel = supabase
      .channel("live-tracking", { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "position" }, ({ payload }) => onPosition(payload))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [allowed, loadInitial, onPosition]);

  // --- Leaflet marker sync ---
  const refreshSources = useCallback(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    const users = Array.from(usersRef.current.values());

    if (online && map && group && mapReadyRef.current) {
      const seen = new Set<string>();
      users.forEach((u) => {
        seen.add(u.user_id);
        let m = markersRef.current.get(u.user_id);
        const latlng: L.LatLngExpression = [u.dispLat, u.dispLng];
        if (!m) {
          const glow = L.circleMarker(latlng, { radius: 14, color: "transparent", fillColor: "#22d3ee", fillOpacity: 0.2 });
          const dot = L.circleMarker(latlng, { radius: 7, color: "#ffffff", weight: 2, fillColor: "#06b6d4", fillOpacity: 1 });
          const label = L.marker(latlng, {
            icon: L.divIcon({
              className: "",
              html: `<span style="color:#fff;font-size:11px;text-shadow:0 0 3px #0f172a,0 0 3px #0f172a;white-space:nowrap">${escapeXml(u.name)}</span>`,
              iconAnchor: [0, -10],
            }),
            interactive: false,
          });
          const line = L.polyline(u.path.map(([lng, lat]) => [lat, lng] as L.LatLngExpression), {
            color: "#38bdf8",
            weight: 3,
            opacity: 0.85,
          });
          dot.on("click", () => {
            setSelected(u.user_id);
            force((n) => n + 1);
          });
          glow.addTo(group);
          line.addTo(group);
          dot.addTo(group);
          label.addTo(group);
          m = { glow, dot, label, line };
          markersRef.current.set(u.user_id, m);
        } else {
          m.glow.setLatLng(latlng);
          m.dot.setLatLng(latlng);
          m.label.setLatLng(latlng);
          m.line.setLatLngs(u.path.map(([lng, lat]) => [lat, lng] as L.LatLngExpression));
        }
      });
      // remove markers for users no longer present
      markersRef.current.forEach((m, uid) => {
        if (!seen.has(uid)) {
          group.removeLayer(m.glow);
          group.removeLayer(m.dot);
          group.removeLayer(m.label);
          group.removeLayer(m.line);
          markersRef.current.delete(uid);
        }
      });
    }

    if (!online) drawOffline(users);
  }, [online]);

  const tick = useCallback(() => {
    const now = performance.now();
    let dirty = false;
    usersRef.current.forEach((u) => {
      const p = Math.min(1, (now - u.animStart) / ANIM_DURATION);
      const nl = u.fromLng + (u.toLng - u.fromLng) * p;
      const na = u.fromLat + (u.toLat - u.fromLat) * p;
      if (nl !== u.dispLng || na !== u.dispLat) dirty = true;
      u.dispLng = nl;
      u.dispLat = na;
    });
    if (dirty) refreshSources();
    rafRef.current = requestAnimationFrame(tick);
  }, [refreshSources]);

  useEffect(() => {
    if (!allowed) return;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [allowed, tick]);

  // --- Leaflet init ---
  useEffect(() => {
    if (!allowed || !online || !mapContainer.current || mapRef.current) return;
    const map = L.map(mapContainer.current, { center: [9.082, 8.6753], zoom: 6, zoomControl: false });
    L.tileLayer(SAT_URL, { attribution: "Tiles &copy; Esri — World Imagery", maxZoom: 23, maxNativeZoom: 19, detectRetina: true, crossOrigin: true }).addTo(map);
    L.tileLayer(LABELS_URL, { maxZoom: 23, maxNativeZoom: 19, opacity: 0.85, pane: "overlayPane" }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;
    mapRef.current = map;
    mapReadyRef.current = true;
    refreshSources();

    // Leaflet needs an explicit size recalculation when its container is first
    // laid out or later resized (tab switches, viewport changes, orientation
    // flips) — without this the satellite tiles render greyed/partial.
    const fixSize = () => map.invalidateSize({ animate: false });
    const t0 = window.setTimeout(fixSize, 0);
    const t1 = window.setTimeout(fixSize, 300);
    const ro = new ResizeObserver(fixSize);
    if (mapContainer.current) ro.observe(mapContainer.current);
    window.addEventListener("resize", fixSize);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      ro.disconnect();
      window.removeEventListener("resize", fixSize);
      mapReadyRef.current = false;
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, [allowed, online, refreshSources]);

  // --- offline SVG renderer ---
  const drawOffline = (users: UserState[]) => {
    const svg = svgRef.current;
    if (!svg) return;
    const w = svg.clientWidth || 800;
    const h = svg.clientHeight || 500;
    const allPts: [number, number][] = [];
    users.forEach((u) => u.path.forEach((p) => allPts.push(p)));
    users.forEach((u) => allPts.push([u.dispLng, u.dispLat]));
    if (!allPts.length) {
      svg.innerHTML = gridMarkup(w, h) + `<text x="${w / 2}" y="${h / 2}" fill="#64748b" font-size="14" text-anchor="middle">No cached movement yet</text>`;
      return;
    }
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    allPts.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    });
    const pad = 40;
    const spanLng = maxLng - minLng || 0.01;
    const spanLat = maxLat - minLat || 0.01;
    const proj = (lng: number, lat: number): [number, number] => [
      pad + ((lng - minLng) / spanLng) * (w - 2 * pad),
      h - (pad + ((lat - minLat) / spanLat) * (h - 2 * pad)),
    ];
    let markup = gridMarkup(w, h);
    users.forEach((u) => {
      if (u.path.length > 1) {
        const d = u.path.map((p, i) => {
          const [x, y] = proj(p[0], p[1]);
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
        markup += `<path d="${d}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-opacity="0.8" />`;
      }
      const [x, y] = proj(u.dispLng, u.dispLat);
      markup += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="#22d3ee" fill-opacity="0.18" />`;
      markup += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#06b6d4" stroke="#fff" stroke-width="2" />`;
      markup += `<text x="${x.toFixed(1)}" y="${(y - 12).toFixed(1)}" fill="#e2e8f0" font-size="11" text-anchor="middle">${escapeXml(u.name)}</text>`;
    });
    svg.innerHTML = markup;
  };

  const gridMarkup = (w: number, h: number) => {
    let g = `<rect width="${w}" height="${h}" fill="#0b1220" />`;
    const step = 40;
    for (let x = 0; x <= w; x += step) g += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#1e293b" stroke-width="1" />`;
    for (let y = 0; y <= h; y += step) g += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#1e293b" stroke-width="1" />`;
    return g;
  };

  if (!allowed) {
    return (
      <div className="flex h-96 items-center justify-center p-6 text-center">
        <div>
          <MapPin className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="font-display text-xl font-bold">Restricted</h2>
          <p className="text-sm text-muted-foreground">Live tracking is available to the Owner, Co-owners and Super Admins only.</p>
        </div>
      </div>
    );
  }

  const sel = selected ? usersRef.current.get(selected) : null;
  const activeCount = usersRef.current.size;

  return (
    <div className="relative h-[calc(100dvh-7rem)] w-full overflow-hidden rounded-xl border bg-background">
      {/* Header */}
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex flex-wrap items-center gap-2">
        <Badge className="pointer-events-auto gap-1 bg-background/80 text-foreground backdrop-blur">
          <Satellite className="h-3.5 w-3.5 text-primary" /> Live Tracking
        </Badge>
        <Badge variant="secondary" className="pointer-events-auto gap-1">
          <Users className="h-3.5 w-3.5" /> {activeCount} tracked
        </Badge>
        {!online && (
          <Badge variant="destructive" className="pointer-events-auto gap-1">
            <WifiOff className="h-3.5 w-3.5" /> Offline — cached view
          </Badge>
        )}
      </div>

      {/* Map / offline grid */}
      {online ? (
        <div ref={mapContainer} className="h-full w-full" />
      ) : (
        <svg ref={svgRef} className="h-full w-full" preserveAspectRatio="none" />
      )}

      {/* Mini-profile */}
      {sel && (
        <Card className="absolute bottom-4 right-4 z-[1000] w-64 space-y-2 bg-background/95 p-4 shadow-xl backdrop-blur">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold leading-tight">{sel.name}</p>
                <p className="text-xs text-muted-foreground">
                  {sel.lastCity ? `In ${sel.lastCity}` : "En route"}
                </p>
              </div>
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-1.5">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <span>{sel.speed != null ? `${(sel.speed * 3.6).toFixed(1)} km/h` : "—"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Battery className="h-4 w-4 text-muted-foreground" />
              <span>{sel.battery != null ? `${sel.battery}%` : "—"}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Updated {Math.max(0, Math.round((Date.now() - sel.lastUpdate) / 1000))}s ago
          </p>
        </Card>
      )}
    </div>
  );
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

export default LiveTrackingDashboard;
