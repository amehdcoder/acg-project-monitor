import { describe, expect, it } from "vitest";
import { latestEyeReportingMonth } from "../exchangePeriod";

describe("Eye Health exchange reporting month", () => {
  it("opens October submissions rather than the previous empty month", () => {
    expect(latestEyeReportingMonth([{ report_date: "2026-10-26" }], new Date("2026-10-27T01:42:00Z"))).toBe("2026-10");
  });
  it("selects the latest submitted month independently of row order", () => {
    expect(latestEyeReportingMonth([{ report_date: "2025-12-01" }, { report_date: "2026-02-03" }, { report_date: "2026-01-10" }])).toBe("2026-02");
  });
  it("uses the current month before any submissions load", () => {
    expect(latestEyeReportingMonth([], new Date("2026-10-27T01:42:00Z"))).toBe("2026-10");
  });
});