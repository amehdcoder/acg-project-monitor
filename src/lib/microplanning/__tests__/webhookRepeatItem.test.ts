// Fixture test for the community_repeat parser used by the Kobo webhook.
// Guarantees PWD / CDD / Trachoma fields nested inside each repeat item
// unpack into the exact microplan_entries column names.

import { describe, it, expect } from "vitest";
import { extractRepeatDisaggregations } from "../../../../supabase/functions/_shared/microplanRepeatItem";

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
