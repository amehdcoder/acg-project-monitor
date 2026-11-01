import { describe, expect, it } from "vitest";
import { dustBand, dustOverlap, facilityReporting, morbidityCount, parseEnvironmentalEvidence } from "../environment";
import snapshot from "@/assets/eye-report/jigawa-environment.json";
import { emptySummary, type EyeReportRow } from "../definition";

const dust = { type: "Feature", properties: { kind: "dust", name: "Survey zone", source: "Field survey", observed_at: "2026-11-01" }, geometry: { type: "Polygon", coordinates: [[[9,11],[10,11],[10,12],[9,12],[9,11]]] } };
describe("Environmental overlay evidence", () => {
  it("loads real attributed Jigawa records and dated dust model observations", () => {
    const data = parseEnvironmentalEvidence(snapshot);
    expect(data.features.filter(f=>f.properties.kind==="water")).toHaveLength(10574);
    expect(data.features.filter(f=>f.properties.kind==="dust")).toHaveLength(29);
    expect(data.features.filter(f=>f.properties.kind==="water").every(f=>f.properties.observed_at.startsWith("2015-") && f.properties.source.includes("Federal Ministry"))).toBe(true);
    expect(data.features.filter(f=>f.properties.kind==="dust").every(f=>f.properties.value !== undefined && f.properties.observed_at==="2026-10-31")).toBe(true);
    expect(dustBand(99)).toBe("eye-gold"); expect(dustBand(150)).toBe("eye-rose");
  });
  it("accepts sourced dust zones and evaluates spatial overlap without inventing risk", () => {
    const data = parseEnvironmentalEvidence({ type: "FeatureCollection", features: [dust] });
    expect(dustOverlap(11.5,9.5,data.features)).toHaveLength(1);
    expect(dustOverlap(13,9.5,data.features)).toHaveLength(0);
  });
  it("rejects environmental evidence without provenance and valid geometry", () => {
    for (const f of [{ ...dust, properties: { ...dust.properties, source: "" } }, { ...dust, geometry: { type: "Point", coordinates: [9,11] } }, { ...dust, geometry: { type: "Polygon", coordinates: [[[9,11],[10,11],[10,12],[9,12]]] } }]) {
      expect(() => parseEnvironmentalEvidence({ type: "FeatureCollection", features: [f] })).toThrow();
    }
  });
  it("maps Cataract and TT screened counts separately with the sex filter", () => {
    const summary = emptySummary(); summary.screen.cataract = { m: 5, f: 8 }; summary.screen.tt = { m: 2, f: 3 };
    summary.ages["screen.cataract"].a15_39 = { m: 5, f: 8 }; summary.ages["screen.tt"].a15_39 = { m: 2, f: 3 };
    const report = { summary } as EyeReportRow;
    expect(morbidityCount(report,"cataract","all")).toBe(13);
    expect(morbidityCount(report,"tt","f")).toBe(3);
  });
  it("reports unique facility reporting days over the observed period, not population incidence", () => {
    const row = { facility_name: "Clinic", report_date: "2026-11-01", summary: emptySummary() } as EyeReportRow;
    const rows = [row, { ...row, id: "duplicate" }, { ...row, report_date: "2026-11-03" }];
    expect(facilityReporting(row,rows,"all")).toMatchObject({ days: 2, span: 3, rate: 2 / 3 * 100 });
  });
});