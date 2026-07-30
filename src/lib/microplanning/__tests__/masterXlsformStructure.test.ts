// Master-XLSForm structure contract for the Geo-enabled Microplanning form.
//
// Locks the requirements derived from the master workbook:
//   • FLHF / Community / Settlement are FREE TEXT (no choice lists, no GPS pre-fill).
//   • State → LGA → Ward remains a dynamic cascading select.
//   • Every location captures a native geopoint PLUS manual lat/long decimals,
//     resolved with geopoint-first precedence.
//   • Every begin_group uses appearance: field-list.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/nigeriaAdminData", () => ({
  getAllStates: () => ["Jigawa"],
  getLGAsForState: () => ["Dutse"],
  getWardsForLGA: () => ["Limawa", "Kachi"],
}));

import * as XLSX from "xlsx";
import { buildMicroplanningXlsForm } from "../xlsformBuilder";

type Rec = Record<string, string>;
const rowsOf = (wb: XLSX.WorkBook, sheet: string): Rec[] =>
  XLSX.utils.sheet_to_json<Rec>(wb.Sheets[sheet], { defval: "" });

const build = () => buildMicroplanningXlsForm(undefined, { projectName: "Master Test" });

describe("master XLSForm structure", () => {
  it("collects FLHF, Community and Settlement names as free text", async () => {
    const survey = rowsOf(await build(), "survey");
    for (const name of ["flhf_name", "community_name", "settlement_name"]) {
      const row = survey.find((r) => r.name === name);
      expect(row, `${name} missing`).toBeTruthy();
      expect(row!.type, `${name} must be text`).toBe("text");
      expect(row!.choice_filter).toBe("");
    }
  });

  it("keeps the dynamic State → LGA → Ward cascade", async () => {
    const wb = await build();
    const survey = rowsOf(wb, "survey");
    expect(survey.find((r) => r.name === "state")!.type).toBe("select_one states");
    expect(survey.find((r) => r.name === "lga")!.choice_filter).toBe("state=${state}");
    expect(survey.find((r) => r.name === "ward")!.choice_filter).toBe("lga=${lga}");

    const choices = rowsOf(wb, "choices");
    const lists = new Set(choices.map((c) => c.list_name));
    expect(lists.has("states")).toBe(true);
    expect(lists.has("lgas")).toBe(true);
    expect(lists.has("wards")).toBe(true);
    // Free-text tiers must never ship as choice lists.
    for (const banned of ["flhfs", "communities", "settlements"]) {
      expect(lists.has(banned)).toBe(false);
    }
    // Wards resolve to a real LGA parent.
    const lgaIds = new Set(choices.filter((c) => c.list_name === "lgas").map((c) => c.name));
    for (const w of choices.filter((c) => c.list_name === "wards")) {
      expect(lgaIds.has(w.lga)).toBe(true);
    }
  });

  it("never pre-fills GPS coordinates", async () => {
    const survey = rowsOf(await build(), "survey");
    for (const r of survey) {
      const isCoord = /latitude|longitude|_gps$/.test(r.name) &&
        ["geopoint", "decimal", "calculate"].includes(r.type);
      if (isCoord) expect(r.default, `${r.name} must not be pre-filled`).toBe("");
      expect(r.calculation).not.toMatch(/instance\('(flhfs|communities|settlements)'\)/);
    }
  });

  it("captures dual GPS (geopoint + manual decimals) with geopoint precedence", async () => {
    const survey = rowsOf(await build(), "survey");
    const tiers: [string, string, string, string][] = [
      ["flhf_gps", "flhf_manual_latitude", "flhf_manual_longitude", "flhf"],
      ["community_gps", "community_manual_latitude", "community_manual_longitude", "community"],
      ["settlement_gps", "settlement_manual_latitude", "settlement_manual_longitude", "settlement"],
    ];
    for (const [gps, mlat, mlng, prefix] of tiers) {
      expect(survey.find((r) => r.name === gps)!.type).toBe("geopoint");
      expect(survey.find((r) => r.name === mlat)!.type).toBe("decimal");
      expect(survey.find((r) => r.name === mlng)!.type).toBe("decimal");
      const lat = survey.find((r) => r.name === `${prefix}_latitude`)!;
      expect(lat.type).toBe("calculate");
      expect(lat.calculation).toBe(`if(\${${gps}} = '', \${${mlat}}, selected-at(\${${gps}}, 0))`);
      const lng = survey.find((r) => r.name === `${prefix}_longitude`)!;
      expect(lng.calculation).toBe(`if(\${${gps}} = '', \${${mlng}}, selected-at(\${${gps}}, 1))`);
    }
  });

  it("frames every community_repeat section as a field-list group", async () => {
    const survey = rowsOf(await build(), "survey");
    const groups = survey.filter((r) => r.type === "begin_group");
    for (const g of groups) {
      expect(g.appearance, `${g.name} must be field-list`).toMatch(/field-list/);
    }
    const expected = [
      "grp_comm_location", "grp_comm_settlement", "grp_comm_context",
      "grp_comm_demographics", "grp_comm_trachoma", "grp_comm_pwd",
      "grp_comm_cdd", "grp_comm_logistics_notes",
    ];
    const names = groups.map((g) => g.name);
    for (const e of expected) expect(names).toContain(e);

    // Group balance + repeat containment.
    const start = survey.findIndex((r) => r.name === "community_repeat");
    const end = survey.findIndex((r) => r.name === "community_repeat_end");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    for (const e of expected) {
      expect(survey.findIndex((r) => r.name === e)).toBeGreaterThan(start);
      expect(survey.findIndex((r) => r.name === e)).toBeLessThan(end);
    }
    expect(survey.filter((r) => r.type === "begin_group").length)
      .toBe(survey.filter((r) => r.type === "end_group").length);
  });

  it("uses Markdown section headers, never HTML", async () => {
    const survey = rowsOf(await build(), "survey");
    const groupLabels = survey.filter((r) => r.type === "begin_group" && r.name !== "grp_welcome").map((r) => r.label);
    expect(groupLabels.length).toBeGreaterThan(5);
    for (const l of groupLabels) {
      expect(l).not.toMatch(/<[^>]+>/);
      expect(l.startsWith("###")).toBe(true);
    }
  });
});
