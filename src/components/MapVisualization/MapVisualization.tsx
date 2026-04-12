import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { MarkerClusterGroup } from "leaflet";
import { Card } from "@/components/ui/card";
import MapControls, { ZoomControls } from "./MapControls";
import MapLegend from "./MapLegend";
import PegmanControl from "./PegmanControl";
import StreetViewPanel from "./StreetViewPanel";
import {
  MapMarker,
  MapViewLevel,
  MapLayerType,
  MAP_VIEWS,
  MAP_LAYERS,
} from "./types";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

// Helper function to create popup HTML content
const createPopupContent = (marker: MapMarker): string => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return dateString;
    }
  };

  // Check if GPS came from form response or metadata
  const geoSource = marker.data?._geoSource;
  const accuracy = marker.data?._accuracy;
  
  const sourceBadge = geoSource === 'form_response'
    ? '<span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">📍 GPS from Form</span>'
    : '<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">📱 Device Location</span>';
  
  const accuracyBadge = accuracy && !isNaN(accuracy)
    ? `<span style="background: #f3f4f6; color: #374151; padding: 2px 8px; border-radius: 12px; font-size: 10px; margin-left: 4px;">±${Math.round(accuracy)}m</span>`
    : '';

  const locationItems: string[] = [];
  if (marker.state) locationItems.push(`<div class="popup-row"><span class="popup-label">State:</span> <span class="popup-value">${marker.state}</span></div>`);
  if (marker.lga) locationItems.push(`<div class="popup-row"><span class="popup-label">LGA:</span> <span class="popup-value">${marker.lga}</span></div>`);
  if (marker.ward) locationItems.push(`<div class="popup-row"><span class="popup-label">Ward:</span> <span class="popup-value">${marker.ward}</span></div>`);
  if (marker.community) locationItems.push(`<div class="popup-row"><span class="popup-label">Community:</span> <span class="popup-value">${marker.community}</span></div>`);
  if (marker.facility) locationItems.push(`<div class="popup-row"><span class="popup-label">Facility:</span> <span class="popup-value">${marker.facility}</span></div>`);

  const metaItems: string[] = [];
  if (marker.formName) metaItems.push(`<div class="popup-meta">📄 ${marker.formName}</div>`);
  if (marker.submitterName) metaItems.push(`<div class="popup-meta">👤 ${marker.submitterName}</div>`);
  if (marker.submittedAt) metaItems.push(`<div class="popup-meta">📅 ${formatDate(marker.submittedAt)}</div>`);

  return `
    <div class="marker-popup">
      <div class="popup-title">${marker.title}</div>
      <div class="popup-source">${sourceBadge}${accuracyBadge}</div>
      ${locationItems.length > 0 ? `<div class="popup-location">${locationItems.join('')}</div>` : ''}
      ${metaItems.length > 0 ? `<div class="popup-meta-section">${metaItems.join('')}</div>` : ''}
      <div class="popup-coords">📌 ${marker.lat.toFixed(6)}, ${marker.lng.toFixed(6)}</div>
    </div>
  `;
};

// Fix for default marker icons in Leaflet
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Configure default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

// Custom marker icon
const createCustomIcon = (isFromForm: boolean = false) => {
  const color = isFromForm ? "#10B981" : "#d4a843";
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      width: 20px;
      height: 20px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2.5px solid white;
      box-shadow: 0 3px 8px rgba(0,0,0,0.35);
      transition: transform 0.2s ease;
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 20],
    popupAnchor: [0, -20],
  });
};

interface GeofenceBoundary {
  name: string;
  coordinates: [number, number][]; // [lat, lng] pairs
  color?: string;
}

interface MapVisualizationProps {
  markers: MapMarker[];
  height?: string;
  initialView?: MapViewLevel;
  showControls?: boolean;
  showLegend?: boolean;
  geofences?: GeofenceBoundary[];
  onMarkerClick?: (marker: MapMarker) => void;
}

