// Graduation Approach pathway — tracks each beneficiary household from mapping
// through verification and selection, then across the delivery stages.
import { componentKind, PRIORITY_LIVELIHOOD_SERVICES } from "./componentOutcomes";

export type SelectionStatus = "mapped" | "verified" | "selected" | "not_selected";

export interface GraduationGate {
  status: SelectionStatus;
  mapped_at?: string;
  verified_at?: string;
  decided_at?: string;
  reason?: string;
  updated_by?: string;
  vulnerability_score?: number;
  vulnerability_band?: string;
  evidence_reasons?: string[];
  opportunity_id?: string;
}

export const SELECTION_STEPS: { value: SelectionStatus; label: string; hint: string }[] = [
  { value: "mapped", label: "Mapped", hint: "Household identified during community mapping" },
  { value: "verified", label: "Verified", hint: "Eligibility confirmed by ground verification" },
  { value: "selected", label: "Selected", hint: "Enrolled onto the Graduation pathway" },
];

/** Delivery stages after selection (the priority services minus the entry stage). */
export const GRADUATION_STAGES = PRIORITY_LIVELIHOOD_SERVICES.slice(1);

export const readGate = (profile: Record<string, unknown> | null | undefined): GraduationGate | null => {
  const g = profile?.graduation as GraduationGate | undefined;
  return g && typeof g === "object" && g.status ? g : null;
};

export interface StageProgress {
  stage: string;
  count: number;
  lastDate: string | null;
}

/** Progress per stage, counted from recorded services with matching names. */
export const stageProgress = (
  services: { service_name?: string | null; service_date?: string | null; component_key?: string | null }[],
): StageProgress[] =>
  GRADUATION_STAGES.map((stage) => {
    const hits = services.filter((s) => (!s.component_key || componentKind(s.component_key) === "livelihood") && (s.service_name || "").trim().toLowerCase() === stage.toLowerCase());
    const lastDate = hits.map((h) => h.service_date || "").filter(Boolean).sort().pop() || null;
    return { stage, count: hits.length, lastDate };
  });

export const pathwayPercent = (progress: StageProgress[]) =>
  progress.length ? Math.round((progress.filter((p) => p.count > 0).length / progress.length) * 100) : 0;

export interface FunnelStep { key: string; label: string; phase: string; count: number; conversion: number | null }
export interface GraduationParticipant { id: string; name: string; lga: string; status: SelectionStatus | "unmapped"; completed: number; percent: number; nextStage: string | null; lastActivity: string | null }

// Phase for each delivery stage, in GRADUATION_STAGES order.
const STAGE_PHASES = ["Social empowerment", "Social empowerment", "Skills & training", "Skills & training", "Skills & training", "Consumption support", "Enterprise & capital", "Enterprise & capital", "Savings & markets", "Savings & markets"];
const PHASE: Record<string, string> = Object.fromEntries(GRADUATION_STAGES.map((s, i) => [s, STAGE_PHASES[i] ?? "Delivery"]));

