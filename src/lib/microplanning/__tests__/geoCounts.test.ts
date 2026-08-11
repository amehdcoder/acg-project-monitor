import { describe, it, expect } from "vitest";
import { countGeography } from "../geoCounts";
import { analyzeDuplicates } from "../duplicates";

const rows = [
  { id: "1", state: "Kano", lga: "Dala", ward: "Kabuwaya", flhf_name: "PHC A", community_name: "C1", settlement_name: "S1", estimated_total_population: 100, created_at: "2026-01-01" },
  // exact duplicate (removable) — must not change ward counts
  { id: "2", state: "kano ", lga: "Dala", ward: " kabuwaya", flhf_name: "PHC A", community_name: "C1", settlement_name: "S1", estimated_total_population: 100, created_at: "2026-01-02" },
  // same ward name, different LGA → distinct ward
  { id: "3", state: "Kano", lga: "Gwale", ward: "Kabuwaya", flhf_name: "PHC B", community_name: "C2", settlement_name: "S2", estimated_total_population: 50, created_at: "2026-01-01" },
  // blanks / placeholders must not count
  { id: "4", state: "Kano", lga: "", ward: "  ", flhf_name: "Unassigned Health Facility", community_name: "C3", settlement_name: "S3", estimated_total_population: 10, created_at: "2026-01-01" },
];

describe("geography KPI consistency", () => {
  it("counts wards on blank-excluding composite keys", () => {
    const g = countGeography(rows);
    expect(g.states).toBe(1);
    expect(g.lgas).toBe(2);
    expect(g.wards).toBe(2);
    expect(g.flhfs).toBe(2);
  });

  it("keeps ward totals identical after duplicate removal", () => {
    const before = countGeography(rows);
    const removable = new Set(analyzeDuplicates(rows as any).removableIds);
    expect(removable.size).toBe(1);
    const after = countGeography(rows.filter((r) => !removable.has(r.id)));
    expect(after).toEqual(before);
  });
});
