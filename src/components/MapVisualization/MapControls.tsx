import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Globe,
  Layers,
  ZoomIn,
  ZoomOut,
  Locate,
  MapPin,
  Filter,
  RefreshCw,
} from "lucide-react";
import { MAP_VIEWS, MAP_LAYERS, MapViewLevel, MapLayerType } from "./types";

interface MapControlsProps {
  currentView: MapViewLevel;
  currentLayer: MapLayerType;
  showClusters: boolean;
  showHeatmap: boolean;
  markerCount: number;
  onViewChange: (view: MapViewLevel) => void;
  onLayerChange: (layer: MapLayerType) => void;
  onToggleClusters: (enabled: boolean) => void;
  onToggleHeatmap: (enabled: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onLocateUser?: () => void;
}

const MapControls = ({
  currentView,
  currentLayer,
  showClusters,
  showHeatmap,
  markerCount,
  onViewChange,
  onLayerChange,
  onToggleClusters,
  onToggleHeatmap,
  onZoomIn,
  onZoomOut,
  onResetView,
  onLocateUser,
}: MapControlsProps) => {
  return (
    <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
      {/* View Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className="shadow-lg gap-2">
            <Globe className="h-4 w-4" />
            {MAP_VIEWS[currentView].label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Map View</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(MAP_VIEWS) as MapViewLevel[]).map((view) => (
            <DropdownMenuItem
              key={view}
              onClick={() => onViewChange(view)}
              className={currentView === view ? "bg-accent" : ""}
            >
              {MAP_VIEWS[view].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Layer Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className="shadow-lg gap-2">
            <Layers className="h-4 w-4" />
            {MAP_LAYERS[currentLayer].label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Map Style</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(MAP_LAYERS) as MapLayerType[]).map((layer) => (
            <DropdownMenuItem
              key={layer}
              onClick={() => onLayerChange(layer)}
              className={currentLayer === layer ? "bg-accent" : ""}
            >
              {MAP_LAYERS[layer].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Display Options */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className="shadow-lg gap-2">
            <Filter className="h-4 w-4" />
            Display
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Display Options</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="p-2 space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="clusters" className="text-sm cursor-pointer">
                Cluster Markers
              </Label>
              <Switch
                id="clusters"
                checked={showClusters}
                onCheckedChange={onToggleClusters}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="heatmap" className="text-sm cursor-pointer">
                Heatmap View
              </Label>
              <Switch
                id="heatmap"
                checked={showHeatmap}
                onCheckedChange={onToggleHeatmap}
              />
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Marker Count Badge */}
      <Badge variant="secondary" className="shadow-lg justify-center gap-1.5 py-1.5">
        <MapPin className="h-3.5 w-3.5" />
        {markerCount} locations
      </Badge>
    </div>
  );
};

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onLocateUser?: () => void;
}

export const ZoomControls = ({
  onZoomIn,
  onZoomOut,
  onResetView,
  onLocateUser,
}: ZoomControlsProps) => {
  return (
    <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-1">
      <Button
        variant="secondary"
        size="icon"
        className="shadow-lg h-8 w-8"
        onClick={onZoomIn}
        title="Zoom In"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="shadow-lg h-8 w-8"
        onClick={onZoomOut}
        title="Zoom Out"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="shadow-lg h-8 w-8"
        onClick={onResetView}
        title="Reset View"
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
      {onLocateUser && (
        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg h-8 w-8"
          onClick={onLocateUser}
          title="My Location"
        >
          <Locate className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default MapControls;
