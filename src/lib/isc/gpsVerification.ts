/**
 * GPS ⇄ place-name verification for the Integrated MDA Supervisory Checklist.
 *
 * Every community visit captured on KoboToolbox carries a GPS fix and a typed
 * community / ward / LGA / State name. This module reverse-geocodes the GPS
 * fix and compares what the mapping provider says is physically at that point
 * against what the monitor typed, so supervisors can tell at a glance whether
 * a point was really taken in the community it claims.
 */
import { supabase } from "@/integrations/supabase/client";

export interface GeoName {
  display_name?: string | null;
  address?: Record<string, string> | null;
}

export type VerifyStatus = "verified" | "nearby" | "mismatch" | "outside" | "unknown";

export interface VerifyResult {
  status: VerifyStatus;
  score: number;              // 0-100 similarity of the best candidate
  matchedName: string;        // the place name the provider reports
  displayName: string;        // full reverse-geocoded address line
  candidates: string[];       // all locality-ish names at that point
  lgaOk: boolean | null;
  stateOk: boolean | null;
  reason: string;             // human sentence for the UI
}

const norm = (v: string) =>
  (v || "")
    .toLowerCase()
    .replace(/\b(village|community|town|ward|settlement|hamlet|quarters?|area)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Normalised Levenshtein similarity, 0..1. */
export function similarity(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const m = x.length, n = y.length;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

const LOCALITY_KEYS = [
  "village", "hamlet", "isolated_dwelling", "suburb", "neighbourhood", "quarter",
  "town", "city", "municipality", "locality", "residential", "city_district",
];
const ROAD_KEYS = ["road", "pedestrian", "footway", "residential"];

/** Extract every locality/street candidate name from a reverse-geocode result. */
export function candidateNames(geo: GeoName): string[] {
  const a = geo.address ?? {};
  const out: string[] = [];
  for (const k of [...LOCALITY_KEYS, ...ROAD_KEYS]) if (a[k]) out.push(String(a[k]));
  const head = (geo.display_name || "").split(",")[0]?.trim();
  if (head) out.push(head);
  return Array.from(new Set(out.filter(Boolean)));
}

export interface CapturedPlace {
  community: string;
  ward?: string;
  lga?: string;
  state?: string;
}

/** Compare a captured Kobo place against the reverse-geocoded reality. */
export function verifyPlace(captured: CapturedPlace, geo: GeoName | null): VerifyResult {
  if (!geo || (!geo.display_name && !geo.address)) {
    return {
      status: "unknown", score: 0, matchedName: "", displayName: "",
      candidates: [], lgaOk: null, stateOk: null,
      reason: "No basemap reference data is published for this location.",
    };
  }
  const a = geo.address ?? {};
  const cands = candidateNames(geo);
  let best = "", bestScore = 0;
  for (const c of cands) {
    const sc = similarity(captured.community, c);
    if (sc > bestScore) { bestScore = sc; best = c; }
  }
  // Ward names sometimes label the settlement on the basemap — accept as nearby.
  let wardScore = 0;
  if (captured.ward) for (const c of cands) wardScore = Math.max(wardScore, similarity(captured.ward, c));

  const lgaRef = a.county || a.state_district || a.municipality || "";
  const stateRef = a.state || "";
  const lgaOk = captured.lga && lgaRef ? similarity(captured.lga, lgaRef) >= 0.72 : null;
  const stateOk = captured.state && stateRef ? similarity(captured.state, stateRef) >= 0.72 : null;

  const score = Math.round(bestScore * 100);

  if (stateOk === false) {
    return {
      status: "outside", score, matchedName: best, displayName: geo.display_name || "",
      candidates: cands, lgaOk, stateOk,
      reason: `GPS falls in ${stateRef || "another state"}, but the record was filed under ${captured.state}.`,
    };
  }
  if (bestScore >= 0.8) {
    return {
      status: "verified", score, matchedName: best, displayName: geo.display_name || "",
      candidates: cands, lgaOk, stateOk,
      reason: `Basemap names this place “${best}” — matches the captured community.`,
    };
  }
  if (bestScore >= 0.55 || wardScore >= 0.75) {
    return {
      status: "nearby", score, matchedName: best || (captured.ward ?? ""), displayName: geo.display_name || "",
      candidates: cands, lgaOk, stateOk,
      reason: `Close but not exact — basemap says “${best || "—"}”. Likely a spelling variant or an adjacent settlement.`,
    };
  }
  if (lgaOk === false) {
    return {
      status: "outside", score, matchedName: best, displayName: geo.display_name || "",
      candidates: cands, lgaOk, stateOk,
      reason: `GPS sits in ${lgaRef || "a different LGA"}, not ${captured.lga}.`,
    };
  }
  return {
    status: "mismatch", score, matchedName: best, displayName: geo.display_name || "",
    candidates: cands, lgaOk, stateOk,
    reason: `Basemap reports “${best || geo.display_name?.split(",")[0] || "unnamed place"}” here, which does not match “${captured.community}”.`,
  };
}

export const STATUS_META: Record<VerifyStatus, { label: string; color: string; hint: string }> = {
  verified: { label: "Name confirmed", color: "#16a34a", hint: "GPS point matches the captured community name" },
  nearby:   { label: "Near match", color: "#2563eb", hint: "Spelling variant or adjacent settlement" },
  mismatch: { label: "Name mismatch", color: "#f59e0b", hint: "Different place name at this coordinate" },
  outside:  { label: "Wrong LGA / State", color: "#dc2626", hint: "GPS falls outside the reported administrative area" },
  unknown:  { label: "No reference", color: "#64748b", hint: "Basemap has no named feature here" },
};

/* ------------------------------------------------------- reverse geocoding */

const memCache = new Map<string, GeoName | null>();
const LS_KEY = "isc.revgeo.v1";

function lsRead(): Record<string, GeoName | null> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function lsWrite(map: Record<string, GeoName | null>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch { /* quota */ }
}

const keyOf = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

/** Reverse geocode a single point (cached in memory + localStorage). */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoName | null> {
  const k = keyOf(lat, lng);
  if (memCache.has(k)) return memCache.get(k)!;
  const disk = lsRead();
  if (k in disk) { memCache.set(k, disk[k]); return disk[k]; }
  try {
    const { data, error } = await supabase.functions.invoke("geo-tools", {
      body: { action: "reverse", lat, lng },
    });
    if (error) throw error;
    const found = (data as { found?: boolean }) ?? {};
    const value: GeoName | null = found.found ? (data as GeoName) : null;
    memCache.set(k, value);
    disk[k] = value;
    lsWrite(disk);
    return value;
  } catch {
    memCache.set(k, null);
    return null;
  }
}

/** Reverse geocode many points with bounded concurrency (provider-friendly). */
export async function reverseGeocodeBatch(
  points: { lat: number; lng: number }[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 3,
): Promise<Map<string, GeoName | null>> {
  const out = new Map<string, GeoName | null>();
  let i = 0, done = 0;
  const total = points.length;
  const workers = Array.from({ length: Math.min(concurrency, total || 1) }, async () => {
    while (i < total) {
      const p = points[i++];
      const res = await reverseGeocode(p.lat, p.lng);
      out.set(keyOf(p.lat, p.lng), res);
      onProgress?.(++done, total);
    }
  });
  await Promise.all(workers);
  return out;
}

export const geoKey = keyOf;
