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
  /** Coordinates of the feature the provider matched (used for distance evidence). */
  lat?: number | string | null;
  lon?: number | string | null;
}

export type VerifyStatus = "verified" | "nearby" | "mismatch" | "outside" | "unknown";

/** One explainable component of the confidence verdict. */
export interface ConfidenceFactor {
  key: "name" | "distance" | "evidence" | "admin";
  label: string;
  /** 0-100 contribution strength. */
  value: number;
  /** Relative weight in the blended confidence score. */
  weight: number;
  /** Short verdict word shown next to the bar. */
  verdict: string;
  /** Plain-language explanation of what was measured. */
  detail: string;
  color: string;
}

export interface VerifyResult {
  status: VerifyStatus;
  score: number;              // 0-100 similarity of the best candidate
  matchedName: string;        // the place name the provider reports
  displayName: string;        // full reverse-geocoded address line
  candidates: string[];       // all locality-ish names at that point
  lgaOk: boolean | null;
  stateOk: boolean | null;
  reason: string;             // human sentence for the UI
  /** Distance in metres between the captured GPS fix and the matched feature. */
  distanceM: number | null;
  /** Weighted 0-100 confidence blended from every factor below. */
  confidence: number;
  factors: ConfidenceFactor[];
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

/** Great-circle distance in metres. */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Distance thresholds (metres) used to grade how tight the basemap match is. */
export const DISTANCE_THRESHOLDS = { exact: 150, close: 500, loose: 2000 };

const band = (v: number) => (v >= 80 ? "#16a34a" : v >= 55 ? "#2563eb" : v >= 30 ? "#f59e0b" : "#dc2626");

function buildFactors(args: {
  nameScore: number;            // 0..1
  wardScore: number;            // 0..1
  bestName: string;
  community: string;
  distanceM: number | null;
  candidates: string[];
  displayName: string;
  lgaOk: boolean | null;
  stateOk: boolean | null;
  lgaRef: string;
  stateRef: string;
}): { factors: ConfidenceFactor[]; confidence: number } {
  const {
    nameScore, wardScore, bestName, community, distanceM, candidates,
    displayName, lgaOk, stateOk, lgaRef, stateRef,
  } = args;

  /* 1 — Name similarity */
  const nameValue = Math.round(Math.max(nameScore, wardScore * 0.85) * 100);
  const nameFactor: ConfidenceFactor = {
    key: "name",
    label: "Name match score",
    value: nameValue,
    weight: 0.45,
    verdict: nameValue >= 80 ? "Same name" : nameValue >= 55 ? "Spelling variant" : nameValue >= 30 ? "Weak overlap" : "Different name",
    detail: bestName
      ? `Kobo recorded “${community}”; the closest basemap feature is “${bestName}” (${nameValue}% character similarity after stripping words like village/community).`
      : `The basemap publishes no named settlement here to compare with “${community}”.`,
    color: band(nameValue),
  };

  /* 2 — Distance threshold */
  let distValue = 45;
  let distVerdict = "Not measurable";
  let distDetail = "The provider returned no coordinate for the matched feature, so proximity could not be measured.";
  if (distanceM !== null) {
    if (distanceM <= DISTANCE_THRESHOLDS.exact) {
      distValue = 100; distVerdict = "On the feature";
      distDetail = `The GPS fix sits ${distanceM} m from the matched feature — inside the ${DISTANCE_THRESHOLDS.exact} m "same place" threshold.`;
    } else if (distanceM <= DISTANCE_THRESHOLDS.close) {
      distValue = 75; distVerdict = "Within settlement";
      distDetail = `${distanceM} m away — beyond ${DISTANCE_THRESHOLDS.exact} m but still inside the ${DISTANCE_THRESHOLDS.close} m settlement radius.`;
    } else if (distanceM <= DISTANCE_THRESHOLDS.loose) {
      distValue = 45; distVerdict = "Edge of area";
      distDetail = `${(distanceM / 1000).toFixed(2)} km from the named feature — the point may be on the outskirts or in an adjacent hamlet.`;
    } else {
      distValue = 12; distVerdict = "Far away";
      distDetail = `${(distanceM / 1000).toFixed(1)} km from the nearest named feature — well outside the ${DISTANCE_THRESHOLDS.loose} m tolerance.`;
    }
  }
  const distFactor: ConfidenceFactor = {
    key: "distance", label: "Distance threshold", value: distValue, weight: 0.2,
    verdict: distVerdict, detail: distDetail, color: band(distValue),
  };

  /* 3 — Reverse-geocode evidence quality */
  const evValue = Math.min(100, (candidates.length ? 40 : 0) + Math.min(30, candidates.length * 10) + (displayName ? 30 : 0));
  const evFactor: ConfidenceFactor = {
    key: "evidence", label: "Reverse-geocode evidence", value: evValue, weight: 0.15,
    verdict: evValue >= 80 ? "Rich" : evValue >= 50 ? "Partial" : "Sparse",
    detail: candidates.length
      ? `${candidates.length} named feature${candidates.length === 1 ? "" : "s"} returned at this coordinate (${candidates.slice(0, 4).join(", ")}${candidates.length > 4 ? "…" : ""}). Full address line: ${displayName || "not published"}.`
      : "The provider returned an address line but no named locality or road, so there is little to compare against.",
    color: band(evValue),
  };

  /* 4 — Administrative agreement */
  const adminChecks = [stateOk, lgaOk].filter((v) => v !== null) as boolean[];
  const adminValue = adminChecks.length
    ? Math.round((adminChecks.filter(Boolean).length / adminChecks.length) * 100)
    : 50;
  const adminFactor: ConfidenceFactor = {
    key: "admin", label: "Administrative agreement", value: adminValue, weight: 0.2,
    verdict: adminChecks.length === 0 ? "Unverifiable" : adminValue === 100 ? "LGA & State agree" : adminValue === 0 ? "Both differ" : "Partial",
    detail: adminChecks.length
      ? `Basemap places this point in ${stateRef || "an unnamed state"}${lgaRef ? ` / ${lgaRef}` : ""}. ` +
        `${stateOk === false ? "The State does not match the record. " : stateOk ? "State matches. " : ""}` +
        `${lgaOk === false ? "The LGA does not match the record." : lgaOk ? "LGA matches." : ""}`.trim()
      : "The provider published no State or LGA for this coordinate, so administrative agreement could not be checked.",
    color: band(adminValue),
  };

  const factors = [nameFactor, distFactor, evFactor, adminFactor];
  const confidence = Math.round(factors.reduce((sum, f) => sum + f.value * f.weight, 0));
  return { factors, confidence };
}

/** Compare a captured Kobo place against the reverse-geocoded reality. */
export function verifyPlace(
  captured: CapturedPlace,
  geo: GeoName | null,
  at?: { lat: number; lng: number },
): VerifyResult {
  if (!geo || (!geo.display_name && !geo.address)) {
    const { factors, confidence } = buildFactors({
      nameScore: 0, wardScore: 0, bestName: "", community: captured.community,
      distanceM: null, candidates: [], displayName: "", lgaOk: null, stateOk: null, lgaRef: "", stateRef: "",
    });
    return {
      status: "unknown", score: 0, matchedName: "", displayName: "",
      candidates: [], lgaOk: null, stateOk: null,
      reason: "No basemap reference data is published for this location.",
      distanceM: null, confidence, factors,
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

  const fLat = Number(geo.lat), fLng = Number(geo.lon);
  const distanceM = at && Number.isFinite(fLat) && Number.isFinite(fLng)
    ? haversineM(at.lat, at.lng, fLat, fLng)
    : null;

  const { factors, confidence } = buildFactors({
    nameScore: bestScore, wardScore, bestName: best, community: captured.community,
    distanceM, candidates: cands, displayName: geo.display_name || "",
    lgaOk, stateOk, lgaRef, stateRef,
  });

  const score = Math.round(bestScore * 100);
  const common = {
    score, candidates: cands, lgaOk, stateOk, distanceM, confidence, factors,
    displayName: geo.display_name || "",
  };

  if (stateOk === false) {
    return {
      ...common, status: "outside", matchedName: best,
      reason: `GPS falls in ${stateRef || "another state"}, but the record was filed under ${captured.state}.`,
    };
  }
  if (bestScore >= 0.8) {
    return {
      ...common, status: "verified", matchedName: best,
      reason: `Basemap names this place “${best}” — matches the captured community.`,
    };
  }
  if (bestScore >= 0.55 || wardScore >= 0.75) {
    return {
      ...common, status: "nearby", matchedName: best || (captured.ward ?? ""),
      reason: `Close but not exact — basemap says “${best || "—"}”. Likely a spelling variant or an adjacent settlement.`,
    };
  }
  if (lgaOk === false) {
    return {
      ...common, status: "outside", matchedName: best,
      reason: `GPS sits in ${lgaRef || "a different LGA"}, not ${captured.lga}.`,
    };
  }
  return {
    ...common, status: "mismatch", matchedName: best,
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

/**
 * GRID3 fallback.
 *
 * OSM has almost no named settlements across rural Nigeria, which produced the
 * bulk of "No reference" verdicts. When the provider returns nothing (or a
 * result with no named locality), we resolve the nearest GRID3 settlement —
 * the same registry the microplanning forms cascade from — and synthesise a
 * GeoName from it so every point gets an authoritative name to verify against.
 */
async function grid3Fallback(lat: number, lng: number, base: GeoName | null): Promise<GeoName | null> {
  try {
    const { nearestGrid3Settlement } = await import("@/lib/isc/grid3Nearest");
    const hit = await nearestGrid3Settlement(lat, lng, 25000);
    if (!hit) return base;
    const addr = { ...(base?.address ?? {}) } as Record<string, string>;
    if (!addr.village && !addr.hamlet && !addr.town && !addr.city && !addr.suburb) {
      addr.village = hit.settlement;
    }
    addr.grid3_settlement = hit.settlement;
    addr.grid3_ward = hit.ward;
    if (!addr.county && !addr.state_district) addr.county = hit.lga;
    if (!addr.state) addr.state = `${hit.state} State`.replace(/ State State$/, " State");
    return {
      display_name:
        base?.display_name ||
        `${hit.settlement}, ${hit.ward} Ward, ${hit.lga}, ${hit.state} State (GRID3 settlement registry)`,
      address: addr,
      // Prefer the GRID3 feature coordinate when the provider gave none.
      lat: base?.lat ?? hit.lat,
      lon: base?.lon ?? hit.lng,
    };
  } catch {
    return base;
  }
}

const hasNamedLocality = (g: GeoName | null) => {
  if (!g) return false;
  const a = g.address ?? {};
  return LOCALITY_KEYS.some((k) => !!a[k]);
};

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
    let value: GeoName | null = null;
    try {
      geoCacheStats.network++;
      const { data, error } = await supabase.functions.invoke("geo-tools", {
        body: { action: "reverse", lat, lng },
      });
      if (error) throw error;
      const found = (data as { found?: boolean }) ?? {};
      value = found.found ? (data as GeoName) : null;
    } catch {
      value = null;
    }
    try {
      // Always enrich with GRID3 when the provider has no named settlement.
      if (!hasNamedLocality(value)) value = await grid3Fallback(lat, lng, value);
    } catch { /* keep provider value */ }

    try {
      memCache.set(k, {
        v: value,
        // Cache negatives only briefly (1h) so a provider blip isn't sticky.
        t: value ? Date.now() : Date.now() - (TTL_MS - 60 * 60 * 1000),
      });
      scheduleFlush();
    } finally {
      inFlight.delete(k);
    }
    return value;
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

/** A synthetic factor appended when an administrator has ruled on the point. */
function adminFactor(ovr: GpsOverride): ConfidenceFactor {
  const value = ovr.decision === "rejected" ? 0 : ovr.decision === "corrected" ? 90 : 100;
  return {
    key: "admin",
    label: "Administrator ruling",
    value,
    weight: 0,
    verdict: OVERRIDE_META[ovr.decision].label,
    detail:
      (ovr.decision === "corrected"
        ? `An administrator corrected the settlement name to “${ovr.corrected_name || "—"}” after inspecting the imagery. `
        : ovr.decision === "rejected"
          ? "An administrator inspected the imagery and rejected this GPS point. "
          : "An administrator inspected the imagery and confirmed this GPS point. ") +
      (ovr.note ? `Note: ${ovr.note}` : "No reviewer note was left."),
    color: OVERRIDE_META[ovr.decision].color,
  };
}

/** Apply an admin decision on top of the computed verdict. */
export function applyOverride(base: VerifyResult, ovr?: GpsOverride | null): VerifyResult {
  if (!ovr) return base;
  const factors = [...base.factors.filter((f) => f.key !== "admin" || f.label !== "Administrator ruling"), adminFactor(ovr)];
  if (ovr.decision === "rejected") {
    return {
      ...base, status: "mismatch", factors, confidence: 0,
      reason: `Admin rejected this point. ${ovr.note || ""}`.trim(),
    };
  }
  return {
    ...base,
    status: "verified",
    score: Math.max(base.score, ovr.decision === "corrected" ? 90 : 100),
    confidence: ovr.decision === "corrected" ? Math.max(base.confidence, 90) : 100,
    factors,
    matchedName: ovr.corrected_name || base.matchedName,
    reason:
      ovr.decision === "corrected"
        ? `Admin corrected the place name to “${ovr.corrected_name || base.matchedName}”. ${ovr.note || ""}`.trim()
        : `Admin manually verified this GPS point. ${ovr.note || ""}`.trim(),
  };
}


