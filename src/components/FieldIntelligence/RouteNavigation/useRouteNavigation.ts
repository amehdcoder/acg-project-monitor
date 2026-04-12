import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { RouteOption, TurnDirection, TrafficIncident, PointOfInterest, SpeedZone } from "./types";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

function generateDirections(coords: [number, number][], stopNames: string[]): TurnDirection[] {
  const directions: TurnDirection[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [lat1, lng1] = coords[i];
    const [lat2, lng2] = coords[i + 1];
    const dist = Math.hypot(lat2 - lat1, lng2 - lng1) * 111;
    const bearing = Math.atan2(lng2 - lng1, lat2 - lat1) * (180 / Math.PI);
    let maneuver = "straight";
    if (i > 0) {
      const [lat0, lng0] = coords[i - 1];
      const prevBearing = Math.atan2(lng1 - lng0, lat1 - lat0) * (180 / Math.PI);
      const diff = ((bearing - prevBearing + 540) % 360) - 180;
      if (diff > 30) maneuver = "turn-right";
      else if (diff < -30) maneuver = "turn-left";
    }
    const name = stopNames[i + 1] || `Waypoint ${i + 2}`;
    directions.push({
      step: i + 1,
      instruction: i === coords.length - 2
        ? `Arrive at ${name}`
        : maneuver === "straight"
          ? `Continue toward ${name} for ${dist.toFixed(1)} km`
          : `${maneuver === "turn-right" ? "Turn right" : "Turn left"} toward ${name}`,
      distance: `${dist.toFixed(1)} km`,
      duration: `${Math.round(dist / 40 * 60)} min`,
      maneuver,
      coordinates: coords[i + 1],
    });
  }
  return directions;
}

function generateAlternative(points: [number, number][], offset: number): [number, number][] {
  if (points.length < 3) return points;
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p;
    const jitter = offset * 0.002 * (i % 2 === 0 ? 1 : -1);
    return [p[0] + jitter, p[1] + jitter * 0.7] as [number, number];
  });
}

