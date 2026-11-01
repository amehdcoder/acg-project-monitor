import { describe, it, expect } from "vitest";
import { normSummary } from "../definition";
describe("legacy age bands", () => {
  it("keeps legacy 15+ consultations", () => {
    const s = normSummary({ consult: { a0_4: { m: 1, f: 1 }, a5_14: { m: 1, f: 0 }, a15: { m: 4, f: 6 } } } as any);
    expect(s.consult.a0_14).toEqual({ m: 2, f: 1 });
    expect(s.consult.a15_39).toEqual({ m: 4, f: 6 });
  });
});
