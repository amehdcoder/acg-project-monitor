import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Building2, Layers, Users, MapPin, Clock, Activity, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface Props {
  projectId: string;
  formId: string;
}

interface IndoorPosition {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  accuracy: number;
  floor: number;
  timestamp: string;
  formName: string;
}

interface FacilityZone {
  name: string;
  center: [number, number];
  radius: number;
  submissions: number;
  collectors: string[];
}

const IndoorTrackingView = ({ projectId, formId }: Props) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [positions, setPositions] = useState<IndoorPosition[]>([]);
  const [zones, setZones] = useState<FacilityZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [floorFilter, setFloorFilter] = useState("all");
  const [accuracyThreshold, setAccuracyThreshold] = useState(50);
  const [floors, setFloors] = useState<number[]>([]);

  // Initialize map with detailed street view
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [9.06, 7.49], zoom: 18, zoomControl: false, maxZoom: 22,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; CARTO', maxZoom: 22,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Fetch indoor positions from high-accuracy submissions
  const fetchIndoorData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data: assignments } = await supabase
        .from("user_project_assignments")
        .select("user_id")
        .eq("project_id", projectId);
      if (!assignments?.length) { setLoading(false); return; }

      const userIds = assignments.map(a => a.user_id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);

      // Get submissions with location data (high accuracy = indoor)
      let query = supabase
        .from("form_submissions")
        .select("user_id, location, submitted_at, form_id, data")
        .in("user_id", userIds)
        .not("location", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(500);
      
      if (formId) query = query.eq("form_id", formId);

      const { data: submissions } = await query;

      // Get form names
      const formIds = [...new Set(submissions?.map(s => s.form_id) || [])];
      const { data: forms } = await supabase
        .from("forms")
        .select("id, name")
        .in("id", formIds.length ? formIds : ["__none__"]);

      const profileMap = new Map(profiles?.map(p => [p.user_id, `${p.first_name} ${p.last_name}`]) || []);
      const formMap = new Map(forms?.map(f => [f.id, f.name]) || []);

      const indoorPositions: IndoorPosition[] = [];
      const zoneMap = new Map<string, FacilityZone>();
      const detectedFloors = new Set<number>();

      submissions?.forEach(sub => {
        const loc = sub.location as any;
        if (!loc) return;
        const lat = loc.lat || loc.latitude;
        const lng = loc.lng || loc.longitude;
        const accuracy = loc.accuracy || 999;
        if (!lat || !lng) return;

        // Estimate floor from altitude or default to ground
        const altitude = loc.altitude || 0;
        const floor = altitude > 3 ? Math.floor(altitude / 3) : 0;
        detectedFloors.add(floor);

        // Only include high-accuracy readings for indoor tracking
        if (accuracy <= accuracyThreshold) {
          indoorPositions.push({
            userId: sub.user_id,
            name: profileMap.get(sub.user_id) || "Unknown",
            lat, lng, accuracy, floor,
            timestamp: sub.submitted_at || sub.created_at || "",
            formName: formMap.get(sub.form_id) || "Unknown Form",
          });
        }

        // Build facility zones by clustering nearby submissions
        const zoneKey = `${Math.round(lat * 1000) / 1000},${Math.round(lng * 1000) / 1000}`;
        if (!zoneMap.has(zoneKey)) {
          zoneMap.set(zoneKey, {
            name: formMap.get(sub.form_id) || `Zone ${zoneMap.size + 1}`,
            center: [lat, lng],
            radius: 30,
            submissions: 0,
            collectors: [],
          });
        }
        const zone = zoneMap.get(zoneKey)!;
        zone.submissions++;
        if (!zone.collectors.includes(sub.user_id)) {
          zone.collectors.push(sub.user_id);
        }
      });

      setPositions(indoorPositions);
      setZones(Array.from(zoneMap.values()).sort((a, b) => b.submissions - a.submissions));
      setFloors(Array.from(detectedFloors).sort());
    } catch (e) {
      console.error("Indoor tracking error:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, formId, accuracyThreshold]);

  useEffect(() => { fetchIndoorData(); }, [fetchIndoorData]);

  // Render on map
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    const layer = layerRef.current;
    layer.clearLayers();

    const filteredPositions = floorFilter === "all"
      ? positions
      : positions.filter(p => p.floor === parseInt(floorFilter));

    // Draw facility zones as building footprints
    zones.forEach(zone => {
      const intensity = Math.min(0.6, 0.1 + zone.submissions * 0.02);
      L.circle(zone.center, {
        radius: zone.radius + zone.submissions * 2,
        fillColor: "#6366f1",
        fillOpacity: intensity,
        color: "#6366f1",
        weight: 1,
        opacity: 0.4,
        dashArray: "4,4",
      }).addTo(layer).bindPopup(`
        <div style="min-width:160px">
          <strong>🏢 ${zone.name}</strong><br/>
          📊 ${zone.submissions} submissions<br/>
          👥 ${zone.collectors.length} collector${zone.collectors.length !== 1 ? "s" : ""}<br/>
        </div>
      `);
    });

    // Draw collector trail lines per user
    const userTrails = new Map<string, IndoorPosition[]>();
    filteredPositions.forEach(p => {
      if (!userTrails.has(p.userId)) userTrails.set(p.userId, []);
      userTrails.get(p.userId)!.push(p);
    });

    const trailColors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
    let colorIdx = 0;
    userTrails.forEach((trail, userId) => {
      if (trail.length < 2) return;
      const color = trailColors[colorIdx % trailColors.length];
      colorIdx++;
      // Sort by time
      trail.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const coords = trail.map(p => [p.lat, p.lng] as [number, number]);
      L.polyline(coords, { color, weight: 3, opacity: 0.7 }).addTo(layer);
      // Direction arrows
      if (coords.length >= 2) {
        const last = coords[coords.length - 1];
        const prev = coords[coords.length - 2];
        const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 180 / Math.PI;
        L.marker(last, {
          icon: L.divIcon({
            className: "",
            html: `<div style="transform:rotate(${angle}deg);color:${color};font-size:18px;">➤</div>`,
            iconSize: [20, 20], iconAnchor: [10, 10],
          }),
        }).addTo(layer);
      }
    });

    // Draw position markers
    filteredPositions.forEach(p => {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 7,
        fillColor: "#22c55e",
        fillOpacity: 0.85,
        color: "#fff",
        weight: 2,
      }).addTo(layer);

      marker.bindPopup(`
        <div style="min-width:180px">
          <strong>${p.name}</strong><br/>
          🏢 Floor ${p.floor}<br/>
          📋 ${p.formName}<br/>
          🎯 ±${Math.round(p.accuracy)}m accuracy<br/>
          🕐 ${p.timestamp ? format(new Date(p.timestamp), "MMM d, h:mm a") : "N/A"}
        </div>
      `);
    });

    // Fit bounds
    if (filteredPositions.length > 0) {
      const bounds = L.latLngBounds(filteredPositions.map(p => [p.lat, p.lng]));
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });
    }
  }, [positions, zones, floorFilter]);

  const uniqueCollectors = new Set(positions.map(p => p.userId)).size;

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10"><Building2 className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Facility Zones</p>
              <p className="text-xl font-bold">{zones.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-green-500/10"><Users className="h-4 w-4 text-green-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Tracked Collectors</p>
              <p className="text-xl font-bold">{uniqueCollectors}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10"><MapPin className="h-4 w-4 text-blue-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Position Readings</p>
              <p className="text-xl font-bold">{positions.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10"><Layers className="h-4 w-4 text-amber-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Floors Detected</p>
              <p className="text-xl font-bold">{floors.length}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <Card className="border-0 shadow-card overflow-hidden">
            <div ref={mapContainerRef} style={{ height: "550px", width: "100%" }} className="rounded-lg" />
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">FLOOR FILTER</p>
                <Select value={floorFilter} onValueChange={setFloorFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Floors</SelectItem>
                    {floors.map(f => (
                      <SelectItem key={f} value={String(f)}>Floor {f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  ACCURACY THRESHOLD: ±{accuracyThreshold}m
                </p>
                <Slider
                  value={[accuracyThreshold]}
                  onValueChange={([v]) => setAccuracyThreshold(v)}
                  min={5} max={200} step={5}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>5m (precise)</span><span>200m</span>
                </div>
              </div>
              <Button onClick={fetchIndoorData} disabled={loading || !projectId} className="w-full gap-2" size="sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Refresh Data
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />Top Zones
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[280px] overflow-y-auto">
                {!projectId ? (
                  <p className="text-sm text-muted-foreground p-4">Select a project</p>
                ) : zones.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">No indoor zones detected</p>
                ) : (
                  zones.slice(0, 10).map((z, i) => (
                    <div key={i} className="px-4 py-3 border-b border-border">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate">{z.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{z.submissions} subs</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        👥 {z.collectors.length} collector{z.collectors.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default IndoorTrackingView;
