import { describe, expect, it } from "vitest";
import { analysePlanning, planningDistance, type AnalysisEntry } from "../planningAnalysis";
import { targetPopulation } from "../targetPopulation";
const target = (e: AnalysisEntry) => targetPopulation(e, ["children_5_14"]);
describe("evidence-supported planning analyses", () => {
  it("counts access/security exposure as a union, not twice", () => {
    const a = analysePlanning([{ estimated_total_population: 100, accessibility: "hard_to_reach", security_clearance: "not_cleared", estimated_children_5_14: 20 }], target);
    expect(a.exposedPopulation).toBe(100); expect(a.exposedRecords).toBe(1); expect(a.eligible).toBe(20);
    expect(a.matrix[2].cells[2].population).toBe(100);
  });
  it("keeps missing population and unknown access separate from measured zero", () => {
    const a = analysePlanning([{ estimated_total_population: 0 }, {}], target);
    expect(a.missingPopulation).toBe(1); expect(a.unknownConditions).toBe(2); expect(a.exposedPopulation).toBe(0);
    expect(a.distance[4].records).toBe(2);
  });
  it("separates identically named facilities across wards and counts only row roster mentions", () => {
    const a = analysePlanning([{ ward: "A", flhf_name: "Clinic", cdd_names: "A, A, B", estimated_children_5_14: 30 }, { ward: "B", flhf_name: "Clinic", cdd_names: "A", estimated_children_5_14: 10 }], target);
    expect(a.facilities).toHaveLength(2); expect(a.facilities[0].rosterMentions).toBe(2); expect(a.facilities[0].target).toBe(30);
  });
  it("uses corrected GPS for straight-line distance instead of stale distance", () => {
    const d = planningDistance({ community_lat_override: 12, community_lng_override: 9, community_latitude: 10, community_longitude: 7, flhf_latitude: 12, flhf_longitude: 9, community_distance_to_flhf_km: 40 });
    expect(d).toEqual({ km: 0, source: "GPS straight-line" });
  });
  it("keeps recorded zero distance and rejects negative measurements", () => {
    expect(planningDistance({ community_distance_to_flhf_km: 0 })).toEqual({ km: 0, source: "Recorded" });
    expect(planningDistance({ community_distance_to_flhf_km: -5 })).toBeNull();
  });
  it("updates totals when changed records replace prior data", () => {
    const before = analysePlanning([{ id: "one", estimated_total_population: 100 }], target);
    const after = analysePlanning([{ id: "one", estimated_total_population: 140 }], target);
    expect(before.population).toBe(100); expect(after.population).toBe(140); expect(after.records).toBe(1);
  });
  it("distinguishes incomplete contacts without claiming they are working", () => {
    const a = analysePlanning([{ community_leader_name: "Leader", community_leader_phone: "  ", estimated_total_population: 100 }, { community_leader_phone: "123", estimated_total_population: 20 }], target);
    expect(a.contacts[0].nameOnly).toBe(1); expect(a.contacts[0].phoneOnly).toBe(1); expect(a.contacts[0].both).toBe(0); expect(a.contacts[0].incompletePopulation).toBe(120);
  });
  it("preserves missing planning vintage and population source", () => {
    const a = analysePlanning([{}, { year_of_microplanning: 2025, population_source: "Census", estimated_total_population: 100 }], target);
    expect(a.provenance.find(p => p.source === "Not recorded")?.year).toBe("Not recorded");
    expect(a.provenance.find(p => p.source === "Census")?.population).toBe(100);
  });
});