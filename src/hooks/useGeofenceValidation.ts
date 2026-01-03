import { useMemo, useCallback } from "react";
import { GeofenceArea } from "@/components/FormBuilder/types";

export interface GeofenceValidationResult {
  isWithinGeofence: boolean;
  distance: number | null; // Distance to nearest boundary in meters
  message: string;
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
  const R = 6371000; // Earth's radius in meters
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
    const [lat2, lng2] = polygon[(i + 1) % polygon.length];

    // Calculate distance to this edge
    const distance = calculateDistance(lat, lng, lat1, lng1);
    minDistance = Math.min(minDistance, distance);
  }

  return minDistance;
};

export const useGeofenceValidation = (geofence: GeofenceArea | undefined) => {
  const validatePosition = useCallback(
    (lat: number, lng: number): GeofenceValidationResult => {
      // If no geofence or geofence not enabled, always valid
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
  };
};

export default useGeofenceValidation;
