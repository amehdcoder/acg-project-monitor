import { describe, expect, it } from "vitest";
import { createFacilityNormalizer, type FacilityRecord } from "../facilityNames";
import { aggregate, emptySummary, totals, t, type EyeReportRow } from "../definition";
import { buildFacilityTrend, filterFacilityTrend } from "../facilityTrend";
const row = (name: string, extra: Partial<FacilityRecord> = {}): FacilityRecord => ({ project_id: "bmz", facility_name: name, state: "Jigawa", lga: "Gumel", ...extra });
describe("Safe dashboard facility normalization", () => {
  it("merges all confirmed Gumel variants under Gumel General Hospital", () => {
    const rows = ["Gimel General Hospital", "Gimel General  Hospital", "Gumel General Hospital", "GUMEL GENERAL HOSPITAL", "Gum el General Hospital"].map(n => row(n));
    const normalize = createFacilityNormalizer(rows);
    expect(rows.map(normalize).map(r => r.facility_name)).toEqual(Array(5).fill("Gumel General Hospital"));
    expect(rows[0].facility_name).toBe("Gimel General Hospital");
  });
  it("automatically handles case, whitespace, punctuation and locality-backed typos elsewhere", () => {
    const rows = [row("Hadejia general hospital", { lga: "Hadejia" }), row("HADEJIA GENERAL HOSPITAL", { lga: "Hadejia" }), row("Had ejia Gen. Hosp.", { lga: "Hadejia" }), row("Hadeja General Hospital", { lga: "Hadejia" })];
    expect(new Set(rows.map(createFacilityNormalizer(rows)).map(r => r.facility_name))).toEqual(new Set(["Hadejia General Hospital"]));
  });
  it("keeps distinct IDs separate even with identical names in the same LGA", () => {
    const rows = [row("Gumel General Hospital", { facility_id: "a" }), row("GUMEL GENERAL HOSPITAL", { facility_id: "b" }), row("Gimel General Hospital")];
    expect(new Set(rows.map(createFacilityNormalizer(rows)).map(r => r.facility_name)).size).toBe(3);
  });
  it("does not merge names across LGAs or projects or blindly fuzzy-match arbitrary facilities", () => {
    const rows = [row("Community Clinic", { lga: "Gumel" }), row("Community Clinic", { lga: "Dutse" }), row("Madina Clinic"), row("Medina Clinic"), row("Gimel General Hospital", { lga: "Dutse" }), row("Gumel General Hospital", { project_id: "other" })];
    const out = rows.map(createFacilityNormalizer(rows));
    expect(out[0].facility_name).not.toBe(out[1].facility_name);
    expect(out[2].facility_name).not.toBe(out[3].facility_name);
    expect(out[4].facility_name).toBe("Gimel General Hospital");
    expect(out[5].project_id).toBe("other");
  });
  it("keeps numbered and differently typed facilities separate", () => {
    const rows = [row("Gumel General Hospital"), row("Gumel Primary Health Centre"), row("Gumel General Hospital 2")];
    expect(new Set(rows.map(createFacilityNormalizer(rows)).map(r => r.facility_name)).size).toBe(3);
  });
  it("links an unregistered spelling only to a unique registered facility in that geography", () => {
    const rows = [row("Gimel General Hospital")];
    const normalize = createFacilityNormalizer(rows, [{ id: "a", name: "Gumel General Hospital", state: "Jigawa", lga: "Gumel" }], "bmz");
    expect(normalize(rows[0]).facility_name).toBe("Gumel General Hospital");
    expect(normalize(row("anything", { facility_id: "a" })).facility_name).toBe("Gumel General Hospital");
  });
  it("preserves submissions and clinical totals when new spelling variants arrive", () => {
    const make = (name: string, id: string) => ({ ...row(name), id, report_date: "2026-11-20", summary: { ...emptySummary(), consult: { a0_14: { m: 3, f: 2 } } }, csom: null }) as EyeReportRow;
    let rows = [make("Gumel General Hospital", "1")];
    expect(aggregate(rows.map(createFacilityNormalizer(rows))).facilities).toBe(1);
    rows = [...rows, make("Gimel General Hospital", "2"), make("Gum el General Hospital", "3")];
    const normalized = rows.map(createFacilityNormalizer(rows)), a = aggregate(normalized);
    expect(a.facilities).toBe(1); expect(a.reports).toBe(3); expect(t(totals(a.summary).consulted)).toBe(15);
    expect(filterFacilityTrend(normalized, "", "", "Gumel General Hospital")).toHaveLength(3);
    expect(buildFacilityTrend(normalized, "day")[0]).toMatchObject({ Submissions: 3, Consulted: 15 });
    expect(rows[1].facility_name).toBe("Gimel General Hospital");
  });
  it("resolves linked WG-SS and State-less tracker rows without cross-LGA guesses", () => {
    const rows = [row("Gimel General Hospital", { id: "report" })];
    const normalize = createFacilityNormalizer(rows);
    expect(normalize(row("GIMEL GENERAL HOSPITAL", { state: null, report_id: "report", lga: null })).facility_name).toBe("Gumel General Hospital");
    expect(normalize(row("Gimel General Hospital", { state: undefined })).facility_name).toBe("Gumel General Hospital");
  });
  it("is deterministic regardless of source-row order", () => {
    const rows = [row("Gum el General Hospital"), row("Gimel General Hospital"), row("Gumel General Hospital")];
    expect(rows.map(createFacilityNormalizer(rows))).toEqual(rows.map(createFacilityNormalizer([...rows].reverse())));
  });
});