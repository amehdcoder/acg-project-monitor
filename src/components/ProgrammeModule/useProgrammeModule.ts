import { useCallback, useEffect, useState } from "react";
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
import { bindQueueAutoFlush, flushQueue, listQueued, pendingFor } from "@/lib/programmeModule/offlineQueue";

/** Programme modules configured on a project. */
export const useProgrammeModules = (projectId?: string) => {
  const [modules, setModules] = useState<ProgrammeModuleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setModules([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("programme_modules")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    setModules(((data as unknown as ProgrammeModuleRow[]) || []).map((m) => ({
      ...m,
      config: normalizeConfig(m.config),
    })));
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  return { modules, loading, reload: load };
};

/** Beneficiaries of a module, merged with anything still queued offline. */
export const useBeneficiaries = (moduleId?: string) => {
  const [rows, setRows] = useState<BeneficiaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!moduleId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("beneficiaries")
      .select("*")
      .eq("module_id", moduleId)
      .order("created_at", { ascending: false })
      .limit(500);
    const server = (data as unknown as BeneficiaryRow[]) || [];
    const serverUuids = new Set(listQueued().map((q) => q.submission_uuid));
    const queued = pendingFor("beneficiary", (p) => p.module_id === moduleId)
      .filter((p) => serverUuids.has(p.submission_uuid as string))
      .map((p) => ({
        ...(p as unknown as BeneficiaryRow),
        id: p.submission_uuid as string,
        __pending: true,
      }));
    setRows([...queued, ...server]);
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
    const onQueue = () => { void load(); };
    window.addEventListener("programme-module-queue", onQueue);
    return () => window.removeEventListener("programme-module-queue", onQueue);
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
      supabase.from("beneficiary_services").select("*").eq("beneficiary_id", beneficiaryId)
        .order("service_date", { ascending: false }),
      supabase.from("beneficiary_referrals").select("*").eq("beneficiary_id", beneficiaryId)
        .order("referral_date", { ascending: false }),
      supabase.from("beneficiary_audit").select("*").eq("beneficiary_id", beneficiaryId)
        .order("created_at", { ascending: false }).limit(100),
    ]);
    const queuedServices = pendingFor("service", (p) => p.beneficiary_id === beneficiaryId)
      .map((p) => ({ ...(p as unknown as BeneficiaryServiceRow), id: p.submission_uuid as string, __pending: true }));
    const queuedReferrals = pendingFor("referral", (p) => p.beneficiary_id === beneficiaryId)
      .map((p) => ({ ...(p as unknown as BeneficiaryReferralRow), id: p.submission_uuid as string, __pending: true }));
    setServices([...queuedServices, ...((s.data as unknown as BeneficiaryServiceRow[]) || [])]);
    setReferrals([...queuedReferrals, ...((r.data as unknown as BeneficiaryReferralRow[]) || [])]);
    setAudit((a.data as unknown as BeneficiaryAuditRow[]) || []);
    setLoading(false);
  }, [beneficiaryId]);

  useEffect(() => {
    void load();
    const onQueue = () => { void load(); };
    window.addEventListener("programme-module-queue", onQueue);
    return () => window.removeEventListener("programme-module-queue", onQueue);
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
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("beneficiary_audit").insert({ ...entry, actor_id: auth.user.id } as never);
};

export const syncNow = () => flushQueue();
