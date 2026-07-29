import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildCoverageXlsForm } from "../generateCoverageXLSForm";
import { buildReconciliationXlsForm } from "../generateReconciliationXLSForm";

function sheetRows(wb: XLSX.WorkBook, name: string): string[][] {
  const s = wb.Sheets[name];
  expect(s, `sheet ${name} missing`).toBeTruthy();
  return XLSX.utils.sheet_to_json<string[]>(s, { header: 1, blankrows: false, defval: "" }) as string[][];
}

function findRowByName(rows: string[][], header: string[], name: string): string[] | undefined {
  const nameIdx = header.indexOf("name");
  return rows.slice(1).find((r) => String(r[nameIdx] ?? "").trim() === name);
}

describe("Coverage XLSForm generator", () => {
  const wb = buildCoverageXlsForm({ projectName: "Test Coverage" });
  const survey = sheetRows(wb, "survey");
  const header = survey[0];

  it("has required survey/choices/settings sheets", () => {
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["survey", "choices", "settings"]));
  });

  it("survey header contains the standard XLSForm columns", () => {
    ["type", "name", "label", "required", "appearance"].forEach((c) =>
      expect(header).toContain(c),
    );
  });

  it("declares the admin cascade at the top with expected field names", () => {
    ["state", "lga", "ward", "flhf_name"].forEach((n) => {
      const row = findRowByName(survey, header, n);
      expect(row, `admin field ${n} missing`).toBeDefined();
      expect(String(row![header.indexOf("required")])).toBe("yes");
    });
  });

  it("wraps community fields in a community_repeat with coverage numeric fields", () => {
    const typeIdx = header.indexOf("type");
    const nameIdx = header.indexOf("name");
    const beginIdx = survey.findIndex((r) => String(r[typeIdx]) === "begin_repeat" && String(r[nameIdx]) === "community_repeat");
    const endIdx = survey.findIndex((r) => String(r[typeIdx]) === "end_repeat" && String(r[nameIdx]) === "community_repeat_end");
    expect(beginIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(beginIdx);

    const inside = survey.slice(beginIdx + 1, endIdx).map((r) => String(r[nameIdx]));
    ["community_name", "total_treated", "doses_administered", "refusals", "missed_population", "community_gps"].forEach((n) =>
      expect(inside, `community_repeat missing ${n}`).toContain(n),
    );
    expect(inside, "target_population must be removed from the coverage form").not.toContain("target_population");

  });

  it("uses a geopoint field for community GPS", () => {
    const row = findRowByName(survey, header, "community_gps");
    expect(row).toBeDefined();
    expect(String(row![header.indexOf("type")])).toBe("geopoint");
  });
});

describe("Reconciliation XLSForm generator", () => {
  const wb = buildReconciliationXlsForm({ projectName: "Test Recon" });
  const survey = sheetRows(wb, "survey");
  const choices = sheetRows(wb, "choices");
  const header = survey[0];

  it("has required sheets", () => {
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["survey", "choices", "settings"]));
  });

  it("declares admin cascade fields", () => {
    ["state", "lga", "ward", "flhf_name"].forEach((n) => {
      expect(findRowByName(survey, header, n), `admin ${n} missing`).toBeDefined();
    });
  });

  it("wraps medicines in a medicine_repeat with reconciliation quantities", () => {
    const typeIdx = header.indexOf("type");
    const nameIdx = header.indexOf("name");
    const beginIdx = survey.findIndex((r) => String(r[typeIdx]) === "begin_repeat" && String(r[nameIdx]) === "medicine_repeat");
    const endIdx = survey.findIndex((r) => String(r[typeIdx]) === "end_repeat" && String(r[nameIdx]) === "medicine_repeat_end");
    expect(beginIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(beginIdx);
    const inside = survey.slice(beginIdx + 1, endIdx).map((r) => String(r[nameIdx]));
    ["medicine_name", "received_quantity", "administered_quantity", "wasted_quantity", "returned_quantity", "discrepancy_notes"].forEach((n) =>
      expect(inside, `medicine_repeat missing ${n}`).toContain(n),
    );
  });

  it("provides a medicine_type choice list with ivermectin/albendazole/mectizan", () => {
    const listIdx = choices[0].indexOf("list_name");
    const nameIdx = choices[0].indexOf("name");
    const meds = choices.slice(1)
      .filter((r) => String(r[listIdx]) === "medicine_type")
      .map((r) => String(r[nameIdx]));
    ["ivermectin", "albendazole", "mectizan"].forEach((m) =>
      expect(meds, `medicine_type missing ${m}`).toContain(m),
    );
  });
});
