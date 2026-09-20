// CDD case search for Morbidity Management & Disability Prevention (MMDP).
//
// Community-directed distributors (CDDs) trained for case search are registered
// under a health facility. Every potential Lymphoedema or Hydrocoele case they
// find is recorded against them, confirmed by a clinician using the lesion
// staging tool, and only becomes a registered beneficiary — with a Case ID —
// once a facility keeps or accepts it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type CaseSearchStatus = "pending" | "confirmed" | "not_a_case" | "referred" | "registered";

export const CASE_STATUS_LABEL: Record<CaseSearchStatus, string> = {
  pending: "Awaiting clinician",
  confirmed: "Confirmed — awaiting registration",
  not_a_case: "Not a case",
  referred: "Referred — awaiting acceptance",
  registered: "Registered beneficiary",
};

export const CASE_STATUS_TONE: Record<CaseSearchStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  pending: "warning",
  confirmed: "info",
  not_a_case: "neutral",
  referred: "info",
  registered: "success",
};

/** Only the two MMDP manifestations CDDs search for. */
export const MMDP_CONDITIONS = [
  { value: "lymphoedema", label: "Lymphoedema (swollen limb)" },
  { value: "hydrocoele", label: "Hydrocoele (scrotal swelling)" },
] as const;

export const AFFECTED_SIDES = [
  "Left leg", "Right leg", "Both legs", "Left arm", "Right arm", "Both arms",
  "Scrotum", "Breast", "Other",
];

export const TRAINING_STATUSES = [
  { value: "trained", label: "Trained on MMDP case search" },
  { value: "refresher_due", label: "Refresher training due" },
  { value: "in_training", label: "In training" },
  { value: "not_trained", label: "Not yet trained" },
];

export const SEX_OPTIONS = ["Female", "Male"];

