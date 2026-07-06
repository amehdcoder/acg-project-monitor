// Lightweight, dependency-free performance metrics for production diagnostics.
//
// Records timing samples (login duration, Forms API calls, offline sync, etc.)
// into a rolling in-memory buffer, logs each one to the console with a stable
// `[metric]` prefix so it is greppable in remote logs, and exposes the buffer
// on `window.__amehnitiesMetrics` so field devices can be inspected live.
//
// This is intentionally frontend-only and side-effect-light: it never blocks
// the operation it measures and never throws into the caller.

export interface MetricSample {
  name: string;
  durationMs: number;
  ok: boolean;
  at: string; // ISO timestamp
  detail?: Record<string, unknown>;
}

const MAX_SAMPLES = 200;
const buffer: MetricSample[] = [];

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

/** Record a completed timing sample. */
export function recordMetric(
  name: string,
  durationMs: number,
  ok = true,
  detail?: Record<string, unknown>,
): MetricSample {
  const sample: MetricSample = {
    name,
    durationMs: Math.round(durationMs),
    ok,
    at: new Date().toISOString(),
    detail,
  };
  buffer.push(sample);
  if (buffer.length > MAX_SAMPLES) buffer.splice(0, buffer.length - MAX_SAMPLES);

  const status = ok ? "ok" : "FAIL";
  // eslint-disable-next-line no-console
  console.info(
    `[metric] ${name} ${sample.durationMs}ms ${status}`,
    detail ? detail : "",
  );

  if (typeof window !== "undefined") {
    (window as any).__amehnitiesMetrics = buffer;
  }
  return sample;
}

/**
 * Time an async operation, recording its duration and success/failure.
 * Re-throws the original error so callers keep their existing control flow.
 */
export async function timeAsync<T>(
  name: string,
  fn: () => Promise<T>,
  detail?: Record<string, unknown>,
): Promise<T> {
  const start = nowMs();
  try {
    const result = await fn();
    recordMetric(name, nowMs() - start, true, detail);
    return result;
  } catch (err: any) {
    recordMetric(name, nowMs() - start, false, {
      ...detail,
      error: err?.message || String(err),
    });
    throw err;
  }
}

/** Start a manual timer; call the returned function to record the sample. */
export function startTimer(name: string): (ok?: boolean, detail?: Record<string, unknown>) => number {
  const start = nowMs();
  return (ok = true, detail?: Record<string, unknown>) => {
    const durationMs = nowMs() - start;
    recordMetric(name, durationMs, ok, detail);
    return durationMs;
  };
}

/** Snapshot of recorded metrics (most recent last). */
export function getMetrics(): MetricSample[] {
  return [...buffer];
}

/** Aggregate stats for a metric name — handy for spotting slowdowns. */
export function summarizeMetric(name: string): {
  count: number;
  avgMs: number;
  maxMs: number;
  p95Ms: number;
  failures: number;
} {
  const samples = buffer.filter((s) => s.name === name);
  if (samples.length === 0) return { count: 0, avgMs: 0, maxMs: 0, p95Ms: 0, failures: 0 };
  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);
  const p95Index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
  return {
    count: samples.length,
    avgMs: Math.round(sum / samples.length),
    maxMs: durations[durations.length - 1],
    p95Ms: durations[p95Index],
    failures: samples.filter((s) => !s.ok).length,
  };
}
