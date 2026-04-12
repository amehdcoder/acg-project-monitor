export interface RouteStop {
  order: number;
  name: string;
  lat: number;
  lng: number;
  distance?: string;
  duration?: string;
}

export interface TurnDirection {
  step: number;
  instruction: string;
  distance: string;
  duration: string;
  maneuver: string;
  coordinates: [number, number];
}

export interface RouteOption {
  id: string;
  label: string;
  distance: string;
  duration: string;
  trafficLevel: "low" | "moderate" | "heavy" | "severe";
  points: [number, number][];
  directions: TurnDirection[];
  selected?: boolean;
}

export interface TrafficIncident {
  id: string;
  type: "congestion" | "closure" | "accident" | "construction";
  severity: "low" | "moderate" | "high";
  title: string;
  description: string;
  coordinates: [number, number];
  reportedAt: string;
}

export interface PointOfInterest {
  id: string;
  name: string;
  category: "fuel" | "food" | "hotel" | "hospital" | "atm" | "police";
  coordinates: [number, number];
  distance?: string;
}

export interface SpeedZone {
  coordinates: [number, number];
  speedLimit: number;
  enforcement: boolean;
  label: string;
}

export interface CachedMapRegion {
  id: string;
  bounds: { north: number; south: number; east: number; west: number };
  zoom: number;
  cachedAt: string;
  tileCount: number;
}
