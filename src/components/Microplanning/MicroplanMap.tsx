import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Map, Layers, Eye } from "lucide-react";

interface MicroplanEntry {
  id: string;
  community_name: string;
  settlement_name: string | null;
  flhf_name: string;
  state: string;
  lga: string;
  ward: string;
  community_latitude: number | null;
  community_longitude: number | null;
  settlement_latitude: number | null;
  settlement_longitude: number | null;
  flhf_latitude: number | null;
  flhf_longitude: number | null;
  estimated_total_population: number | null;
  accessibility: string | null;
  terrain_type: string | null;
  security_clearance: string | null;
  community_distance_to_flhf_km: number | null;
}

interface MicroplanMapProps {
  entries: MicroplanEntry[];
  onEntryClick?: (id: string) => void;
}

type MapLayer = "communities" | "flhf" | "settlements" | "accessibility" | "population";

const accessibilityColors: Record<string, string> = {
  accessible: "#10B981",
  hard_to_reach: "#F59E0B",
  inaccessible: "#EF4444",
  seasonal: "#8B5CF6",
};

const MicroplanMap = ({ entries, onEntryClick }: MicroplanMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layerGroupsRef = useRef<Record<string, any>>({});
  const [activeLayers, setActiveLayers] = useState<MapLayer[]>(["communities", "flhf"]);
  const [mapStyle, setMapStyle] = useState<"standard" | "satellite">("standard");

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current, { zoomControl: true }).setView([9.0, 8.0], 6);
    mapInstanceRef.current = map;

    const tiles: Record<string, any> = {
      standard: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }),
      satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "© Esri",
      }),
    };
    tiles.standard.addTo(map);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update layers when entries or activeLayers change
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    // Clear existing layers
    Object.values(layerGroupsRef.current).forEach((lg: any) => lg.clearLayers());

    const communityGroup = L.layerGroup().addTo(map);
    const flhfGroup = L.layerGroup().addTo(map);
    const settlementGroup = L.layerGroup().addTo(map);
    layerGroupsRef.current = { communities: communityGroup, flhf: flhfGroup, settlements: settlementGroup };

    const bounds: [number, number][] = [];

    entries.forEach((entry) => {
      // Community markers
      if (activeLayers.includes("communities") && entry.community_latitude && entry.community_longitude) {
        const color = activeLayers.includes("accessibility") && entry.accessibility
          ? (accessibilityColors[entry.accessibility] || "#3B82F6")
          : "#3B82F6";

        const radius = activeLayers.includes("population") && entry.estimated_total_population
          ? Math.max(6, Math.min(20, Math.sqrt(entry.estimated_total_population) / 5))
          : 8;

        const marker = L.circleMarker([entry.community_latitude, entry.community_longitude], {
          radius,
          fillColor: color,
          color: "#fff",
          weight: 2,
          fillOpacity: 0.8,
        }).addTo(communityGroup);

        marker.bindPopup(`
          <div style="min-width:200px">
            <strong style="font-size:14px">${entry.community_name}</strong>
            ${entry.settlement_name ? `<br/><span style="color:#666">Settlement: ${entry.settlement_name}</span>` : ""}
            <hr style="margin:4px 0;border-color:#eee"/>
            <div style="font-size:12px">
              <b>FLHF:</b> ${entry.flhf_name}<br/>
              <b>State:</b> ${entry.state} | <b>LGA:</b> ${entry.lga} | <b>Ward:</b> ${entry.ward}<br/>
              ${entry.estimated_total_population ? `<b>Population:</b> ${entry.estimated_total_population.toLocaleString()}<br/>` : ""}
              ${entry.accessibility ? `<b>Access:</b> <span style="color:${accessibilityColors[entry.accessibility] || '#666'}">${entry.accessibility.replace(/_/g, " ")}</span><br/>` : ""}
              ${entry.terrain_type ? `<b>Terrain:</b> ${entry.terrain_type}<br/>` : ""}
              ${entry.security_clearance ? `<b>Security:</b> ${entry.security_clearance.replace(/_/g, " ")}<br/>` : ""}
              ${entry.community_distance_to_flhf_km ? `<b>Distance to FLHF:</b> ${entry.community_distance_to_flhf_km} km` : ""}
            </div>
          </div>
        `);

        if (onEntryClick) marker.on("click", () => onEntryClick(entry.id));
        bounds.push([entry.community_latitude, entry.community_longitude]);

        // Draw line to FLHF
        if (entry.flhf_latitude && entry.flhf_longitude) {
          L.polyline(
            [[entry.community_latitude, entry.community_longitude], [entry.flhf_latitude, entry.flhf_longitude]],
            { color: "#94A3B8", weight: 1, dashArray: "4 4", opacity: 0.5 }
          ).addTo(communityGroup);
        }
      }

      // FLHF markers
      if (activeLayers.includes("flhf") && entry.flhf_latitude && entry.flhf_longitude) {
        const flhfIcon = L.divIcon({
          className: "custom-flhf-icon",
          html: `<div style="background:#EF4444;color:white;width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)">+</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([entry.flhf_latitude, entry.flhf_longitude], { icon: flhfIcon })
          .addTo(flhfGroup)
          .bindPopup(`<strong>🏥 ${entry.flhf_name}</strong><br/>Ward: ${entry.ward}`);
        bounds.push([entry.flhf_latitude, entry.flhf_longitude]);
      }

      // Settlement markers
      if (activeLayers.includes("settlements") && entry.settlement_latitude && entry.settlement_longitude) {
        L.circleMarker([entry.settlement_latitude, entry.settlement_longitude], {
          radius: 5, fillColor: "#F59E0B", color: "#fff", weight: 1.5, fillOpacity: 0.8,
        }).addTo(settlementGroup).bindPopup(`<strong>${entry.settlement_name || "Settlement"}</strong>`);
        bounds.push([entry.settlement_latitude, entry.settlement_longitude]);
      }
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [entries, activeLayers, onEntryClick]);

  const toggleLayer = (layer: MapLayer) => {
    setActiveLayers(prev => prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer]);
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Map className="h-4 w-4 text-primary" />
            Geo-enabled Microplan Map
          </CardTitle>
          <div className="flex items-center gap-1 flex-wrap">
            {(["communities", "flhf", "settlements", "accessibility", "population"] as MapLayer[]).map(layer => (
              <Button
                key={layer}
                variant={activeLayers.includes(layer) ? "default" : "outline"}
                size="sm"
                className="text-[11px] h-7 px-2"
                onClick={() => toggleLayer(layer)}
              >
                {layer === "communities" ? "🏘️" : layer === "flhf" ? "🏥" : layer === "settlements" ? "📍" : layer === "accessibility" ? "🚧" : "👥"}
                {" "}{layer.charAt(0).toUpperCase() + layer.slice(1).replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={mapRef} className="h-[400px] md:h-[500px] w-full rounded-b-lg" />
        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2 text-[11px] text-muted-foreground flex-wrap border-t border-border/30">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-blue-500" /> Community</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-500 text-white text-[8px] font-bold text-center leading-3">+</span> FLHF</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Settlement</span>
          {activeLayers.includes("accessibility") && (
            <>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-500" /> Accessible</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Hard to Reach</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500" /> Inaccessible</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MicroplanMap;
