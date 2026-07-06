// Throttled + cached driver for the heavy advanced-analytics engine.
//
// The engine (Random Forest with bootstrapped trees, 4k-run Monte Carlo,
// grounded-theory + discourse text mining) is CPU-intensive. Running it
// synchronously inside a render `useMemo` on every submissions change can jank
// a dashboard when data streams in live. This hook keeps the UI smooth by:
//
//   • Caching results by a cheap content signature so identical inputs never
//     recompute (instant when navigating back to a dashboard).
//   • Debouncing recompute so a burst of realtime inserts collapses into one run.
//   • Deferring the actual computation to browser idle time (requestIdleCallback)
//     so it never blocks paint/interaction.
//   • Showing the previous (stale) result while a fresh one is computing.

import { useEffect, useRef, useState } from "react";
import {
  buildAdvancedAnalytics,
  type AdvancedAnalyticsOptions,
  type AdvancedAnalyticsResult,
} from "@/lib/advancedAnalytics";
import type { NarrativeQuestion, NarrativeSubmission } from "@/lib/narrativeInsights";

const cache = new Map<string, AdvancedAnalyticsResult>();
const MAX_CACHE = 32;

/** Cheap, stable fingerprint of the inputs (avoids hashing every row). */
function signature(
  subs: NarrativeSubmission[],
  qs: NarrativeQuestion[],
  opts?: AdvancedAnalyticsOptions,
): string {
  const n = subs.length;
  const first = subs[0];
  const last = subs[n - 1];
  const hyp = (opts?.hypotheses || []).map((h) => h.name).join("~");
  return [
    n,
    first?.id ?? "",
    last?.id ?? "",
    last?.submitted_at ?? "",
    qs.length,
    hyp,
  ].join("|");
}

const idle = (cb: () => void): number => {
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  return ric ? ric(cb, { timeout: 1200 }) : (window.setTimeout(cb, 0) as unknown as number);
};

export interface UseAdvancedAnalytics {
  result: AdvancedAnalyticsResult | null;
  computing: boolean;
}

export function useAdvancedAnalytics(
  submissions: NarrativeSubmission[],
  questions: NarrativeQuestion[],
  options?: AdvancedAnalyticsOptions,
  debounceMs = 450,
): UseAdvancedAnalytics {
  const subs = submissions || [];
  const qs = questions || [];
  const sig = signature(subs, qs, options);

  // Keep the latest inputs in refs so the debounced worker reads fresh data
  // without re-arming the timer on every render.
  const dataRef = useRef({ subs, qs, options });
  dataRef.current = { subs, qs, options };

  const [result, setResult] = useState<AdvancedAnalyticsResult | null>(
    () => cache.get(sig) ?? null,
  );
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    const cached = cache.get(sig);
    if (cached) {
      setResult(cached);
      setComputing(false);
      return;
    }
    setComputing(true);
    let idleHandle = 0;
    const timer = window.setTimeout(() => {
      idleHandle = idle(() => {
        const { subs: s, qs: q, options: o } = dataRef.current;
        const r = buildAdvancedAnalytics(s, q, o || {});
        cache.set(sig, r);
        // Bound the cache (drop oldest entry).
        if (cache.size > MAX_CACHE) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        setResult(r);
        setComputing(false);
      });
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      const cic = (window as any).cancelIdleCallback as ((h: number) => void) | undefined;
      if (idleHandle && cic) cic(idleHandle);
    };
    // Only re-run when the content signature changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, debounceMs]);

  return { result, computing };
}
