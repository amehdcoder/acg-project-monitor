// Fixture test for the community_repeat parser used by the Kobo webhook.
// Guarantees PWD / CDD / Trachoma fields nested inside each repeat item
// unpack into the exact microplan_entries column names.

import { describe, it, expect } from "vitest";
import {
  extractRepeatDisaggregations,
  pickFirst,
  pickNumber,
  resolveCoordinates,
  validateRepeatDisaggregations,
  parseRepeatDisaggregations,
  RepeatItemValidationError,
  type MicroplanRepeatRow,
} from "../../../../supabase/functions/_shared/microplanRepeatItem";

describe("extractRepeatDisaggregations", () => {
  it("unpacks flat per-community keys", () => {
    const item = {
      pwd_total: 12, pwd_visual: 3, pwd_hearing: 1, pwd_physical: 2,
      pwd_intellectual: 1, pwd_communication: 1, pwd_selfcare: 2, pwd_albinism: 2,
      cdd_names: "Aisha, Musa", cdd_phone_numbers: "080..., 081...",
      cdd_from_community: "yes",
      trachoma_0_5_months: 4, trachoma_6m_6y: 10, trachoma_7_14y: 7, trachoma_15_plus: 30,
    };
    const out = extractRepeatDisaggregations(item);
    expect(out.pwd_total).toBe(12);
    expect(out.pwd_visual).toBe(3);
    expect(out.pwd_albinism).toBe(2);
    expect(out.cdd_names).toBe("Aisha, Musa");
    expect(out.cdd_from_community).toBe("yes");
    expect(out.trachoma_15_plus).toBe(30);
  });

  it("resolves grouped Kobo paths (pwd_grp/, cdd_grp/, trachoma_grp/)", () => {
    const item = {
      "pwd_grp/pwd_total": "5",
      "pwd_grp/pwd_visual": "1",
      "cdd_grp/cdd_names": "  Zainab ",
      "cdd_grp/cdd_phone_numbers": "0803000000",
      "trachoma_grp/trachoma_0_5_months": 2,
    };
    const out = extractRepeatDisaggregations(item);
    expect(out.pwd_total).toBe(5);
    expect(out.pwd_visual).toBe(1);
    expect(out.cdd_names).toBe("Zainab");
    expect(out.cdd_phone_numbers).toBe("0803000000");
    expect(out.trachoma_0_5_months).toBe(2);
  });

  it("returns null for missing fields (never undefined) so downstream cleanup drops them", () => {
    const out = extractRepeatDisaggregations({});
    for (const k of [
      "pwd_total","pwd_visual","pwd_hearing","pwd_physical","pwd_intellectual",
      "pwd_communication","pwd_selfcare","pwd_albinism",
      "cdd_names","cdd_phone_numbers","cdd_from_community",
      "trachoma_0_5_months","trachoma_6m_6y","trachoma_7_14y","trachoma_15_plus",
    ]) {
      expect(out).toHaveProperty(k, null);
    }
  });

  it("uses the microplan_entries column names exactly (contract lock)", () => {
    const out = extractRepeatDisaggregations({ pwd_total: 1 });
    // Contract with public.microplan_entries columns — do NOT rename these.
    expect(Object.keys(out).sort()).toEqual([
      "cdd_from_community","cdd_names","cdd_phone_numbers",
      "pwd_albinism","pwd_communication","pwd_hearing","pwd_intellectual",
      "pwd_physical","pwd_selfcare","pwd_total","pwd_visual",
      "trachoma_0_5_months","trachoma_15_plus","trachoma_6m_6y","trachoma_7_14y",
    ]);
  });
});

