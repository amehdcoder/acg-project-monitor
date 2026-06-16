/**
 * Major Nigerian cities used for geofence enter/leave alerts on the live
 * tracking dashboard. Radius is in kilometres.
 */
export interface GeoCity {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

export const MAJOR_CITIES: GeoCity[] = [
  { name: "Lagos", lat: 6.5244, lng: 3.3792, radiusKm: 35 },
  { name: "Abuja", lat: 9.0765, lng: 7.3986, radiusKm: 30 },
  { name: "Kano", lat: 12.0022, lng: 8.592, radiusKm: 25 },
  { name: "Ibadan", lat: 7.3775, lng: 3.947, radiusKm: 25 },
  { name: "Port Harcourt", lat: 4.8156, lng: 7.0498, radiusKm: 25 },
  { name: "Benin City", lat: 6.335, lng: 5.6037, radiusKm: 20 },
  { name: "Kaduna", lat: 10.5222, lng: 7.4383, radiusKm: 22 },
  { name: "Enugu", lat: 6.5244, lng: 7.5186, radiusKm: 20 },
  { name: "Maiduguri", lat: 11.8333, lng: 13.15, radiusKm: 22 },
  { name: "Jos", lat: 9.8965, lng: 8.8583, radiusKm: 20 },
];

/** Haversine distance in kilometres. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Which city (if any) a coordinate currently sits inside. */
export function cityContaining(lat: number, lng: number): string | null {
  for (const c of MAJOR_CITIES) {
    if (distanceKm(lat, lng, c.lat, c.lng) <= c.radiusKm) return c.name;
  }
  return null;
}
