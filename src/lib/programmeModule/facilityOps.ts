// Facility dashboard data, referral inbox and beneficiary deletion approvals.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BeneficiaryReferralRow, BeneficiaryRow } from "./types";

export interface DeleteRequestRow {
  id: string;
  beneficiary_id: string;
  project_id: string;
  beneficiary_name: string;
  case_id: string | null;
  reason: string | null;
  status: "pending" | "approved" | "declined";
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

/** Everything happening at one facility: its beneficiaries and referrals. */
export const useFacilityDashboard = (facilityId?: string) => {
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRow[]>([]);
  const [incoming, setIncoming] = useState<BeneficiaryReferralRow[]>([]);
  const [outgoing, setOutgoing] = useState<BeneficiaryReferralRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!facilityId) {
      setBeneficiaries([]); setIncoming([]); setOutgoing([]);
      return;
    }
    setLoading(true);
    const [b, inc, out] = await Promise.all([
      supabase.from("beneficiaries").select("*").eq("facility_id", facilityId)
        .order("created_at", { ascending: false }).limit(500),
      supabase.from("beneficiary_referrals").select("*").eq("to_facility_id", facilityId)
        .order("referral_date", { ascending: false }).limit(300),
      supabase.from("beneficiary_referrals").select("*").eq("from_facility_id", facilityId)
        .order("referral_date", { ascending: false }).limit(300),
    ]);
    setBeneficiaries((b.data as unknown as BeneficiaryRow[]) || []);
    setIncoming((inc.data as unknown as BeneficiaryReferralRow[]) || []);
    setOutgoing((out.data as unknown as BeneficiaryReferralRow[]) || []);
    setLoading(false);
  }, [facilityId]);

  useEffect(() => { void load(); }, [load]);

  // Live refresh so a focal person sees a referral the moment it is recorded.
  useEffect(() => {
    if (!facilityId) return;
    const ch = supabase
      .channel(`facility-dash-${facilityId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes" as never,
        { event: "*", schema: "public", table: "beneficiary_referrals" } as never,
        () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [facilityId, load]);

  return { beneficiaries, incoming, outgoing, loading, reload: load };
};

export const setReferralStatus = async (referralId: string, status: string) => {
  const { error } = await supabase
    .from("beneficiary_referrals")
    .update({ status } as never)
    .eq("id", referralId);
  if (error) throw error;
};

/** Outcomes a receiving facility can record against an assigned referral. */
export const REFERRAL_OUTCOMES = [
  { value: "pending", label: "Awaiting visit" },
  { value: "attended", label: "Patient attended" },
  { value: "treated", label: "Treated" },
  { value: "referred_on", label: "Referred on" },
  { value: "not_attended", label: "Did not attend" },
  { value: "lost_to_followup", label: "Lost to follow-up" },
] as const;

export const REFERRAL_OUTCOME_LABEL: Record<string, string> =
  Object.fromEntries(REFERRAL_OUTCOMES.map((o) => [o.value, o.label]));

/** Outcomes that close the referral loop. */
export const CLOSED_OUTCOMES = ["treated", "referred_on", "lost_to_followup"];

export interface ReferralOutcomeInput {
  outcome: string;
  outcome_notes?: string;
  followup_date?: string;
  followup_time?: string;
  followup_location?: string;
  status?: string;
}

export const saveReferralOutcome = async (referralId: string, input: ReferralOutcomeInput) => {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("beneficiary_referrals")
    .update({
      outcome: input.outcome,
      outcome_notes: input.outcome_notes || null,
      followup_date: input.followup_date || null,
      followup_time: input.followup_time || null,
      followup_location: input.followup_location || null,
      outcome_recorded_by: auth.user?.id ?? null,
      outcome_recorded_at: new Date().toISOString(),
      ...(input.status ? { status: input.status } : {}),
    } as never)
    .eq("id", referralId);
  if (error) throw error;
};

/** Deletion requests raised on a project's beneficiaries. */
export const useDeleteRequests = (projectId?: string) => {
  const [requests, setRequests] = useState<DeleteRequestRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setRequests([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("beneficiary_delete_requests" as never)
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    setRequests((data as unknown as DeleteRequestRow[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  return { requests, loading, reload: load };
};

/** True when the signed-in user may approve deletions on this project. */
export const useCanApproveDeletion = (projectId?: string) => {
  const [can, setCan] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!projectId) { setCan(false); return; }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { if (!cancelled) setCan(false); return; }
      const { data } = await supabase.rpc("can_approve_beneficiary_delete" as never, {
        _user_id: auth.user.id, _project_id: projectId,
      } as never);
      if (!cancelled) setCan(Boolean(data));
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  return can;
};

export const requestBeneficiaryDeletion = async (args: {
  beneficiary: BeneficiaryRow;
  reason: string;
}) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You must be signed in.");
  const { error } = await supabase.from("beneficiary_delete_requests" as never).insert({
    beneficiary_id: args.beneficiary.id,
    project_id: args.beneficiary.project_id,
    beneficiary_name: args.beneficiary.full_name,
    case_id: args.beneficiary.case_id,
    reason: args.reason || null,
    requested_by: auth.user.id,
  } as never);
  if (error) throw error;
};

export const decideDeleteRequest = async (requestId: string, approve: boolean, note?: string) => {
  const { error } = await supabase.rpc("decide_beneficiary_delete_request" as never, {
    _request_id: requestId, _approve: approve, _note: note || null,
  } as never);
  if (error) throw error;
};
