import { describe, expect, it } from "vitest";
import { ASSESSMENT_SECTIONS, buildShortlist, scoreLivelihood } from "./livelihood";
import { livelihoodDisability } from "./livelihoodDisability";
import { gateFromAssessment, graduationOverview, GRADUATION_STAGES, stageProgress } from "./graduation";
import type { BeneficiaryRow } from "./types";

const beneficiary = (profile: Record<string, unknown> = {}, id = "a") => ({ id, full_name: id, case_id: id, profile, lga: "Kano" } as BeneficiaryRow);
const full = Object.fromEntries(ASSESSMENT_SECTIONS.flatMap(s => s.fields.filter(f => f.type !== "text").map(f => [f.name, f.type === "number" ? f.max : f.options?.[0]?.value])));
const score = (profile = {}, answers = full, id = "a") => scoreLivelihood({ beneficiary: beneficiary(profile, id), answers });

describe("livelihood evidence and selection", () => {
  it("uses current registered vulnerability factors alongside assessment answers", () => {
    const poor = score({ vulnerability_factors: ["Extremely poor/vulnerable household", "Person requiring caregiver support"] });
    expect(poor.reasons).toContain("Registered as extremely vulnerable.");
    expect(poor.reasons).toContain("Registered need for caregiver support.");
  });
  it("classifies disability from actual WG answers, not the stored summary", () => {
    expect(livelihoodDisability({ wg_ss: { answers: { seeing: "a_lot" }, hasDisability: false } }).hasDisability).toBe(true);
    expect(livelihoodDisability({ wg_ss: { answers: { seeing: "some" }, hasDisability: true } }).hasDisability).toBe(false);
    expect(livelihoodDisability({ wg_ss: { answers: { walking: "cannot" } } }).domains).toEqual(["Walking"]);
  });
  it("recognizes registered disability without treating suspected disability as confirmed", () => {
    expect(score({ disability_status: "Disability identified" }).disability).toBe(true);
    expect(score({ disability_status: "No disability reported" }).disability).toBe(false);
    expect(score({ disability_status: "Suspected disability", disability_type: ["Visual"] }).disability).toBe(false);
    expect(score({ vulnerability_factors: ["Person with disability"] }).disability).toBe(true);
  });
  it("requires explicit consent and complete vulnerability assessment", () => {
    const partial = score({}, { consent: "yes", income_monthly: "none" });
    expect(partial.assessmentComplete).toBe(false);
    expect(gateFromAssessment(partial, null, "t").status).toBe("mapped");
    expect(buildShortlist([partial], { target: 1 }).selected).toHaveLength(0);
    expect(score({}, { ...full, consent: undefined }).consentGiven).toBe(false);
  });
  it("holds protection concerns for review in both gate and shortlist", () => {
    const r = score({}, { ...full, protection_risk: "yes" });
    expect(gateFromAssessment(r, null, "t").status).toBe("not_selected");
    expect(buildShortlist([r], { target: 1 }).selected).toHaveLength(0);
  });
  it("prioritizes vulnerability rather than readiness or preference", () => {
    const base = score({}, { ...full, protection_risk: "no" });
    const high = { ...base, beneficiaryId: "high", vulnerability: 90, preferenceFit: 0 };
    const low = { ...base, beneficiaryId: "lower", vulnerability: 80, preferenceFit: 100 };
    expect(buildShortlist([low, high], { target: 1 }).selected[0]?.result.beneficiaryId).toBe("high");
  });
  it("uses WG evidence for the disability inclusion floor", () => {
    const a = { ...score({}, { ...full, protection_risk: "no" }, "a"), vulnerability: 95 };
    const b = { ...score({ wg_ss: { answers: { hearing: "cannot" } } }, { ...full, protection_risk: "no" }, "b"), vulnerability: 80 };
    expect(buildShortlist([a, b], { target: 1, quotaDisabilityPct: 100 }).selected[0]?.result.beneficiaryId).toBe("b");
  });
  it("links selected records to the same real livelihood services in Overview", () => {
    const b = beneficiary({ graduation: { status: "selected" } });
    const services = [{ beneficiary_id: "a", component_key: "livelihood", service_name: GRADUATION_STAGES[0].toUpperCase(), service_date: "2026-10-20" },
      { beneficiary_id: "a", component_key: "mental_health", service_name: GRADUATION_STAGES[1] }];
    expect(stageProgress(services).filter(p => p.count > 0)).toHaveLength(1);
    const overview = graduationOverview([b], services);
    expect(overview.participants[0]?.completed).toBe(1);
    expect(overview.totals.selected).toBe(1);
    expect(overview.totals.avgPercent).toBe(10);
  });
});