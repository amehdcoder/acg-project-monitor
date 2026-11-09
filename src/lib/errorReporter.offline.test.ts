import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(async () => true) }));
vi.mock("@/lib/appUpdateManager", () => ({ hardReloadToLatest: mocks.update }));
import { refreshToLatest } from "./errorReporter";
describe("recovery preserves offline shell", () => {
  afterEach(() => { vi.restoreAllMocks(); mocks.update.mockClear(); });
  it("does not navigate or remove the saved shell offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await refreshToLatest()).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("uses the bounded shared update flow when online", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    expect(await refreshToLatest()).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});