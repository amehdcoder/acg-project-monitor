import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Satellite, Layers, MapPin, Search, Loader2, Eye, ZoomIn, ZoomOut,
  Globe, RefreshCw, LocateFixed,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "@/hooks/use-toast";

const SATELLITE_LAYERS = {
  esri: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri",
    label: "Esri World Imagery",
  },
  google: {
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "&copy; Google",
    label: "Google Satellite",
  },
  googleHybrid: {
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "&copy; Google",
    label: "Google Hybrid",
  },
  openTopo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenTopoMap",
    label: "Topographic",
  },
};

type LayerKey = keyof typeof SATELLITE_LAYERS;

const SatelliteImageryView = () => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<L.TileLayer | null>(null);

  const [activeLayer, setActiveLayer] = useState<LayerKey>("esri");
  const [showLabels, setShowLabels] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [9.06, 7.49],
      zoom: 6,
      zoomControl: false,
    });

    const layer = SATELLITE_LAYERS[activeLayer];
    const tile = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: 20,
    }).addTo(map);
    tileRef.current = tile;

    // Labels overlay
    const labels = L.tileLayer(
      "https://stamen-tiles.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.png",
      { maxZoom: 20, opacity: 0.7 }
    ).addTo(map);
    labelsLayerRef.current = labels;

    L.control.zoom({ position: "topright" }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update layer
  useEffect(() => {
    if (!tileRef.current) return;
    const layer = SATELLITE_LAYERS[activeLayer];
    tileRef.current.setUrl(layer.url);
  }, [activeLayer]);

  // Toggle labels
  useEffect(() => {
    if (!mapRef.current || !labelsLayerRef.current) return;
    if (showLabels) {
      if (!mapRef.current.hasLayer(labelsLayerRef.current)) {
        labelsLayerRef.current.addTo(mapRef.current);
      }
    } else {
      mapRef.current.removeLayer(labelsLayerRef.current);
    }
  }, [showLabels]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`
      );
      const data = await res.json();
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0];
        mapRef.current?.setView([parseFloat(lat), parseFloat(lon)], 15, { animate: true });
        L.marker([parseFloat(lat), parseFloat(lon)])
          .addTo(mapRef.current!)
          .bindPopup(`<strong>${display_name}</strong>`)
          .openPopup();
        toast({ title: "Location Found", description: display_name.slice(0, 80) });
      } else {
        toast({ title: "Not Found", description: "No results for that search.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Search Error", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleLocate = () => {
    mapRef.current?.locate({ setView: true, maxZoom: 16 });
    mapRef.current?.once("locationfound", (e) => {
      L.circleMarker(e.latlng, {
        radius: 8,
        fillColor: "hsl(var(--primary))",
        fillOpacity: 0.9,
        color: "#fff",
        weight: 3,
      }).addTo(mapRef.current!);
    });
  };

  return (
    <div className="space-y-4 p-4 lg:p-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Satellite className="h-7 w-7 text-primary" />
          </div>
          Satellite Imagery
        </h1>
        <p className="text-muted-foreground mt-1">
          Remote sensing and environmental monitoring with multi-source satellite imagery
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Controls */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" /> Location Search
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Search location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="text-sm"
                />
                <Button size="icon" onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleLocate}>
                <LocateFixed className="h-4 w-4" /> My Location
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Imagery Source
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={activeLayer} onValueChange={(v) => setActiveLayer(v as LayerKey)}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(SATELLITE_LAYERS) as [LayerKey, typeof SATELLITE_LAYERS.esri][]).map(
                    ([key, layer]) => (
                      <SelectItem key={key} value={key}>
                        {layer.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>

              <div className="flex items-center justify-between py-1">
                <Label className="text-sm">Show Labels</Label>
                <Switch checked={showLabels} onCheckedChange={setShowLabels} />
              </div>

              <div className="flex items-center justify-between py-1">
                <Label className="text-sm">Overlay Active</Label>
                <Switch checked={overlayEnabled} onCheckedChange={setOverlayEnabled} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Quick Views
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { name: "Nigeria Overview", lat: 9.06, lng: 7.49, zoom: 6 },
                { name: "Abuja", lat: 9.0579, lng: 7.4951, zoom: 13 },
                { name: "Lagos", lat: 6.5244, lng: 3.3792, zoom: 12 },
                { name: "Kano", lat: 12.0, lng: 8.52, zoom: 12 },
              ].map((loc) => (
                <Button
                  key={loc.name}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs"
                  onClick={() =>
                    mapRef.current?.setView([loc.lat, loc.lng], loc.zoom, { animate: true })
                  }
                >
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {loc.name}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <Card className="border-0 shadow-card overflow-hidden">
            <div className="relative">
              <div ref={mapContainerRef} style={{ height: "650px", width: "100%" }} className="rounded-lg" />
              <Badge
                variant="secondary"
                className="absolute top-4 left-4 z-[1000] shadow-lg gap-1.5"
              >
                <Satellite className="h-3.5 w-3.5" />
                {SATELLITE_LAYERS[activeLayer].label}
              </Badge>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SatelliteImageryView;
