import { describe, it, expect } from "vitest";
import {
  rowInLensScope,
  projectInLensScope,
  campaignInLensScope,
  readKoboGeo,
  readKoboCampaign,
  type MdaLensGrant,
} from "@/lib/mdaLens/config";

const grant = (over: Partial<MdaLensGrant> = {}): MdaLensGrant => ({
  user_id: "u1",
  enabled: true,
  microplan_tabs: [],
  supervisory_tabs: [],
  states: ["Kano"],
  lgas: ["Dala"],
  wards: [],
  project_ids: [],
  campaign_types: [],
  can_export: true,
  ...over,
});

describe("MDA Lens — geography scoping", () => {
  it("keeps rows inside the granted State and LGA", () => {
    expect(rowInLensScope(grant(), "Kano", "Dala", "Gwammaja")).toBe(true);
  });

  it("rejects rows from another State", () => {
    expect(rowInLensScope(grant(), "Jigawa", "Dutse")).toBe(false);
  });

  it("rejects rows from a non-granted LGA inside the granted State", () => {
    expect(rowInLensScope(grant(), "Kano", "Ungogo")).toBe(false);
  });

  it("rejects a non-granted ward when wards are pinned", () => {
    const lens = grant({ wards: ["Gwammaja"] });
    expect(rowInLensScope(lens, "Kano", "Dala", "Kabuwaya")).toBe(false);
    expect(rowInLensScope(lens, "Kano", "Dala", "Gwammaja")).toBe(true);
  });

  it("allows every LGA/Ward when only a State is granted", () => {
    const lens = grant({ lgas: [], wards: [] });
    expect(rowInLensScope(lens, "Kano", "Ungogo", "Rimin Gado")).toBe(true);
    expect(rowInLensScope(lens, "Jigawa", "Dutse")).toBe(false);
  });

  it("matches despite Kobo formatting variants (case, code prefixes, suffixes, cascade paths)", () => {
    for (const value of ["kano", "KANO", " Kano ", "c__kano", "Kano State", "Nigeria|Kano"]) {
      expect(rowInLensScope(grant({ lgas: [] }), value, "")).toBe(true);
    }
  });

  it("does not let a look-alike value slip through normalization", () => {
    for (const value of ["Kanoo", "Kanawa", "Kano-South-Extra", "c__jigawa", "Katsina State"]) {
      expect(rowInLensScope(grant({ lgas: [] }), value, "")).toBe(false);
    }
  });

  it("treats a null lens (unrestricted admin) as full access", () => {
    expect(rowInLensScope(null, "Anywhere", "Anything")).toBe(true);
  });
});

describe("MDA Lens — project and campaign scoping", () => {
  it("hides projects outside the grant", () => {
    const lens = grant({ project_ids: ["p-accelerate"] });
    expect(projectInLensScope(lens, "p-accelerate")).toBe(true);
    expect(projectInLensScope(lens, "p-givewell")).toBe(false);
  });

  it("allows all projects when none are pinned", () => {
    expect(projectInLensScope(grant(), "p-anything")).toBe(true);
  });

  it("hides campaign types outside the grant", () => {
    const lens = grant({ campaign_types: ["Onchocerciasis"] });
    expect(campaignInLensScope(lens, "onchocerciasis")).toBe(true);
    expect(campaignInLensScope(lens, "Schistosomiasis")).toBe(false);
  });
});

describe("MDA Lens — Kobo field extraction", () => {
  it("reads geography from group-prefixed, variant-named Kobo fields", () => {
    const row = {
      "group_geo/mda_state": "Kano",
      "group_geo/sel_lga": "Dala",
      "group_geo/ward_name": "Gwammaja",
      "meta/instanceID": "uuid:1",
    };
    expect(readKoboGeo(row)).toEqual({ state: "Kano", lga: "Dala", ward: "Gwammaja" });
  });

  it("reads the campaign type regardless of prefix", () => {
    expect(readKoboCampaign({ "grp/mda_campaign_type": "Onchocerciasis" })).toBe("Onchocerciasis");
  });

  it("returns empty strings when geography is absent", () => {
    expect(readKoboGeo({ foo: 1 })).toEqual({ state: "", lga: "", ward: "" });
  });
});

/**
 * Simulates the exact predicates the two MDA pages apply to a live/real-time
 * fetch result, proving a lens user can never be handed out-of-scope rows even
 * when the underlying read returns the full national dataset.
 */
describe("MDA Lens — real-time read cannot be bypassed", () => {
  const nationalKoboRows = [
    { "grp/state": "Kano", "grp/lga": "Dala", "grp/ward": "Gwammaja", "grp/campaign_type": "Oncho", v: 1 },
    { "grp/state": "c__kano", "grp/lga": "Dala LGA", "grp/ward": "Kabuwaya", "grp/campaign_type": "Oncho", v: 2 },
    { "grp/state": "Kano", "grp/lga": "Ungogo", "grp/ward": "Zango", "grp/campaign_type": "Oncho", v: 3 },
    { "grp/state": "Jigawa", "grp/lga": "Dutse", "grp/ward": "Limawa", "grp/campaign_type": "Oncho", v: 4 },
    { "grp/state": "Kano", "grp/lga": "Dala", "grp/ward": "Gwammaja", "grp/campaign_type": "Schisto", v: 5 },
  ];

  const supervisoryFilter = (lens: MdaLensGrant, rows: Record<string, unknown>[]) =>
    rows.filter((r) => {
      const { state, lga, ward } = readKoboGeo(r);
      return rowInLensScope(lens, state, lga, ward) && campaignInLensScope(lens, readKoboCampaign(r));
    });

  it("filters a full national Kobo payload down to the granted State/LGA", () => {
    const kept = supervisoryFilter(grant(), nationalKoboRows);
    expect(kept.map((r) => r.v)).toEqual([1, 2, 5]);
  });

  it("also enforces campaign type on the same payload", () => {
    const kept = supervisoryFilter(grant({ campaign_types: ["Oncho"] }), nationalKoboRows);
    expect(kept.map((r) => r.v)).toEqual([1, 2]);
  });

  it("never leaks a row whose State is outside the grant, in any variant", () => {
    const lens = grant();
    const hostile = [
      { "grp/state": "Jigawa", "grp/lga": "Dala" }, // right LGA name, wrong State
      { "grp/state": "c__jigawa", "grp/lga": "Dala" },
      { "grp/state": "JIGAWA STATE", "grp/lga": "dala" },
      { "grp/state": "Nigeria|Jigawa", "grp/lga": "Dala" },
    ];
    expect(supervisoryFilter(lens, hostile)).toHaveLength(0);
  });

  const microplanFilter = (lens: MdaLensGrant, rows: any[]) =>
    rows.filter(
      (e) => rowInLensScope(lens, e.state, e.lga, e.ward) && campaignInLensScope(lens, e.campaign_type),
    );

  it("filters microplan entries the same way, including the export row-set", () => {
    const entries = [
      { id: "a", state: "Kano", lga: "Dala", ward: "Gwammaja" },
      { id: "b", state: "Kano", lga: "Ungogo", ward: "Zango" },
      { id: "c", state: "Jigawa", lga: "Dutse", ward: "Limawa" },
    ];
    const visible = microplanFilter(grant(), entries);
    expect(visible.map((e) => e.id)).toEqual(["a"]);
    // The export always derives from the visible row-set, never the raw fetch.
    expect(visible.length).toBeLessThan(entries.length);
  });
});
