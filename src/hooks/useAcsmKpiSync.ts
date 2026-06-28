import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AcsmKpiPayload {
  generatedAt: string;
  projectName?: string;
  kpis: Array<{ key: string; label: string; value: number | string; unit?: string; source?: string }>;
  indicators: Array<Record<string, any>>;
  duplicates: Record<string, number>;
}

interface SyncConfig {
  enabled: boolean;
  spreadsheetUrl: string;
  lookerUrl: string;
}

const DEFAULT: SyncConfig = { enabled: false, spreadsheetUrl: "", lookerUrl: "" };

function storeKey(projectId?: string | null) {
  return `acsm_kpi_sync_${projectId || "all"}`;
}

function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  // allow pasting a bare id
  if (/^[a-zA-Z0-9-_]{20,}$/.test(url.trim())) return url.trim();
  return null;
}

/**
 * Persists Google Sheets / Looker sync configuration and pushes the linked
 * IRF + Advocacy KPIs to the target sheet. When enabled, `autoSync` is called by
 * the dashboard whenever the underlying data changes (realtime), so Looker Studio —
 * which auto-refreshes from the sheet — stays current automatically.
 */
export const useAcsmKpiSync = (projectId?: string | null) => {
  const [config, setConfig] = useState<SyncConfig>(DEFAULT);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSigRef = useRef<string>("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey(projectId));
      setConfig(raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT);
      setLastSync(localStorage.getItem(`${storeKey(projectId)}_last`) || null);
    } catch { setConfig(DEFAULT); }
    lastSigRef.current = "";
  }, [projectId]);

  const saveConfig = useCallback((next: Partial<SyncConfig>) => {
    setConfig((prev) => {
      const merged = { ...prev, ...next };
      try { localStorage.setItem(storeKey(projectId), JSON.stringify(merged)); } catch { /* ignore */ }
      return merged;
    });
  }, [projectId]);

  const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);

  const sync = useCallback(async (payload: AcsmKpiPayload): Promise<boolean> => {
    if (!spreadsheetId) { setLastError("Add a valid Google Sheet link first."); return false; }
    setSyncing(true);
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheets", {
        body: { action: "sync_acsm_kpis", spreadsheetId, payload },
      });
      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error || "Sync failed");
      const now = new Date().toISOString();
      setLastSync(now);
      try { localStorage.setItem(`${storeKey(projectId)}_last`, now); } catch { /* ignore */ }
      return true;
    } catch (e: any) {
      setLastError(e?.message || "Sync failed");
      return false;
    } finally {
      setSyncing(false);
    }
  }, [spreadsheetId, projectId]);

  /** Debounced auto-sync; only fires when enabled and the payload actually changed. */
  const autoSync = useCallback((payload: AcsmKpiPayload) => {
    if (!config.enabled || !spreadsheetId) return;
    const sig = JSON.stringify({ k: payload.kpis, d: payload.duplicates });
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void sync(payload); }, 1500);
  }, [config.enabled, spreadsheetId, sync]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return {
    config, saveConfig, spreadsheetId,
    syncing, lastSync, lastError,
    sync, autoSync,
  };
};
