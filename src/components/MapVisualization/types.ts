// Map visualization types

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description?: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  community?: string | null;
  facility?: string | null;
  submittedAt?: string;
  submitterName?: string;
  formName?: string;
  /** Explicit marker colour (overrides GPS-source colour). */
  markerColor?: string;
  data?: Record<string, any>;
}

export type MapViewLevel = "nigeria" | "africa" | "world";

export interface MapViewConfig {
  center: [number, number];
  zoom: number;
  label: string;
}

export const MAP_VIEWS: Record<MapViewLevel, MapViewConfig> = {
  nigeria: {
    center: [9.082, 8.6753],
    zoom: 6,
    label: "Nigeria",
  },
  africa: {
    center: [1.0, 20.0],
    zoom: 3,
    label: "Africa",
  },
  world: {
    center: [20.0, 0.0],
    zoom: 2,
    label: "World",
  },
};

export type MapLayerType = "standard" | "satellite" | "terrain" | "dark";

export interface MapLayerConfig {
  url: string;
  attribution: string;
  label: string;
}

export const MAP_LAYERS: Record<MapLayerType, MapLayerConfig> = {
  standard: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    label: "Standard",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    label: "Satellite",
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    label: "Terrain",
  },
  dark: {
    url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>',
    label: "Dark",
  },
};

export interface MapFilters {
  dateRange?: { start: Date; end: Date };
  state?: string;
  formId?: string;
}
