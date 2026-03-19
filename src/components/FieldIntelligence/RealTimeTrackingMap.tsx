import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radar, Users, Activity, Clock, Locate, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface Props {
  projectId: string;
  formId: string;
  realtimeKey?: number;
}

interface CollectorPosition {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  accuracy?: number;
  lastSeen: string;
  status: "active" | "idle" | "offline";
  submissionCount: number;
}

const statusColors: Record<string, string> = {
  active: "#22c55e",
  idle: "#f59e0b",
  offline: "#94a3b8",
};

const RealTimeTrackingMap = ({ projectId, formId }: Props) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const trailsRef = useRef<Map<string, L.Polyline>>(new Map());
  const [collectors, setCollectors] = useState<CollectorPosition[]>([]);
  const [showTrails, setShowTrails] = useState(true);
  const [selectedCollector, setSelectedCollector] = useState<string | null>(null);

  // Initialize map with street style
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [9.06, 7.49], zoom: 6, zoomControl: false,
    });
    // Street map (Bolt-like)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; CARTO', maxZoom: 20,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Fetch collector positions from field_activity + profiles
  const fetchCollectorPositions = useCallback(async () => {
    if (!projectId) return;
    try {
      // Get users assigned to this project
      const { data: assignments } = await supabase
        .from("user_project_assignments")
        .select("user_id")
        .eq("project_id", projectId);
      if (!assignments || assignments.length === 0) return;

      const userIds = assignments.map(a => a.user_id);

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, last_seen_at")
        .in("user_id", userIds);

      // Get latest field_activity with location
      const { data: activities } = await supabase
        .from("field_activity")
        .select("user_id, location, started_at, form_id")
        .in("user_id", userIds)
        .order("started_at", { ascending: false })
        .limit(100);

      // Get submission counts
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("user_id")
        .in("user_id", userIds)
        .gte("submitted_at", new Date(Date.now() - 86400000).toISOString());

      const submissionCounts: Record<string, number> = {};
      submissions?.forEach(s => {
        submissionCounts[s.user_id] = (submissionCounts[s.user_id] || 0) + 1;
      });

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      const positions: CollectorPosition[] = [];
      const seen = new Set<string>();

      activities?.forEach(act => {
        if (seen.has(act.user_id)) return;
        seen.add(act.user_id);
        const loc = act.location as any;
        if (!loc?.lat && !loc?.latitude) return;
        const profile = profileMap.get(act.user_id);
        const lastSeen = profile?.last_seen_at;
        const minutesAgo = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 60000 : 999;
        positions.push({
          userId: act.user_id,
          name: profile ? `${profile.first_name} ${profile.last_name}` : "Unknown",
          lat: loc.lat || loc.latitude,
          lng: loc.lng || loc.longitude,
          accuracy: loc.accuracy,
          lastSeen: act.started_at,
          status: minutesAgo < 5 ? "active" : minutesAgo < 30 ? "idle" : "offline",
          submissionCount: submissionCounts[act.user_id] || 0,
        });
      });

      setCollectors(positions);
    } catch (e) {
      console.error("Error fetching collector positions:", e);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCollectorPositions();
    const interval = setInterval(fetchCollectorPositions, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchCollectorPositions]);

  // Update map markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current.clear();

    collectors.forEach(c => {
      const color = statusColors[c.status];
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: selectedCollector === c.userId ? 14 : 10,
        fillColor: color,
        fillOpacity: 0.9,
        color: "#fff",
        weight: selectedCollector === c.userId ? 4 : 2,
      }).addTo(map);

      // Pulsing ring for active
      if (c.status === "active") {
        L.circleMarker([c.lat, c.lng], {
          radius: 20, fillColor: color, fillOpacity: 0.2,
          color, weight: 1, opacity: 0.4,
        }).addTo(map);
      }

      marker.bindPopup(`
        <div style="min-width:180px">
          <strong>${c.name}</strong><br/>
          <span style="color:${color}">●</span> ${c.status.charAt(0).toUpperCase() + c.status.slice(1)}<br/>
          📊 ${c.submissionCount} submissions today<br/>
          📍 ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}<br/>
          ${c.accuracy ? `🎯 ±${Math.round(c.accuracy)}m accuracy<br/>` : ""}
          🕐 Last seen: ${format(new Date(c.lastSeen), "h:mm a")}
        </div>
      `);

      marker.on("click", () => setSelectedCollector(c.userId));
      markersRef.current.set(c.userId, marker);
    });

    // Fit bounds
    if (collectors.length > 0) {
      const bounds = L.latLngBounds(collectors.map(c => [c.lat, c.lng]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [collectors, selectedCollector]);

  const activeCount = collectors.filter(c => c.status === "active").length;
  const idleCount = collectors.filter(c => c.status === "idle").length;

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-green-500/10"><Users className="h-4 w-4 text-green-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Active Now</p>
              <p className="text-xl font-bold">{activeCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10"><Clock className="h-4 w-4 text-amber-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Idle</p>
              <p className="text-xl font-bold">{idleCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10"><Activity className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Tracked</p>
              <p className="text-xl font-bold">{collectors.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10"><Radar className="h-4 w-4 text-blue-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Submissions Today</p>
              <p className="text-xl font-bold">{collectors.reduce((s, c) => s + c.submissionCount, 0)}</p>
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
        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />Collectors
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-y-auto">
                {collectors.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">
                    {projectId ? "No collector activity found" : "Select a project to view"}
                  </p>
                ) : (
                  collectors.map(c => (
                    <button
                      key={c.userId}
                      onClick={() => {
                        setSelectedCollector(c.userId);
                        const marker = markersRef.current.get(c.userId);
                        if (marker && mapRef.current) {
                          mapRef.current.setView([c.lat, c.lng], 15, { animate: true });
                          marker.openPopup();
                        }
                      }}
                      className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors ${
                        selectedCollector === c.userId ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate">{c.name}</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px]"
                          style={{ backgroundColor: `${statusColors[c.status]}20`, color: statusColors[c.status] }}
                        >
                          {c.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{c.submissionCount} submissions</span>
                        <span>•</span>
                        <span>{format(new Date(c.lastSeen), "h:mm a")}</span>
                      </div>
                    </button>
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

export default RealTimeTrackingMap;
