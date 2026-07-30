// Cascade dedup contract: repeated raw GRID3 / admin data must never produce
// duplicate (list_name, name) rows or orphan cascade filters.
//
// The XLSForm builder is exercised end-to-end with a mocked admin/GRID3
// dataset that intentionally includes duplicated LGAs, wards, FLHFs,
// communities and settlements at every tier.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/nigeriaAdminData", () => ({
  getAllStates: () => ["Testland"],
  getLGAsForState: (s: string) =>
    s === "Testland" ? ["Alpha LGA", "Alpha LGA", "Beta LGA"] : [],
  getWardsForLGA: (s: string, lga: string) => {
    if (s !== "Testland") return [];
    if (lga === "Alpha LGA") return ["Ward One", "Ward One", "Ward Two"];
    if (lga === "Beta LGA") return ["Ward One"]; // same NAME as Alpha's ward — must NOT collapse
    return [];
  },
}));

vi.mock("@/lib/grid3NigeriaData", () => ({
  getGrid3FullStateEntries: async (kind: "fac" | "set", state: string) => {
    if (state !== "Testland") return [];
    if (kind === "fac") {
      return [
        { name: "PHC Alpha", lga: "Alpha LGA", ward: "Ward One", latitude: 10, longitude: 8 },
        { name: "PHC Alpha", lga: "Alpha LGA", ward: "Ward One", latitude: 10, longitude: 8 }, // dup
        { name: "PHC Alpha", lga: "Beta LGA", ward: "Ward One", latitude: 11, longitude: 9 },  // same name, different ward
        { name: "PHC Beta", lga: "Alpha LGA", ward: "Ward Two", latitude: 12, longitude: 7 },
      ];
    }
    return [
      { name: "Zaria Community", lga: "Alpha LGA", ward: "Ward One", latitude: 10.1, longitude: 8.1 },
      { name: "Zaria Community", lga: "Alpha LGA", ward: "Ward One", latitude: 10.1, longitude: 8.1 }, // dup
      { name: "Zaria Community", lga: "Beta LGA", ward: "Ward One", latitude: 11.1, longitude: 9.1 }, // same name, different ward
      { name: "Kano Village", lga: "Alpha LGA", ward: "Ward Two", latitude: 12.1, longitude: 7.1 },
    ];
  },
}));

import * as XLSX from "xlsx";
import { buildMicroplanningXlsForm } from "../xlsformBuilder";

interface ChoiceRow {
  list_name: string;
  name: string;
  label?: string;
  lga?: string;
  ward?: string;
  community?: string;
}

const readChoices = (wb: XLSX.WorkBook): ChoiceRow[] =>
  XLSX.utils.sheet_to_json<ChoiceRow>(wb.Sheets["choices"], { defval: "" });

describe("cascade dedup + orphan-free choice filters", () => {
  it("emits no duplicate (list_name, name) rows even when raw data repeats", async () => {
    const wb = await buildMicroplanningXlsForm(undefined, {
      projectName: "Dedup Test",
      projectStates: ["Testland"],
    });
    const rows = readChoices(wb);
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.list_name}\u0001${r.name}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("every ward references an existing LGA option (no orphan cascade filters)", async () => {
    const wb = await buildMicroplanningXlsForm(undefined, { projectStates: ["Testland"] });
    const rows = readChoices(wb);
    const lgaIds = new Set(rows.filter((r) => r.list_name === "lgas").map((r) => r.name));
    const wardRows = rows.filter((r) => r.list_name === "wards");
    expect(wardRows.length).toBeGreaterThan(0);
    for (const w of wardRows) {
      expect(lgaIds.has(String(w.lga)), `orphan ward "${w.label}" → lga=${w.lga}`).toBe(true);
    }
  });

  it("does NOT emit FLHF / community / settlement choice lists (they are free text)", async () => {
    const wb = await buildMicroplanningXlsForm(undefined, { projectStates: ["Testland"] });
    const rows = readChoices(wb);
    const lists = new Set(rows.map((r) => r.list_name));
    for (const banned of ["flhfs", "communities", "settlements"]) {
      expect(lists.has(banned), `${banned} must not be a choice list`).toBe(false);
    }
  });

  it("preserves same-name entries under distinct parents (Ward One under Alpha ≠ under Beta)", async () => {
    const wb = await buildMicroplanningXlsForm(undefined, { projectStates: ["Testland"] });
    const rows = readChoices(wb);
    const wardOneRows = rows.filter((r) => r.list_name === "wards" && r.label === "Ward One");
    expect(wardOneRows.length).toBe(2); // one per parent LGA
    const parents = new Set(wardOneRows.map((r) => r.lga));
    expect(parents.size).toBe(2);
  });

  it("choice `name` slugs are lowercase alphanumeric/underscore only", async () => {
    const wb = await buildMicroplanningXlsForm(undefined, { projectStates: ["Testland"] });
    const rows = readChoices(wb);
    for (const r of rows) {
      // Skip built-in escape hatches and helper lists.
      if (r.name === "__other__") continue;
      expect(r.name, `bad slug: ${r.list_name}/${r.name}`).toMatch(/^[a-z0-9_]+$/);
    }
  });
});