// ── Repeat unpacking with typed (free-text) FLHF / Community / Settlement ──
describe("community_repeat unpacking with free-text location names", () => {
  const payload = {
    _uuid: "abc-123",
    project_id: "11111111-1111-1111-1111-111111111111",
    state: "Jigawa", lga: "Dutse", ward: "Limawa",
    flhf_name: "Limawa PHC",
    flhf_gps: "11.7 9.3 400 5",
    community_repeat: [
      {
        community_name: "Nayinawa",
        settlement_name: "Unguwar Sarki",
        settlement_mai_unguwa: "Alhaji Bala",
        community_gps: "11.71 9.31 402 5",
        pwd_total: 9, pwd_visual: 3,
        cdd_names: "Aisha, Musa", cdd_phone_numbers: "08031234567",
        trachoma_7_14y: 12,
        estimated_children_0_4: 40,
        additional_notes: "Riverine access",
      },
      {
        community_name: "Kachi",
        manual_latitude: "11.90", manual_longitude: "9.10",
        pwd_total: 2, cdd_names: "Hauwa",
      },
    ],
  };

  it("unpacks each repeat item with typed names, coordinates and project binding", () => {
    const rows: MicroplanRepeatRow[] = payload.community_repeat.map((item, idx) => ({
      idempotency_key: `${payload._uuid}_${idx}`,
      project_id: payload.project_id,
      flhf_name: pickFirst(item, ["flhf_name"]) ?? payload.flhf_name,
      community_name: pickFirst(item, ["community_name"]),
      settlement_name: pickFirst(item, ["settlement_name"]),
      settlement_mai_unguwa: pickFirst(item, ["settlement_mai_unguwa"]),
      estimated_children_0_4: pickNumber(item, ["estimated_children_0_4"]),
      notes: pickFirst(item, ["additional_notes", "notes"]),
      ...extractRepeatDisaggregations(item),
      ...(() => {
        const c = resolveCoordinates(item);
        return { community_latitude: c.lat, community_longitude: c.lng, geotagged: c.geotagged };
      })(),
    }));

    expect(rows).toHaveLength(2);
    expect(rows[0].idempotency_key).toBe("abc-123_0");
    expect(rows[1].idempotency_key).toBe("abc-123_1");
    for (const r of rows) {
      expect(r.project_id).toBe("11111111-1111-1111-1111-111111111111");
      expect(r.flhf_name).toBe("Limawa PHC");
      expect(r.geotagged).toBe(true);
    }
    expect(rows[0].community_name).toBe("Nayinawa");
    expect(rows[0].settlement_name).toBe("Unguwar Sarki");
    expect(rows[0].settlement_mai_unguwa).toBe("Alhaji Bala");
    expect(rows[0].community_latitude).toBeCloseTo(11.71, 4);
    // Disaggregation fields must be present on the mapped row and match source.
    for (const key of ["pwd_total", "pwd_visual", "cdd_names", "cdd_phone_numbers", "trachoma_7_14y"] as const) {
      expect(rows[0]).toHaveProperty(key);
    }
    expect(rows[0].pwd_total).toBe(9);
    expect(rows[0].pwd_visual).toBe(3);
    expect(rows[0].cdd_names).toBe("Aisha, Musa");
    expect(rows[0].cdd_phone_numbers).toBe("08031234567");
    expect(rows[0].trachoma_7_14y).toBe(12);
    expect(rows[0].notes).toBe("Riverine access");
    // Second item has no geopoint — manual lat/long fallback must apply.
    expect(rows[1].community_latitude).toBeCloseTo(11.9, 4);
    expect(rows[1].community_longitude).toBeCloseTo(9.1, 4);
    expect(rows[1].settlement_name).toBeNull();
    expect(rows[1].pwd_total).toBe(2);
    expect(rows[1].cdd_names).toBe("Hauwa");
    expect(rows[1].trachoma_7_14y).toBeNull();
  });
});

// ── RUNTIME VALIDATION OF DISAGGREGATION COLUMNS ───────────────────────

