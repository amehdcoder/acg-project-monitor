import { describe, expect, it } from "vitest";
import { lotChoice, mopUpCommunities, summariseRound } from "./roundForms";

describe("LQAS round tools", () => {
  it("encodes lot ids as Kobo-safe choices", () => {
    expect(lotChoice("12345678-aaaa-bbbb-cccc-1234567890ab")).toBe("L12345678aaaabbbbcccc1234567890ab");
  });
  it("lists every community of the failed lot, largest first", () => {
    const e = [
      { state: "Kano", lga: "Dala", ward: "A", flhf_name: "", community_name: "Small", estimated_total_population: 100 },
      { state: "Kano", lga: "Dala", ward: "A", flhf_name: "", community_name: "Big", estimated_total_population: 900, security_clearance: "not_cleared" },
      { state: "Kano", lga: "Dala", ward: "B", flhf_name: "", community_name: "Other", estimated_total_population: 500 },
    ] as never[];
    const round = { id: "r", disease: "x", drug: null, eu_level: "lga", eu_key: "KANO › DALA", eu_name: "Dala", upper_threshold: 80, sample_n: 19, decision_rule: 13 };
    const key = "KANO › DALA › A";
    const out = mopUpCommunities(e, round, key);
    expect(out.map((c) => c.community)).toEqual(["Big", "Small"]);
    expect(out[0].restricted).toBe(true);
  });
  it("computes pass rate from reported lots only", () => {
    const s = summariseRound([
      { population: 100, status: "PASS", covered_count: 17, sampled_count: 19 },
      { population: 100, status: "FAIL", covered_count: 9, sampled_count: 19 },
      { population: 100, status: "Not Started", covered_count: null, sampled_count: null },
    ]);
    expect(s.reported).toBe(2); expect(s.passRate).toBe(0.5); expect(s.coverage).toBeCloseTo(13 / 19);
  });
});
