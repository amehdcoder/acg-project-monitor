import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import { GeofenceArea } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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
import { MapPin, Trash2, Save, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GeofenceEditorProps {
  geofence: GeofenceArea | undefined;
  onGeofenceChange: (geofence: GeofenceArea | undefined) => void;
}

const GeofenceEditor = ({ geofence, onGeofenceChange }: GeofenceEditorProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const [geofenceName, setGeofenceName] = useState(geofence?.name || "");
  const [geofenceEnabled, setGeofenceEnabled] = useState(geofence?.enabled || false);
  const [coordinates, setCoordinates] = useState<[number, number][]>(
    geofence?.coordinates || []
  );

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
    <div className="space-y-4">
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <MapPin className="h-5 w-5 text-primary" />
            Geofencing Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
            <Info className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              Draw a polygon on the map to define the area where data collection
              is allowed. Submissions outside this area will be restricted.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="geofence-name">Geofence Name</Label>
              <Input
                id="geofence-name"
                value={geofenceName}
                onChange={(e) => setGeofenceName(e.target.value)}
                placeholder="e.g., Lagos State Health District"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="geofence-enabled">Enable Geofencing</Label>
                <p className="text-xs text-muted-foreground">
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
