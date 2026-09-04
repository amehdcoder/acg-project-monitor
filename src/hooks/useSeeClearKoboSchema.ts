/**
 * Live KoboToolbox schema registry for the See Clear (Plateau Comprehensive &
 * Inclusive Eye Health) MEL Checklist.
 *
 * Reads the snapshot stored in `seeclear_kobo_schema` by the
 * `seeclear-schema-sync` edge function, subscribes to realtime changes so the
 * checklist and dashboard react the moment the Kobo form is edited, and exposes
 * a manual "Sync now" action for administrators.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SchemaField {
  name: string;
  type: string;
  label: string;
  group: string | null;
  required: boolean;
  list_name: string | null;
  hint: string | null;
  relevant: string | null;
}

export interface SchemaDrift {
  added: { name: string; label: string; type: string }[];
  removed: { name: string; label: string; type: string }[];
  changed: { name: string; from: string; to: string }[];
  at?: string;
}

export interface SeeClearSchema {
  form_uid: string;
  form_title: string | null;
  version_id: string | null;
  fields: SchemaField[];
  choices: Record<string, { value: string; label: string }[]>;
  drift: SchemaDrift | null;
  submission_count: number | null;
  last_synced_at: string | null;
  last_error: string | null;
  updated_at?: string | null;
}

const EMPTY_DRIFT: SchemaDrift = { added: [], removed: [], changed: [] };

export function useSeeClearKoboSchema(enabled = true) {
  const [schema, setSchema] = useState<SeeClearSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("seeclear_kobo_schema" as any)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (err) setError(err.message);
    else {
      const row = (data as any[])?.[0] ?? null;
      setSchema(row ? ({ ...row, drift: row.drift ?? EMPTY_DRIFT } as SeeClearSchema) : null);
      setError(null);
    }
    setLoading(false);
  }, [enabled]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("seeclear-schema-sync", {
        body: { action: "sync" },
      });
      if (err) throw new Error(err.message);
      if ((data as any)?.error) throw new Error((data as any).detail || (data as any).error);
      await load();
      return { ok: true, changes: Number((data as any)?.changes ?? 0) };
    } catch (e) {
      const msg = (e as Error).message || "Schema sync failed";
      setError(msg);
      return { ok: false, changes: 0, error: msg };
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const channel = supabase
      .channel(`seeclear-schema-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "seeclear_kobo_schema" },
        () => void load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [enabled, load]);

  const drift = schema?.drift ?? EMPTY_DRIFT;
  const driftCount = drift.added.length + drift.removed.length + drift.changed.length;

  return { schema, fields: schema?.fields ?? [], choices: schema?.choices ?? {}, drift, driftCount, loading, syncing, error, reload: load, sync };
}

export default useSeeClearKoboSchema;
