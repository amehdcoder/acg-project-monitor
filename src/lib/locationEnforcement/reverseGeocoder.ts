/**
 * Offline reverse geocoder.
 *
 * Strategy: GRID3 settlement registry (already shipped under /data/grid3_settlements.json)
 * holds State → LGA → Ward → [Settlement, lat, lng] for ~292K Nigerian settlements.
 * For a given coordinate, find the nearest settlement → that record gives the full
 * State / LGA / Ward / Settlement chain in one shot. No GeoJSON polygons needed
 * (which would be ~50–100MB), and works 100% offline once the JSON is cached by
 * the service worker on first install.
 */

export interface ReverseGeocodeResult {
  state: string | null;
  lga: string | null;
  ward: string | null;
  community: string | null;   // alias for ward when no settlement match nearby
  settlement: string | null;
  distanceMeters: number | null;
  source: "grid3_settlements" | "state_bbox" | "none";
}

const EARTH_R = 6371000;

const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

type SettlementsBlob = Record<
  string,
  Record<string, Record<string, [string, number | null, number | null][]>>
>;

let cache: SettlementsBlob | null = null;
let loading: Promise<SettlementsBlob | null> | null = null;

/**
 * Pre-cache the GRID3 settlements file so the service worker stores it for
 * fully-offline reverse-geocoding. Safe to call repeatedly.
 */
export async function preloadOfflineGeocoder(): Promise<void> {
  if (cache || loading) {
    await loading;
    return;
  }
  loading = fetch("/data/grid3_settlements.json")
    .then((r) => r.json())
    .then((d) => {
      cache = d as SettlementsBlob;
      return cache;
    })
    .catch((e) => {
      console.warn("[reverseGeocoder] preload failed:", e);
      cache = {};
      return cache;
    });
  await loading;
}

/**
 * Resolve nearest settlement → returns full admin chain.
 * Searches a coarse pre-filter window first (±0.5°) to avoid scanning all 292K
 * settlements every call. Falls back to bbox state lookup if no settlement
 * within ~25km (rural / undocumented area).
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult> {
  if (!isFinite(lat) || !isFinite(lng)) {
    return { state: null, lga: null, ward: null, community: null, settlement: null, distanceMeters: null, source: "none" };
  }

  await preloadOfflineGeocoder();
  const data = cache;

  let bestDist = Infinity;
  let best: { state: string; lga: string; ward: string; settlement: string } | null = null;

  if (data) {
    // Coarse pre-filter: 0.5° latitude ≈ 55km, 0.5° longitude ≈ 55km at equator.
    // We'll scan settlements within a generous box and pick nearest.
    const LAT_W = 0.5;
    const LNG_W = 0.5;

    for (const stateName of Object.keys(data)) {
      const lgas = data[stateName];
      for (const lgaName of Object.keys(lgas)) {
        const wards = lgas[lgaName];
        for (const wardName of Object.keys(wards)) {
          const settlements = wards[wardName] || [];
          for (const entry of settlements) {
            const [sName, sLat, sLng] = entry;
            if (sLat == null || sLng == null) continue;
            if (Math.abs(sLat - lat) > LAT_W || Math.abs(sLng - lng) > LNG_W) continue;
            const d = haversine(lat, lng, sLat, sLng);
            if (d < bestDist) {
              bestDist = d;
              best = { state: stateName, lga: lgaName, ward: wardName, settlement: sName };
            }
          }
        }
      }
    }
  }

  if (best && bestDist <= 25000) {
    return {
      state: best.state,
      lga: best.lga,
      ward: best.ward,
      community: best.ward,
      settlement: best.settlement,
      distanceMeters: Math.round(bestDist),
      source: "grid3_settlements",
    };
  }

  // Fallback: bbox state-only resolution (already implemented in locationUtils)
  const { getStateFromGPS } = await import("@/lib/locationUtils");
  const st = getStateFromGPS(lat, lng);
  if (st) {
    return {
      state: st,
      lga: null,
      ward: null,
      community: null,
      settlement: null,
      distanceMeters: null,
      source: "state_bbox",
    };
  }

  return { state: null, lga: null, ward: null, community: null, settlement: null, distanceMeters: null, source: "none" };
}

/** Format a short "Ward, LGA" label for the persistent header. */
export function formatHeaderLabel(r: ReverseGeocodeResult | null): string {
  if (!r) return "Locating…";
  const parts = [r.ward, r.lga].filter(Boolean);
  if (parts.length) return parts.join(", ");
  if (r.state) return r.state;
  return "Outside coverage area";
}
