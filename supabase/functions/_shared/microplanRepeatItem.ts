// Pure parser helpers for a single community_repeat item coming from the
// Kobo webhook. Extracted so the same logic can be exercised from vitest
// (Node) without pulling in the Deno-only edge-function runtime.

export type AnyRec = Record<string, unknown>;

export function getFlat(obj: AnyRec, key: string): unknown {
  if (key in obj) return obj[key];
  const lowered = key.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (kl === lowered || kl.endsWith(`/${lowered}`)) return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const found = getFlat(v as AnyRec, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function pickFirst(obj: AnyRec, keys: string[]): string | null {
  for (const k of keys) {
    const v = getFlat(obj, k);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

export function pickNumber(obj: AnyRec, keys: string[]): number | null {
  const v = pickFirst(obj, keys);
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Explicit contract with the public.microplan_entries columns — keep these
// names in sync with the table (do NOT rename).
export interface RepeatDisaggregations {
  trachoma_0_5_months: number | null;
  trachoma_6m_6y: number | null;
  trachoma_7_14y: number | null;
  trachoma_15_plus: number | null;
  pwd_total: number | null;
  pwd_visual: number | null;
  pwd_hearing: number | null;
  pwd_physical: number | null;
  pwd_intellectual: number | null;
  pwd_communication: number | null;
  pwd_selfcare: number | null;
  pwd_albinism: number | null;
  cdd_names: string | null;
  cdd_phone_numbers: string | null;
  cdd_from_community: string | null;
}

// The shape a single community_repeat item is mapped into before upsert.
export interface MicroplanRepeatRow extends RepeatDisaggregations {
  idempotency_key: string;
  project_id: string | null;
  flhf_name: string | null;
  community_name: string | null;
  settlement_name: string | null;
  settlement_mai_unguwa: string | null;
  estimated_children_0_4: number | null;
  notes: string | null;
  community_latitude: number | null;
  community_longitude: number | null;
  geotagged: boolean;
}

// Extract the PWD / CDD / Trachoma sub-fields now nested inside
// community_repeat so the webhook can pass them through to microplan_entries.
export function extractRepeatDisaggregations(item: AnyRec): RepeatDisaggregations {
  return {
    // Trachoma
    trachoma_0_5_months: pickNumber(item, ["trachoma_0_5_months", "trachoma_grp/trachoma_0_5_months"]),
    trachoma_6m_6y: pickNumber(item, ["trachoma_6m_6y", "trachoma_grp/trachoma_6m_6y"]),
    trachoma_7_14y: pickNumber(item, ["trachoma_7_14y", "trachoma_grp/trachoma_7_14y"]),
    trachoma_15_plus: pickNumber(item, ["trachoma_15_plus", "trachoma_grp/trachoma_15_plus"]),
    // PWD disaggregation
    pwd_total: pickNumber(item, ["pwd_total", "pwd_grp/pwd_total"]),
    pwd_visual: pickNumber(item, ["pwd_visual", "visual", "pwd_grp/pwd_visual"]),
    pwd_hearing: pickNumber(item, ["pwd_hearing", "hearing", "pwd_grp/pwd_hearing"]),
    pwd_physical: pickNumber(item, ["pwd_physical", "physical", "pwd_grp/pwd_physical"]),
    pwd_intellectual: pickNumber(item, ["pwd_intellectual", "intellectual", "pwd_grp/pwd_intellectual"]),
    pwd_communication: pickNumber(item, ["pwd_communication", "communication", "pwd_grp/pwd_communication"]),
    pwd_selfcare: pickNumber(item, ["pwd_selfcare", "self_care", "pwd_grp/pwd_selfcare"]),
    pwd_albinism: pickNumber(item, ["pwd_albinism", "albinism", "pwd_grp/pwd_albinism"]),
    // CDDs
    cdd_names: pickFirst(item, ["cdd_names", "cdd_grp/cdd_names"]),
    cdd_phone_numbers: pickFirst(item, ["cdd_phone_numbers", "cdd_phones", "cdd_grp/cdd_phone_numbers"]),
    cdd_from_community: pickFirst(item, ["cdd_from_community", "cdd_grp/cdd_from_community"]),
  };
}

// ── DUAL GPS RESOLUTION ────────────────────────────────────────────────
// Strict precedence:
//   1. Native Kobo `geopoint` string ("lat lng alt acc") — including the
//      `_geolocation` array Kobo attaches to the submission root.
//   2. Manually typed decimal latitude/longitude fields.
// A coordinate pair is only accepted when both values are finite, inside
// valid WGS84 ranges, and not the (0,0) null-island sentinel.

export interface ResolvedCoords {
  lat: number | null;
  lng: number | null;
  source: "geopoint" | "manual" | "none";
  geotagged: boolean;
}

const validPair = (lat: number | null, lng: number | null): boolean =>
  lat != null && lng != null &&
  Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

export function parseGeopoint(value: unknown): { lat: number | null; lng: number | null } {
  if (Array.isArray(value) && value.length >= 2) {
    const lat = Number(value[0]), lng = Number(value[1]);
    return validPair(lat, lng) ? { lat, lng } : { lat: null, lng: null };
  }
  if (typeof value === "string" && value.trim()) {
    const parts = value.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    if (parts.length >= 2 && validPair(parts[0], parts[1])) return { lat: parts[0], lng: parts[1] };
  }
  return { lat: null, lng: null };
}

/**
 * Resolve final coordinates for a record from native geopoint fields first,
 * then manually typed lat/long fields.
 */
export function resolveCoordinates(
  obj: AnyRec,
  opts: { geopointKeys?: string[]; latKeys?: string[]; lngKeys?: string[] } = {},
): ResolvedCoords {
  const geopointKeys = opts.geopointKeys ?? [
    "community_gps", "gps_location", "gps_capture", "gps", "geopoint", "_geopoint", "location",
  ];
  const latKeys = opts.latKeys ?? [
    "manual_latitude", "community_manual_latitude", "latitude", "community_latitude", "lat", "gps_latitude",
  ];
  const lngKeys = opts.lngKeys ?? [
    "manual_longitude", "community_manual_longitude", "longitude", "community_longitude", "lng", "lon", "gps_longitude",
  ];

  // 1 — native geopoint (array form first, then string forms)
  const geoArray = parseGeopoint(getFlat(obj, "_geolocation"));
  if (validPair(geoArray.lat, geoArray.lng)) {
    return { ...geoArray, source: "geopoint", geotagged: true };
  }
  for (const key of geopointKeys) {
    const parsed = parseGeopoint(getFlat(obj, key));
    if (validPair(parsed.lat, parsed.lng)) {
      return { ...parsed, source: "geopoint", geotagged: true };
    }
  }

  // 2 — manual decimal fallback
  const lat = pickNumber(obj, latKeys);
  const lng = pickNumber(obj, lngKeys);
  if (validPair(lat, lng)) return { lat, lng, source: "manual", geotagged: true };

  return { lat: null, lng: null, source: "none", geotagged: false };
}
