import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OverrideMap, OverrideDecision } from "@/lib/acsm/irfBridge";

export interface DuplicateOverrideRow {
  id: string;
  project_id: string | null;
  source_table: "irf_reports" | "acsm_reports";
  submission_id: string;
  signature: string | null;
  decision: OverrideDecision;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Loads admin overrides for duplicate-flagged ACSM / IRF submissions and exposes
 * helpers to set / clear them. Both dashboards subscribe to realtime so a decision
 * recomputes unique counts everywhere instantly.
 */
export const useAcsmDuplicateOverrides = (projectId?: string | null) => {
  const [overrides, setOverrides] = useState<DuplicateOverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  const reload = useCallback(async () => {
    const my = ++reqRef.current;
    setLoading(true);
    try {
      let q = supabase.from("acsm_duplicate_overrides" as any).select("*");
      if (projectId) q = q.eq("project_id", projectId);
      const { data } = await q;
      if (my !== reqRef.current) return;
      setOverrides((data as any as DuplicateOverrideRow[]) || []);
    } finally {
      if (my === reqRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const channel = supabase
      .channel(`acsm_dup_overrides_${projectId || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "acsm_duplicate_overrides" },
        () => { void reload(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, reload]);

  /** map for a single source table, keyed by submission id */
  const mapFor = useCallback((table: "irf_reports" | "acsm_reports"): OverrideMap => {
    const m: OverrideMap = new Map();
    for (const o of overrides) {
      if (o.source_table === table) m.set(o.submission_id, o.decision);
    }
    return m;
  }, [overrides]);

  const irfMap = useMemo(() => mapFor("irf_reports"), [mapFor]);
  const acsmMap = useMemo(() => mapFor("acsm_reports"), [mapFor]);

  const setOverride = useCallback(async (args: {
    sourceTable: "irf_reports" | "acsm_reports";
    submissionId: string;
    decision: OverrideDecision;
    signature?: string | null;
    reason?: string | null;
  }) => {
    const { data: { user } } = await supabase.auth.getUser();
    let name: string | null = null;
    if (user) {
      const { data: prof } = await supabase
        .from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      name = (prof as any)?.full_name ?? user.email ?? null;
    }
    const { error } = await supabase
      .from("acsm_duplicate_overrides" as any)
      .upsert({
        project_id: projectId ?? null,
        source_table: args.sourceTable,
        submission_id: args.submissionId,
        signature: args.signature ?? null,
        decision: args.decision,
        reason: args.reason ?? null,
        reviewed_by: user?.id ?? null,
        reviewed_by_name: name,
        updated_at: new Date().toISOString(),
      }, { onConflict: "source_table,submission_id" });
    if (error) throw error;
    await reload();
  }, [projectId, reload]);

  const clearOverride = useCallback(async (sourceTable: string, submissionId: string) => {
    const { error } = await supabase
      .from("acsm_duplicate_overrides" as any)
      .delete()
      .eq("source_table", sourceTable)
      .eq("submission_id", submissionId);
    if (error) throw error;
    await reload();
  }, [reload]);

  return { overrides, loading, reload, irfMap, acsmMap, setOverride, clearOverride };
};
