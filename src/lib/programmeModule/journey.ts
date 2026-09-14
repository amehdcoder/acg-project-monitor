// Beneficiary journey: one row per person telling the whole story of change —
// where they stand in the programme, what they received, how they say they
// changed, what they told us, and whether a safeguarding flag was raised.
// Grouped by the health facility that holds their care.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BeneficiaryRow } from "./types";

export interface JourneyService {
  component_key: string;
  service_name: string | null;
  service_date: string;
  data: Record<string, unknown>;
}

export interface JourneyRow {
  beneficiary: BeneficiaryRow;
  facilityId: string;
  programmeStatus: string;
  serviceCount: number;
  components: string[];
  firstServiceDate: string | null;
  lastServiceDate: string | null;
  perceivedChange: string | null;
  improvementAreas: string[];
  satisfaction: string | null;
  feedbackTypes: string[];
  feedbackResolved: string | null;
  safeguardingFlags: number;
  safeguardingUrgent: boolean;
}

export interface FacilityJourneyGroup {
  facilityId: string;
  rows: JourneyRow[];
}

const str = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));
const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) return v.split(/[,;]\s*/);
  return [];
};

/** Loads every beneficiary of a module plus their services, and derives the journey. */
export const useBeneficiaryJourneys = (projectId?: string, moduleId?: string) => {
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRow[]>([]);
  const [services, setServices] = useState<(JourneyService & { beneficiary_id: string })[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setBeneficiaries([]); setServices([]); return; }
    setLoading(true);
    let bq = supabase.from("beneficiaries").select("*").eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(1000);
    let sq = supabase.from("beneficiary_services")
      .select("beneficiary_id,component_key,service_name,service_date,data")
      .eq("project_id", projectId)
      .order("service_date", { ascending: true }).limit(5000);
    if (moduleId) { bq = bq.eq("module_id", moduleId); sq = sq.eq("module_id", moduleId); }
    const [b, s] = await Promise.all([bq, sq]);
    setBeneficiaries((b.data as unknown as BeneficiaryRow[]) || []);
    setServices((s.data as unknown as (JourneyService & { beneficiary_id: string })[]) || []);
    setLoading(false);
  }, [projectId, moduleId]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo<JourneyRow[]>(() => {
    const byBeneficiary = new Map<string, JourneyService[]>();
    for (const s of services) {
      const arr = byBeneficiary.get(s.beneficiary_id) || [];
      arr.push(s);
      byBeneficiary.set(s.beneficiary_id, arr);
    }

    return beneficiaries.map((b) => {
      const own = (byBeneficiary.get(b.id) || [])
        .slice()
        .sort((x, y) => x.service_date.localeCompare(y.service_date));
      const profile = (b.profile || {}) as Record<string, unknown>;

      let perceivedChange: string | null = null;
      let improvementAreas: string[] = [];
      let satisfaction: string | null = null;
      let feedbackTypes: string[] = [];
      let feedbackResolved: string | null = null;
      let safeguardingFlags = 0;
      let safeguardingUrgent = false;

      for (const s of own) {
        const d = (s.data || {}) as Record<string, unknown>;
        if (str(d.perceived_change)) {
          perceivedChange = str(d.perceived_change);
          improvementAreas = list(d.improvement_areas);
        }
        if (str(d.beneficiary_satisfaction)) satisfaction = str(d.beneficiary_satisfaction);
        if (str(d.feedback_given) === "Yes") {
          feedbackTypes = Array.from(new Set([...feedbackTypes, ...list(d.feedback_types)]));
          feedbackResolved = str(d.feedback_resolved) || feedbackResolved;
        }
        const concern = str(d.safeguarding_concern);
        if (concern === "Yes" || concern === "Suspected") {
          safeguardingFlags += 1;
          const action = str(d.safeguarding_immediate_action);
          if (action === "Urgent" || action === "Yes" || action === "Referred") safeguardingUrgent = true;
        }
      }

      return {
        beneficiary: b,
        facilityId: (b as unknown as { facility_id?: string | null }).facility_id || "",
        programmeStatus: str(profile.programme_status) || b.status || "Active",
        serviceCount: own.length,
        components: Array.from(new Set(own.map((s) => s.component_key))),
        firstServiceDate: own[0]?.service_date || null,
        lastServiceDate: own[own.length - 1]?.service_date || null,
        perceivedChange,
        improvementAreas,
        satisfaction,
        feedbackTypes,
        feedbackResolved,
        safeguardingFlags,
        safeguardingUrgent,
      };
    });
  }, [beneficiaries, services]);

  return { rows, loading, reload: load };
};

export const groupByFacility = (rows: JourneyRow[]): FacilityJourneyGroup[] => {
  const map = new Map<string, JourneyRow[]>();
  for (const r of rows) {
    const arr = map.get(r.facilityId) || [];
    arr.push(r);
    map.set(r.facilityId, arr);
  }
  return Array.from(map.entries()).map(([facilityId, groupRows]) => ({ facilityId, rows: groupRows }));
};

export const CHANGE_TONE: Record<string, string> = {
  "Much improved": "border-emerald-200 bg-emerald-50 text-emerald-800",
  Improved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "No change": "border-amber-200 bg-amber-50 text-amber-800",
  Worsened: "border-rose-200 bg-rose-50 text-rose-800",
  "Much worsened": "border-rose-200 bg-rose-50 text-rose-800",
  "Unable to assess": "border-border bg-muted text-muted-foreground",
};
