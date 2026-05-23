/**
 * Speech telemetry — Batch 11.
 *
 * Per-utterance ring buffer used by the Diagnostics panel to surface real
 * field performance instead of guessing. Local-only (no network beacons),
 * persisted to localStorage so reloads don't lose the last session.
 *
 * Caller contract: every STT call (cloud / whisper / web speech) should
 * call `recordUtterance(...)` exactly once with whichever fields it knows.
 */

export type SttTier = "scribe_cloud" | "whisper_local" | "web_speech";

export interface UtteranceTelemetry {
  ts: number;
  tier: SttTier;
  lang?: string;
  /** Round-trip from mic-stop → final text, milliseconds. */
  latencyMs: number;
  /** Provider-reported or heuristic 0–1 confidence. */
  conf?: number;
  /** Recording duration in ms. */
  durationMs?: number;
  /** RMS energy 0–1 (loudness proxy). */
  rms?: number;
  /** Question id, when known — never the answer text (PII). */
  qId?: string;
  /** Set when this attempt failed and the engine fell back. */
  fallbackReason?: string;
  /** True if connection was offline/flaky when the attempt started. */
  offline?: boolean;
}

const KEY = "speech_telemetry_v1";
const MAX = 200; // ring buffer cap

function load(): UtteranceTelemetry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-MAX) : [];
  } catch {
    return [];
  }
}

let buffer: UtteranceTelemetry[] = typeof localStorage !== "undefined" ? load() : [];

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(buffer.slice(-MAX)));
  } catch {
    // quota — drop oldest half and retry once
    buffer = buffer.slice(-Math.floor(MAX / 2));
    try { localStorage.setItem(KEY, JSON.stringify(buffer)); } catch { /* give up */ }
  }
}

export function recordUtterance(t: Omit<UtteranceTelemetry, "ts"> & { ts?: number }) {
  const entry: UtteranceTelemetry = { ts: Date.now(), ...t };
  buffer.push(entry);
  if (buffer.length > MAX) buffer = buffer.slice(-MAX);
  persist();
}

export function getRecentTelemetry(limit = 50): UtteranceTelemetry[] {
  return buffer.slice(-limit).reverse();
}

export function clearTelemetry() {
  buffer = [];
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

export interface TelemetryStats {
  total: number;
  byTier: Record<SttTier, { count: number; avgLatencyMs: number; avgConf: number; failRate: number }>;
  fallbackRate: number;
}

export function getTelemetryStats(): TelemetryStats {
  const tiers: SttTier[] = ["scribe_cloud", "whisper_local", "web_speech"];
  const byTier = Object.fromEntries(
    tiers.map((t) => [t, { count: 0, avgLatencyMs: 0, avgConf: 0, failRate: 0 }]),
  ) as TelemetryStats["byTier"];
  let fallbacks = 0;
  for (const e of buffer) {
    const b = byTier[e.tier];
    if (!b) continue;
    b.count++;
    b.avgLatencyMs += e.latencyMs || 0;
    b.avgConf += e.conf || 0;
    if (e.fallbackReason) { b.failRate++; fallbacks++; }
  }
  for (const t of tiers) {
    const b = byTier[t];
    if (b.count > 0) {
      b.avgLatencyMs = Math.round(b.avgLatencyMs / b.count);
      b.avgConf = +(b.avgConf / b.count).toFixed(2);
      b.failRate = +(b.failRate / b.count).toFixed(2);
    }
  }
  return {
    total: buffer.length,
    byTier,
    fallbackRate: buffer.length ? +(fallbacks / buffer.length).toFixed(2) : 0,
  };
}
