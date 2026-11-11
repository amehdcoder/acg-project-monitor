import { describe, it, expect } from "vitest";
import { refreshRiskCache, compareRisks, riskInRange } from "../riskRanking";
describe("local risk rankings", () => {
  const entry = { id: "a", security_clearance: "cleared", accessibility: "accessible", cdd_names: "Amina" };
  it("updates each changed risk factor immediately from cached inputs", () => {
    const cache = refreshRiskCache([entry]);
    expect(refreshRiskCache([{ ...entry, security_clearance: "not_cleared" }], cache).a.risk.score).toBe(50);
    expect(refreshRiskCache([{ ...entry, accessibility: "inaccessible" }], cache).a.risk.score).toBe(30);
    expect(refreshRiskCache([{ ...entry, cdd_names: "none" }], cache).a.risk.score).toBe(20);
    expect(refreshRiskCache([entry], cache).a).toBe(cache.a);
  });
  it("filters inclusive ranges without treating unknown inputs as scores", () => {
    const risk = refreshRiskCache([{ ...entry, security_clearance: "partial" }]).a.risk;
    expect(riskInRange(risk, 25, 49)).toBe(true);
    expect(riskInRange(risk, 0, 24)).toBe(false);
    const unknown = refreshRiskCache([{ id: "b" }]).b.risk;
    expect(riskInRange(unknown, 0, 100)).toBe(false);
    expect(riskInRange(unknown, 0, 100, true)).toBe(true);
  });
  it("ranks confirmed scores descending and places incomplete evidence last", () => {
    const values = refreshRiskCache([entry, { ...entry, id: "b", security_clearance: "not_cleared", accessibility: "inaccessible", cdd_names: "none" }, { id: "c" }]);
    expect(Object.keys(values).sort((a,b) => compareRisks(values[a].risk, values[b].risk))).toEqual(["b", "a", "c"]);
    expect(refreshRiskCache([entry], values).b).toBeUndefined();
  });
});