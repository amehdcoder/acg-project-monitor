import { describe, expect, it } from "vitest";
import { gpsFromPosition, normEyeGps } from "../gps";
import { boundaryAt, locatedReports, mapValue, type BoundaryFeature } from "../mapModel";
import { emptySummary, type EyeReportRow } from "../definition";
import { eyeGps } from "../../../../supabase/functions/_shared/eyeGps";
import { readFileSync } from "node:fs";

const gps = { lat: 11.75, lng: 9.33, accuracy: 12, captured_at: "2026-11-01T20:38:00Z" };
describe("Eye reporting GPS evidence", () => {
  it("retains coordinates, accuracy and actual fix time in both intake paths", () => {
    expect(normEyeGps(gps)).toEqual(gps);
    expect(eyeGps(gps)).toEqual(gps);
    expect(gpsFromPosition({ coords: { latitude: gps.lat, longitude: gps.lng, accuracy: 12 }, timestamp: Date.parse(gps.captured_at) } as GeolocationPosition)).toEqual({ ...gps, captured_at: "2026-11-01T20:38:00.000Z" });
  });
  it("never fabricates GPS on historical reports", () => {
    expect(normEyeGps(undefined)).toBeNull(); expect(eyeGps(null)).toBeNull();
    expect(locatedReports([{ id: "old" } as EyeReportRow], [])).toEqual([]);
  });
  it("rejects invalid coordinates and accuracy", () => {
    for (const invalid of [{ ...gps, lat: 91 }, { ...gps, lng: -181 }, { ...gps, accuracy: -1 }, { ...gps, lat: "11" }, { ...gps, captured_at: "invalid" }]) {
      expect(normEyeGps(invalid)).toBeNull(); expect(() => eyeGps(invalid)).toThrow("invalid_eye_gps");
    }
  });
  it("identifies the actual Nigerian State and LGA from coordinates", () => {
    const geo = JSON.parse(readFileSync("public/nigeria-lga.geojson", "utf8"));
    const location = boundaryAt(11.75, 9.33, geo.features);
    expect(location?.properties.state).toBe("Jigawa");
    expect(location?.properties.lga).toBeTruthy();
    expect(boundaryAt(51.5, -0.12, geo.features)).toBeUndefined();
  });
  it("excludes holes when resolving boundaries", () => {
    const feature: BoundaryFeature = { type: "Feature", properties: { state: "State", lga: "LGA" }, geometry: { type: "Polygon", coordinates: [[[0,0],[10,0],[10,10],[0,10],[0,0]], [[2,2],[4,2],[4,4],[2,4],[2,2]]] } };
    expect(boundaryAt(1,1,[feature])).toBe(feature); expect(boundaryAt(3,3,[feature])).toBeUndefined();
  });
  it("distinguishes unassessed outcomes from zero and respects sex counts", () => {
    const summary = emptySummary(); summary.consult.a15_39 = { m: 7, f: 9 };
    const report = { summary, csom: null } as EyeReportRow;
    expect(mapValue(report, "consulted")).toBe(16); expect(mapValue(report, "consulted", "f")).toBe(9);
    expect(mapValue(report, "outcome")).toBeNull();
    expect(mapValue({ ...report, csom: { discharge: { presenting: { good: 0, borderline: 0, poor: 5 } } } }, "outcome")).toBe(0);
  });
});