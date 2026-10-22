// Per-component beneficiary journey: derives the visible care pathway from the
// actual record, linked case-search case, services, referrals and Graduation
// gate. Components without evidence of participation are intentionally absent.

import type {
  BeneficiaryReferralRow,
  BeneficiaryServiceRow,
  ProgrammeComponent,
} from "./types";
import { componentKind } from "./componentOutcomes";
import { GRADUATION_STAGES, readGate, stageProgress } from "./graduation";
import type { PotentialCaseRow } from "./cddCaseSearch";

export interface JourneyBeneficiary {
  case_id: string;
  status: string;
  created_at: string;
  profile?: Record<string, unknown> | null;
}

export type JourneyStepKey = "case_search" | "registration" | "care" | "completion" | "outcome";
export type JourneyStepState = "done" | "current" | "waiting";

export interface ComponentJourneyStep {
  key: JourneyStepKey;
  label: string;
  detail: string;
  at: string | null;
  state: JourneyStepState;
}

export interface ComponentJourney {
  component: ProgrammeComponent;
  percent: number;
  completedSteps: number;
  currentStep: string;
  latestOutcome: string | null;
  steps: ComponentJourneyStep[];
}

const FINAL_PROGRAMME_STATUSES = new Set([
  "completed planned intervention",
  "graduated",
  "referred",
  "lost to follow-up",
  "withdrawn",
  "completed",
  "exited",
]);

const COMPLETION_EVIDENCE =
  /completed|complete|successful|success|healed|improved|graduated|objective achieved|normal vision|minimal symptoms|adaptation completed|business active|income increased|treated/i;

const text = (value: unknown) => String(value ?? "").trim();

const latestByDate = <T extends { service_date?: string | null; referral_date?: string | null }>(rows: T[]) =>
  [...rows].sort((a, b) => text(a.service_date || a.referral_date).localeCompare(text(b.service_date || b.referral_date))).pop();

const programmeStatus = (beneficiary: JourneyBeneficiary) =>
  text(beneficiary.profile?.programme_status || beneficiary.status).toLowerCase();

const programmeFinal = (beneficiary: JourneyBeneficiary) =>
  FINAL_PROGRAMME_STATUSES.has(programmeStatus(beneficiary));

const completionHit = (
  component: ProgrammeComponent,
  beneficiary: JourneyBeneficiary,
  services: BeneficiaryServiceRow[],
  referrals: BeneficiaryReferralRow[],
) => {
  if (programmeFinal(beneficiary)) {
    return {
      at: text(beneficiary.profile?.exit_date) || null,
      detail: text(beneficiary.profile?.exit_reason) || "Planned care has been marked complete on the record.",
    };
  }

  const completedReferral = latestByDate(referrals.filter((r) => /completed/i.test(text(r.status))));
  if (completedReferral) {
    return {
      at: completedReferral.referral_date,
      detail: `Referral completed${completedReferral.outcome ? ` — ${completedReferral.outcome}` : ""}.`,
    };
  }

  if (componentKind(component.key, component.label) === "livelihood") {
    const progress = stageProgress(services);
    if (progress.length === GRADUATION_STAGES.length && progress.every((p) => p.count > 0)) {
      return {
        at: progress.map((p) => p.lastDate || "").sort().pop() || null,
        detail: "Every Graduation pathway delivery stage has been recorded.",
      };
    }
  }

  const service = latestByDate(services.filter((s) =>
    COMPLETION_EVIDENCE.test(`${text(s.service_name)} ${text(s.result)}`),
  ));
  return service
    ? { at: service.service_date, detail: text(service.result) || text(service.service_name) }
    : null;
};

