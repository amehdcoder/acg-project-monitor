import { describe, it, expect } from "vitest";
import { analyseGpsQuality, normLga } from "../gpsQuality";
import type { AdminBoundary } from "../nigeriaAdminBoundaries";
const sq = (state: string, lga: string, w: number, s: number, e: number, n: number): AdminBoundary => ({ type: "Feature", properties: { state, lga, state_pcode: "", pcode: "", center_lat: 0, center_lon: 0 }, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
const L = [sq("Kano", "Gabasawa", 8.7, 12.1, 9.0, 12.4), sq("Kano", "Rano", 8.4, 11.4, 8.6, 11.6), sq("Jigawa", "Dutse", 9.2, 11.6, 9.6, 12.0)];
const row = (id: string, lga: string, lat: number, lng: number) => ({ id, state: "Kano", lga, community_latitude: lat, community_longitude: lng });
describe("GPS quality check", () => {
  it("classifies inside, swapped, other State, outside Nigeria and border points", () => {
    const r = analyseGpsQuality([row("a", "Gabasawa", 12.2, 8.8), row("b", "Gabasawa", 8.8, 12.2), row("c", "Gabasawa", 11.8, 9.4), row("d", "Gabasawa", 30, 30), row("e", "Gabasawa", 12.2, 8.695)], L);
    expect(r.counts).toMatchObject({ inside: 1, swapped: 1, other_state: 1, outside_nigeria: 1, border: 1 });
    expect(r.score).toBe(40);
  });
  it("treats official spelling variants as the same LGA", () => { expect(normLga("Garun Malam")).toBe(normLga("Garum Mallam")); });
  it("flags many communities sharing one GPS spot", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ ...row(`x${i}`, "Rano", 11.5, 8.5), community_name: `Village ${i}` }));
    expect(analyseGpsQuality(rows, L).clusters[0].count).toBe(6);
  });
  it("counts missing coordinates separately", () => { expect(analyseGpsQuality([{ id: "m", state: "Kano", lga: "Rano" }], L).missing).toBe(1); });
});
