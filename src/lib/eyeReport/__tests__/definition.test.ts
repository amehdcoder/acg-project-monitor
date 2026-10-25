import { describe, it, expect } from "vitest";
import { aggregate, aggregatePatients, byMonth, emptyCsom, emptySummary, pct, totals, validateReport, wgVsSummaryIssues } from "../definition";

const base = () => ({ facility: "Dutse GH", date: "2026-10-20", today: "2026-10-25", summary: emptySummary(), csom: null as any });

describe("eye daily report rules", () => {
  it("totals consultations across all age bands by sex", () => {
    const s = emptySummary(); s.consult.a0_4 = { m: 2, f: 3 }; s.consult.a15 = { m: 10, f: 5 };
    expect(totals(s).consulted).toEqual({ m: 12, f: 8 });
  });
  it("blocks future dates", () => {
    expect(validateReport({ ...base(), date: "2026-10-26" }).some((i) => i.field === "date" && i.level === "error")).toBe(true);
  });
  it("blocks disability counts above consultations", () => {
    const r = base(); r.summary.consult.a15 = { m: 3, f: 0 }; r.summary.pwd = { m: 4, f: 0 };
    expect(validateReport(r).some((i) => i.field === "pwd.m" && i.level === "error")).toBe(true);
  });
  it("requires CSOM when cataract surgeries are recorded and matching totals", () => {
    const r = base(); r.summary.consult.a15 = { m: 5, f: 5 }; r.summary.surgery.cataract = { m: 2, f: 1 };
    expect(validateReport(r).some((i) => i.field === "csom")).toBe(true);
    const c = emptyCsom(); c.surgeries = 2;
    expect(validateReport({ ...r, csom: c }).some((i) => i.field === "csom.surgeries")).toBe(true);
    c.surgeries = 3; c.discharge.presenting = { good: 2, borderline: 1, poor: 0 }; c.discharge.pinhole = { good: 2, borderline: 0, poor: 0 };
    expect(validateReport({ ...r, csom: c }).some((i) => i.field === "csom.discharge.pinhole" && i.level === "error")).toBe(true);
  });
  it("computes percentages to one decimal", () => { expect(pct(2, 3)).toBe(66.7); expect(pct(1, 0)).toBe(0); });
  it("aggregates daily rows into months", () => {
    const row = (d: string, m: number) => ({ id: d, project_id: "p", facility_id: null, facility_name: "A", state: null, lga: null, report_date: d, summary: { consult: { a15: { m, f: 0 } } }, csom: null, notes: null, prepared_by: null, confirmed_by: null, created_by: null, device_id: null, collector_label: null });
    const months = byMonth([row("2026-01-02", 4), row("2026-01-03", 6), row("2026-02-01", 1)]);
    expect(totals(months[0].summary).consulted.m).toBe(10);
    expect(months[0].days).toBe(2);
    expect(aggregate([]).reports).toBe(0);
  });
});
