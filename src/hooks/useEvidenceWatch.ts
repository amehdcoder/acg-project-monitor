/**
 * Scheduled daily refresh + new-evidence alerting for the Integrated MDA
 * Supervisory Checklist evidence ledger.
 *
 * • Re-runs the caller's refresh function on a fixed interval (default hourly)
 *   and whenever the browser tab regains focus after the scheduled time.
 * • Diffs the current ledger against the findings already acknowledged on this
 *   device, so an alert only fires for evidence that genuinely was not captured
 *   on any prior day.
 * • Raises a toast and, when the user has granted permission, a native
 *   notification.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { EvidenceFact, EvidenceLedger } from "@/lib/isc/evidencePatterns";

const SEEN_KEY = "isc:evidence:seen-facts";
const PREF_KEY = "isc:evidence:watch-enabled";
const LAST_KEY = "isc:evidence:last-refresh";

const readSeen = (): Set<string> => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

const writeSeen = (ids: Set<string>) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-4000)));
  } catch {
    /* quota — ignore */
  }
};

export interface UseEvidenceWatch {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** Findings never acknowledged on this device. */
  unseen: EvidenceFact[];
  lastRefresh: string | null;
  refreshing: boolean;
  refreshNow: () => Promise<void>;
  acknowledge: () => void;
  notificationsGranted: boolean;
  requestNotifications: () => Promise<void>;
}

export function useEvidenceWatch(
  ledger: EvidenceLedger,
  onRefresh?: () => void | Promise<void>,
  intervalMs = 60 * 60 * 1000,
): UseEvidenceWatch {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try { return localStorage.getItem(PREF_KEY) !== "off"; } catch { return true; }
  });
  const [seen, setSeen] = useState<Set<string>>(() => readSeen());
  const [lastRefresh, setLastRefresh] = useState<string | null>(() => {
    try { return localStorage.getItem(LAST_KEY); } catch { return null; }
  });
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsGranted, setGranted] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted",
  );
  const alertedRef = useRef<string>("");
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try { localStorage.setItem(PREF_KEY, v ? "on" : "off"); } catch { /* ignore */ }
  }, []);

  const unseen = useMemo(
    () => ledger.facts.filter((f) => !seen.has(f.id)),
    [ledger.facts, seen],
  );

  const acknowledge = useCallback(() => {
    const next = new Set(seen);
    ledger.facts.forEach((f) => next.add(f.id));
    writeSeen(next);
    setSeen(next);
  }, [ledger.facts, seen]);

  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshRef.current?.();
      const now = new Date().toISOString();
      try { localStorage.setItem(LAST_KEY, now); } catch { /* ignore */ }
      setLastRefresh(now);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const requestNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const res = await Notification.requestPermission();
    setGranted(res === "granted");
  }, []);

  /* Scheduled refresh. */
  useEffect(() => {
    if (!enabled || !onRefresh) return;
    const tick = () => {
      const last = Number(new Date(localStorage.getItem(LAST_KEY) ?? 0));
      if (Date.now() - last >= intervalMs) void refreshNow();
    };
    tick();
    const id = window.setInterval(tick, Math.min(intervalMs, 15 * 60 * 1000));
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, refreshNow, !!onRefresh]);

  /* Alert on genuinely new evidence. */
  useEffect(() => {
    if (!enabled || unseen.length === 0) return;
    const signature = unseen.map((f) => f.id).join("|");
    if (alertedRef.current === signature) return;
    alertedRef.current = signature;

    const critical = unseen.filter((f) => f.severity === "critical").length;
    const headline = `${unseen.length} new finding${unseen.length === 1 ? "" : "s"} not seen on any earlier day`;
    const body = unseen
      .slice(0, 3)
      .map((f) => `${f.theme} — ${f.place}`)
      .join("\n");

    toast.warning(headline, {
      description: `${body}${unseen.length > 3 ? `\n+${unseen.length - 3} more` : ""}`,
      duration: 9000,
    });

    if (notificationsGranted && typeof Notification !== "undefined") {
      try {
        new Notification("MDA evidence alert", {
          body: `${headline}${critical ? ` · ${critical} critical` : ""}\n${body}`,
          tag: "isc-evidence",
        });
      } catch { /* ignore */ }
    }
  }, [enabled, unseen, notificationsGranted]);

  return {
    enabled, setEnabled, unseen, lastRefresh, refreshing,
    refreshNow, acknowledge, notificationsGranted, requestNotifications,
  };
}
