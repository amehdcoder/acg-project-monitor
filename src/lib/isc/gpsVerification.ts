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
/**
 * Caching + rate limiting.
 *
 *  L1  in-memory Map (instant, per-session)
 *  L2  localStorage with a 30-day TTL and an LRU cap so the quota never blows
 *  L3  in-flight de-duplication — the same coordinate asked twice concurrently
 *      only ever produces ONE network call
 *
 * Every real network call passes through a token bucket (default 8 requests
 * per second, burst 8) so a dashboard with thousands of points can never
 * exceed the Google/provider rate limits.
 */

interface CacheEntry { v: GeoName | null; t: number }

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ENTRIES = 4000;
const LS_KEY = "isc.revgeo.v2";

const memCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<GeoName | null>>();

let diskLoaded = false;
let diskDirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

function loadDisk() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "{}") as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [k, e] of Object.entries(raw)) {
      if (e && typeof e.t === "number" && now - e.t < TTL_MS) memCache.set(k, e);
    }
  } catch { /* corrupted cache — start clean */ }
}

function scheduleFlush() {
  diskDirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!diskDirty) return;
    diskDirty = false;
    try {
      // LRU-ish trim: keep the most recently written entries.
      const entries = Array.from(memCache.entries()).sort((a, b) => b[1].t - a[1].t).slice(0, MAX_ENTRIES);
      if (entries.length < memCache.size) {
        memCache.clear();
        entries.forEach(([k, v]) => memCache.set(k, v));
      }
      localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* quota — cache stays in memory only */ }
  }, 1200);
}

/* ------------------------------------------------------------ token bucket */

const RATE_PER_SEC = 8;
const BURST = 8;
let tokens = BURST;
let lastRefill = Date.now();

function refill() {
  const now = Date.now();
  tokens = Math.min(BURST, tokens + ((now - lastRefill) / 1000) * RATE_PER_SEC);
  lastRefill = now;
}

async function takeToken(): Promise<void> {
  for (;;) {
    refill();
    if (tokens >= 1) { tokens -= 1; return; }
    const waitMs = Math.max(40, ((1 - tokens) / RATE_PER_SEC) * 1000);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

/** Cache/rate-limiter telemetry surfaced in the UI. */
export const geoCacheStats = { hits: 0, misses: 0, network: 0, throttled: 0 };

export function geoCacheSize(): number { loadDisk(); return memCache.size; }

export function clearGeoCache() {
  memCache.clear();
  inFlight.clear();
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
  geoCacheStats.hits = geoCacheStats.misses = geoCacheStats.network = geoCacheStats.throttled = 0;
}

/** Reverse geocode a single point (memory + localStorage cached, rate limited). */
export async function reverseGeocode(lat: number, lng: number, force = false): Promise<GeoName | null> {
  loadDisk();
  const k = keyOf(lat, lng);

  if (!force) {
    const hit = memCache.get(k);
    if (hit && Date.now() - hit.t < TTL_MS) { geoCacheStats.hits++; return hit.v; }
    const pending = inFlight.get(k);
    if (pending) { geoCacheStats.hits++; return pending; }
  }
  geoCacheStats.misses++;

  const task = (async (): Promise<GeoName | null> => {
    refill();
    if (tokens < 1) geoCacheStats.throttled++;
    await takeToken();
    try {
      geoCacheStats.network++;
      const { data, error } = await supabase.functions.invoke("geo-tools", {
        body: { action: "reverse", lat, lng },
      });
      if (error) throw error;
      const found = (data as { found?: boolean }) ?? {};
      const value: GeoName | null = found.found ? (data as GeoName) : null;
      memCache.set(k, { v: value, t: Date.now() });
      scheduleFlush();
      return value;
    } catch {
      // Cache negatives briefly (1h) so a provider blip doesn't hammer it.
      memCache.set(k, { v: null, t: Date.now() - (TTL_MS - 60 * 60 * 1000) });
      scheduleFlush();
      return null;
    } finally {
      inFlight.delete(k);
    }
  })();

  inFlight.set(k, task);
  return task;
}

/** Reverse geocode many points with bounded concurrency (provider-friendly). */
export async function reverseGeocodeBatch(
  points: { lat: number; lng: number }[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
  force = false,
): Promise<Map<string, GeoName | null>> {
  loadDisk();
  const out = new Map<string, GeoName | null>();

  // Collapse duplicate coordinates before doing any work at all.
  const unique = new Map<string, { lat: number; lng: number }>();
  points.forEach((p) => unique.set(keyOf(p.lat, p.lng), p));
  const list = Array.from(unique.values());

  let i = 0, done = 0;
  const total = list.length;
  onProgress?.(0, total);
  const workers = Array.from({ length: Math.min(concurrency, total || 1) }, async () => {
    while (i < total) {
      const p = list[i++];
      const res = await reverseGeocode(p.lat, p.lng, force);
      out.set(keyOf(p.lat, p.lng), res);
      onProgress?.(++done, total);
    }
  });
  await Promise.all(workers);
  return out;
}

export const geoKey = keyOf;

/* ------------------------------------------------- admin overrides + history */

export type OverrideDecision = "verified" | "corrected" | "rejected";

export interface GpsOverride {
  loc_key: string;
  decision: OverrideDecision;
  corrected_name?: string | null;
  note?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export const OVERRIDE_META: Record<OverrideDecision, { label: string; color: string }> = {
  verified:  { label: "Admin verified", color: "#0d9488" },
  corrected: { label: "Admin corrected", color: "#7c3aed" },
  rejected:  { label: "Admin rejected", color: "#be123c" },
};

/** Apply an admin decision on top of the computed verdict. */
export function applyOverride(base: VerifyResult, ovr?: GpsOverride | null): VerifyResult {
  if (!ovr) return base;
  if (ovr.decision === "rejected") {
    return { ...base, status: "mismatch", reason: `Admin rejected this point. ${ovr.note || ""}`.trim() };
  }
  return {
    ...base,
    status: "verified",
    score: Math.max(base.score, ovr.decision === "corrected" ? 90 : 100),
    matchedName: ovr.corrected_name || base.matchedName,
    reason:
      ovr.decision === "corrected"
        ? `Admin corrected the place name to “${ovr.corrected_name || base.matchedName}”. ${ovr.note || ""}`.trim()
        : `Admin manually verified this GPS point. ${ovr.note || ""}`.trim(),
  };
}

