import { useMemo, useCallback } from "react";
import { GeofenceArea } from "@/components/FormBuilder/types";

export interface GeofenceValidationResult {
  isWithinGeofence: boolean;
  distance: number | null;
  message: string;
}

// Normalize geofence from either GeofenceArea format or GeoJSON format stored in DB
export function normalizeGeofence(raw: any): GeofenceArea | undefined {
  if (!raw) return undefined;

  // Already in GeofenceArea format
  if (raw.enabled !== undefined && Array.isArray(raw.coordinates) && raw.coordinates.length > 0 && typeof raw.coordinates[0][0] === "number") {
    return raw as GeofenceArea;
  }

  // GeoJSON Polygon format: { type: "Polygon", coordinates: [[[lng, lat], ...]], properties: { name, enforced } }
  if (raw.type === "Polygon" && Array.isArray(raw.coordinates)) {
    const ring = raw.coordinates[0]; // outer ring
    if (!ring || ring.length < 3) return undefined;

    // GeoJSON uses [lng, lat] — convert to [lat, lng] for our internal format
    const coords: [number, number][] = ring.map((c: number[]) => [c[1], c[0]] as [number, number]);

    return {
      id: raw.properties?.id || "geofence-db",
      name: raw.properties?.name || "Geofence",
      coordinates: coords,
      enabled: raw.properties?.enforced !== false, // default to enabled
    };
  }

  // Legacy format with nested coordinates but no type field
  if (Array.isArray(raw.coordinates) && raw.coordinates.length > 0) {
    const first = raw.coordinates[0];
    // Check if it's nested arrays (GeoJSON-like)
    if (Array.isArray(first) && Array.isArray(first[0])) {
      const ring = first;
      const coords: [number, number][] = ring.map((c: number[]) => [c[1], c[0]] as [number, number]);
      return {
        id: raw.id || "geofence-db",
        name: raw.name || "Geofence",
        coordinates: coords,
        enabled: raw.enabled !== false,
      };
    }
    // Flat [lat, lng] pairs
    return {
      id: raw.id || "geofence-db",
      name: raw.name || "Geofence",
      coordinates: raw.coordinates,
      enabled: raw.enabled !== false,
    };
  }

  return undefined;
}

// Check if a point is inside a polygon using ray casting algorithm
const isPointInPolygon = (
  point: [number, number],
  polygon: [number, number][]
): boolean => {
  const [lat, lng] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lat1, lng1] = polygon[i];
    const [lat2, lng2] = polygon[j];

    if (
      lng1 > lng !== lng2 > lng &&
      lat < ((lat2 - lat1) * (lng - lng1)) / (lng2 - lng1) + lat1
    ) {
      inside = !inside;
    }
  }

  return inside;
};

// Calculate distance between two points using Haversine formula
const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Calculate distance to nearest polygon edge
const distanceToPolygon = (
  point: [number, number],
  polygon: [number, number][]
): number => {
  let minDistance = Infinity;
  const [lat, lng] = point;

  for (let i = 0; i < polygon.length; i++) {
    const [lat1, lng1] = polygon[i];
    const distance = calculateDistance(lat, lng, lat1, lng1);
    minDistance = Math.min(minDistance, distance);
  }

  return minDistance;
};

export const useGeofenceValidation = (geofenceRaw: any | undefined) => {
  // Normalize the geofence from whatever format it comes in
  const geofence = useMemo(() => normalizeGeofence(geofenceRaw), [geofenceRaw]);

  const validatePosition = useCallback(
    (lat: number, lng: number): GeofenceValidationResult => {
      if (!geofence || !geofence.enabled || geofence.coordinates.length < 3) {
        return {
          isWithinGeofence: true,
          distance: null,
          message: "No geofence restriction",
        };
      }

      const point: [number, number] = [lat, lng];
      const isInside = isPointInPolygon(point, geofence.coordinates);
      const distance = distanceToPolygon(point, geofence.coordinates);

      if (isInside) {
        return {
          isWithinGeofence: true,
          distance: 0,
          message: `You are within the ${geofence.name} boundary`,
        };
      } else {
        return {
          isWithinGeofence: false,
          distance: Math.round(distance),
          message: `You are approximately ${Math.round(distance)}m outside the ${geofence.name} boundary`,
        };
      }
    },
    [geofence]
  );

  const isGeofenceEnabled = useMemo(() => {
    return geofence?.enabled && geofence.coordinates.length >= 3;
  }, [geofence]);

  return {
    validatePosition,
    isGeofenceEnabled,
    geofenceName: geofence?.name || null,
    normalizedGeofence: geofence,
  };
};

export default useGeofenceValidation;
