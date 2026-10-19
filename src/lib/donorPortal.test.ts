import { describe, it, expect } from "vitest";
import { choroplethCells, mergeMonthly, type DonorAggregates } from "./donorPortal";

const baseAgg: DonorAggregates = {
  total_beneficiaries: 10,
  active_beneficiaries: 8,
  by_sex: { Male: 4, Female: 6 },
  by_state: { Kano: 10 },
  by_lga: { "Kano / Gwale": 7, "Kano / Tarauni": 3 },
  by_age_band: { "5-14": 6, "15-24": 4 },
  with_disability: 2,
  total_services: 25,
  services_by_component: { health: 15, livelihood: 10 },
  services_by_month: [{ month: "2026-10", count: 25 }],
  registrations_by_month: [{ month: "2026-09", count: 4 }, { month: "2026-10", count: 6 }],
  home_visits_completed: 5,
  referrals_total: 3,
  feedback_total: 2,
};

describe("choroplethCells", () => {
  it("creates one cell per state/LGA pair keyed by the normalised map key", () => {
    const cells = choroplethCells(baseAgg);
    expect(cells.size).toBe(2);
    expect(cells.has("kano|gwale")).toBe(true);
    expect(cells.has("kano|tarauni")).toBe(true);
  });

  it("gives the highest-count LGA the deepest blue", () => {
    const cells = choroplethCells(baseAgg);
    const deep = cells.get("kano|gwale")!.fill;
    const light = cells.get("kano|tarauni")!.fill;
    // lightness channel: deeper colour = lower lightness
    const l = (s: string) => Number(s.match(/(\d+)%\)/)?.[1]);
    expect(l(deep)).toBeLessThan(l(light));
  });

  it("never includes row-level data — popups carry only place names and counts", () => {
    const cells = choroplethCells(baseAgg);
    for (const cell of cells.values()) {
      expect(cell.popupHtml).toContain("beneficiar");
      expect(cell.popupHtml).not.toMatch(/case id|full_name|beneficiary_id/i);
    }
  });

  it("handles an empty LGA map without dividing by zero", () => {
    const cells = choroplethCells({ ...baseAgg, by_lga: {} });
    expect(cells.size).toBe(0);
  });
});

describe("mergeMonthly", () => {
  it("sorts months chronologically", () => {
    const sorted = mergeMonthly([
      { month: "2026-10", count: 6 },
      { month: "2026-08", count: 2 },
      { month: "2026-09", count: 4 },
    ]);
    expect(sorted.map((s) => s.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
});
