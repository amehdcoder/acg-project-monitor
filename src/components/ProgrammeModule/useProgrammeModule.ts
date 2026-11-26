import { offlineMutate } from "@/lib/programmeModule/offlineWrite";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeConfig } from "@/lib/programmeModule/defaults";
import type {
  BeneficiaryAuditRow,
  BeneficiaryReferralRow,
  BeneficiaryRow,
  BeneficiaryServiceRow,
  ProgrammeModuleConfig,
  ProgrammeModuleRow,
} from "@/lib/programmeModule/types";
import { cachedRead } from "@/lib/programmeModule/offlineReadCache";
import { bindQueueAutoFlush, flushQueue, listQueued, pendingFor, recentLocalEdit } from "@/lib/programmeModule/offlineQueue";

/** Programme modules configured on a project. */
export const useProgrammeModules = (projectId?: string) => {
  const [modules, setModules] = useState<ProgrammeModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const modulesFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) { setModules([]); setLoading(false); return; }
    // Only the first load for a project shows a loading state; later refreshes keep the screen.
    if (modulesFor.current !== projectId) setLoading(true);
    const { data } = await cachedRead(`modules:${projectId}`, () => supabase
      .from("programme_modules")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }));
    if (data || modulesFor.current !== projectId) setModules(((data as unknown as ProgrammeModuleRow[]) || []).map((m) => ({
      ...m,
      config: normalizeConfig(m.config),
    })));
    modulesFor.current = projectId;
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  return { modules, loading, reload: load };
};

