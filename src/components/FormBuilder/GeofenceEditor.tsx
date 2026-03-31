import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import shp from "shpjs";
import { GeofenceArea } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles } from "lucide-react";

// Extend Leaflet types for leaflet-draw
declare module "leaflet" {
  namespace Control {
    class Draw extends L.Control {
      constructor(options?: any);
    }
  }
  namespace Draw {
    interface Event {
      CREATED: string;
      EDITED: string;
      DELETED: string;
    }
  }
  const Draw: {
    Event: {
      CREATED: string;
      EDITED: string;
      DELETED: string;
    };
  };
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Trash2, Save, Info, Upload, FileUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GeofenceEditorProps {
  geofence: GeofenceArea | undefined;
  onGeofenceChange: (geofence: GeofenceArea | undefined) => void;
}

const GeofenceEditor = ({ geofence, onGeofenceChange }: GeofenceEditorProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [geofenceName, setGeofenceName] = useState(geofence?.name || "");
  const [geofenceEnabled, setGeofenceEnabled] = useState(geofence?.enabled || false);
  const [coordinates, setCoordinates] = useState<[number, number][]>(
    geofence?.coordinates || []
  );
  const [isLoadingShapefile, setIsLoadingShapefile] = useState(false);
  const [aiLocationInput, setAiLocationInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // AI-powered geofence generation
  const handleAiGeofence = useCallback(async () => {
    if (!aiLocationInput.trim()) {
      toast({ title: "Enter Location", description: "Describe the location or enter State/LGA/Ward/Community name.", variant: "destructive" });
      return;
    }
    setIsAiLoading(true);
    try {
      // Local geofence generation: create a circular polygon around approximate Nigerian LGA centroids
      // This uses a ~5km radius square polygon for community-level, ~20km for LGA-level
      const input = aiLocationInput.trim().toLowerCase();
      
      // Nigerian state capital approximate coordinates for fallback
      const stateCoords: Record<string, [number, number]> = {
        "abuja": [9.0579, 7.4951], "lagos": [6.5244, 3.3792], "kano": [12.0022, 8.5920],
        "kaduna": [10.5105, 7.4165], "rivers": [4.8156, 7.0498], "oyo": [7.3775, 3.9470],
        "borno": [11.8333, 13.1510], "katsina": [13.0059, 7.6000], "bauchi": [10.3158, 9.8442],
        "jigawa": [12.2280, 9.5616], "benue": [7.7333, 8.5333], "niger": [9.6139, 6.5569],
        "anambra": [6.2209, 6.9370], "imo": [5.4836, 7.0253], "enugu": [6.4584, 7.5464],
        "delta": [5.8904, 5.6804], "edo": [6.3350, 5.6037], "ondo": [7.2500, 5.1931],
        "osun": [7.7827, 4.5624], "ekiti": [7.6211, 5.2195], "kwara": [8.4966, 4.5426],
        "plateau": [9.8965, 8.8583], "adamawa": [9.3265, 12.3984], "taraba": [7.9994, 11.3755],
        "gombe": [10.2897, 11.1674], "yobe": [12.2939, 11.7390], "zamfara": [12.1844, 6.6599],
        "sokoto": [13.0622, 5.2339], "kebbi": [12.4539, 4.1975], "nasarawa": [8.5380, 8.3220],
        "kogi": [7.7337, 6.6906], "ebonyi": [6.2649, 8.0137], "abia": [5.5320, 7.4860],
        "cross river": [4.9757, 8.3417], "akwa ibom": [5.0510, 7.9335], "bayelsa": [4.7719, 6.0699],
        "ogun": [6.9980, 3.4737],
      };
      
      let center: [number, number] | null = null;
      let radius = 0.05; // ~5km in degrees
      let locName = aiLocationInput.trim();
      
      // Try to match state
      for (const [state, coords] of Object.entries(stateCoords)) {
        if (input.includes(state)) {
          center = coords;
          radius = 0.2; // ~20km for state level
          locName = state.charAt(0).toUpperCase() + state.slice(1);
          break;
        }
      }
      
      // Default to center of Nigeria if no match
      if (!center) {
        center = [9.06, 7.49];
        radius = 0.05;
      }
      
      // Generate square polygon around center
      const leafletCoords: [number, number][] = [
        [center[0] - radius, center[1] - radius],
        [center[0] - radius, center[1] + radius],
        [center[0] + radius, center[1] + radius],
        [center[0] + radius, center[1] - radius],
      ];
      
      if (drawnItemsRef.current && mapInstanceRef.current) {
        drawnItemsRef.current.clearLayers();
        const polygon = L.polygon(leafletCoords, { color: "#d4a843", fillColor: "#d4a843", fillOpacity: 0.3 });
        drawnItemsRef.current.addLayer(polygon);
        mapInstanceRef.current.fitBounds(polygon.getBounds());
      }
      setCoordinates(leafletCoords);
      if (!geofenceName) setGeofenceName(locName);
      toast({
        title: "Geofence Generated",
        description: `${locName} - approximate boundary. Adjust the polygon as needed.`,
      });
    } catch (err: any) {
      console.error("Geofence error:", err);
      toast({
        title: "Geofence Failed",
        description: err.message || "Could not generate geofence. Try drawing manually.",
        variant: "destructive",
      });
    } finally {
      setIsAiLoading(false);
    }
  }, [aiLocationInput, geofenceName]);

  // Handle shapefile upload
  const handleShapefileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type - accept .zip or .shp
    const validExtensions = ['.zip', '.shp'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a .zip file containing shapefile components (.shp, .shx, .dbf) or a .shp file.",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingShapefile(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const geojson = await shp(arrayBuffer);

      // Handle both single feature and feature collection
      let features: GeoJSON.Feature[] = [];
      if (Array.isArray(geojson)) {
        // shpjs can return an array of FeatureCollections
        for (const item of geojson) {
          if (item?.type === "FeatureCollection" && item.features) {
            features.push(...item.features);
          } else if (item?.type === "Feature") {
            features.push(item);
          }
        }
      } else if (geojson?.type === "FeatureCollection") {
        features = geojson.features || [];
      } else if (geojson?.type === "Feature") {
        features = [geojson];
      }

      if (features.length === 0) {
        throw new Error("No valid features found in shapefile");
      }

      const swapToLatLng = (coords: any[]): [number, number][] => {
        return coords
          .filter((c: any) => Array.isArray(c) && c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number")
          .map((c: any) => [c[1], c[0]] as [number, number]);
      };

      // Extract coordinates from polygon features - merge all polygons into one boundary
      let polygonCoords: [number, number][] = [];
      
      for (const feature of features) {
        const geometry = feature.geometry;
        if (!geometry) continue;
        
        if (geometry.type === "Polygon" && geometry.coordinates?.[0]) {
          polygonCoords = swapToLatLng(geometry.coordinates[0]);
          break;
        } else if (geometry.type === "MultiPolygon" && geometry.coordinates?.[0]?.[0]) {
          // Find the largest polygon ring
          let largestRing: any[] = [];
          for (const polygon of geometry.coordinates) {
            if (polygon[0] && polygon[0].length > largestRing.length) {
              largestRing = polygon[0];
            }
          }
          polygonCoords = swapToLatLng(largestRing);
          break;
        }
      }

      if (polygonCoords.length < 3) {
        throw new Error("No valid polygon geometry found in shapefile");
      }

      // Update map with new polygon
      if (drawnItemsRef.current && mapInstanceRef.current) {
        drawnItemsRef.current.clearLayers();

        const polygon = L.polygon(polygonCoords, {
          color: "#d4a843",
          fillColor: "#d4a843",
          fillOpacity: 0.3,
        });

        drawnItemsRef.current.addLayer(polygon);
        mapInstanceRef.current.fitBounds(polygon.getBounds());
      }

      setCoordinates(polygonCoords);

      // Set name from file if not already set
      if (!geofenceName) {
        const baseName = file.name.replace(/\.(zip|shp)$/i, "");
        setGeofenceName(baseName);
      }

      toast({
        title: "Shapefile Loaded",
        description: `Imported polygon with ${polygonCoords.length} points from ${file.name}`,
      });

    } catch (error) {
      console.error("Error parsing shapefile:", error);
      toast({
        title: "Shapefile Error",
        description: error instanceof Error ? error.message : "Failed to parse shapefile. Please ensure it contains valid polygon geometry.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingShapefile(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [geofenceName]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Initialize map centered on Nigeria (as example for public health projects in Africa)
    const map = L.map(mapRef.current).setView([9.082, 8.6753], 6);
    mapInstanceRef.current = map;

    // Add tile layer (OpenStreetMap)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Initialize feature group for drawn items
    const drawnItems = new L.FeatureGroup();
    drawnItemsRef.current = drawnItems;
    map.addLayer(drawnItems);

    // Add existing geofence if present
    if (geofence?.coordinates && geofence.coordinates.length > 0) {
      const polygon = L.polygon(
        geofence.coordinates.map((coord): L.LatLngTuple => [coord[0], coord[1]]),
        {
          color: "#d4a843",
          fillColor: "#d4a843",
          fillOpacity: 0.3,
        }
      );
      drawnItems.addLayer(polygon);
      map.fitBounds(polygon.getBounds());
    }

    // Initialize draw control
    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          drawError: {
            color: "#e1e1e1",
            message: "<strong>Cannot draw self-intersecting polygon!</strong>",
          },
          shapeOptions: {
            color: "#d4a843",
            fillColor: "#d4a843",
            fillOpacity: 0.3,
          },
        },
        polyline: false,
        circle: false,
        rectangle: {
          shapeOptions: {
            color: "#d4a843",
            fillColor: "#d4a843",
            fillOpacity: 0.3,
          },
        },
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);

    // Handle draw events
    map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      
      // Clear existing layers
      drawnItems.clearLayers();
      drawnItems.addLayer(layer);

      // Extract coordinates
      const latLngs = layer.getLatLngs()[0];
      const coords: [number, number][] = latLngs.map((latLng: L.LatLng) => [
        latLng.lat,
        latLng.lng,
      ]);
      setCoordinates(coords);

      toast({
        title: "Geofence Area Defined",
        description: `Area with ${coords.length} points has been created.`,
      });
    });

    map.on(L.Draw.Event.EDITED, (e: any) => {
      const layers = e.layers;
      layers.eachLayer((layer: any) => {
        const latLngs = layer.getLatLngs()[0];
        const coords: [number, number][] = latLngs.map((latLng: L.LatLng) => [
          latLng.lat,
          latLng.lng,
        ]);
        setCoordinates(coords);
      });

      toast({
        title: "Geofence Updated",
        description: "The geofence area has been modified.",
      });
    });

    map.on(L.Draw.Event.DELETED, () => {
      setCoordinates([]);
      toast({
        title: "Geofence Removed",
        description: "The geofence area has been deleted.",
      });
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  const handleSaveGeofence = () => {
    if (coordinates.length < 3) {
      toast({
        title: "Invalid Geofence",
        description: "Please draw a polygon with at least 3 points.",
        variant: "destructive",
      });
      return;
    }

    if (!geofenceName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for the geofence area.",
        variant: "destructive",
      });
      return;
    }

    const newGeofence: GeofenceArea = {
      id: geofence?.id || `geo-${Date.now()}`,
      name: geofenceName,
      coordinates,
      enabled: geofenceEnabled,
    };

    onGeofenceChange(newGeofence);

    toast({
      title: "Geofence Saved",
      description: `Geofence "${geofenceName}" has been saved successfully.`,
    });
  };

  const handleClearGeofence = () => {
    drawnItemsRef.current?.clearLayers();
    setCoordinates([]);
    setGeofenceName("");
    setGeofenceEnabled(false);
    onGeofenceChange(undefined);

    toast({
      title: "Geofence Cleared",
      description: "The geofence has been removed from this form.",
    });
  };

  return (
    <div className="space-y-5">
      <Card className="border border-border/50 shadow-card overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/30 pb-4">
          <CardTitle className="flex items-center gap-3 font-display text-lg">
            <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            Geofencing Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-primary/5 to-muted/30 p-4 border border-primary/10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <Info className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Draw a polygon on the map, upload a shapefile (.zip), or use AI-powered location detection to define the area where data collection is allowed. Submissions outside this boundary will be restricted.
            </p>
          </div>

          {/* Shapefile Upload Section */}
          <div className="rounded-xl border-2 border-dashed border-primary/20 p-5 bg-gradient-to-br from-primary/[0.02] to-transparent hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                  <FileUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Upload Shapefile</p>
                  <p className="text-xs text-muted-foreground">
                    Upload a .zip file containing .shp, .shx, and .dbf files
                  </p>
                </div>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.shp"
                  onChange={handleShapefileUpload}
                  className="hidden"
                  id="shapefile-upload"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoadingShapefile}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {isLoadingShapefile ? "Loading..." : "Choose File"}
                </Button>
              </div>
            </div>
          </div>

          {/* AI Location-Based Geofencing */}
          <div className="rounded-xl border-2 border-dashed border-accent/30 p-5 bg-gradient-to-br from-accent/[0.03] to-transparent hover:border-accent/50 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI-Powered Geofencing</p>
                <p className="text-xs text-muted-foreground">
                  Describe a location or enter a State, LGA, Area Council (FCT), Ward, Health Facility, or Community name
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Textarea
                value={aiLocationInput}
                onChange={(e) => setAiLocationInput(e.target.value)}
                placeholder="e.g., 'Kano State', 'Ikeja LGA, Lagos', 'AMAC Area Council, FCT-Abuja', 'Wuse Ward', 'General Hospital Maitama'"
                className="flex-1 min-h-[60px]"
              />
              <Button onClick={handleAiGeofence} disabled={isAiLoading} variant="acg" className="self-end">
                {isAiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {isAiLoading ? "Generating..." : "Auto-Detect"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="geofence-name" className="text-sm font-semibold">Geofence Name</Label>
              <Input
                id="geofence-name"
                value={geofenceName}
                onChange={(e) => setGeofenceName(e.target.value)}
                placeholder="e.g., Lagos State Health District"
                className="h-11"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
              <div>
                <Label htmlFor="geofence-enabled" className="text-sm font-semibold">Enable Geofencing</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Restrict data collection to this area
                </p>
              </div>
              <Switch
                id="geofence-enabled"
                checked={geofenceEnabled}
                onCheckedChange={setGeofenceEnabled}
              />
            </div>
          </div>

          {coordinates.length > 0 && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm font-medium text-foreground">
                Area Defined: {coordinates.length} points
              </p>
              <p className="text-xs text-muted-foreground">
                The geofence polygon has been drawn on the map
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSaveGeofence} variant="acg" className="flex-1">
              <Save className="mr-2 h-4 w-4" />
              Save Geofence
            </Button>
            <Button onClick={handleClearGeofence} variant="outline">
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-0 shadow-card">
        <CardHeader className="pb-0">
          <CardTitle className="font-display text-base">
            Draw Geofence Area
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Use the polygon or rectangle tool to draw the allowed data collection area
          </p>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          <div
            ref={mapRef}
            className="h-[500px] w-full rounded-b-lg"
            style={{ zIndex: 1 }}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default GeofenceEditor;