const outcomeHit = (
  beneficiary: JourneyBeneficiary,
  services: BeneficiaryServiceRow[],
  referrals: BeneficiaryReferralRow[],
) => {
  const referral = latestByDate(referrals.filter((r) => text(r.outcome)));
  const service = latestByDate(services.filter((s) => text(s.result)));
  const candidates = [
    referral ? { at: referral.referral_date, label: text(referral.outcome) } : null,
    service ? { at: service.service_date, label: text(service.result) } : null,
    programmeFinal(beneficiary) && text(beneficiary.profile?.exit_reason)
      ? { at: text(beneficiary.profile?.exit_date) || null, label: text(beneficiary.profile?.exit_reason) }
      : null,
  ].filter(Boolean) as { at: string | null; label: string }[];
  return candidates.sort((a, b) => text(a.at).localeCompare(text(b.at))).pop() || null;
};

const withSequence = (steps: Omit<ComponentJourneyStep, "state">[]): ComponentJourneyStep[] => {
  const firstOpen = steps.findIndex((s) => !s.at && !s.detail.startsWith("Done"));
  return steps.map((step, index) => ({
    ...step,
    state: firstOpen === -1 || index < firstOpen ? "done" : index === firstOpen ? "current" : "waiting",
  }));
};

/** Build one journey for every component the beneficiary is actually receiving. */
export const componentJourneys = (
  beneficiary: JourneyBeneficiary,
  components: ProgrammeComponent[],
  services: BeneficiaryServiceRow[],
  referrals: BeneficiaryReferralRow[],
  caseSearch?: Pick<PotentialCaseRow, "search_date" | "created_at" | "status" | "confirmed_at" | "accepted_at"> | null,
): ComponentJourney[] =>
  components
    .filter((component) => component.countsTowardsProgress !== false)
    .flatMap((component) => {
      const ownServices = services.filter((s) => s.component_key === component.key);
      const ownReferrals = referrals.filter((r) => r.component_key === component.key);
      const kind = componentKind(component.key, component.label);
      const linkedCase = kind === "mmdp" ? caseSearch : null;
      const graduationGate = kind === "livelihood" ? readGate(beneficiary.profile) : null;
      const participates = ownServices.length > 0 || ownReferrals.length > 0 || !!linkedCase || !!graduationGate;
      if (!participates) return [];

      const firstService = [...ownServices].sort((a, b) => a.service_date.localeCompare(b.service_date))[0];
      const latestService = latestByDate(ownServices);
      const completion = completionHit(component, beneficiary, ownServices, ownReferrals);
      const outcome = completion ? outcomeHit(beneficiary, ownServices, ownReferrals) : null;
      const caseSearchAt = linkedCase?.search_date || linkedCase?.created_at || graduationGate?.mapped_at || null;

      const steps = withSequence([
        {
          key: "case_search",
          label: linkedCase ? "Case search" : graduationGate ? "Mapping" : "Identification",
          detail: linkedCase
            ? "Found through community case search."
            : graduationGate
              ? "Mapped for the Graduation pathway."
              : "Registered directly; no linked community case-search record.",
          at: caseSearchAt || beneficiary.created_at,
        },
        {
          key: "registration",
          label: "Registration",
          detail: `Case ID ${beneficiary.case_id} issued.`,
          at: linkedCase?.accepted_at || beneficiary.created_at,
        },
        {
          key: "care",
          label: "Care in progress",
          detail: ownServices.length
            ? `${ownServices.length} service${ownServices.length === 1 ? "" : "s"} recorded${latestService?.service_name ? `; latest: ${latestService.service_name}` : ""}.`
            : "Awaiting the first recorded service for this component.",
          at: firstService?.service_date || null,
        },
        {
          key: "completion",
          label: "Completion of care",
          detail: completion?.detail || "Awaiting evidence that the planned care is complete.",
          at: completion?.at || null,
        },
        {
          key: "outcome",
          label: "Final outcome",
          detail: outcome?.label || "The final outcome will appear here once completion is recorded.",
          at: outcome?.at || null,
        },
      ]);

      const completedSteps = steps.filter((s) => s.state === "done").length;
      return [{
        component,
        percent: Math.round((completedSteps / steps.length) * 100),
        completedSteps,
        currentStep: steps.find((s) => s.state === "current")?.label || "Journey complete",
        latestOutcome: outcome?.label || null,
        steps,
      }];
    });