export interface CddRow {
  id: string;
  project_id: string;
  module_id: string | null;
  facility_id: string;
  full_name: string;
  cdd_code: string | null;
  sex: string | null;
  phone: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  community: string | null;
  trained_on: string | null;
  training_status: string;
  supervisor_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PotentialCaseRow {
  id: string;
  project_id: string;
  module_id: string | null;
  facility_id: string;
  cdd_id: string | null;
  full_name: string;
  sex: string | null;
  age: number | null;
  phone: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  community: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  condition: string;
  affected_side: string | null;
  duration_years: number | null;
  acute_attacks_last_year: number | null;
  photos: string[];
  search_date: string;
  notes: string | null;
  status: CaseSearchStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
  confirmed_condition: string | null;
  confirmed_stage: number | null;
  confirmed_stage_label: string | null;
  clinical_criteria: Record<string, boolean>;
  measurements: Record<string, number | null>;
  analysis: Record<string, unknown>;
  clinician_notes: string | null;
  /** The consultation itself: complaints, diagnosis and what was done. */
  symptoms: Record<string, unknown>;
  diagnosis: Record<string, unknown>;
  treatment: Record<string, unknown>;
  rejection_reason: string | null;
  referred_to_facility_id: string | null;
  referred_at: string | null;
  referral_urgency: string | null;
  referral_summary: string | null;
  accepted_at: string | null;
  beneficiary_id: string | null;
  created_at: string;
}

const CDD_COLUMNS =
  "id,project_id,module_id,facility_id,full_name,cdd_code,sex,phone,state,lga,ward,community," +
  "trained_on,training_status,supervisor_name,notes,is_active,created_at";

/** CDDs registered on a project, newest first. */
export const useCdds = (projectId?: string) => {
  const [cdds, setCdds] = useState<CddRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setCdds([]); return; }
    setLoading(true);
    const { data } = await db.from("mmdp_cdds")
      .select(CDD_COLUMNS)
      .eq("project_id", projectId)
      .order("full_name")
      .limit(1000);
    setCdds((data as CddRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  return { cdds, loading, reload: load };
};

export type CddInput = Partial<CddRow> & { full_name: string; facility_id: string };

export const saveCdd = async (input: CddInput & { project_id: string }) => {
  const payload = {
    project_id: input.project_id,
    module_id: input.module_id || null,
    facility_id: input.facility_id,
    full_name: input.full_name.trim(),
    cdd_code: input.cdd_code || null,
    sex: input.sex || null,
    phone: input.phone || null,
    state: input.state || null,
    lga: input.lga || null,
    ward: input.ward || null,
    community: input.community || null,
    trained_on: input.trained_on || null,
    training_status: input.training_status || "trained",
    supervisor_name: input.supervisor_name || null,
    notes: input.notes || null,
    is_active: input.is_active !== false,
  };
  if (input.id) {
    const { error } = await db.from("mmdp_cdds").update(payload).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await db.from("mmdp_cdds").insert(payload).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
};

export const deleteCdd = async (id: string) => {
  const { error } = await db.from("mmdp_cdds").delete().eq("id", id);
  if (error) throw error;
};

/** Potential cases on a project — including those referred to other facilities. */
export const usePotentialCases = (projectId?: string) => {
  const [cases, setCases] = useState<PotentialCaseRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setCases([]); return; }
    setLoading(true);
    const { data } = await db.from("mmdp_potential_cases")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1000);
    setCases(((data as PotentialCaseRow[]) || []).map((c) => ({
      ...c,
      photos: Array.isArray(c.photos) ? c.photos : [],
      clinical_criteria: (c.clinical_criteria || {}) as Record<string, boolean>,
      measurements: (c.measurements || {}) as Record<string, number | null>,
      analysis: (c.analysis || {}) as Record<string, unknown>,
      symptoms: (c.symptoms || {}) as Record<string, unknown>,
      diagnosis: (c.diagnosis || {}) as Record<string, unknown>,
      treatment: (c.treatment || {}) as Record<string, unknown>,
    })));
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // A referral acceptance elsewhere should show up without a manual refresh.
  useEffect(() => {
    if (!projectId) return;
    const ch = supabase
      .channel(`mmdp-cases-${projectId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes" as never,
        { event: "*", schema: "public", table: "mmdp_potential_cases" } as never,
        () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [projectId, load]);

  return { cases, loading, reload: load };
};

export type PotentialCaseInput = Partial<PotentialCaseRow> & {
  project_id: string;
  facility_id: string;
  full_name: string;
};

export const savePotentialCase = async (input: PotentialCaseInput) => {
  const payload = {
    project_id: input.project_id,
    module_id: input.module_id || null,
    facility_id: input.facility_id,
    cdd_id: input.cdd_id || null,
    full_name: input.full_name.trim(),
    sex: input.sex || null,
    age: input.age ?? null,
    phone: input.phone || null,
    state: input.state || null,
    lga: input.lga || null,
    ward: input.ward || null,
    community: input.community || null,
    address: input.address || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    condition: input.condition || "lymphoedema",
    affected_side: input.affected_side || null,
    duration_years: input.duration_years ?? null,
    acute_attacks_last_year: input.acute_attacks_last_year ?? null,
    photos: input.photos || [],
    search_date: input.search_date || new Date().toISOString().slice(0, 10),
    notes: input.notes || null,
  };
  if (input.id) {
    const { error } = await db.from("mmdp_potential_cases").update(payload).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await db.from("mmdp_potential_cases")
    .insert(payload).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
};

export const deletePotentialCase = async (id: string) => {
  const { error } = await db.from("mmdp_potential_cases").delete().eq("id", id);
  if (error) throw error;
};

export interface ConfirmationInput {
  confirmed: boolean;
  condition?: string;
  stage?: number | null;
  stageLabel?: string | null;
  criteria?: Record<string, boolean>;
  measurements?: Record<string, number | null>;
  analysis?: Record<string, unknown>;
  /** The consultation record. */
  symptoms?: Record<string, unknown>;
  diagnosis?: Record<string, unknown>;
  treatment?: Record<string, unknown>;
  notes?: string;
  rejectionReason?: string;
}

/** A clinician confirms the case — or records that it is not a case. */
export const confirmPotentialCase = async (id: string, input: ConfirmationInput) => {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await db.from("mmdp_potential_cases").update({
    status: input.confirmed ? "confirmed" : "not_a_case",
    confirmed_by: auth.user?.id ?? null,
    confirmed_at: new Date().toISOString(),
    confirmed_condition: input.confirmed ? input.condition || null : null,
    confirmed_stage: input.confirmed ? input.stage ?? null : null,
    confirmed_stage_label: input.confirmed ? input.stageLabel || null : null,
    clinical_criteria: input.criteria || {},
    measurements: input.measurements || {},
    analysis: input.analysis || {},
    symptoms: input.symptoms || {},
    diagnosis: input.diagnosis || {},
    treatment: input.treatment || {},
    clinician_notes: input.notes || null,
    rejection_reason: input.confirmed ? null : input.rejectionReason || null,
  }).eq("id", id);
  if (error) throw error;
};

export interface CaseReferralInput {
  toFacilityId: string;
  urgency: string;
  summary?: string;
}

/** Refers a confirmed case on — no Case ID is issued until it is accepted. */
export const referPotentialCase = async (id: string, input: CaseReferralInput) => {
  const { error } = await db.from("mmdp_potential_cases").update({
    status: "referred",
    referred_to_facility_id: input.toFacilityId,
    referred_at: new Date().toISOString(),
    referral_urgency: input.urgency || "routine",
    referral_summary: input.summary || null,
  }).eq("id", id);
  if (error) throw error;
};

/** Cancels a referral that has not been accepted yet. */
export const withdrawCaseReferral = async (id: string) => {
  const { error } = await db.from("mmdp_potential_cases").update({
    status: "confirmed",
    referred_to_facility_id: null,
    referred_at: null,
    referral_urgency: null,
    referral_summary: null,
  }).eq("id", id);
  if (error) throw error;
};

/**
 * Registers a confirmed case as a beneficiary at the given facility. The Case ID
 * is issued here — on keeping the case, or on acceptance by the facility it was
 * referred to — never before.
 */
export const registerConfirmedCase = async (caseId: string, facilityId: string) => {
  const { data, error } = await db.rpc("register_confirmed_mmdp_case", {
    _case_id: caseId,
    _facility_id: facilityId,
  });
  if (error) throw error;
  return data as string;
};

export interface CddPerformance {
  found: number;
  pending: number;
  confirmed: number;
  notACase: number;
  referred: number;
  registered: number;
  confirmationRate: number;
}

export const cddPerformance = (cases: PotentialCaseRow[], cddId: string): CddPerformance => {
  const mine = cases.filter((c) => c.cdd_id === cddId);
  const count = (s: CaseSearchStatus) => mine.filter((c) => c.status === s).length;
  const confirmed = count("confirmed") + count("referred") + count("registered");
  return {
    found: mine.length,
    pending: count("pending"),
    confirmed: count("confirmed"),
    notACase: count("not_a_case"),
    referred: count("referred"),
    registered: count("registered"),
    confirmationRate: mine.length ? Math.round((confirmed / mine.length) * 100) : 0,
  };
};

/** Simple totals for the case-search header cards. */
export const caseSearchTotals = (cases: PotentialCaseRow[]) => {
  const by = (s: CaseSearchStatus) => cases.filter((c) => c.status === s).length;
  return {
    total: cases.length,
    pending: by("pending"),
    confirmed: by("confirmed"),
    referred: by("referred"),
    registered: by("registered"),
    notACase: by("not_a_case"),
  };
};

/** Client-side name/community/CDD search. */
export const useCaseFilter = (cases: PotentialCaseRow[], term: string, status: string) =>
  useMemo(() => {
    const q = term.trim().toLowerCase();
    return cases.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (!q) return true;
      return [c.full_name, c.community, c.ward, c.lga, c.phone]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [cases, term, status]);

/**
 * Everything the case search already knows about the person, expressed in the
 * registration form's own field names. Used to pre-fill the full beneficiary
 * record straight after confirmation so the longitudinal system holds the same
 * fields for a case-search beneficiary as for one registered at the desk.
 */
export const caseProfileSeed = (c: PotentialCaseRow): Record<string, unknown> => {
  const seed: Record<string, unknown> = {
    full_name: c.full_name,
    gender: c.sex || undefined,
    phone: c.phone || undefined,
    address: c.address || undefined,
    state: c.state || undefined,
    lga: c.lga || undefined,
    ward: c.ward || undefined,
    village: c.community || undefined,
    primary_condition: "Lymphatic Filariasis (Lymphedema / Hydrocele)",
    mmdp_manifestation: c.confirmed_condition || c.condition,
    mmdp_affected_side: c.affected_side || undefined,
    mmdp_duration_years: c.duration_years ?? undefined,
    mmdp_acute_attacks_last_year: c.acute_attacks_last_year ?? undefined,
    mmdp_confirmed_stage: c.confirmed_stage ?? undefined,
    mmdp_confirmed_stage_label: c.confirmed_stage_label || undefined,
    case_source: "CDD case search",
  };
  if (c.latitude != null && c.longitude != null) seed.gps = `${c.latitude}, ${c.longitude}`;
  if (c.age != null) seed.age = c.age;
  for (const k of Object.keys(seed)) if (seed[k] === undefined) delete seed[k];
  return seed;
};

/** Registration fields still blank on a record — what remains to be completed. */
export const missingProfileFields = (
  profile: Record<string, unknown>,
  fields: { name?: string; label?: string }[],
) => fields.filter((q) => {
  if (!q.name) return false;
  const v = profile[q.name];
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
});

/** Loads one beneficiary row, e.g. the record just created from a case. */
export const fetchBeneficiary = async (id: string) => {
  const { data } = await db.from("beneficiaries").select("*").eq("id", id).maybeSingle();
  return (data as Record<string, unknown> | null) || null;
};

/** One step in a case's journey from community finding to registered record. */
export interface CaseJourneyStep {
  key: "submitted" | "review" | "staging" | "referral" | "acceptance" | "registration";
  label: string;
  detail: string;
  at: string | null;
  state: "done" | "current" | "blocked" | "waiting";
}

/**
 * The full journey of one potential case. Every step is derived from the case
 * record itself, so the trail can never drift from what actually happened.
 */
export const caseJourney = (
  c: PotentialCaseRow,
  opts: {
    cddName?: (id?: string | null) => string;
    facilityName?: (id?: string | null) => string;
    caseCode?: string | null;
  } = {},
): CaseJourneyStep[] => {
  const cdd = opts.cddName?.(c.cdd_id) || "a CDD";
  const facility = opts.facilityName?.(c.facility_id) || "the facility";
  const target = c.referred_to_facility_id ? opts.facilityName?.(c.referred_to_facility_id) : null;
  const rejected = c.status === "not_a_case";
  const reviewed = !!c.confirmed_at;
  const steps: CaseJourneyStep[] = [];

  steps.push({
    key: "submitted",
    label: "Found during case search",
    detail: `${cdd} recorded this ${c.condition === "hydrocoele" ? "hydrocoele" : "lymphoedema"} case`
      + `${c.community ? ` in ${c.community}` : ""} under ${facility}.`,
    at: c.search_date || c.created_at,
    state: "done",
  });

  steps.push({
    key: "review",
    label: rejected ? "Ruled out by clinician" : "Clinician review",
    detail: rejected
      ? c.rejection_reason || "The clinician judged this not to be an MMDP case."
      : reviewed
        ? "A clinician reviewed the pictures and confirmed the case."
        : "Waiting for a clinician to review the pictures.",
    at: c.confirmed_at,
    state: rejected ? "blocked" : reviewed ? "done" : "current",
  });

  if (!rejected) {
    steps.push({
      key: "staging",
      label: "Lesion staging",
      detail: c.confirmed_stage_label
        ? `Confirmed as ${c.confirmed_stage_label}`
          + (c.confirmed_stage != null ? ` (stage ${c.confirmed_stage})` : "")
          + (c.clinician_notes ? ` — ${c.clinician_notes}` : "")
        : reviewed ? "Confirmed without a recorded stage." : "Staged during clinician review.",
      at: c.confirmed_at,
      state: reviewed ? "done" : "waiting",
    });

    if (c.referred_to_facility_id) {
      steps.push({
        key: "referral",
        label: "Referred on",
        detail: `Sent to ${target || "another facility"}`
          + (c.referral_urgency ? ` · ${c.referral_urgency}` : "")
          + (c.referral_summary ? ` — ${c.referral_summary}` : ""),
        at: c.referred_at,
        state: "done",
      });
      steps.push({
        key: "acceptance",
        label: "Accepted by receiving facility",
        detail: c.status === "registered"
          ? `${target || "The receiving facility"} accepted the case.`
          : `Waiting for ${target || "the receiving facility"} to accept.`,
        at: c.accepted_at,
        state: c.status === "registered" ? "done" : "current",
      });
    }

    steps.push({
      key: "registration",
      label: "Registered at a facility",
      detail: c.status === "registered"
        ? `Case ID ${opts.caseCode || "issued"} at ${target || facility}.`
        : reviewed
          ? "No Case ID yet — the facility must keep the case or accept the referral."
          : "A Case ID is issued once the case is confirmed and kept or accepted.",
      at: c.status === "registered" ? c.accepted_at || c.confirmed_at : null,
      state: c.status === "registered" ? "done" : reviewed ? "current" : "waiting",
    });
  }

  return steps;
};

/** Case IDs of the beneficiaries created from confirmed case-search cases. */
export const useCaseBeneficiaries = (cases: PotentialCaseRow[]) => {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const ids = useMemo(
    () => Array.from(new Set(cases.map((c) => c.beneficiary_id).filter(Boolean) as string[])).sort(),
    [cases],
  );
  const key = ids.join(",");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!ids.length) { setCodes({}); return; }
      const { data } = await db.from("beneficiaries").select("id,case_id").in("id", ids);
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const r of (data as { id: string; case_id: string }[]) || []) map[r.id] = r.case_id;
      setCodes(map);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return codes;
};

/**
 * Resolves the CDD who found a beneficiary, and the facility they were first
 * identified at, for display on the beneficiary record.
 */
export const useCddSource = (cddId?: string | null, facilityId?: string | null) => {
  const [cdd, setCdd] = useState<{ full_name: string; cdd_code: string | null; community: string | null } | null>(null);
  const [facility, setFacility] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (cddId) {
        const { data } = await db.from("mmdp_cdds")
          .select("full_name, cdd_code, community").eq("id", cddId).maybeSingle();
        if (alive) setCdd((data as never) || null);
      } else if (alive) setCdd(null);

      if (facilityId) {
        const { data } = await db.from("health_facilities")
          .select("name").eq("id", facilityId).maybeSingle();
        if (alive) setFacility((data as { name?: string } | null)?.name || null);
      } else if (alive) setFacility(null);
    })();
    return () => { alive = false; };
  }, [cddId, facilityId]);

  return { cdd, facility };
};
