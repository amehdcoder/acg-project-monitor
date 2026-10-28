import { describe, expect, it } from "vitest";
import { facilityEntryDefaults, localReportDate } from "../entryDefaults";

describe("new reporting facility defaults", () => {
  it("defaults facility selection to today's date rather than a prior report date", () => {
    const now = new Date(2026, 9, 28, 4, 53);
    expect(facilityEntryDefaults(false, "2026-10-27", [], now).date).toBe("2026-10-28");
  });
  it("starts with new WG-SS entries instead of previous facility patients", () => {
    expect(facilityEntryDefaults(false, "2026-10-27", [{ patient_label: "Prior patient" }]).patients).toEqual([]);
  });
  it("retains the saved date and patients when editing an existing report", () => {
    const patients = [{ patient_label: "Saved patient" }];
    expect(facilityEntryDefaults(true, "2026-10-27", patients)).toEqual({ date: "2026-10-27", patients });
  });
  it("uses the device's local calendar date", () => {
    expect(localReportDate(new Date(2026, 9, 28, 0, 15))).toBe("2026-10-28");
  });
});