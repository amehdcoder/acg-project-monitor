export function eyeGps(raw: unknown) {
  if (raw == null) return null;
  if (typeof raw !== "object") throw new Error("invalid_eye_gps");
  const p = raw as Record<string, unknown>;
  if (typeof p.lat !== "number" || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 ||
    typeof p.lng !== "number" || !Number.isFinite(p.lng) || Math.abs(p.lng) > 180 ||
    typeof p.accuracy !== "number" || !Number.isFinite(p.accuracy) || p.accuracy < 0 ||
    typeof p.captured_at !== "string" || !Number.isFinite(Date.parse(p.captured_at))) throw new Error("invalid_eye_gps");
  return { lat: p.lat, lng: p.lng, accuracy: p.accuracy, captured_at: p.captured_at };
}