describe("validateRepeatDisaggregations (runtime schema)", () => {
  const complete = {
    community_name: "Nayinawa",
    pwd_total: 9,
    cdd_names: "Aisha, Musa",
    trachoma_7_14y: 12,
  };

  it("accepts a complete item in strict mode and returns mapped data", () => {
    const res = validateRepeatDisaggregations(complete, { requireDisaggregations: true });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.pwd_total).toBe(9);
      expect(res.data.cdd_names).toBe("Aisha, Musa");
      expect(res.data.trachoma_7_14y).toBe(12);
    }
  });

  it.each([
    ["pwd_total", { ...complete, pwd_total: undefined }],
    ["cdd_names", { ...complete, cdd_names: "   " }],
    ["trachoma_7_14y", { ...complete, trachoma_7_14y: null }],
  ])("fails fast with a clear error when %s is missing", (field, item) => {
    const res = validateRepeatDisaggregations(item as Record<string, unknown>, {
      requireDisaggregations: true,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues).toEqual([
        { field, code: "required", message: "field is missing or empty in the webhook payload" },
      ]);
      expect(res.error.message).toContain(field);
      expect(res.error.message).toContain("required");
    }
    expect(() =>
      parseRepeatDisaggregations(item as Record<string, unknown>, { requireDisaggregations: true }),
    ).toThrow(RepeatItemValidationError);
  });

  it("reports every missing required field at once", () => {
    const res = validateRepeatDisaggregations({ community_name: "Kachi" }, { requireDisaggregations: true });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.map((i) => i.field).sort()).toEqual([
        "cdd_names", "pwd_total", "trachoma_7_14y",
      ]);
    }
  });

  it("rejects malformed types even outside strict mode", () => {
    const res = validateRepeatDisaggregations({
      pwd_total: "not-a-number",
      trachoma_7_14y: -4,
      cdd_names: { first: "Aisha" },
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const byField = Object.fromEntries(res.error.issues.map((i) => [i.field, i]));
      expect(byField.pwd_total.code).toBe("invalid_type");
      expect(byField.trachoma_7_14y.message).toContain("non-negative");
      expect(byField.cdd_names.message).toContain("expected text");
    }
  });

  it("does not require disaggregations by default (backward compatible)", () => {
    expect(validateRepeatDisaggregations({ community_name: "Kachi" }).success).toBe(true);
  });
});

// ── EXACT VALUE PARITY: mapped row vs source payload, multiple fixtures ──

describe("mapped row disaggregation values match the source payload exactly", () => {
  const fixtures: Array<{
    name: string;
    item: Record<string, unknown>;
    expected: { pwd_total: number | null; cdd_names: string | null; trachoma_7_14y: number | null };
  }> = [
    {
      name: "flat numeric keys",
      item: { pwd_total: 9, cdd_names: "Aisha, Musa", trachoma_7_14y: 12 },
      expected: { pwd_total: 9, cdd_names: "Aisha, Musa", trachoma_7_14y: 12 },
    },
    {
      name: "numeric strings from KoboCollect",
      item: { pwd_total: "17", cdd_names: " Zainab ", trachoma_7_14y: "3" },
      expected: { pwd_total: 17, cdd_names: "Zainab", trachoma_7_14y: 3 },
    },
    {
      name: "grouped Kobo paths",
      item: {
        "pwd_grp/pwd_total": "5",
        "cdd_grp/cdd_names": "Hauwa; Bala",
        "trachoma_grp/trachoma_7_14y": 22,
      },
      expected: { pwd_total: 5, cdd_names: "Hauwa; Bala", trachoma_7_14y: 22 },
    },
    {
      name: "thousands separators",
      item: { pwd_total: "1,204", cdd_names: "Musa", trachoma_7_14y: "2,000" },
      expected: { pwd_total: 1204, cdd_names: "Musa", trachoma_7_14y: 2000 },
    },
    {
      name: "zero values are preserved (not coerced to null)",
      item: { pwd_total: 0, cdd_names: "None", trachoma_7_14y: 0 },
      expected: { pwd_total: 0, cdd_names: "None", trachoma_7_14y: 0 },
    },
  ];

  it.each(fixtures)("$name", ({ item, expected }) => {
    const row: MicroplanRepeatRow = {
      idempotency_key: "fx_0",
      project_id: "11111111-1111-1111-1111-111111111111",
      flhf_name: null, community_name: null, settlement_name: null,
      settlement_mai_unguwa: null, estimated_children_0_4: null, notes: null,
      community_latitude: null, community_longitude: null, geotagged: false,
      ...parseRepeatDisaggregations(item),
    };
    expect(row.pwd_total).toBe(expected.pwd_total);
    expect(row.cdd_names).toBe(expected.cdd_names);
    expect(row.trachoma_7_14y).toBe(expected.trachoma_7_14y);
  });
});
