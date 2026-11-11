import { describe, expect, it, vi } from "vitest";
import { deriveOnce } from "../derivedCache";

describe("deriveOnce", () => {
  it("reuses a derived model when a tab remounts with the same dataset", () => {
    const rows = [{ id: "1" }];
    const compute = vi.fn(() => ({ total: rows.length }));
    expect(deriveOnce(rows, "summary", compute)).toEqual({ total: 1 });
    expect(deriveOnce(rows, "summary", compute)).toEqual({ total: 1 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("keeps different calculations and datasets isolated", () => {
    const first = [{ id: "1" }];
    const second = [{ id: "2" }, { id: "3" }];
    expect(deriveOnce(first, "a", () => 1)).toBe(1);
    expect(deriveOnce(first, "b", () => 2)).toBe(2);
    expect(deriveOnce(second, "a", () => second.length)).toBe(2);
  });

  it("recomputes when realtime data replaces the source array", () => {
    const before = [{ id: "1" }];
    const after = [...before, { id: "2" }];
    expect(deriveOnce(before, "count", () => before.length)).toBe(1);
    expect(deriveOnce(after, "count", () => after.length)).toBe(2);
  });
});
