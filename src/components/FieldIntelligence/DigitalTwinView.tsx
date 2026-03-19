import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Box, Layers, Activity, Users, MapPin, TrendingUp, Clock, Loader2,
  BarChart3, Eye, Thermometer, Zap, Play, Pause, SkipBack, SkipForward
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, CartesianGrid, Cell, Legend
} from "recharts";

interface Props {
  projectId: string;
  formId: string;
}

interface EnvironmentSnapshot {
  lat: number;
  lng: number;
  submissions: number;
  collectors: string[];
  avgAccuracy: number;
  geofenceCompliance: number;
  peakHour: number;
  formNames: string[];
  lastActivity: string;
}

interface TimeSlice {
  hour: string;
  submissions: number;
  activeCollectors: number;
  geofenceRate: number;
}

interface TimelineEntry {
  timestamp: string;
  lat: number;
  lng: number;
  userId: string;
  formName: string;
  withinGeofence: boolean;
}

const DigitalTwinView = ({ projectId, formId }: Props) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<any>(null);
  const timelineLayerRef = useRef<L.LayerGroup | null>(null);

  const [snapshots, setSnapshots] = useState<EnvironmentSnapshot[]>([]);
  const [timeSlices, setTimeSlices] = useState<TimeSlice[]>([]);
  const [scatterData, setScatterData] = useState<any[]>([]);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [show3DExtrusions, setShow3DExtrusions] = useState(true);
  const [timeWindow, setTimeWindow] = useState("7d");
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [totalCollectors, setTotalCollectors] = useState(0);
  const [avgCompliance, setAvgCompliance] = useState(0);

  // Timeline scrubber state
  const [timelinePosition, setTimelinePosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [heatmapIntensity, setHeatmapIntensity] = useState(0.6);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [9.06, 7.49], zoom: 6, zoomControl: false,
    });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: '&copy; Esri', maxZoom: 20,
    }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
      maxZoom: 20, pane: "overlayPane",
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    timelineLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const buildDigitalTwin = useCallback(async () => {
    setLoading(true);
    try {
      const days = timeWindow === "1d" ? 1 : timeWindow === "7d" ? 7 : 30;
      const since = subDays(new Date(), days).toISOString();

      let userIds: string[];
      if (projectId) {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("user_id")
          .eq("project_id", projectId);
        if (!assignments?.length) { setLoading(false); return; }
        userIds = assignments.map(a => a.user_id);
      } else {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("is_active", true)
          .limit(500);
        if (!profiles?.length) { setLoading(false); return; }
        userIds = profiles.map(p => p.user_id);
      }

      let query = supabase
        .from("form_submissions")
        .select("user_id, location, submitted_at, form_id, within_geofence")
        .in("user_id", userIds)
        .gte("submitted_at", since)
        .not("location", "is", null)
        .order("submitted_at", { ascending: true })
        .limit(1000);
      if (formId) query = query.eq("form_id", formId);
      const { data: submissions } = await query;

      const formIds = [...new Set(submissions?.map(s => s.form_id) || [])];
      const { data: forms } = await supabase
        .from("forms")
        .select("id, name, geofence")
        .in("id", formIds.length ? formIds : ["__none__"]);
      const formMap = new Map(forms?.map(f => [f.id, f.name]) || []);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.user_id, `${p.first_name} ${p.last_name}`]) || []);

      // Build timeline entries for scrubber
      const timeline: TimelineEntry[] = [];
      const gridSize = 0.01;
      const cellMap = new Map<string, EnvironmentSnapshot>();
      const hourlyData: Record<number, { subs: number; users: Set<string>; geofenced: number; total: number }> = {};
      for (let h = 0; h < 24; h++) {
        hourlyData[h] = { subs: 0, users: new Set(), geofenced: 0, total: 0 };
      }

      let totalGeo = 0, totalGeoTrue = 0;

      submissions?.forEach(sub => {
        const loc = sub.location as any;
        if (!loc) return;
        const lat = loc.lat || loc.latitude;
        const lng = loc.lng || loc.longitude;
        if (!lat || !lng) return;

        // Timeline entry
        timeline.push({
          timestamp: sub.submitted_at || "",
          lat, lng,
          userId: sub.user_id,
          formName: formMap.get(sub.form_id) || "Unknown",
          withinGeofence: !!sub.within_geofence,
        });

        const cellKey = `${Math.round(lat / gridSize) * gridSize},${Math.round(lng / gridSize) * gridSize}`;
        if (!cellMap.has(cellKey)) {
          cellMap.set(cellKey, {
            lat: Math.round(lat / gridSize) * gridSize,
            lng: Math.round(lng / gridSize) * gridSize,
            submissions: 0, collectors: [], avgAccuracy: 0,
            geofenceCompliance: 0, peakHour: 0, formNames: [],
            lastActivity: "",
          });
        }
        const cell = cellMap.get(cellKey)!;
        cell.submissions++;
        if (!cell.collectors.includes(sub.user_id)) cell.collectors.push(sub.user_id);
        cell.avgAccuracy += (loc.accuracy || 50);
        if (sub.within_geofence) { cell.geofenceCompliance++; totalGeoTrue++; }
        totalGeo++;
        const fname = formMap.get(sub.form_id);
        if (fname && !cell.formNames.includes(fname)) cell.formNames.push(fname);
        if (!cell.lastActivity || (sub.submitted_at && sub.submitted_at > cell.lastActivity)) {
          cell.lastActivity = sub.submitted_at || "";
        }

        if (sub.submitted_at) {
          const h = new Date(sub.submitted_at).getHours();
          hourlyData[h].subs++;
          hourlyData[h].users.add(sub.user_id);
          hourlyData[h].total++;
          if (sub.within_geofence) hourlyData[h].geofenced++;
        }
      });

      cellMap.forEach(cell => {
        cell.avgAccuracy = Math.round(cell.avgAccuracy / cell.submissions);
        cell.geofenceCompliance = cell.submissions > 0
          ? Math.round((cell.geofenceCompliance / cell.submissions) * 100) : 0;
      });

      const snapshotList = Array.from(cellMap.values()).sort((a, b) => b.submissions - a.submissions);

      const slices: TimeSlice[] = Object.entries(hourlyData).map(([h, d]) => ({
        hour: `${h.padStart(2, "0")}:00`,
        submissions: d.subs,
        activeCollectors: d.users.size,
        geofenceRate: d.total > 0 ? Math.round((d.geofenced / d.total) * 100) : 0,
      }));

      const collectorStats: Record<string, { name: string; subs: number; avgAcc: number; accCount: number }> = {};
      submissions?.forEach(sub => {
        if (!collectorStats[sub.user_id]) {
          collectorStats[sub.user_id] = {
            name: profileMap.get(sub.user_id) || sub.user_id.slice(0, 8),
            subs: 0, avgAcc: 0, accCount: 0,
          };
        }
        const cs = collectorStats[sub.user_id];
        cs.subs++;
        const loc = sub.location as any;
        if (loc?.accuracy) { cs.avgAcc += loc.accuracy; cs.accCount++; }
      });

      const scatter = Object.values(collectorStats).map(cs => ({
        name: cs.name,
        submissions: cs.subs,
        accuracy: cs.accCount > 0 ? Math.round(cs.avgAcc / cs.accCount) : 50,
      }));

      setSnapshots(snapshotList);
      setTimeSlices(slices);
      setScatterData(scatter);
      setTimelineEntries(timeline);
      setTotalSubmissions(submissions?.length || 0);
      setTotalCollectors(new Set(submissions?.map(s => s.user_id)).size);
      setAvgCompliance(totalGeo > 0 ? Math.round((totalGeoTrue / totalGeo) * 100) : 0);
      setTimelinePosition(0);
    } catch (e) {
      console.error("Digital twin error:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, formId, timeWindow]);

  useEffect(() => { buildDigitalTwin(); }, [buildDigitalTwin]);

  // Render heatmap using leaflet.heat
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old heatmap
    if (heatLayerRef.current) {
      mapRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (showHeatmap && snapshots.length > 0) {
      const heatData = snapshots.map(s => [s.lat, s.lng, s.submissions] as [number, number, number]);
      heatLayerRef.current = (L as any).heatLayer(heatData, {
        radius: 30,
        blur: 20,
        maxZoom: 17,
        max: Math.max(...snapshots.map(s => s.submissions), 1),
        gradient: {
          0.2: "#2563eb",
          0.4: "#22c55e",
          0.6: "#eab308",
          0.8: "#f97316",
          1.0: "#ef4444",
        },
        minOpacity: heatmapIntensity * 0.3,
      }).addTo(mapRef.current);
    }
  }, [snapshots, showHeatmap, heatmapIntensity]);

  // Render 3D extrusion markers
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    layerRef.current.clearLayers();

    const maxSubs = Math.max(...snapshots.map(s => s.submissions), 1);

    snapshots.forEach(snap => {
      const intensity = snap.submissions / maxSubs;
      const complianceColor = snap.geofenceCompliance >= 80 ? "#22c55e"
        : snap.geofenceCompliance >= 50 ? "#f59e0b" : "#ef4444";

      if (show3DExtrusions) {
        const height = Math.min(6, Math.ceil(intensity * 6));
        for (let h = 0; h < height; h++) {
          const offset = h * 0.0003;
          L.circle([snap.lat + offset, snap.lng], {
            radius: 200 + snap.submissions * 15,
            fillColor: complianceColor,
            fillOpacity: 0.15 - h * 0.02,
            color: complianceColor,
            weight: 0.5,
            opacity: 0.3,
          }).addTo(layerRef.current!);
        }
      }

      const marker = L.circleMarker([snap.lat, snap.lng], {
        radius: Math.max(8, Math.min(22, 8 + intensity * 14)),
        fillColor: complianceColor,
        fillOpacity: 0.85,
        color: "#fff",
        weight: 2,
      }).addTo(layerRef.current!);

      marker.bindPopup(`
        <div style="min-width:200px">
          <strong>🏗️ Environment Zone</strong><br/>
          📊 ${snap.submissions} submissions<br/>
          👥 ${snap.collectors.length} collectors<br/>
          🎯 ±${snap.avgAccuracy}m avg accuracy<br/>
          ✅ ${snap.geofenceCompliance}% geofence compliance<br/>
          📋 Forms: ${snap.formNames.slice(0, 3).join(", ")}<br/>
          ${snap.lastActivity ? `🕐 Last: ${format(new Date(snap.lastActivity), "MMM d, h:mm a")}` : ""}
        </div>
      `);
    });

    if (snapshots.length > 0 && mapRef.current) {
      const bounds = L.latLngBounds(snapshots.map(s => [s.lat, s.lng]));
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [snapshots, show3DExtrusions]);

  // Timeline playback
  useEffect(() => {
    if (isPlaying && timelineEntries.length > 0) {
      playIntervalRef.current = setInterval(() => {
        setTimelinePosition(prev => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 100;
          }
          return prev + (0.5 * playbackSpeed);
        });
      }, 100);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, playbackSpeed, timelineEntries.length]);

  // Render timeline markers on map
  useEffect(() => {
    if (!mapRef.current || !timelineLayerRef.current || timelineEntries.length === 0) return;
    timelineLayerRef.current.clearLayers();

    const cutoffIndex = Math.floor((timelinePosition / 100) * timelineEntries.length);
    const visibleEntries = timelineEntries.slice(0, cutoffIndex);

    // Color by user
    const userColors = new Map<string, string>();
    const palette = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
    let colorIdx = 0;

    visibleEntries.forEach((entry, i) => {
      if (!userColors.has(entry.userId)) {
        userColors.set(entry.userId, palette[colorIdx % palette.length]);
        colorIdx++;
      }
      const color = userColors.get(entry.userId)!;
      const isLatest = i === visibleEntries.length - 1;

      const marker = L.circleMarker([entry.lat, entry.lng], {
        radius: isLatest ? 8 : 4,
        fillColor: color,
        fillOpacity: isLatest ? 1 : 0.5,
        color: isLatest ? "#fff" : color,
        weight: isLatest ? 3 : 1,
      }).addTo(timelineLayerRef.current!);

      if (isLatest && entry.timestamp) {
        marker.bindPopup(`
          <strong>${entry.formName}</strong><br/>
          ${format(new Date(entry.timestamp), "MMM d, h:mm a")}<br/>
          ${entry.withinGeofence ? "✅ In Geofence" : "❌ Outside Geofence"}
        `).openPopup();
      }
    });

    // Draw movement trails per user
    const userTrails = new Map<string, [number, number][]>();
    visibleEntries.forEach(e => {
      if (!userTrails.has(e.userId)) userTrails.set(e.userId, []);
      userTrails.get(e.userId)!.push([e.lat, e.lng]);
    });
    userTrails.forEach((trail, userId) => {
      if (trail.length >= 2) {
        L.polyline(trail, {
          color: userColors.get(userId) || "#3b82f6",
          weight: 2,
          opacity: 0.6,
          dashArray: "4,4",
        }).addTo(timelineLayerRef.current!);
      }
    });
  }, [timelinePosition, timelineEntries]);

  const currentTimeLabel = timelineEntries.length > 0 ? (() => {
    const idx = Math.min(
      Math.floor((timelinePosition / 100) * timelineEntries.length),
      timelineEntries.length - 1
    );
    return timelineEntries[idx]?.timestamp
      ? format(new Date(timelineEntries[idx].timestamp), "MMM d, h:mm a")
      : "";
  })() : "";

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10"><Box className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Environment Zones</p>
              <p className="text-xl font-bold">{snapshots.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-green-500/10"><Activity className="h-4 w-4 text-green-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Submissions</p>
              <p className="text-xl font-bold">{totalSubmissions}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10"><Users className="h-4 w-4 text-blue-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Active Collectors</p>
              <p className="text-xl font-bold">{totalCollectors}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10"><Thermometer className="h-4 w-4 text-amber-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Geofence Compliance</p>
              <p className="text-xl font-bold">{avgCompliance}%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Timeline Scrubber */}
      <Card>
        <CardContent className="py-3 px-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setTimelinePosition(0); setIsPlaying(false); }}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button size="icon" variant={isPlaying ? "default" : "outline"} className="h-8 w-8" onClick={() => {
                if (timelinePosition >= 100) setTimelinePosition(0);
                setIsPlaying(!isPlaying);
              }}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setTimelinePosition(100)}>
                <SkipForward className="h-4 w-4" />
              </Button>
              <Select value={String(playbackSpeed)} onValueChange={v => setPlaybackSpeed(Number(v))}>
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">0.5x</SelectItem>
                  <SelectItem value="1">1x</SelectItem>
                  <SelectItem value="2">2x</SelectItem>
                  <SelectItem value="4">4x</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {currentTimeLabel || "No data"} • {timelineEntries.length} events
            </div>
          </div>
          <Slider
            value={[timelinePosition]}
            onValueChange={([v]) => { setTimelinePosition(v); setIsPlaying(false); }}
            max={100}
            step={0.5}
            className="w-full"
          />
        </CardContent>
      </Card>

      {/* Map + Controls */}
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
                <Eye className="h-4 w-4 text-primary" />Twin Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">TIME WINDOW</p>
                <Select value={timeWindow} onValueChange={setTimeWindow}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1d">Today</SelectItem>
                    <SelectItem value="7d">7 Days</SelectItem>
                    <SelectItem value="30d">30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Heatmap Density</span>
                <Switch checked={showHeatmap} onCheckedChange={setShowHeatmap} />
              </div>
              {showHeatmap && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Intensity</p>
                  <Slider value={[heatmapIntensity]} onValueChange={([v]) => setHeatmapIntensity(v)} min={0.1} max={1} step={0.1} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm">3D Extrusions</span>
                <Switch checked={show3DExtrusions} onCheckedChange={setShow3DExtrusions} />
              </div>
              <Button onClick={buildDigitalTwin} disabled={loading || !projectId} className="w-full gap-2" size="sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Rebuild Twin
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Zones</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[220px] overflow-y-auto">
                {snapshots.slice(0, 8).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => mapRef.current?.setView([s.lat, s.lng], 15, { animate: true })}
                    className="w-full text-left px-4 py-2 border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{s.formNames[0] || `Zone ${i + 1}`}</span>
                      <Badge variant="secondary" className="text-[10px]">{s.submissions} subs</Badge>
                    </div>
                    <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span>👥 {s.collectors.length}</span>
                      <span>✅ {s.geofenceCompliance}%</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />Hourly Activity Pattern
            </CardTitle>
            <CardDescription>Submission distribution across hours</CardDescription>
          </CardHeader>
          <CardContent>
            {timeSlices.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={timeSlices}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="submissions" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="Submissions" />
                  <Bar dataKey="activeCollectors" fill="#22c55e" radius={[2, 2, 0, 0]} name="Collectors" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {projectId ? "No activity data found" : "Select a project"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />Collector Performance Map
            </CardTitle>
            <CardDescription>Submissions vs GPS accuracy per collector</CardDescription>
          </CardHeader>
          <CardContent>
            {scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="submissions" name="Submissions" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="accuracy" name="Accuracy (m)" tick={{ fontSize: 10 }} unit="m" />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-2 text-xs shadow-lg">
                          <p className="font-medium">{d.name}</p>
                          <p>Submissions: {d.submissions}</p>
                          <p>Avg Accuracy: ±{d.accuracy}m</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} fill="hsl(var(--primary))">
                    {scatterData.map((_, idx) => (
                      <Cell key={idx} fill={scatterData[idx].accuracy > 100 ? "#ef4444" : "hsl(var(--primary))"} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {projectId ? "No collector data found" : "Select a project"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DigitalTwinView;
