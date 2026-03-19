import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Users, AlertTriangle, MapPin, Radar, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Props {
  projectId: string;
  realtimeKey?: number;
}

interface ProximityPair {
  user1: { id: string; name: string; lat: number; lng: number };
  user2: { id: string; name: string; lat: number; lng: number };
  distance: number; // meters
  detectedAt: string;
}

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const ProximityAlerts = ({ projectId, realtimeKey }: Props) => {
  const [proximityPairs, setProximityPairs] = useState<ProximityPair[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [thresholdMeters, setThresholdMeters] = useState(500);
  const [loading, setLoading] = useState(false);

  const detectProximity = useCallback(async () => {
    setLoading(true);
    try {
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
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);

      const { data: activities } = await supabase
        .from("field_activity")
        .select("user_id, location, started_at")
        .in("user_id", userIds)
        .order("started_at", { ascending: false })
        .limit(200);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      const latestPositions = new Map<string, any>();
      activities?.forEach(a => {
        if (!latestPositions.has(a.user_id) && a.location) {
          const loc = a.location as any;
          if (loc.lat || loc.latitude) {
            latestPositions.set(a.user_id, {
              lat: loc.lat || loc.latitude,
              lng: loc.lng || loc.longitude,
              time: a.started_at,
            });
          }
        }
      });

      const pairs: ProximityPair[] = [];
      const users = Array.from(latestPositions.entries());
      for (let i = 0; i < users.length; i++) {
        for (let j = i + 1; j < users.length; j++) {
          const [id1, pos1] = users[i];
          const [id2, pos2] = users[j];
          const dist = haversineDistance(pos1.lat, pos1.lng, pos2.lat, pos2.lng);
          if (dist <= thresholdMeters) {
            const p1 = profileMap.get(id1);
            const p2 = profileMap.get(id2);
            pairs.push({
              user1: { id: id1, name: p1 ? `${p1.first_name} ${p1.last_name}` : "Unknown", lat: pos1.lat, lng: pos1.lng },
              user2: { id: id2, name: p2 ? `${p2.first_name} ${p2.last_name}` : "Unknown", lat: pos2.lat, lng: pos2.lng },
              distance: Math.round(dist),
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }
      setProximityPairs(pairs);
      if (pairs.length > 0 && alertsEnabled) {
        toast({ title: `${pairs.length} Proximity Alert${pairs.length > 1 ? "s" : ""}`, description: `Collectors within ${thresholdMeters}m of each other` });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [projectId, thresholdMeters, alertsEnabled]);

  useEffect(() => {
    detectProximity();
  }, [detectProximity]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-primary" />Proximity Detection Settings
          </CardTitle>
          <CardDescription>Detect when data collectors are near each other in the field</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Enable Proximity Alerts</p>
              <p className="text-xs text-muted-foreground">Get notified when collectors are close</p>
            </div>
            <Switch checked={alertsEnabled} onCheckedChange={setAlertsEnabled} />
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Detection Radius: {thresholdMeters}m</p>
            <Slider
              value={[thresholdMeters]}
              onValueChange={([v]) => setThresholdMeters(v)}
              min={50}
              max={5000}
              step={50}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>50m</span><span>5km</span>
            </div>
          </div>
          <Button onClick={detectProximity} disabled={loading || !projectId} className="gap-2">
            <Radar className="h-4 w-4" />Scan Now
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Proximity Alerts ({proximityPairs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!projectId ? (
            <p className="text-sm text-muted-foreground">Select a project to scan for proximity</p>
          ) : proximityPairs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No collectors detected within {thresholdMeters}m of each other</p>
          ) : (
            <div className="space-y-3">
              {proximityPairs.map((pair, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-amber-500" />
                      <span className="font-medium text-sm">{pair.user1.name}</span>
                      <span className="text-muted-foreground text-xs">↔</span>
                      <span className="font-medium text-sm">{pair.user2.name}</span>
                    </div>
                    <Badge variant={pair.distance < 100 ? "destructive" : "secondary"}>
                      {pair.distance}m apart
                    </Badge>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>📍 {pair.user1.lat.toFixed(4)}, {pair.user1.lng.toFixed(4)}</span>
                    <span>📍 {pair.user2.lat.toFixed(4)}, {pair.user2.lng.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProximityAlerts;
