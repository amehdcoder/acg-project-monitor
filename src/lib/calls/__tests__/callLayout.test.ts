import { describe, it, expect } from "vitest";
import { computeVideoGridLayout } from "../callLayout";

describe("computeVideoGridLayout", () => {
  it("single participant fills the frame", () => {
    const l = computeVideoGridLayout(1);
    expect(l.featured).toBe(false);
    expect(l.columns).toBe(1);
  });

  it("1:1 uses the featured picture-in-picture layout", () => {
    const l = computeVideoGridLayout(2);
    expect(l.featured).toBe(true);
  });

  it("small groups use a 2-column grid", () => {
    expect(computeVideoGridLayout(3).columns).toBe(2);
    expect(computeVideoGridLayout(4).columns).toBe(2);
    expect(computeVideoGridLayout(3).featured).toBe(false);
  });

  it("scales columns up as participants grow, without featured layout", () => {
    expect(computeVideoGridLayout(6).columns).toBe(3);
    expect(computeVideoGridLayout(9).columns).toBe(3);
    expect(computeVideoGridLayout(12).columns).toBe(4);
    expect(computeVideoGridLayout(20).columns).toBe(5);
    expect(computeVideoGridLayout(20).featured).toBe(false);
  });

  it("guards against invalid counts", () => {
    expect(computeVideoGridLayout(0).columns).toBe(1);
    expect(computeVideoGridLayout(-5).columns).toBe(1);
    expect(computeVideoGridLayout(NaN).columns).toBe(1);
  });

  it("always returns tailwind grid-cols classes", () => {
    for (const n of [1, 2, 3, 5, 7, 10, 15]) {
      expect(computeVideoGridLayout(n).containerClass).toContain("grid-cols-");
    }
  });
});