/** Sequential Graduation funnel: selection gate, then each delivery stage, then full completion. */
export function graduationOverview(
  beneficiaries: { id: string; full_name: string; lga: string | null; profile?: unknown }[],
  services: { beneficiary_id: string; service_name?: string | null; service_date?: string | null; component_key?: string | null }[],
) {
  const byBen = new Map<string, typeof services>();
  for (const s of services) {
    if (s.component_key && componentKind(s.component_key) !== "livelihood") continue;
    byBen.set(s.beneficiary_id, [...(byBen.get(s.beneficiary_id) ?? []), s]);
  }
  const participants: GraduationParticipant[] = beneficiaries.flatMap(b => {
    const gate = readGate(b.profile as Record<string, unknown>);
    const own = byBen.get(b.id) ?? [];
    if (!gate && !own.length) return [];
    const progress = stageProgress(own);
    const completed = progress.filter(p => p.count > 0).length;
    const dates = own.map(s => s.service_date || "").filter(Boolean).sort();
    return [{ id: b.id, name: b.full_name, lga: b.lga || "Not recorded", status: gate?.status ?? "unmapped", completed, percent: pathwayPercent(progress), nextStage: progress.find(p => p.count === 0)?.stage ?? null, lastActivity: dates.pop() ?? null }];
  });
  const reached = (fn: (p: GraduationParticipant) => boolean) => participants.filter(fn).length;
  const rank = { unmapped: 0, mapped: 1, verified: 2, selected: 3, not_selected: 2 } as const;
  const counts: { key: string; label: string; phase: FunnelStep["phase"]; count: number }[] = [
    { key: "mapped", label: "Mapped", phase: "Selection", count: reached(p => rank[p.status] >= 1) },
    { key: "verified", label: "Verified", phase: "Selection", count: reached(p => rank[p.status] >= 2) },
    { key: "selected", label: "Selected", phase: "Selection", count: reached(p => p.status === "selected") },
    ...GRADUATION_STAGES.map(stage => ({ key: stage, label: stage, phase: PHASE[stage], count: participants.filter(p => p.status === "selected" && (stageProgress((byBen.get(p.id) ?? [])).find(x => x.stage === stage)?.count ?? 0) > 0).length })),
    { key: "graduated", label: "All stages completed", phase: "Graduation", count: reached(p => p.status === "selected" && p.completed === GRADUATION_STAGES.length) },
  ];
  const funnel: FunnelStep[] = counts.map((c, i) => ({ ...c, conversion: i === 0 ? null : (i <= 3 ? counts[i - 1].count : counts[2].count) ? Math.round(100 * c.count / (i <= 3 ? counts[i - 1].count : counts[2].count)) : null }));
  const selected = participants.filter(p => p.status === "selected");
  const lgas = [...new Set(participants.map(p => p.lga))].sort().map(lga => {
    const rows = participants.filter(p => p.lga === lga); const sel = rows.filter(p => p.status === "selected");
    return { lga, mapped: rows.filter(p => rank[p.status] >= 1).length, selected: sel.length, avgPercent: sel.length ? Math.round(sel.reduce((a, p) => a + p.percent, 0) / sel.length) : 0, graduated: sel.filter(p => p.completed === GRADUATION_STAGES.length).length };
  });
  return {
    participants, funnel, lgas,
    totals: { tracked: participants.length, selected: selected.length, notSelected: reached(p => p.status === "not_selected"), unmapped: reached(p => p.status === "unmapped"), avgPercent: selected.length ? Math.round(selected.reduce((a, p) => a + p.percent, 0) / selected.length) : 0, graduated: counts[counts.length - 1].count },
  };
}

/** Selection decided by the Needs Assessment: completing it maps & verifies the
 * household; extreme/high vulnerability with consent selects it. */
export function gateFromAssessment(
  r: { vulnerability: number; band: "extreme" | "high" | "moderate" | "low"; consentGiven: boolean; protectionConcern?: boolean; assessmentComplete?: boolean; reasons?: string[] },
  prev: GraduationGate | null, now: string, userId?: string,
): GraduationGate {
  const selected = r.consentGiven && !r.protectionConcern && r.assessmentComplete !== false && (r.band === "extreme" || r.band === "high");
  const reason = selected ? undefined
    : !r.consentGiven ? "Did not consent to the livelihood assessment"
    : r.protectionConcern ? "Safeguarding concern — review before enrolment"
    : r.assessmentComplete === false ? "Complete all vulnerability domains before confirming selection"
    : `Needs Assessment score ${r.vulnerability}/100 (${r.band}) is below the selection threshold`;
  return {
    ...(prev || {}), status: r.assessmentComplete === false ? "mapped" : selected ? "selected" : "not_selected",
    mapped_at: prev?.mapped_at || now,
    verified_at: r.assessmentComplete === false ? prev?.verified_at : prev?.verified_at || now,
    decided_at: r.assessmentComplete === false ? prev?.decided_at : now,
    reason, updated_by: userId,
    vulnerability_score: r.vulnerability, vulnerability_band: r.band, evidence_reasons: r.reasons,
  };
}
