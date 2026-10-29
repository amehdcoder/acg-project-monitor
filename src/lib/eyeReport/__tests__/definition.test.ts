import { describe, it, expect } from "vitest";
import { aggregate, aggregatePatients, byMonth, combineArms, emptyCsom, emptySummary, pct, totals, validateReport, wgVsSummaryIssues } from "../definition";

const base = () => ({ facility: "Dutse GH", date: "2026-10-20", today: "2026-10-25", summary: emptySummary(), csom: null as any });

describe("eye daily report rules", () => {
  it("totals consultations across all age bands by sex", () => {
    const s = emptySummary(); s.consult.a0_14 = { m: 2, f: 3 }; s.consult.a40 = { m: 10, f: 5 };
    expect(totals(s).consulted).toEqual({ m: 12, f: 8 });
  });
  it("blocks future dates", () => {
    expect(validateReport({ ...base(), date: "2026-10-26" }).some((i) => i.field === "date" && i.level === "error")).toBe(true);
  });
  it("blocks disability counts above consultations", () => {
    const r = base(); r.summary.consult.a40 = { m: 3, f: 0 }; r.summary.pwd = { m: 4, f: 0 };
    expect(validateReport(r).some((i) => i.field === "pwd.m" && i.level === "error")).toBe(true);
  });
  it("treats CSOM surgeries as its own input, independent of the day's summary", () => {
    const r = base(); r.summary.consult.a40 = { m: 5, f: 5 }; r.summary.surgery.cataract = { m: 2, f: 1 };
    expect(validateReport(r).some((i) => i.field.startsWith("csom"))).toBe(false);
    const c = emptyCsom(); c.surgeries = 7;
    expect(validateReport({ ...r, csom: c }).some((i) => i.field === "csom.surgeries")).toBe(false);
    c.surgeries = 0; c.iol = 2;
    expect(validateReport({ ...r, csom: c }).some((i) => i.field === "csom.surgeries")).toBe(true);
    c.iol = 0; c.surgeries = 3; c.discharge.presenting = { good: 2, borderline: 1, poor: 0 }; c.discharge.pinhole = { good: 2, borderline: 0, poor: 0 };
    expect(validateReport({ ...r, csom: c }).some((i) => i.field === "csom.discharge.pin" && i.level === "error")).toBe(true);
  });
  it("flags CSOM presenting or pinhole totals above CSOM surgeries, and identical figures", () => {
    const r = base(); r.summary.consult.a40 = { m: 5, f: 5 };
    const c = emptyCsom(); c.surgeries = 2;
    c.followup.presenting = { good: 2, borderline: 1, poor: 0 }; c.followup.bcva = { good: 3, borderline: 0, poor: 0 };
    const is = validateReport({ ...r, csom: c });
    expect(is.some((i) => i.field === "csom.followup" && i.level === "error")).toBe(true);
    expect(is.some((i) => i.field === "csom.followup.pin" && i.level === "error" && i.message.includes("exceeds"))).toBe(true);
    c.surgeries = 5; c.discharge.presenting = { good: 1, borderline: 1, poor: 0 }; c.discharge.pinhole = { good: 1, borderline: 1, poor: 0 };
    expect(validateReport({ ...r, csom: c }).some((i) => i.field === "csom.discharge.pin" && i.level === "warning" && i.message.includes("identical"))).toBe(true);
  });
  it("requires the outreach community name when outreach is recorded", () => {
    const r = base(); const s = combineArms(emptySummary(), emptySummary(), emptySummary());
    expect(validateReport({ ...r, summary: s }).some((i) => i.field === "outreach.community")).toBe(true);
    s.outreachCommunity = "Kofar Fada";
    expect(validateReport({ ...r, summary: s }).some((i) => i.field === "outreach.community")).toBe(false);
  });
  it("computes percentages to one decimal", () => { expect(pct(2, 3)).toBe(66.7); expect(pct(1, 0)).toBe(0); });
  it("requires state, LGA, sign-off names and a labelled source document", () => {
    const r = { ...base(), state: "", lga: "", preparedBy: "", confirmedBy: "", attachments: [] as any[] };
    const fields = validateReport(r).filter((i) => i.level === "error").map((i) => i.field);
    expect(fields).toContain("state"); expect(fields).toContain("lga");
    expect(fields).toContain("prepared"); expect(fields).toContain("confirmed"); expect(fields).toContain("attachments");
    const ok = validateReport({ ...r, state: "Jigawa", lga: "Dutse", preparedBy: "A. Clerk", confirmedBy: "B. Matron", attachments: [{ ref: "x", label: "Register p.1" }] as any });
    expect(ok.some((i) => ["state", "lga", "prepared", "confirmed", "attachments"].includes(i.field))).toBe(false);
  });
  it("flags unlabelled source documents", () => {
    const r = { ...base(), attachments: [{ ref: "x", label: " " }] as any[] };
    expect(validateReport(r).some((i) => i.field === "attachments" && i.level === "error")).toBe(true);
  });
  it("warns when WG-SS screenings do not match the summary", () => {
    const s = emptySummary(); s.consult.a40 = { m: 3, f: 2 }; s.pwd = { m: 1, f: 0 };
    const issues = wgVsSummaryIssues(4, 0, s);
    expect(issues.some((i) => i.message.includes("4 patients"))).toBe(true);
    expect(issues.some((i) => i.message.includes("classified 0"))).toBe(true);
    expect(wgVsSummaryIssues(5, 1, s)).toEqual([]);
  });
  it("aggregates WG-SS patients by domain and sex", () => {
    const p = (id: string, sex: string, domains: string[]) => ({
      id, project_id: "p", report_id: null, facility_id: null, facility_name: "A", state: null, lga: null,
      report_date: "2026-10-20", patient_label: id, sex, age_band: "a15", wg_ss: {},
      has_disability: domains.length > 0, disability_domains: domains, created_by: null, device_id: null, collector_label: null,
    });
    const agg = aggregatePatients([p("1", "m", ["Seeing"]), p("2", "f", ["Seeing", "Walking"]), p("3", "f", [])]);
    expect(agg.screened).toBe(3); expect(agg.withDisability).toBe(2);
    expect(agg.domains[0]).toEqual({ label: "Seeing", count: 2 });
    expect(agg.bySex).toEqual({ m: 1, f: 2, other: 0 });
  });
  it("aggregates daily rows into months", () => {
    const row = (d: string, m: number) => ({ id: d, project_id: "p", facility_id: null, facility_name: "A", state: null, lga: null, report_date: d, summary: { consult: { a40: { m, f: 0 } } }, csom: null, notes: null, prepared_by: null, confirmed_by: null, created_by: null, device_id: null, collector_label: null });
    const months = byMonth([row("2026-01-02", 4), row("2026-01-03", 6), row("2026-02-01", 1)]);
    expect(totals(months[0].summary).consulted.m).toBe(10);
    expect(months[0].days).toBe(2);
    expect(aggregate([]).reports).toBe(0);
  });
  it("flags near-duplicate facility names but not exact or unrelated ones", async () => {
    const { similarFacilityName } = await import("../definition");
    expect(similarFacilityName("Dutse Gen Hosp", ["Dutse General Hospital"])).not.toBeNull();
    expect(similarFacilityName("Dutse General Hospital", ["Dutse General Hospital"])).toBeNull();
    expect(similarFacilityName("Kano Eye Clinic", ["Dutse General Hospital"])).toBeNull();
  });
  it("uses 0-14, 15-39 and 40+ age bands and merges legacy 0-4/5-14", async () => {
    const d = await import("../definition");
    expect(d.AGE_BANDS.map((b) => b.label)).toEqual(["0–14 yrs", "15–39 yrs", "40+ yrs"]);
    expect(d.normSummary({ consult: { a0_4: { m: 1, f: 0 }, a5_14: { m: 2, f: 1 } } }).consult.a0_14).toEqual({ m: 3, f: 1 });
  });
  it("counts WG-SS disabilities by age and sex and blocks screenings above consultations", async () => {
    const d = await import("../definition");
    const rows = [{ sex: "m", age_band: "a40", has_disability: true }, { sex: "m", age_band: "a40", has_disability: false }, { sex: "f", age_band: "a0_14", has_disability: true }];
    const by = d.wgPwdByAge(rows);
    expect(by.a40).toEqual({ m: 1, f: 0 }); expect(by.a0_14).toEqual({ m: 0, f: 1 });
    const s = emptySummary(); s.consult.a40 = { m: 1, f: 0 }; s.consult.a0_14 = { m: 0, f: 1 };
    expect(d.wgAgeIssues(rows, s).some((i) => i.field === "patients.a40.m" && i.level === "error")).toBe(true);
    s.consult.a40 = { m: 2, f: 0 };
    expect(d.wgAgeIssues(rows, s).filter((i) => i.level === "error")).toEqual([]);
  });
  it("blocks age-band disability counts above that band's consultations", () => {
    const r = base(); r.summary.consult.a15_39 = { m: 1, f: 0 }; r.summary.pwdAge.a15_39 = { m: 2, f: 0 };
    expect(validateReport(r).some((i) => i.field === "pwd.a15_39.m" && i.level === "error")).toBe(true);
  });
  it("derives item totals from the age-by-sex breakdown", async () => {
    const d = await import("../definition");
    const s = d.normSummary({ ages: { "surgery.cataract": { a0_14: { m: 1, f: 2 }, a40: { m: 3, f: 0 } } } });
    expect(s.surgery.cataract).toEqual({ m: 4, f: 2 });
  });
  it("requires a description when other eye conditions are screened", () => {
    const r = base(); r.summary.consult.a40 = { m: 5, f: 5 }; r.summary.screen.other = { m: 1, f: 0 };
    expect(validateReport(r).some((i) => i.field === "screen.otherSpecify")).toBe(true);
    r.summary.screenOther = "Pterygium";
    expect(validateReport(r).some((i) => i.field === "screen.otherSpecify")).toBe(false);
  });
});

