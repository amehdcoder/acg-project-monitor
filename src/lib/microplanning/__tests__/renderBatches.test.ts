import { afterEach, describe, expect, it, vi } from "vitest";
import { renderBatches } from "../renderBatches";

afterEach(() => vi.useRealTimers());
describe("cancellable map rendering", () => {
  it("yields rather than drawing a whole dataset synchronously, and draws every item", () => {
    vi.useFakeTimers();
    const draw = vi.fn();
    const done = vi.fn();
    renderBatches(Array.from({ length: 1000 }, (_, i) => i), draw, done);
    expect(draw).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(draw.mock.calls.length).toBeGreaterThan(0);
    expect(draw.mock.calls.length).toBeLessThanOrEqual(20);
    vi.runAllTimers();
    expect(draw).toHaveBeenCalledTimes(1000);
    expect(draw.mock.calls[999][0]).toBe(999);
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("never draws into a removed map or completes a cancelled render", () => {
    vi.useFakeTimers();
    const draw = vi.fn();
    const done = vi.fn();
    const cancel = renderBatches(Array.from({ length: 100 }, (_, i) => i), draw, done);
    vi.advanceTimersByTime(0);
    const before = draw.mock.calls.length;
    cancel();
    vi.runAllTimers();
    expect(draw).toHaveBeenCalledTimes(before);
    expect(done).not.toHaveBeenCalled();
  });
});