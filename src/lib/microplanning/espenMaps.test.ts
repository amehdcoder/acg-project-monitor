import { describe, it, expect } from "vitest";
import { ESPEN_MAPS, classIndex, cddCount } from "./espenMaps";
const m = (id: string) => ESPEN_MAPS.find((x) => x.id === id)!;
describe("ESPEN thematic maps", () => {
  it("classes FLHF distance at 5/10/15 km", () => {
    expect(classIndex(m("distance"), 4)).toBe(0);
    expect(classIndex(m("distance"), 12)).toBe(2);
    expect(classIndex(m("distance"), 20)).toBe(3);
  });
  it("coverage uses the 80% target and leaves missing data unestimated", () => {
    expect(m("coverage").value({ households_treated: 80, number_of_households: 100 }, 1)).toBe(80);
    expect(classIndex(m("coverage"), 80)).toBe(2);
    expect(m("coverage").value({ number_of_households: 100 }, 1)).toBeNull();
  });
  it("CDD workload divides population by named CDDs", () => {
    expect(cddCount({ cdd_names: "Ali, Musa; Fatima" })).toBe(3);
    expect(m("cdd").value({ estimated_total_population: 900, cdd_names: "Ali, Musa, Fatima" }, 1)).toBe(300);
  });
});
