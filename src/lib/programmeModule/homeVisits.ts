// Home visit tracing — the loop that closes the follow-up risk prediction.
//
// A visit is dispatched from the risk register, carried out by a community
// directed distributor (CDD), a facility focal person or a health worker, and
// the outcome is reported back here. Reporting an outcome writes straight onto
// the beneficiary record: a re-booked appointment becomes the person's next
// follow-up date, and a person who has moved, declined or died is marked so the
// register stops chasing them.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface HomeVisitRow {
  id: string;
  project_id: string;
  module_id: string | null;
  beneficiary_id: string;
  assigned_to: string | null;
  assigned_name: string | null;
  risk_score: number | null;
  risk_band: string | null;
  reasons: string[];
  due_date: string | null;
  status: string;
  outcome: string | null;
  outcome_notes: string | null;
  visited_at: string | null;
  visitor_role: string | null;
  visitor_name: string | null;
  cdd_id: string | null;
  visited_on: string | null;
  found_at_home: boolean | null;
  next_appointment_date: string | null;
  action_taken: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export const HOME_VISIT_COLUMNS =
  "id,project_id,module_id,beneficiary_id,assigned_to,assigned_name,risk_score,risk_band," +
  "reasons,due_date,status,outcome,outcome_notes,visited_at,visitor_role,visitor_name," +
  "cdd_id,visited_on,found_at_home,next_appointment_date,action_taken,latitude,longitude,created_at";

/** Who carried the visit out. */
export const VISITOR_ROLES = [
  { value: "cdd", label: "Community directed distributor (CDD)" },
  { value: "focal_person", label: "Facility focal person" },
  { value: "chew", label: "Community health extension worker" },
  { value: "other", label: "Other team member" },
];

export const VISITOR_ROLE_LABEL: Record<string, string> =
  Object.fromEntries(VISITOR_ROLES.map((r) => [r.value, r.label]));

export interface OutcomeDef {
  value: string;
  label: string;
  /** Does this outcome expect a new appointment date? */
  needsAppointment: boolean;
  /** Status to place on the beneficiary record, if any. */
  beneficiaryStatus?: string;
  tone: "good" | "warn" | "bad";
}

export const VISIT_OUTCOMES: OutcomeDef[] = [
  { value: "seen_rebooked", label: "Seen at home — appointment re-booked", needsAppointment: true, tone: "good" },
  { value: "seen_attended", label: "Seen — already attended the facility", needsAppointment: true, tone: "good" },
  { value: "seen_treated_home", label: "Seen — care given at home", needsAppointment: true, tone: "good" },
  { value: "not_found", label: "Not found at home — call back", needsAppointment: false, tone: "warn" },
  { value: "travelled", label: "Travelled — expected back later", needsAppointment: true, tone: "warn" },
  { value: "relocated", label: "Has relocated out of the area", needsAppointment: false, beneficiaryStatus: "transferred", tone: "bad" },
  { value: "refused", label: "Declined further care", needsAppointment: false, beneficiaryStatus: "refused", tone: "bad" },
  { value: "deceased", label: "Reported deceased", needsAppointment: false, beneficiaryStatus: "deceased", tone: "bad" },
];

export const OUTCOME_LABEL: Record<string, string> =
  Object.fromEntries(VISIT_OUTCOMES.map((o) => [o.value, o.label]));

export const outcomeDef = (value?: string | null) =>
  VISIT_OUTCOMES.find((o) => o.value === value) || null;

