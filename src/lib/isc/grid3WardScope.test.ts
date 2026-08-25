/**
 * GRID3 Coordinate Accuracy Audit — ward-scoping guarantees.
 *
 * The audit may only compare a captured community with registry settlements
 * inside the SAME Ward of the SAME LGA and State. These tests pin that rule,
 * including the negative cross-ward / cross-LGA / cross-state cases.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  findGrid3Named, nearestGrid3InWard, grid3WardSettlementCount,
} from "./grid3Nearest";

/** [name, lat, lng] triples keyed State → LGA → Ward. */
const REGISTRY = {
  Kano: {
    Dala: {
      "Ward A": [
        ["Gwale", 12.0, 8.5],
        ["Kofar Mata", 12.02, 8.52],
      ],
      "Ward B": [["Gwale", 12.4, 8.9]],
    },
    Nassarawa: {
      "Ward A": [["Gwale", 12.6, 9.2]],
    },
  },
  Jigawa: {
    Dala: {
      "Ward A": [["Gwale", 11.2, 9.9]],
    },
  },
};

beforeAll(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => REGISTRY })));
});

const AT_WARD_A = { lat: 12.001, lng: 8.501 };

describe("ward-only registry matching", () => {
  it("matches a community to the same-name settlement inside its own ward", async () => {
    const hit = await findGrid3Named("Gwale", AT_WARD_A.lat, AT_WARD_A.lng, {
      ward: "Ward A", lga: "Dala", state: "Kano", wardOnly: true,
    });
    expect(hit).not.toBeNull();
    expect(hit!.ward).toBe("Ward A");
    expect(hit!.lga).toBe("Dala");
    expect(hit!.state).toBe("Kano");
    expect(hit!.scope).toBe("ward");
    expect(hit!.distanceM).toBeLessThan(500);
  });

  it("never matches a same-name settlement in a neighbouring ward", async () => {
    // Captured in Ward C (no registry rows). The nearby "Gwale" of Ward A/B
    // must NOT be used.
    const hit = await findGrid3Named("Gwale", AT_WARD_A.lat, AT_WARD_A.lng, {
      ward: "Ward C", lga: "Dala", state: "Kano", wardOnly: true,
    });
    expect(hit).toBeNull();
  });

  it("never matches across LGAs even when the ward name is identical", async () => {
    const hit = await findGrid3Named("Kofar Mata", AT_WARD_A.lat, AT_WARD_A.lng, {
      ward: "Ward A", lga: "Nassarawa", state: "Kano", wardOnly: true,
    });
    expect(hit).toBeNull();
  });

  it("never matches across States even when Ward and LGA names are identical", async () => {
    const hit = await findGrid3Named("Kofar Mata", AT_WARD_A.lat, AT_WARD_A.lng, {
      ward: "Ward A", lga: "Dala", state: "Jigawa", wardOnly: true,
    });
    expect(hit).toBeNull();
  });

  it("returns nothing when the record carries no Ward or LGA", async () => {
    expect(await findGrid3Named("Gwale", AT_WARD_A.lat, AT_WARD_A.lng, {
      lga: "Dala", state: "Kano", wardOnly: true,
    })).toBeNull();
    expect(await findGrid3Named("Gwale", AT_WARD_A.lat, AT_WARD_A.lng, {
      ward: "Ward A", state: "Kano", wardOnly: true,
    })).toBeNull();
  });
});

describe("ward-confined spatial evidence", () => {
  it("returns the nearest settlement of the declared ward only", async () => {
    const near = await nearestGrid3InWard(12.39, 8.89, {
      ward: "Ward A", lga: "Dala", state: "Kano",
    });
    expect(near).not.toBeNull();
    // Ward B's Gwale is far closer, but it is out of scope.
    expect(near!.ward).toBe("Ward A");
  });

  it("returns nothing when the ward holds no registry settlements", async () => {
    expect(await nearestGrid3InWard(12.0, 8.5, {
      ward: "Ward C", lga: "Dala", state: "Kano",
    })).toBeNull();
  });
});

describe("ward registry coverage", () => {
  it("counts only settlements of the declared Ward / LGA / State", async () => {
    expect(await grid3WardSettlementCount("Kano", "Dala", "Ward A")).toBe(2);
    expect(await grid3WardSettlementCount("Kano", "Dala", "Ward B")).toBe(1);
    expect(await grid3WardSettlementCount("Kano", "Dala", "Ward C")).toBe(0);
    expect(await grid3WardSettlementCount("Kano", "", "Ward A")).toBe(0);
  });
});
