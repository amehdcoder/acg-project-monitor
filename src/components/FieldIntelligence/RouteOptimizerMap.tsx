import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Route, Locate, Zap, Fuel, UtensilsCrossed, Hotel, Heart, Landmark, Shield, Gauge } from "lucide-react";
import { toast } from "@/hooks/use-toast";

import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

import { useRouteNavigation } from "./RouteNavigation/useRouteNavigation";
import { useOfflineMap } from "./RouteNavigation/useOfflineMap";
import DirectionsPanel from "./RouteNavigation/DirectionsPanel";
import RouteOptionsPanel from "./RouteNavigation/RouteOptionsPanel";
import TrafficPanel from "./RouteNavigation/TrafficPanel";
import OfflinePanel from "./RouteNavigation/OfflinePanel";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface Props {
  projectId: string;
  formId: string;
  forms: any[];
}

const poiIcons: Record<string, string> = {
  fuel: "⛽", food: "🍽️", hotel: "🏨", hospital: "🏥", atm: "🏧", police: "👮",
};

const trafficIcons: Record<string, string> = {
  congestion: "🟡", closure: "🔴", accident: "🟠", construction: "🔵",
};

const RouteOptimizerMap = ({ projectId, formId, forms }: Props) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const poiLayerRef = useRef<L.LayerGroup | null>(null);
  const trafficLayerRef = useRef<L.LayerGroup | null>(null);
  const speedLayerRef = useRef<L.LayerGroup | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [geofenceTargets, setGeofenceTargets] = useState<any[]>([]);
  const [isNavigating, setIsNavigating] = useState(false);

  const nav = useRouteNavigation(geofenceTargets, userLocation);
  const offline = useOfflineMap();

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [9.06, 7.49], zoom: 6, zoomControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap", maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    poiLayerRef.current = L.layerGroup().addTo(map);
    trafficLayerRef.current = L.layerGroup().addTo(map);
    speedLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Load geofence targets
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

  const locateUser = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        if (mapRef.current) mapRef.current.setView(loc, 12, { animate: true });
        toast({ title: "Location Found", description: `${loc[0].toFixed(4)}, ${loc[1].toFixed(4)}` });
      },
      () => toast({ title: "Location Error", variant: "destructive", description: "Could not get your location" }),
      { enableHighAccuracy: true }
    );
  }, []);

  // Draw everything on map
  useEffect(() => {
    if (!mapRef.current || !routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();

    // User location
    if (userLocation) {
      L.circleMarker(userLocation, { radius: 10, fillColor: "#3b82f6", fillOpacity: 1, color: "#fff", weight: 3 })
        .addTo(routeLayerRef.current).bindPopup("<strong>📍 You are here</strong>");
    }

    // Geofence polygons
    geofenceTargets.forEach((t, i) => {
      const polygon = L.polygon(t.polygon, { color: "#10b981", weight: 2, fillOpacity: 0.15, dashArray: "6,4" })
        .addTo(routeLayerRef.current!);
      polygon.bindTooltip(t.name, { permanent: false, direction: "center" });
      const icon = L.divIcon({
        className: "route-stop-icon",
        html: `<div style="background:#10b981;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${i + 1}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14],
      });
      L.marker(t.center, { icon }).addTo(routeLayerRef.current!).bindPopup(`<strong>${t.name}</strong><br/>Stop #${i + 1}`);
    });

    // Draw routes
    const routeColors = ["#6366f1", "#f59e0b", "#ef4444"];
    nav.routes.forEach((r, i) => {
      if (r.points.length >= 2) {
        const line = L.polyline(r.points, {
          color: routeColors[i % routeColors.length],
          weight: r.id === nav.selectedRouteId ? 5 : 3,
          opacity: r.id === nav.selectedRouteId ? 0.9 : 0.4,
          dashArray: r.id === nav.selectedRouteId ? undefined : "8,6",
        }).addTo(routeLayerRef.current!);
        line.bindTooltip(r.label, { sticky: true });
        line.on("click", () => nav.selectRoute(r.id));
      }
    });

    // Active step marker
    const selectedRoute = nav.routes.find(r => r.id === nav.selectedRouteId);
    if (selectedRoute && selectedRoute.directions[nav.activeStep]) {
      const stepCoord = selectedRoute.directions[nav.activeStep].coordinates;
      L.circleMarker(stepCoord, { radius: 12, fillColor: "#ef4444", fillOpacity: 0.8, color: "#fff", weight: 3 })
        .addTo(routeLayerRef.current).bindPopup(`<strong>Step ${nav.activeStep + 1}</strong><br/>${selectedRoute.directions[nav.activeStep].instruction}`).openPopup();
    }

    // Fit bounds
    const allPoints = geofenceTargets.map(t => t.center as [number, number]);
    if (userLocation) allPoints.push(userLocation);
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [geofenceTargets, userLocation, nav.routes, nav.selectedRouteId, nav.activeStep]);

  // Draw POIs
  useEffect(() => {
    if (!poiLayerRef.current) return;
    poiLayerRef.current.clearLayers();
    if (!nav.showPois) return;
    nav.pois.forEach(poi => {
      const icon = L.divIcon({
        className: "poi-icon",
        html: `<div style="font-size:20px;text-shadow:0 1px 3px rgba(0,0,0,0.3);">${poiIcons[poi.category] || "📍"}</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12],
      });
      L.marker(poi.coordinates, { icon }).addTo(poiLayerRef.current!)
        .bindPopup(`<strong>${poi.name}</strong><br/><em>${poi.category}</em>`);
    });
  }, [nav.pois, nav.showPois]);

  // Draw traffic
  useEffect(() => {
    if (!trafficLayerRef.current) return;
    trafficLayerRef.current.clearLayers();
    if (!nav.showTraffic) return;
    nav.trafficIncidents.forEach(inc => {
      const icon = L.divIcon({
        className: "traffic-icon",
        html: `<div style="font-size:18px;">${trafficIcons[inc.type] || "⚠️"}</div>`,
        iconSize: [20, 20], iconAnchor: [10, 10],
      });
      L.marker(inc.coordinates, { icon }).addTo(trafficLayerRef.current!)
        .bindPopup(`<strong>${inc.title}</strong><br/>${inc.description}<br/><em>Severity: ${inc.severity}</em>`);
    });
  }, [nav.trafficIncidents, nav.showTraffic]);

  // Draw speed zones
  useEffect(() => {
    if (!speedLayerRef.current) return;
    speedLayerRef.current.clearLayers();
    if (!nav.showSpeedAlerts) return;
    nav.speedZones.forEach(zone => {
      const icon = L.divIcon({
        className: "speed-icon",
        html: `<div style="background:white;border:3px solid ${zone.enforcement ? '#ef4444' : '#f59e0b'};border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;color:#111;">${zone.speedLimit}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16],
      });
      L.marker(zone.coordinates, { icon }).addTo(speedLayerRef.current!)
        .bindPopup(`<strong>${zone.label}</strong>${zone.enforcement ? "<br/>⚠️ Speed camera" : ""}`);
    });
  }, [nav.speedZones, nav.showSpeedAlerts]);

  const handleStartNav = useCallback(() => { setIsNavigating(true); nav.startNavigation(); }, [nav]);
  const handleStopNav = useCallback(() => { setIsNavigating(false); nav.stopNavigation(); }, [nav]);

  const handleCacheView = useCallback(() => {
    if (!mapRef.current) return;
    const b = mapRef.current.getBounds();
    const z = mapRef.current.getZoom();
    offline.cacheRegion({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }, z);
  }, [offline]);

  const selectedRoute = nav.routes.find(r => r.id === nav.selectedRouteId);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <Card className="border-0 shadow-card overflow-hidden">
            <div ref={mapContainerRef} style={{ height: "550px", width: "100%" }} className="rounded-lg" />
          </Card>
          {/* Active navigation banner */}
          {isNavigating && selectedRoute && selectedRoute.directions[nav.activeStep] && (
            <Card className="mt-2 border-primary/30 bg-primary/5">
              <CardContent className="py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  {nav.activeStep + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{selectedRoute.directions[nav.activeStep].instruction}</p>
                  <p className="text-xs text-muted-foreground">{selectedRoute.directions[nav.activeStep].distance} • {selectedRoute.directions[nav.activeStep].duration}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Controls */}
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
              <Button onClick={nav.optimizeRoute} className="w-full gap-2" disabled={nav.loading || geofenceTargets.length < 2}>
                {nav.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Navigate Route
              </Button>
              <div className="text-xs text-muted-foreground">
                {geofenceTargets.length} target{geofenceTargets.length !== 1 ? "s" : ""}
              </div>
              {/* Layer toggles */}
              <div className="border-t pt-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">MAP LAYERS</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs flex items-center gap-1"><UtensilsCrossed className="h-3 w-3" /> POIs</span>
                  <Switch checked={nav.showPois} onCheckedChange={nav.setShowPois} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs flex items-center gap-1"><Shield className="h-3 w-3" /> Traffic</span>
                  <Switch checked={nav.showTraffic} onCheckedChange={nav.setShowTraffic} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs flex items-center gap-1"><Gauge className="h-3 w-3" /> Speed Alerts</span>
                  <Switch checked={nav.showSpeedAlerts} onCheckedChange={nav.setShowSpeedAlerts} />
                </div>
              </div>
            </CardContent>
          </Card>

          <RouteOptionsPanel routes={nav.routes} selectedId={nav.selectedRouteId} onSelect={nav.selectRoute} />

          {selectedRoute && (
            <DirectionsPanel
              directions={selectedRoute.directions}
              activeStep={nav.activeStep}
              onStepClick={nav.setActiveStep}
              onStart={handleStartNav}
              onStop={handleStopNav}
              isNavigating={isNavigating}
            />
          )}

          {nav.showTraffic && <TrafficPanel incidents={nav.trafficIncidents} />}

          <OfflinePanel
            cachedRegions={offline.cachedRegions}
            caching={offline.caching}
            cacheProgress={offline.cacheProgress}
            onCacheCurrentView={handleCacheView}
            onRemove={offline.removeCachedRegion}
            onLoad={offline.loadCachedRegions}
          />
        </div>
      </div>
    </div>
  );
};

export default RouteOptimizerMap;
