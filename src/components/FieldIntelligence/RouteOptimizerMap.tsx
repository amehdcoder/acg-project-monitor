import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Route, Navigation, MapPin, Clock, Locate, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface Props {
  projectId: string;
  formId: string;
  forms: any[];
}

const RouteOptimizerMap = ({ projectId, formId, forms }: Props) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [geofenceTargets, setGeofenceTargets] = useState<any[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [9.06, 7.49],
      zoom: 6,
      zoomControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Get user location
  const locateUser = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        if (mapRef.current) {
          mapRef.current.setView(loc, 12, { animate: true });
          const marker = L.circleMarker(loc, {
            radius: 10, fillColor: "#3b82f6", fillOpacity: 1,
            color: "#fff", weight: 3,
          }).addTo(routeLayerRef.current!);
          marker.bindPopup("<strong>📍 You are here</strong>").openPopup();
        }
        toast({ title: "Location Found", description: `${loc[0].toFixed(4)}, ${loc[1].toFixed(4)}` });
      },
      () => toast({ title: "Location Error", variant: "destructive", description: "Could not get your location" }),
      { enableHighAccuracy: true }
    );
  }, []);

  // Load geofenced areas as targets
  useEffect(() => {
    if (!formId && forms.length === 0) return;
    const targets: any[] = [];
    const relevantForms = formId ? forms.filter(f => f.id === formId) : forms;
    relevantForms.forEach((f) => {
      if (f.geofence?.coordinates && Array.isArray(f.geofence.coordinates)) {
        const coords = f.geofence.coordinates;
        if (coords.length >= 3) {
          const centroid = coords.reduce(
            (acc: [number, number], c: [number, number]) => [acc[0] + c[0] / coords.length, acc[1] + c[1] / coords.length],
            [0, 0]
          );
          targets.push({ name: f.name, formId: f.id, center: centroid, polygon: coords });
        }
      }
    });
    setGeofenceTargets(targets);
  }, [formId, forms]);

  // Draw geofences on map
  useEffect(() => {
    if (!mapRef.current || !routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();

    // Re-add user location
    if (userLocation) {
      L.circleMarker(userLocation, {
        radius: 10, fillColor: "#3b82f6", fillOpacity: 1, color: "#fff", weight: 3,
      }).addTo(routeLayerRef.current).bindPopup("<strong>📍 You are here</strong>");
    }

    geofenceTargets.forEach((t, i) => {
      const polygon = L.polygon(t.polygon, {
        color: "#10b981", weight: 2, fillOpacity: 0.15, dashArray: "6,4",
      }).addTo(routeLayerRef.current!);
      polygon.bindTooltip(t.name, { permanent: false, direction: "center" });

      const numberIcon = L.divIcon({
        className: "route-stop-icon",
        html: `<div style="background:#10b981;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${i + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker(t.center, { icon: numberIcon }).addTo(routeLayerRef.current!).bindPopup(`<strong>${t.name}</strong><br/>Stop #${i + 1}`);
    });

    // Draw route
    if (routeData?.optimizedOrder) {
      const points: [number, number][] = [];
      if (userLocation) points.push(userLocation);
      routeData.optimizedOrder.forEach((idx: number) => {
        if (geofenceTargets[idx]) points.push(geofenceTargets[idx].center);
      });
      if (points.length >= 2) {
        L.polyline(points, {
          color: "#6366f1", weight: 4, opacity: 0.8,
          dashArray: "10,6",
        }).addTo(routeLayerRef.current!);
      }
    }

    if (geofenceTargets.length > 0 && mapRef.current) {
      const allPoints = geofenceTargets.map(t => t.center as [number, number]);
      if (userLocation) allPoints.push(userLocation);
      const bounds = L.latLngBounds(allPoints);
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [geofenceTargets, userLocation, routeData]);

  // AI Route optimization
  const optimizeRoute = useCallback(async () => {
    if (geofenceTargets.length < 2) {
      toast({ title: "Need more targets", description: "Select a project with at least 2 geofenced forms", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Local nearest-neighbor heuristic (no AI credits needed)
      const order: number[] = [];
      const visited = new Set<number>();
      let current = userLocation || geofenceTargets[0].center;
      for (let i = 0; i < geofenceTargets.length; i++) {
        let bestDist = Infinity, bestIdx = 0;
        geofenceTargets.forEach((t, idx) => {
          if (visited.has(idx)) return;
          const d = Math.hypot(t.center[0] - current[0], t.center[1] - current[1]);
          if (d < bestDist) { bestDist = d; bestIdx = idx; }
        });
        order.push(bestIdx);
        visited.add(bestIdx);
        current = geofenceTargets[bestIdx].center;
      }
      const totalDist = order.reduce((sum, idx, i) => {
        if (i === 0) return 0;
        const prev = geofenceTargets[order[i - 1]].center;
        const curr = geofenceTargets[idx].center;
        return sum + Math.hypot(curr[0] - prev[0], curr[1] - prev[1]) * 111;
      }, 0);
      setRouteData({
        optimizedOrder: order,
        estimatedTime: `~${Math.round(totalDist / 40 * 60)} min`,
        totalDistance: `${totalDist.toFixed(1)} km`,
        stops: order.map((idx, i) => ({ order: i + 1, name: geofenceTargets[idx].name })),
      });
      toast({ title: "Route Optimized!", description: `Estimated time: ~${Math.round(totalDist / 40 * 60)} min` });
    } catch (e: any) {
      toast({ title: "Route Error", description: e.message || "Failed to optimize route", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [geofenceTargets, userLocation]);

  return (
    <div className="space-y-4">
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
                <Route className="h-4 w-4 text-primary" />Route Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={locateUser} variant="outline" className="w-full gap-2">
                <Locate className="h-4 w-4" />My Location
              </Button>
              <Button
                onClick={optimizeRoute}
                className="w-full gap-2"
                disabled={loading || geofenceTargets.length < 2}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Optimize Route
              </Button>
              <div className="text-xs text-muted-foreground">
                {geofenceTargets.length} geofenced target{geofenceTargets.length !== 1 ? "s" : ""} found
              </div>
            </CardContent>
          </Card>

          {routeData && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-primary" />Optimal Route
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Distance</span>
                  <Badge variant="secondary">{routeData.totalDistance}</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Est. Time</span>
                  <Badge variant="secondary">{routeData.estimatedTime}</Badge>
                </div>
                <div className="border-t pt-2 mt-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">STOP ORDER</p>
                  {routeData.stops?.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                        {s.order}
                      </div>
                      <span className="truncate">{s.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default RouteOptimizerMap;
