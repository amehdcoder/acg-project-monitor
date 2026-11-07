import { describe, expect, it } from "vitest";
import { buildRoundXlsForm, lotChoice, mopUpCommunities, snapshotPlans, summariseRound } from "./roundForms";
import { buildPlan } from "./lqas";
import * as XLSX from "xlsx";

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
  it("withholds weighted summaries when a reported lot lacks population", () => {
    const s = summariseRound([{ population: 0, status: "PASS", covered_count: 19, sampled_count: 19 }]);
    expect(s.coverage).toBeNull(); expect(s.missingWeights).toBe(1);
  });
  it("excludes incomplete and invalid observations from classified summaries", () => {
    const s = summariseRound([{ population: 100, status: "In Progress", covered_count: 18, sampled_count: 18 }, { population: 100, status: "PASS", covered_count: 20, sampled_count: 19 }]);
    expect(s.reported).toBe(0); expect(s.coverage).toBeNull();
  });
  it("retains frozen sampling points and the saved indicator in phone exports", async () => {
    const plans = buildPlan([{ state: "Kano", lga: "Dala", ward: "A", flhf_name: "PHC", community_name: "Original", estimated_total_population: 100 }], "ward");
    const round = { id: "12345678-aaaa-bbbb-cccc-1234567890ab", disease: "Trachoma", drug: null, eu_level: "lga", eu_key: "KANO › DALA", eu_name: "Dala", upper_threshold: 80, sample_n: 19, decision_rule: 13, indicator: "Saved medicine ingestion", sampling_snapshot: plans };
    expect(snapshotPlans(round)?.[0].sample[0].community).toBe("Original");
    const blob = buildRoundXlsForm(round, [{ id: "12345678-aaaa-bbbb-cccc-1234567890ab", lot_key: plans[0].key, lot_name: "A", security_status: "Green" }], "Project", "Changed question");
    const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.survey);
    expect(rows.find((r) => r.name === "received")?.label).toBe("Saved medicine ingestion");
    expect(rows.find((r) => r.name === "lqas_respondents" && r.type === "begin_repeat")?.repeat_count).toBe("19");
    expect(rows.find((r) => r.name === "planned_community")?.calculation).toContain("Original");
    expect(rows.find((r) => r.name === "covered")?.calculation).toBe("count(${lqas_respondents}[received = 'yes'])");
  });
});