export const VISIT_STATUSES = [
  { value: "dispatched", label: "Dispatched" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Visit reported" },
  { value: "cancelled", label: "Cancelled" },
];

/** Visits for one beneficiary, newest first. */
export const useBeneficiaryHomeVisits = (beneficiaryId?: string) => {
  const [visits, setVisits] = useState<HomeVisitRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!beneficiaryId) { setVisits([]); return; }
    setLoading(true);
    const { data } = await db.from("beneficiary_home_visits")
      .select(HOME_VISIT_COLUMNS)
      .eq("beneficiary_id", beneficiaryId)
      .order("created_at", { ascending: false })
      .limit(100);
    setVisits(((data as HomeVisitRow[]) || []).map((v) => ({
      ...v, reasons: Array.isArray(v.reasons) ? v.reasons : [],
    })));
    setLoading(false);
  }, [beneficiaryId]);

  useEffect(() => { void load(); }, [load]);

  return { visits, loading, reload: load };
};

export interface VisitOutcomeInput {
  visitId: string;
  beneficiaryId: string;
  projectId: string;
  visitorRole: string;
  visitorName: string;
  cddId?: string | null;
  visitedOn: string;
  foundAtHome: boolean;
  outcome: string;
  nextAppointmentDate?: string | null;
  actionTaken?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Records the outcome of a home visit and pushes the consequences onto the
 * beneficiary record, so nobody predicted to be at risk is left without a
 * next step.
 */
export const reportVisitOutcome = async (input: VisitOutcomeInput) => {
  const { data: auth } = await supabase.auth.getUser();
  const def = outcomeDef(input.outcome);

  const { error } = await db.from("beneficiary_home_visits").update({
    status: "completed",
    outcome: input.outcome,
    outcome_notes: input.notes || null,
    visitor_role: input.visitorRole,
    visitor_name: input.visitorName || null,
    cdd_id: input.cddId || null,
    visited_on: input.visitedOn,
    visited_at: new Date().toISOString(),
    found_at_home: input.foundAtHome,
    next_appointment_date: input.nextAppointmentDate || null,
    action_taken: input.actionTaken || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    reported_by: auth.user?.id || null,
  }).eq("id", input.visitId);
  if (error) throw error;

  // Carry the result back to the person's record.
  const patch: Record<string, unknown> = {};
  if (input.nextAppointmentDate) patch.next_follow_up_date = input.nextAppointmentDate;
  if (def?.beneficiaryStatus) patch.status = def.beneficiaryStatus;
  if (Object.keys(patch).length) {
    const { error: bErr } = await db.from("beneficiaries").update(patch).eq("id", input.beneficiaryId);
    if (bErr) throw bErr;
  }

  // Keep the visit on the care timeline alongside clinical services.
  await db.from("beneficiary_services").insert({
    project_id: input.projectId,
    beneficiary_id: input.beneficiaryId,
    service_type: "home_visit",
    service_name: `Home visit — ${VISITOR_ROLE_LABEL[input.visitorRole] || "team member"}`,
    service_date: input.visitedOn,
    provider_name: input.visitorName || null,
    result: OUTCOME_LABEL[input.outcome] || input.outcome,
    notes: [input.actionTaken, input.notes].filter(Boolean).join(" — ") || null,
    next_follow_up_date: input.nextAppointmentDate || null,
    created_by: auth.user?.id,
  });
};

/** Visits still owed a report, oldest due first. */
export const isVisitOpen = (v: HomeVisitRow) =>
  v.status === "dispatched" || v.status === "in_progress";

/** Plain-language line for a reported visit. */
export const visitSummary = (v: HomeVisitRow) => {
  if (isVisitOpen(v)) {
    return v.due_date
      ? `Awaiting report — due ${new Date(v.due_date).toLocaleDateString()}`
      : "Awaiting report";
  }
  if (v.status === "cancelled") return "Visit cancelled";
  const who = v.visitor_name
    ? `${v.visitor_name} (${VISITOR_ROLE_LABEL[v.visitor_role || ""] || "team member"})`
    : VISITOR_ROLE_LABEL[v.visitor_role || ""] || "Team member";
  const when = v.visited_on ? new Date(v.visited_on).toLocaleDateString() : "";
  return `${OUTCOME_LABEL[v.outcome || ""] || "Reported"} · ${who}${when ? ` · ${when}` : ""}`;
};
