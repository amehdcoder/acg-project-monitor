// Auto-map coverage guard.
//
// Fails loudly in CI when the XLSForm generator introduces a new user-facing
// question that the TARGET_FIELDS registry (KoboFormConfigPanel) does not
// cover. Rationale: an unmapped Kobo question silently drops that column from
// microplan_entries, so the dashboard and webhook ingestion break in prod.
//
// If this test fails after intentionally adding a new field, add it to
// TARGET_FIELDS in src/lib/microplanning/koboAutoMap.ts (or, when the field
// is deliberately non-DB, extend UNMAPPED_ALLOWLIST below with a comment).

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/nigeriaAdminData", () => ({
  getAllStates: () => ["__none__"],
  getLGAsForState: () => [],
  getWardsForLGA: () => [],
}));
vi.mock("@/lib/grid3NigeriaData", () => ({
  getGrid3FullStateEntries: async () => [],
}));

import * as XLSX from "xlsx";
import { buildMicroplanningXlsForm } from "../xlsformBuilder";
import { TARGET_FIELDS, computeAutoMap, normToken, type KoboField } from "../koboAutoMap";

// ODK/Kobo metadata + structural types that never map to a DB column.
const STRUCTURAL_TYPES = new Set([
  "start", "end", "today", "deviceid", "username", "phonenumber", "phone_number",
  "audit", "note", "calculate", "hidden",
  "begin_group", "end_group", "begin_repeat", "end_repeat",
]);

// Explicit non-DB questions (UX helpers, geopoints split into lat/lng cols, etc.).
const UNMAPPED_ALLOWLIST = new Set<string>([
  // Composite geopoints — split into *_latitude / *_longitude before persistence.
  "flhf_gps", "community_gps", "settlement_gps",
  // Manual GPS override capture — reconciled into the canonical *_latitude/_longitude columns.
  "flhf_gps_override", "community_gps_override", "settlement_gps_override",
  // Search/UX affordances that never round-trip to DB.
  "flhf_search", "community_search", "settlement_search",
  // "Other (specify)" free-text pairs — merged into the canonical *_name column by the webhook.
  "flhf_name_other", "community_name_other", "settlement_name_other",
  "flhf_manual", "community_manual", "settlement_manual",
  // Conditional-section toggle — drives `relevant` on the trachoma group, not persisted.
  "include_trachoma",
]);


const readSurvey = (wb: XLSX.WorkBook): Record<string, string>[] => {
  const sheet = wb.Sheets["survey"];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
};

describe("XLSForm ↔ TARGET_FIELDS coverage guard", () => {
  it("every user-facing survey question maps to a TARGET_FIELDS entry (fail-loud on schema drift)", async () => {
    const wb = await buildMicroplanningXlsForm(undefined, {
      projectName: "Coverage Guard",
      projectStates: ["__none__"],
    });
    const rows = readSurvey(wb);

    // Reduce type strings like "select_one campaign_type" to their head token.
    const questions = rows
      .map((r) => ({
        name: String(r.name ?? "").trim(),
        type: String(r.type ?? "").trim().split(/\s+/)[0],
        label: String(r.label ?? "").trim(),
      }))
      .filter((q) => q.name && !STRUCTURAL_TYPES.has(q.type));

    expect(questions.length).toBeGreaterThan(20); // sanity check builder produced fields

    const fields: KoboField[] = questions.map((q) => ({ name: q.name, type: q.type, label: q.label }));
    const mapping = computeAutoMap(fields);
    const mappedNames = new Set(Object.values(mapping));

    // Any question whose name matches a TARGET_FIELDS key/alias via normToken
    // counts as covered even when computeAutoMap picks a sibling — this test
    // is about "is there a mapping SLOT for this question", not tie-breaking.
    const registryTokens = new Set<string>();
    for (const t of TARGET_FIELDS) {
      registryTokens.add(normToken(t.key));
      for (const a of t.aliases ?? []) registryTokens.add(normToken(a));
    }

    const unmapped = questions
      .filter((q) => !mappedNames.has(q.name))
      .filter((q) => !registryTokens.has(normToken(q.name)))
      .filter((q) => !UNMAPPED_ALLOWLIST.has(q.name))
      .map((q) => `${q.name} (${q.type})`);

    if (unmapped.length) {
      throw new Error(
        `Unmapped XLSForm questions detected — add them to TARGET_FIELDS ` +
        `in src/lib/microplanning/koboAutoMap.ts or extend UNMAPPED_ALLOWLIST ` +
        `with a justification comment:\n  • ${unmapped.join("\n  • ")}`,
      );
    }
  });

  it("computeAutoMap resolves canonical questions by name AND label", () => {
    const fields: KoboField[] = [
      { name: "flhf_name", type: "text", label: "FLHF Name" },
      { name: "estimated_total_population", type: "integer", label: "Estimated Total Population" },
      { name: "some_wild_name", type: "text", label: "Community" },
    ];
    const map = computeAutoMap(fields);
    expect(map.flhf_name).toBe("flhf_name");
    expect(map.estimated_total_population).toBe("estimated_total_population");
    // Label-matched fallback for the community column.
    expect(map.community_name).toBe("some_wild_name");
  });

  it("TARGET_FIELDS entries carry unique keys", () => {
    const keys = TARGET_FIELDS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