import { combineArms as _combine, emptySummary as _empty, normSummary as _norm, totals as _totals } from "../definition";
describe("facility + outreach split", () => {
  it("report totals are facility plus outreach and survive a reload", () => {
    const fac = _empty(); fac.consult.a0_14 = { m: 3, f: 2 };
    const out = _empty(); out.consult.a40 = { m: 4, f: 1 };
    const combined = _combine(fac, out, _empty());
    expect(_totals(combined).consulted).toEqual({ m: 7, f: 3 });
    const again = _norm(JSON.parse(JSON.stringify(combined)));
    expect(_totals(again).consulted).toEqual({ m: 7, f: 3 });
    expect(again.split?.outreach.consult.a40).toEqual({ m: 4, f: 1 });
  });
  it("validates discharge and follow-up outcomes against their own surgery counts", () => {
    const r = base();
    const c = emptyCsom(); c.surgeries = 10; c.dischargeSurgeries = 4; c.followupSurgeries = 3;
    c.discharge.presenting = { good: 3, borderline: 1, poor: 0 };
    c.followup.presenting = { good: 2, borderline: 1, poor: 1 };
    const iss = validateReport({ ...r, csom: c });
    expect(iss.some((i) => i.field === "csom.discharge" && i.level === "error")).toBe(false);
    expect(iss.some((i) => i.field === "csom.followup" && i.level === "error")).toBe(true);
    c.followupSurgeries = 11;
    expect(validateReport({ ...r, csom: c }).some((i) => i.field === "csom.followupSurgeries")).toBe(true);
  });
});
