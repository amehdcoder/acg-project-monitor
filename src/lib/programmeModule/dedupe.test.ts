import { describe, expect, it } from "vitest";
import { caseIdFromScan, completenessScore, findDuplicates, isDuplicatePair } from "./dedupe";
import type { BeneficiaryRow } from "./types";

const row = (id: string, full_name: string, lga: string | null, profile: Record<string, unknown>): BeneficiaryRow => ({
  id, module_id: "m", project_id: "p", case_id: `CiS2-X-${id}`, full_name, profile, status: "active",
  risk_level: null, photo_url: null, latitude: null, longitude: null, state: null, lga, ward: null,
  village: null, next_follow_up_date: null, created_at: "", updated_at: "",
});

describe("duplicate matching (name + age/DOB + LGA)", () => {
  it("flags same name, same LGA, ages within 2 years", () => {
    expect(isDuplicatePair(row("1", "Musa Aliyu", "Dutse", { age: 40 }), row("2", "Aliyu Musa", "Dutse", { age: 42 }))).not.toBeNull();
  });
  it("does not flag when LGA differs", () => {
    expect(isDuplicatePair(row("1", "Musa Aliyu", "Dutse", { age: 40 }), row("2", "Musa Aliyu", "Kano", { age: 40 }))).toBeNull();
  });
  it("does not flag when ages are more than 2 years apart", () => {
    expect(isDuplicatePair(row("1", "Musa Aliyu", "Dutse", { age: 40 }), row("2", "Musa Aliyu", "Dutse", { age: 43 }))).toBeNull();
  });
  it("tolerates a small spelling slip", () => {
    expect(findDuplicates([row("1", "Fatima Abubakar", "Dutse", { age: 30 }), row("2", "Fatima Abubakr", "Dutse", { age: 30 })])).toHaveLength(1);
  });
});

describe("completeness and QR", () => {
  it("empty record scores low, full record scores 100", () => {
    expect(completenessScore(row("1", "A", null, {}))).toBe(8);
    const full = { ...row("1", "A", "Dutse", { sex: "F", age: 3, phone: "1", ward: "w", primary_condition: "LF", consent_obtained: "yes" }),
      state: "Jigawa", village: "v", facility_id: "f", photo_url: "x", latitude: 1 };
    expect(completenessScore(full)).toBe(100);
  });
  it("reads Case ID from a scanned link or raw text", () => {
    expect(caseIdFromScan("https://www.amehnities.org/cases?case=CiS2-EEHK-20260101-0000001")).toBe("CiS2-EEHK-20260101-0000001");
    expect(caseIdFromScan(" CiS2-EEHK-1 ")).toBe("CiS2-EEHK-1");
  });
});