const MapVisualization = ({
  markers,
  height = "500px",
  initialView = "nigeria",
  showControls = true,
  showLegend = true,
  geofences = [],
  onMarkerClick,
}: MapVisualizationProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<MarkerClusterGroup | null>(null);
  const individualMarkersRef = useRef<L.LayerGroup | null>(null);
  const heatmapLayerRef = useRef<L.LayerGroup | null>(null);

  const [currentView, setCurrentView] = useState<MapViewLevel>(initialView);
  const [currentLayer, setCurrentLayer] = useState<MapLayerType>("standard");
  const [showClusters, setShowClusters] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [showGeofences, setShowGeofences] = useState(true);
  const [streetViewActive, setStreetViewActive] = useState(false);
  const [streetViewCoords, setStreetViewCoords] = useState<{ lat: number; lng: number } | null>(null);
  const geofenceLayersRef = useRef<L.Polygon[]>([]);

  // Convert pixel point to lat/lng using the Leaflet map
  const getLatLngFromPoint = useCallback((x: number, y: number) => {
    if (!mapRef.current) return null;
    const point = mapRef.current.containerPointToLatLng([x, y]);
    return { lat: point.lat, lng: point.lng };
  }, []);

  // Handle Pegman activation (drag-drop or click mode)
  const handlePegmanActivate = useCallback((coords?: { lat: number; lng: number }) => {
    if (coords) {
      // Dropped onto a specific location
      setStreetViewCoords(coords);
      setStreetViewActive(true);
    } else {
      // Toggle click mode
      if (streetViewActive) {
        setStreetViewActive(false);
        setStreetViewCoords(null);
      } else {
        setStreetViewActive(true);
      }
    }
  }, [streetViewActive]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const viewConfig = MAP_VIEWS[initialView];
    const map = L.map(mapContainerRef.current, {
      center: viewConfig.center,
      zoom: viewConfig.zoom,
      zoomControl: false, // We'll use custom controls
      attributionControl: true,
    });

    mapRef.current = map;

    // Add initial tile layer
    const layerConfig = MAP_LAYERS[currentLayer];
    const tileLayer = L.tileLayer(layerConfig.url, {
      attribution: layerConfig.attribution,
      maxZoom: 19,
    });
    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    // Initialize marker cluster group
    const markerCluster = (L as any).markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = "small";
        if (count > 10) size = "medium";
        if (count > 50) size = "large";

        const sizeMap = { small: 30, medium: 40, large: 50 };
        const dimension = sizeMap[size as keyof typeof sizeMap];

        return L.divIcon({
          html: `<div style="
            background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8));
            color: white;
            width: ${dimension}px;
            height: ${dimension}px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: ${dimension / 3}px;
            box-shadow: 0 3px 10px rgba(0,0,0,0.3);
            border: 3px solid white;
          ">${count}</div>`,
          className: "custom-cluster-icon",
          iconSize: L.point(dimension, dimension),
        });
      },
    });
    markersLayerRef.current = markerCluster;
    map.addLayer(markerCluster);

    // Initialize individual markers layer (for non-clustered view)
    const individualMarkers = L.layerGroup();
    individualMarkersRef.current = individualMarkers;

    // Initialize heatmap layer
    const heatmapLayer = L.layerGroup();
    heatmapLayerRef.current = heatmapLayer;

    setIsMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    if (!isMapReady || !markersLayerRef.current || !individualMarkersRef.current) return;

    const clusterGroup = markersLayerRef.current;
    const individualGroup = individualMarkersRef.current;

    // Clear existing markers
    clusterGroup.clearLayers();
    individualGroup.clearLayers();

    // Create markers
    markers.forEach((markerData) => {
      const isFromForm = markerData.data?._geoSource === 'form_response';
      const icon = createCustomIcon(isFromForm);
      const marker = L.marker([markerData.lat, markerData.lng], { icon });

      // Create popup content
      const popupContent = createPopupContent(markerData);
      marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: "custom-popup",
      });

      // Add click handler
      if (onMarkerClick) {
        marker.on("click", () => onMarkerClick(markerData));
      }

      // Add to both layers
      clusterGroup.addLayer(marker);

      const individualMarker = L.marker([markerData.lat, markerData.lng], { icon: createCustomIcon(isFromForm) });
      individualMarker.bindPopup(popupContent, {
        maxWidth: 300,
        className: "custom-popup",
      });
      individualGroup.addLayer(individualMarker);
    });

    // Update visibility based on cluster setting
    const map = mapRef.current;
    if (map) {
      if (showClusters) {
        if (!map.hasLayer(clusterGroup)) map.addLayer(clusterGroup);
        if (map.hasLayer(individualGroup)) map.removeLayer(individualGroup);
      } else {
        if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
        if (!map.hasLayer(individualGroup)) map.addLayer(individualGroup);
      }
    }
  }, [markers, isMapReady, showClusters, onMarkerClick]);

  // Update heatmap visualization
  useEffect(() => {
    if (!isMapReady || !heatmapLayerRef.current || !mapRef.current) return;

    const map = mapRef.current;
    const heatmapLayer = heatmapLayerRef.current;

    heatmapLayer.clearLayers();

    if (showHeatmap && markers.length > 0) {
      // Create circle markers for heatmap effect
      markers.forEach((marker) => {
        const circle = L.circleMarker([marker.lat, marker.lng], {
          radius: 20,
          fillColor: "hsl(var(--primary))",
          fillOpacity: 0.3,
          stroke: false,
        });
        heatmapLayer.addLayer(circle);
      });

      if (!map.hasLayer(heatmapLayer)) {
        map.addLayer(heatmapLayer);
      }
    } else {
      if (map.hasLayer(heatmapLayer)) {
        map.removeLayer(heatmapLayer);
      }
    }
  }, [markers, isMapReady, showHeatmap]);

  // Render geofence boundaries
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    const map = mapRef.current;

    // Store geofence layers for cleanup
    const geofenceLayers: L.Polygon[] = [];

    geofences.forEach((gf) => {
      if (gf.coordinates.length < 3) return;
      const latLngs = gf.coordinates.map(([lat, lng]) => [lat, lng] as [number, number]);
      const polygon = L.polygon(latLngs, {
        color: gf.color || "#e11d48",
        weight: 2.5,
        opacity: 0.8,
        fillColor: gf.color || "#e11d48",
        fillOpacity: 0.1,
        dashArray: "8, 6",
      });
      polygon.bindTooltip(gf.name, {
        permanent: false,
        direction: "center",
        className: "geofence-tooltip",
      });
      polygon.addTo(map);
      geofenceLayers.push(polygon);
    });

    return () => {
      geofenceLayers.forEach((layer) => map.removeLayer(layer));
    };
  }, [geofences, isMapReady]);

  // Handle view changes
  const handleViewChange = useCallback((view: MapViewLevel) => {
    setCurrentView(view);
    if (mapRef.current) {
      const viewConfig = MAP_VIEWS[view];
      mapRef.current.setView(viewConfig.center, viewConfig.zoom, {
        animate: true,
        duration: 1,
      });
    }
  }, []);

  // Handle layer changes
  const handleLayerChange = useCallback((layer: MapLayerType) => {
    setCurrentLayer(layer);
    if (mapRef.current && tileLayerRef.current) {
      const layerConfig = MAP_LAYERS[layer];
      tileLayerRef.current.setUrl(layerConfig.url);
    }
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut();
  }, []);

  const handleResetView = useCallback(() => {
    if (mapRef.current) {
      const viewConfig = MAP_VIEWS[currentView];
      mapRef.current.setView(viewConfig.center, viewConfig.zoom, {
        animate: true,
      });
    }
  }, [currentView]);

  const handleLocateUser = useCallback(() => {
    if (!mapRef.current) return;

    mapRef.current.locate({ setView: true, maxZoom: 12 });
    mapRef.current.once("locationfound", (e) => {
      toast({
        title: "Location Found",
        description: `Your location: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`,
      });
    });
    mapRef.current.once("locationerror", () => {
      toast({
        title: "Location Error",
        description: "Unable to determine your location.",
        variant: "destructive",
      });
    });
  }, []);

  // Fit bounds to markers
  useEffect(() => {
    if (!isMapReady || !mapRef.current || markers.length === 0) return;

    // Debounce fit bounds
    const timeoutId = setTimeout(() => {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
      if (bounds.isValid()) {
        mapRef.current?.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: 12,
          animate: true,
        });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [markers, isMapReady]);

  // Street View click mode: click map to open street view
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    const map = mapRef.current;

    const onClick = (e: L.LeafletMouseEvent) => {
      if (streetViewActive && !streetViewCoords) {
        setStreetViewCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    };

    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [isMapReady, streetViewActive, streetViewCoords]);

  // Change cursor when in street view click mode
  useEffect(() => {
    if (!mapContainerRef.current) return;
    mapContainerRef.current.style.cursor = streetViewActive && !streetViewCoords ? "crosshair" : "";
  }, [streetViewActive, streetViewCoords]);

  return (
    <Card className="relative overflow-hidden border-0 shadow-card">
      <div
        ref={mapContainerRef}
        style={{ height: streetViewCoords ? `calc(${height} + 300px)` : height, width: "100%" }}
        className="rounded-lg"
      />

      {showControls && (
        <>
          <MapControls
            currentView={currentView}
            currentLayer={currentLayer}
            showClusters={showClusters}
            showHeatmap={showHeatmap}
            markerCount={markers.length}
            onViewChange={handleViewChange}
            onLayerChange={handleLayerChange}
            onToggleClusters={setShowClusters}
            onToggleHeatmap={setShowHeatmap}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetView={handleResetView}
          />

          <ZoomControls
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetView={handleResetView}
            onLocateUser={handleLocateUser}
          />
        </>
      )}

      <MapLegend
        markers={markers}
        showLegend={showLegend}
        geofences={geofences}
        showGeofences={showGeofences}
        onToggleGeofences={() => setShowGeofences((v) => !v)}
        onGeofenceClick={(idx) => {
          const gf = geofences[idx];
          if (gf && mapRef.current && gf.coordinates.length >= 3) {
            if (!showGeofences) setShowGeofences(true);
            const latLngs = gf.coordinates.map(([lat, lng]) => [lat, lng] as L.LatLngTuple);
            const bounds = L.latLngBounds(latLngs);
            mapRef.current.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 0.8 });
          }
        }}
      />

      <style>{`
        .custom-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }
        .custom-popup .leaflet-popup-content {
          margin: 12px;
        }
        .custom-popup .leaflet-popup-tip {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }
        .leaflet-container {
          font-family: inherit;
        }
        .custom-cluster-icon {
          background: transparent !important;
        }
        .marker-popup {
          min-width: 200px;
          max-width: 280px;
        }
        .marker-popup .popup-title {
          font-weight: 600;
          font-size: 15px;
          margin-bottom: 8px;
          color: hsl(var(--foreground));
        }
        .marker-popup .popup-source {
          margin-bottom: 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .marker-popup .popup-location {
          margin-bottom: 10px;
          padding: 8px 10px;
          background: hsl(var(--muted) / 0.5);
          border-radius: 8px;
        }
        .marker-popup .popup-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          margin-bottom: 4px;
        }
        .marker-popup .popup-label {
          color: hsl(var(--muted-foreground));
        }
        .marker-popup .popup-value {
          font-weight: 500;
        }
        .marker-popup .popup-meta-section {
          border-top: 1px solid hsl(var(--border));
          padding-top: 8px;
          margin-top: 8px;
        }
        .marker-popup .popup-meta {
          font-size: 12px;
          color: hsl(var(--muted-foreground));
          margin-bottom: 4px;
        }
        .marker-popup .popup-coords {
          margin-top: 8px;
          padding: 6px 10px;
          background: hsl(var(--muted));
          border-radius: 6px;
          font-size: 11px;
          font-family: monospace;
          display: inline-block;
          color: hsl(var(--muted-foreground));
        }
      `}</style>
    </Card>
  );
};

export default MapVisualization;