/** Beneficiaries of a module, merged with anything still queued offline. */
export const useBeneficiaries = (moduleId?: string) => {
  const [rows, setRows] = useState<BeneficiaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const rowsFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!moduleId) { setRows([]); setLoading(false); return; }
    // Background refreshes keep saved rows on screen and merge only what changed.
    if (rowsFor.current !== moduleId) setLoading(true);
    const { data } = await cachedRead(`beneficiaries:${moduleId}`, () => supabase
      .from("beneficiaries")
      .select("*")
      .eq("module_id", moduleId)
      .order("created_at", { ascending: false })
      .limit(500));
    const server = (data as unknown as BeneficiaryRow[]) || [];
    const serverUuids = new Set(listQueued().map((q) => q.submission_uuid));
    const queued = pendingFor("beneficiary", (p) => p.module_id === moduleId)
      .filter((p) => serverUuids.has(p.submission_uuid as string))
      .map((p) => ({
        ...(p as unknown as BeneficiaryRow),
        id: p.submission_uuid as string,
        __pending: true,
      }));
    if (!data && rowsFor.current === moduleId) { setLoading(false); return; }
    // Edits still waiting to send stay on screen even when a fresh server copy arrives.
    const pendingEdits = new Map<string, Record<string, unknown>>();
    for (const op of pendingFor("op", (p) => p.table === "beneficiaries" && p.action === "update" && !!p.id)) {
      pendingEdits.set(op.id as string, { ...(pendingEdits.get(op.id as string) || {}), ...((op.values as Record<string, unknown>) || {}) });
    }
    const serverWithEdits = server.map((r) => {
      const edit = pendingEdits.get(r.id) || recentLocalEdit(r.id);
      return edit ? ({ ...r, ...edit } as BeneficiaryRow) : r;
    });
    const next = [...queued, ...serverWithEdits];
    setRows((prev) => {
      const before = new Map(prev.map((r) => [r.id, r]));
      const merged = next.map((r) => {
        const old = before.get(r.id);
        return old && JSON.stringify(old) === JSON.stringify(r) ? old : r;
      });
      return merged.length === prev.length && merged.every((r, i) => r === prev[i]) ? prev : merged;
    });
    rowsFor.current = moduleId;
    setLoading(false);
  }, [moduleId]);

  /**
   * Put a row straight into the list without waiting for a refetch — the
   * register reflects a new or edited beneficiary the moment it is saved.
   */
  const upsert = useCallback((row: BeneficiaryRow) => {
    setRows((prev) => {
      const without = prev.filter((r) => r.id !== row.id);
      return [row, ...without];
    });
  }, []);

  useEffect(() => {
    bindQueueAutoFlush();
    void load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const onQueue = () => { clearTimeout(t); t = setTimeout(() => { void load(); }, 400); };
    window.addEventListener("programme-module-queue", onQueue);
    return () => { clearTimeout(t); window.removeEventListener("programme-module-queue", onQueue); };
  }, [load]);

  // Anything saved on another device or by a colleague appears without a reload.
  useEffect(() => {
    if (!moduleId) return;
    const channel = supabase
      .channel(`beneficiaries-${moduleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beneficiaries", filter: `module_id=eq.${moduleId}` },
        (payload) => {
          const row = payload.new as unknown as BeneficiaryRow;
          if (payload.eventType === "DELETE") {
            const gone = payload.old as unknown as { id?: string };
            setRows((prev) => prev.filter((r) => r.id !== gone?.id));
            return;
          }
          if (row?.id) upsert(row);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [moduleId, upsert]);

  return { beneficiaries: rows, loading, reload: load, upsert };
};

/** Everything attached to one beneficiary: services, referrals and history. */
export const useBeneficiaryRecord = (beneficiaryId?: string) => {
  const [services, setServices] = useState<BeneficiaryServiceRow[]>([]);
  const [referrals, setReferrals] = useState<BeneficiaryReferralRow[]>([]);
  const [audit, setAudit] = useState<BeneficiaryAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!beneficiaryId) return;
    setLoading(true);
    const [s, r, a] = await Promise.all([
      cachedRead(`services:${beneficiaryId}`, () => supabase.from("beneficiary_services").select("*").eq("beneficiary_id", beneficiaryId)
        .order("service_date", { ascending: false })),
      cachedRead(`referrals:${beneficiaryId}`, () => supabase.from("beneficiary_referrals").select("*").eq("beneficiary_id", beneficiaryId)
        .order("referral_date", { ascending: false })),
      cachedRead(`audit:${beneficiaryId}`, () => supabase.from("beneficiary_audit").select("*").eq("beneficiary_id", beneficiaryId)
        .order("created_at", { ascending: false }).limit(100)),
    ]);
    const queuedServices = pendingFor("service", (p) => p.beneficiary_id === beneficiaryId)
      .map((p) => ({ ...(p as unknown as BeneficiaryServiceRow), id: p.submission_uuid as string, __pending: true }));
    const queuedReferrals = pendingFor("referral", (p) => p.beneficiary_id === beneficiaryId)
      .map((p) => ({ ...(p as unknown as BeneficiaryReferralRow), id: p.submission_uuid as string, __pending: true }));
    // Services/referrals saved through the general offline queue stay visible until they are sent.
    const queuedOps = <T,>(table: string) => pendingFor("op", (p) => p.table === table && p.action === "insert")
      .flatMap((p) => (Array.isArray(p.values) ? p.values : [p.values]) as Record<string, unknown>[])
      .filter((v) => v && v.beneficiary_id === beneficiaryId)
      .map((v) => ({ ...(v as unknown as T), __pending: true }));
    const withPending = <T extends { id: string }>(pending: T[], server: T[]) => {
      const seen = new Set(server.map((x) => x.id));
      return [...pending.filter((x) => !seen.has(x.id)), ...server];
    };
    setServices(withPending([...queuedServices, ...queuedOps<BeneficiaryServiceRow>("beneficiary_services")], (s.data as unknown as BeneficiaryServiceRow[]) || []));
    setReferrals(withPending([...queuedReferrals, ...queuedOps<BeneficiaryReferralRow>("beneficiary_referrals")], (r.data as unknown as BeneficiaryReferralRow[]) || []));
    setAudit((a.data as unknown as BeneficiaryAuditRow[]) || []);
    setLoading(false);
  }, [beneficiaryId]);

  useEffect(() => {
    void load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const onQueue = () => { clearTimeout(t); t = setTimeout(() => { void load(); }, 400); };
    window.addEventListener("programme-module-queue", onQueue);
    return () => { clearTimeout(t); window.removeEventListener("programme-module-queue", onQueue); };
  }, [load]);

  return { services, referrals, audit, loading, reload: load };
};

export const saveModuleConfig = async (moduleId: string, config: ProgrammeModuleConfig, name?: string) => {
  const patch: Record<string, unknown> = { config: config as unknown as Record<string, unknown> };
  if (name) patch.name = name;
  const { error } = await supabase.from("programme_modules").update(patch as never).eq("id", moduleId);
  if (error) throw error;
};

export const recordAudit = async (entry: {
  beneficiary_id: string;
  project_id: string;
  action: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
}) => {
  // getSession works offline; the queued write keeps offline edits in the record history.
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return;
  try {
    await offlineMutate({ table: "beneficiary_audit", action: "insert", values: { ...entry, actor_id: uid } });
  } catch { /* history is best-effort; never block the save */ }
};

export const syncNow = () => flushQueue();