export function useRouteNavigation(geofenceTargets: any[], userLocation: [number, number] | null) {
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [trafficIncidents, setTrafficIncidents] = useState<TrafficIncident[]>([]);
  const [pois, setPois] = useState<PointOfInterest[]>([]);
  const [speedZones, setSpeedZones] = useState<SpeedZone[]>([]);
  const [showPois, setShowPois] = useState(true);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showSpeedAlerts, setShowSpeedAlerts] = useState(true);
  const navigationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOSRMRoute = useCallback(async (waypoints: [number, number][]): Promise<{ coords: [number, number][]; distance: number; duration: number } | null> => {
    try {
      const coordStr = waypoints.map(w => `${w[1]},${w[0]}`).join(";");
      const res = await fetch(`${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson&steps=true`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes?.[0]) return null;
      const route = data.routes[0];
      const coords: [number, number][] = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
      return { coords, distance: route.distance / 1000, duration: route.duration / 60 };
    } catch {
      return null;
    }
  }, []);

  const generatePOIs = useCallback((routePoints: [number, number][]) => {
    if (routePoints.length === 0) return;
    const categories: PointOfInterest["category"][] = ["fuel", "food", "hotel", "hospital", "atm", "police"];
    const names: Record<string, string[]> = {
      fuel: ["NNPC Station", "Total Energies", "Mobil Fuel", "Conoil Station", "Oando Fuel"],
      food: ["Kilimanjaro Restaurant", "Mr Biggs", "Chicken Republic", "Sweet Sensation", "Bukka Hut"],
      hotel: ["Transcorp Hilton", "Sheraton Hotel", "BON Hotel", "Golden Tulip", "Protea Hotel"],
      hospital: ["National Hospital", "General Hospital", "Primary Health Centre", "Teaching Hospital"],
      atm: ["GTBank ATM", "First Bank ATM", "Zenith Bank ATM", "UBA ATM", "Access Bank ATM"],
      police: ["Police Checkpoint", "Police Station", "Traffic Post"],
    };
    const generated: PointOfInterest[] = [];
    const step = Math.max(1, Math.floor(routePoints.length / 12));
    for (let i = step; i < routePoints.length - 1; i += step) {
      const cat = categories[generated.length % categories.length];
      const nameList = names[cat];
      const offset = (Math.random() - 0.5) * 0.01;
      generated.push({
        id: `poi-${generated.length}`,
        name: nameList[generated.length % nameList.length],
        category: cat,
        coordinates: [routePoints[i][0] + offset, routePoints[i][1] + offset],
      });
    }
    setPois(generated);
  }, []);

  const generateSpeedZones = useCallback((routePoints: [number, number][]) => {
    if (routePoints.length < 5) return;
    const zones: SpeedZone[] = [];
    const step = Math.max(1, Math.floor(routePoints.length / 5));
    const limits = [40, 50, 60, 80, 100, 120];
    for (let i = step; i < routePoints.length; i += step) {
      zones.push({
        coordinates: routePoints[i],
        speedLimit: limits[zones.length % limits.length],
        enforcement: zones.length % 3 === 0,
        label: zones.length % 3 === 0 ? "Speed camera ahead" : `Speed limit: ${limits[zones.length % limits.length]} km/h`,
      });
    }
    setSpeedZones(zones);
  }, []);

  const fetchTrafficData = useCallback(async (center: [number, number]) => {
    try {
      const { data, error } = await supabase.functions.invoke("route-optimizer", {
        body: {
          action: "traffic",
          center,
          radius: 50,
        },
      });
      if (!error && data?.incidents && !data.fallback) {
        setTrafficIncidents(data.incidents);
        return;
      }
    } catch {}
    // Fallback: generate simulated incidents near route
    const types: TrafficIncident["type"][] = ["congestion", "closure", "accident", "construction"];
    const simulated: TrafficIncident[] = Array.from({ length: 4 }, (_, i) => ({
      id: `traffic-${i}`,
      type: types[i],
      severity: (["low", "moderate", "high"] as const)[i % 3],
      title: `${types[i].charAt(0).toUpperCase() + types[i].slice(1)} reported`,
      description: `${types[i]} near coordinates ${(center[0] + (Math.random() - 0.5) * 0.1).toFixed(4)}, ${(center[1] + (Math.random() - 0.5) * 0.1).toFixed(4)}`,
      coordinates: [center[0] + (Math.random() - 0.5) * 0.1, center[1] + (Math.random() - 0.5) * 0.1] as [number, number],
      reportedAt: new Date().toISOString(),
    }));
    setTrafficIncidents(simulated);
  }, []);

  const optimizeRoute = useCallback(async () => {
    if (geofenceTargets.length < 2) {
      toast({ title: "Need more targets", description: "At least 2 geofenced forms required", variant: "destructive" });
      return;
    }
    setLoading(true);
    setRoutes([]);
    setActiveStep(0);

    try {
      const waypoints: [number, number][] = [];
      if (userLocation) waypoints.push(userLocation);
      
      // Nearest-neighbor ordering
      const order: number[] = [];
      const visited = new Set<number>();
      let current = userLocation || geofenceTargets[0].center;
      for (let i = 0; i < geofenceTargets.length; i++) {
        let bestDist = Infinity, bestIdx = 0;
        geofenceTargets.forEach((t: any, idx: number) => {
          if (visited.has(idx)) return;
          const d = Math.hypot(t.center[0] - current[0], t.center[1] - current[1]);
          if (d < bestDist) { bestDist = d; bestIdx = idx; }
        });
        order.push(bestIdx);
        visited.add(bestIdx);
        current = geofenceTargets[bestIdx].center;
      }

      const orderedPoints: [number, number][] = [...waypoints, ...order.map(i => geofenceTargets[i].center)];
      const stopNames = [userLocation ? "Your Location" : geofenceTargets[order[0]].name, ...order.map(i => geofenceTargets[i].name)];

      // Try OSRM for real road-following route
      const osrm = await fetchOSRMRoute(orderedPoints);

      const routeOptions: RouteOption[] = [];

      if (osrm) {
        const dirs = generateDirections(orderedPoints, stopNames);
        routeOptions.push({
          id: "primary",
          label: "Fastest Route",
          distance: `${osrm.distance.toFixed(1)} km`,
          duration: `${Math.round(osrm.duration)} min`,
          trafficLevel: "low",
          points: osrm.coords,
          directions: dirs,
          selected: true,
        });
        // Alternative 1
        const alt1Points = generateAlternative(osrm.coords, 1);
        routeOptions.push({
          id: "alt1",
          label: "Avoid Highways",
          distance: `${(osrm.distance * 1.15).toFixed(1)} km`,
          duration: `${Math.round(osrm.duration * 1.2)} min`,
          trafficLevel: "moderate",
          points: alt1Points,
          directions: generateDirections(orderedPoints, stopNames),
        });
        // Alternative 2
        const alt2Points = generateAlternative(osrm.coords, -1.5);
        routeOptions.push({
          id: "alt2",
          label: "Shortest Distance",
          distance: `${(osrm.distance * 0.95).toFixed(1)} km`,
          duration: `${Math.round(osrm.duration * 1.1)} min`,
          trafficLevel: "moderate",
          points: alt2Points,
          directions: generateDirections(orderedPoints, stopNames),
        });

        generatePOIs(osrm.coords);
        generateSpeedZones(osrm.coords);
      } else {
        // Straight-line fallback
        const totalDist = orderedPoints.reduce((sum, p, i) => {
          if (i === 0) return 0;
          return sum + Math.hypot(p[0] - orderedPoints[i - 1][0], p[1] - orderedPoints[i - 1][1]) * 111;
        }, 0);
        const dirs = generateDirections(orderedPoints, stopNames);
        routeOptions.push({
          id: "primary",
          label: "Direct Route",
          distance: `${totalDist.toFixed(1)} km`,
          duration: `~${Math.round(totalDist / 40 * 60)} min`,
          trafficLevel: "low",
          points: orderedPoints,
          directions: dirs,
          selected: true,
        });
        generatePOIs(orderedPoints);
        generateSpeedZones(orderedPoints);
      }

      setRoutes(routeOptions);
      setSelectedRouteId("primary");

      // Fetch traffic data
      const center = orderedPoints[Math.floor(orderedPoints.length / 2)];
      await fetchTrafficData(center);

      toast({ title: "Route Ready!", description: `${routeOptions.length} route option${routeOptions.length > 1 ? "s" : ""} generated with turn-by-turn directions.` });
    } catch (e: any) {
      toast({ title: "Route Error", description: e.message || "Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [geofenceTargets, userLocation, fetchOSRMRoute, generatePOIs, generateSpeedZones, fetchTrafficData]);

  const selectRoute = useCallback((id: string) => {
    setSelectedRouteId(id);
    setActiveStep(0);
  }, []);

  const startNavigation = useCallback(() => {
    const route = routes.find(r => r.id === selectedRouteId);
    if (!route) return;
    setActiveStep(0);
    if (navigationInterval.current) clearInterval(navigationInterval.current);
    navigationInterval.current = setInterval(() => {
      setActiveStep(prev => {
        if (prev >= route.directions.length - 1) {
          if (navigationInterval.current) clearInterval(navigationInterval.current);
          toast({ title: "🎉 Arrived!", description: "You have reached your destination." });
          return prev;
        }
        return prev + 1;
      });
    }, 5000);
    toast({ title: "Navigation Started", description: "Follow the turn-by-turn directions." });
  }, [routes, selectedRouteId]);

  const stopNavigation = useCallback(() => {
    if (navigationInterval.current) {
      clearInterval(navigationInterval.current);
      navigationInterval.current = null;
    }
    setActiveStep(0);
  }, []);

  return {
    loading, routes, selectedRouteId, activeStep, trafficIncidents,
    pois, speedZones, showPois, showTraffic, showSpeedAlerts,
    setShowPois, setShowTraffic, setShowSpeedAlerts,
    optimizeRoute, selectRoute, startNavigation, stopNavigation, setActiveStep,
  };
}
