import { describe, expect, it } from "vitest";
import { buildLots, roundDesign, type RoundEntry } from "./rounds";

const row = (ward: string, community: string, extra: Partial<RoundEntry> = {}): RoundEntry => ({
  state: "Yobe", lga: "Gujba", ward, flhf_name: "PHC", community_name: community,
  estimated_total_population: 100, number_of_households: 20, ...extra,
});

describe("LQAS round design (n=19)", () => {
  it.each([[80, 13], [85, 14], [90, 15], [65, 10]])("upper %i%% gives PASS if covered >= %i", (u, d) => {
    expect(roundDesign(19, u, 50).d).toBe(d);
  });
});

describe("lots one level below the evaluation unit", () => {
  const eu = "YOBE › GUJBA";
  it("LGA evaluation unit makes one lot per ward, summing population", () => {
    const lots = buildLots([row("Katarko", "A"), row("Katarko", "B"), row("Buni", "C")], "lga", eu);
    expect(lots.map((l) => l.lot_name).sort()).toEqual(["BUNI", "KATARKO"]);
    expect(lots.find((l) => l.lot_name === "KATARKO")!.population).toBe(200);
  });
  it("puts high-risk lots first with recorded flags", () => {
    const lots = buildLots([row("Buni", "C"), row("Katarko", "A", { security_clearance: "not_cleared", accessibility: "hard_to_reach" })], "lga", eu, new Set(["YOBE › GUJBA › KATARKO"]));
    expect(lots[0].lot_name).toBe("KATARKO");
    expect(lots[0].security_status).toBe("Red");
    expect(lots[0].risk_flags).toEqual(["Previous FAIL", "Security Red", "Hard-to-Reach"]);
  });
});
