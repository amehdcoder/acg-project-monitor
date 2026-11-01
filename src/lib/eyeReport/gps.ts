export interface EyeGps { lat: number; lng: number; accuracy: number; captured_at: string }

export function normEyeGps(raw: unknown): EyeGps | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.lat !== "number" || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 ||
    typeof p.lng !== "number" || !Number.isFinite(p.lng) || Math.abs(p.lng) > 180 ||
    typeof p.accuracy !== "number" || !Number.isFinite(p.accuracy) || p.accuracy < 0 ||
    typeof p.captured_at !== "string" || !Number.isFinite(Date.parse(p.captured_at))) return null;
  return { lat: p.lat, lng: p.lng, accuracy: p.accuracy, captured_at: p.captured_at };
}

export function gpsFromPosition(position: GeolocationPosition): EyeGps | null {
  return normEyeGps({ lat: position.coords.latitude, lng: position.coords.longitude,
    accuracy: position.coords.accuracy, captured_at: new Date(position.timestamp).toISOString() });
}