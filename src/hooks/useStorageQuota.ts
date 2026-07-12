import { useEffect, useState, useCallback } from "react";
import { getStorageEstimate, type StorageEstimateResult } from "@/lib/storagePersistence";

/**
 * Monitors the device's browser-storage quota and re-checks periodically. When
 * the available fraction drops below `warnBelow` (default 15%) the consumer can
 * surface a low-space warning so the field worker frees phone storage before the
 * offline queue is put at risk.
 */
export function useStorageQuota(warnBelow = 0.15, pollMs = 60_000) {
  const [estimate, setEstimate] = useState<StorageEstimateResult | null>(null);

  const refresh = useCallback(async () => {
    const est = await getStorageEstimate();
    setEstimate(est);
    return est;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const est = await getStorageEstimate();
      if (!cancelled) setEstimate(est);
    })();
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [refresh, pollMs]);

  const low =
    !!estimate && estimate.supported && estimate.availableRatio < warnBelow;

  return { estimate, low, refresh };
}
