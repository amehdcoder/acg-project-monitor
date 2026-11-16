import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { geometryContains, normState } from "../heatmaps";
import { selectAdminBoundaries, type AdminCollection, type NigeriaAdminBoundaries } from "../nigeriaAdminBoundaries";

const base = "public/data/nigeria-admin/cod-v01";
const states = JSON.parse(readFileSync(`${base}/states.geojson`, "utf8")) as AdminCollection;
const lgas = JSON.parse(readFileSync(`${base}/lgas.geojson`, "utf8")) as AdminCollection;
const data: NigeriaAdminBoundaries = { states, lgas };
afterEach(() => { vi.unstubAllGlobals(); });

describe("government-provenance Nigeria map reference", () => {
  it("covers 36 States plus FCT, and exactly 774 unique official LGAs", () => {
    expect(states.features).toHaveLength(37);
    expect(lgas.features).toHaveLength(774);
    expect(new Set(lgas.features.map(f => f.properties.pcode)).size).toBe(774);
    expect(lgas.features.filter(f => f.properties.state === "Borno")).toHaveLength(27);
    expect(lgas.features.some(f => f.properties.lga === "Lake Chad")).toBe(false);
    expect(lgas.features.filter(f => f.properties.state === "Federal Capital Territory")).toHaveLength(6);
  });

  it("retains the downloaded COD coordinates without simplification or axis swapping", () => {
    // Independently recorded from the standard OCHA archive, not computed from the bundled files.
    expect(createHash("sha256").update(JSON.stringify(states.features.map(f => f.geometry))).digest("hex")).toBe("STATE_GEOMETRY_SHA");
    expect(createHash("sha256").update(JSON.stringify(lgas.features.map(f => f.geometry))).digest("hex")).toBe("LGA_GEOMETRY_SHA");
  });

  it("keeps all 774 LGAs linked to an existing official State P-code", () => {
    const parents = new Map(states.features.map(f => [f.properties.pcode, f.properties.state]));
    for (const f of lgas.features) expect(parents.get(f.properties.state_pcode)).toBe(f.properties.state);
  });

  it("uses the correct State for known Nigerian city coordinates", () => {
    for (const [state, lat, lng] of [["Kano", 12.0022, 8.5920], ["Jigawa", 11.75, 9.33], ["Yobe", 11.75, 11.96], ["Federal Capital Territory", 9.0765, 7.3986], ["Lagos", 6.5244, 3.3792]] as const) {
      const matches = states.features.filter(f => geometryContains(f.geometry, lat, lng));
      expect(matches.map(f => f.properties.state)).toEqual([state]);
    }
  });

  it("normalizes legacy Nasarawa and Abuja labels without removing neighbouring LGAs", () => {
    expect(normState("Nassarawa State")).toBe("NASARAWA");
    expect(selectAdminBoundaries(data, ["Nassarawa State"]).lgas.features).toHaveLength(13);
    const fct = selectAdminBoundaries(data, ["Abuja"]);
    expect(fct.states.features).toHaveLength(1);
    expect(fct.lgas.features).toHaveLength(6);
    expect(selectAdminBoundaries(data, ["Yobe"]).lgas.features).toHaveLength(17);
    expect(selectAdminBoundaries(data, []).states.features).toHaveLength(0);
  });

  it("shares one successful load across map tabs and retries a failed load", async () => {
    vi.resetModules();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true, json: async () => lgas })
      .mockResolvedValueOnce({ ok: true, json: async () => states }).mockResolvedValueOnce({ ok: true, json: async () => lgas });
    vi.stubGlobal("fetch", fetcher);
    const { loadNigeriaAdminBoundaries } = await import("../nigeriaAdminBoundaries");
    await expect(loadNigeriaAdminBoundaries()).rejects.toThrow("offline");
    const first = loadNigeriaAdminBoundaries();
    expect(loadNigeriaAdminBoundaries()).toBe(first);
    expect((await first).lgas.features).toHaveLength(774);
    await loadNigeriaAdminBoundaries();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});