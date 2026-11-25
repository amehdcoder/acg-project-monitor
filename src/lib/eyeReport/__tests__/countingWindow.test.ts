import { describe, expect, it } from "vitest";
import {
  EYE_COUNTING_WINDOW_START, aggregate, aggregatePatients, inCountingWindow, totals,
  withinCountingWindow, type EyePatientRow, type EyeReportRow,
} from "../definition";

const report = (date: string, m: number, f: number): EyeReportRow => ({
  id: `r-${date}`, project_id: "p1", facility_id: null, facility_name: "Gumel General Hospital",
  state: "Jigawa", lga: "Gumel", report_date: date,
  summary: { consult: { a0_14: { m: 0, f: 0 }, a15_39: { m: 0, f: 0 }, a40: { m, f } } },
  csom: null, notes: null, prepared_by: null, confirmed_by: null,
  created_by: null, device_id: null, collector_label: null,
});

const patient = (date: string, disabled: boolean, n: number): EyePatientRow => ({
  id: `p-${date}-${n}`, project_id: "p1", report_id: null, facility_id: null,
  facility_name: "Gumel General Hospital", state: "Jigawa", lga: "Gumel", report_date: date,
  patient_label: `P${n}`, sex: "f", age_band: "a40", wg_ss: null,
  has_disability: disabled, disability_domains: disabled ? ["Seeing"] : [],
  created_by: null, device_id: null, collector_label: null,
});

describe("Eye Health counting window (2 November 2026)", () => {
  it("excludes 1 November 2026 and includes 2 November 2026", () => {
    expect(EYE_COUNTING_WINDOW_START).toBe("2026-11-02");
    expect(inCountingWindow("2026-10-30")).toBe(false);
    expect(inCountingWindow("2026-11-01")).toBe(false);
    expect(inCountingWindow("2026-11-02")).toBe(true);
    expect(inCountingWindow("2026-11-25")).toBe(true);
    expect(inCountingWindow(null)).toBe(false);
    expect(inCountingWindow(undefined)).toBe(false);
  });

  it("keeps only reports dated on/after 2 November 2026 in dashboard totals", () => {
    const rows = [
      report("2026-10-30", 40, 30),
      report("2026-11-01", 25, 25),
      report("2026-11-02", 12, 8),
      report("2026-11-25", 5, 5),
    ];
    const counted = withinCountingWindow(rows);
    expect(counted.map((r) => r.report_date)).toEqual(["2026-11-02", "2026-11-25"]);
    expect(totals(aggregate(counted).summary).consulted).toEqual({ m: 17, f: 13 });
    // Unwindowed rows still hold every report for the map, trend and milestone views.
    expect(rows).toHaveLength(4);
    expect(totals(aggregate(rows).summary).consulted).toEqual({ m: 82, f: 68 });
  });

  it("excludes pre-window screenings from the WG-SS totals", () => {
    const patients = [
      patient("2026-11-01", true, 1),
      patient("2026-11-02", true, 2),
      patient("2026-11-02", false, 3),
    ];
    expect(aggregatePatients(withinCountingWindow(patients))).toMatchObject({ screened: 2, withDisability: 1 });
    expect(aggregatePatients(patients)).toMatchObject({ screened: 3, withDisability: 2 });
  });
});
