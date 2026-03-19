import { useState, useEffect, useCallback, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Network, Users, Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface Props {
  projectId: string;
  formId: string;
}

interface UserNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  connections: number;
  submissions: number;
}

const SocialNetworkMap = ({ projectId, formId }: Props) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [nodes, setNodes] = useState<UserNode[]>([]);
  const [edges, setEdges] = useState<[string, string][]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [9.06, 7.49], zoom: 6, zoomControl: false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; CARTO', maxZoom: 20,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const buildNetwork = useCallback(async () => {
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

      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("user_id, location, form_id, submitted_at")
        .in("user_id", userIds)
        .not("location", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(500);

      const profileMap = new Map(profiles?.map(p => [p.user_id, `${p.first_name} ${p.last_name}`]) || []);

      // Build user nodes from latest submission locations
      const userLatest = new Map<string, any>();
      const userSubCounts: Record<string, number> = {};
      submissions?.forEach(s => {
        userSubCounts[s.user_id] = (userSubCounts[s.user_id] || 0) + 1;
        if (!userLatest.has(s.user_id) && s.location) {
          const loc = s.location as any;
          if (loc.lat || loc.latitude) {
            userLatest.set(s.user_id, { lat: loc.lat || loc.latitude, lng: loc.lng || loc.longitude });
          }
        }
      });

      // Build edges: users who submitted to the same form within 1 hour
      const formBuckets: Record<string, { userId: string; time: string }[]> = {};
      submissions?.forEach(s => {
        if (!formBuckets[s.form_id]) formBuckets[s.form_id] = [];
        formBuckets[s.form_id].push({ userId: s.user_id, time: s.submitted_at || "" });
      });

      const edgeSet = new Set<string>();
      Object.values(formBuckets).forEach(bucket => {
        for (let i = 0; i < bucket.length; i++) {
          for (let j = i + 1; j < bucket.length; j++) {
            if (bucket[i].userId === bucket[j].userId) continue;
            const timeDiff = Math.abs(new Date(bucket[i].time).getTime() - new Date(bucket[j].time).getTime());
            if (timeDiff < 3600000) { // Within 1 hour
              const key = [bucket[i].userId, bucket[j].userId].sort().join("-");
              edgeSet.add(key);
            }
          }
        }
      });

      const connectionCounts: Record<string, number> = {};
      const edgeList: [string, string][] = [];
      edgeSet.forEach(key => {
        const [a, b] = key.split("-");
        edgeList.push([a, b]);
        connectionCounts[a] = (connectionCounts[a] || 0) + 1;
        connectionCounts[b] = (connectionCounts[b] || 0) + 1;
      });

      const nodeList: UserNode[] = [];
      userLatest.forEach((pos, uid) => {
        nodeList.push({
          id: uid,
          name: profileMap.get(uid) || uid.slice(0, 8),
          lat: pos.lat,
          lng: pos.lng,
          connections: connectionCounts[uid] || 0,
          submissions: userSubCounts[uid] || 0,
        });
      });

      setNodes(nodeList);
      setEdges(edgeList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { buildNetwork(); }, [buildNetwork]);

  // Render network on map
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    const layer = layerRef.current;
    layer.clearLayers();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Draw edges
    edges.forEach(([a, b]) => {
      const na = nodeMap.get(a), nb = nodeMap.get(b);
      if (na && nb) {
        L.polyline([[na.lat, na.lng], [nb.lat, nb.lng]], {
          color: "#6366f1", weight: 1.5, opacity: 0.4,
        }).addTo(layer);
      }
    });

    // Draw nodes
    nodes.forEach(n => {
      const radius = Math.max(6, Math.min(16, 6 + n.connections * 2));
      const marker = L.circleMarker([n.lat, n.lng], {
        radius,
        fillColor: n.connections > 3 ? "#f59e0b" : "#6366f1",
        fillOpacity: 0.8,
        color: "#fff",
        weight: 2,
      }).addTo(layer);

      marker.bindPopup(`
        <strong>${n.name}</strong><br/>
        🔗 ${n.connections} connections<br/>
        📊 ${n.submissions} submissions<br/>
        📍 ${n.lat.toFixed(4)}, ${n.lng.toFixed(4)}
      `);
    });

    if (nodes.length > 0) {
      const bounds = L.latLngBounds(nodes.map(n => [n.lat, n.lng]));
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [nodes, edges]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Nodes</p>
              <p className="text-xl font-bold">{nodes.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Connections</p>
              <p className="text-xl font-bold">{edges.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">Hub Users</p>
              <p className="text-xl font-bold">{nodes.filter(n => n.connections > 3).length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Density</p>
              <p className="text-xl font-bold">
                {nodes.length > 1 ? (2 * edges.length / (nodes.length * (nodes.length - 1)) * 100).toFixed(0) : 0}%
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="border-0 shadow-card overflow-hidden">
        <div ref={mapContainerRef} style={{ height: "500px", width: "100%" }} className="rounded-lg" />
      </Card>

      {loading && (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Building social network...</span>
        </div>
      )}
    </div>
  );
};

export default SocialNetworkMap;
