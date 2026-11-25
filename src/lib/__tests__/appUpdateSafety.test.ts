import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/formProgressPersistence", () => ({ prepareSilentFormRestoreForUpdate: vi.fn(() => true) }));

describe("safe, responsive app updates", () => {
  const originalLocation = window.location;
  let replace: ReturnType<typeof vi.fn>;
  let removeCache: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    replace = vi.fn();
    removeCache = vi.fn(async () => true);
    Object.defineProperty(window, "location", { configurable: true, value: {
      hostname: "amehnities.org", href: "https://amehnities.org/?project=test&tab=forms#section", search: "", replace,
    } });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.stubGlobal("caches", { delete: removeCache, keys: vi.fn(async () => ["workbox-precache", "html-cache", "map-tiles"]) });
    document.head.innerHTML = '<script src="/assets/index-current.js"></script>';
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.head.innerHTML = "";
  });
  const response = (buildId = "next", html = '<div id="root"></div><script src="/assets/index-next.js"></script>') =>
    ({ ok: true, json: async () => ({ buildId }), text: async () => html }) as Response;

  it("failed checks report failure, not current, and retain a previously verified update", async () => {
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetcher);
    const mgr = await import("@/lib/appUpdateManager");
    await mgr.checkForAppUpdate({ force: true });
    fetcher.mockRejectedValue(new Error("network unavailable"));
    const failed = await mgr.checkForAppUpdate({ force: true });
    expect(failed.status).toBe("error");
    expect(failed.updateAvailable).toBe(true);
    expect(failed.latestBuildId).toBe("next");
    expect(replace).not.toHaveBeenCalled();
  });

  it("same version is never offered as an update", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("development", '<div id="root"></div><script src="/assets/index-current.js"></script>')));
    const mgr = await import("@/lib/appUpdateManager");
    const result = await mgr.checkForAppUpdate({ force: true });
    expect(result.updateAvailable).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("a real new version is only applied when Update is tapped", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    const mgr = await import("@/lib/appUpdateManager");
    const found = await mgr.checkForAppUpdate({ force: true });
    expect(found.updateAvailable).toBe(true);
    await new Promise(r => setTimeout(r, 20));
    expect(replace).not.toHaveBeenCalled();
    expect(await mgr.hardReloadToLatest()).toBe(true);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("version checks ignore the release pin and applying drops it", async () => {
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetcher);
    document.cookie = "__dpl=old-release; Path=/";
    const mgr = await import("@/lib/appUpdateManager");
    await mgr.checkForAppUpdate({ force: true });
    expect(fetcher.mock.calls.every(([, init]) => (init as RequestInit).credentials === "omit")).toBe(true);
    await mgr.hardReloadToLatest();
    expect(document.cookie).not.toContain("__dpl=old-release");
  });

  it("hung probes abort and return a retryable failure within a bounded time", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const mgr = await import("@/lib/appUpdateManager");
    const pending = mgr.checkForAppUpdate({ force: true });
    await vi.advanceTimersByTimeAsync(7001);
    expect((await pending).status).toBe("error");
    expect(fetcher.mock.calls.length).toBe(2);
    expect(replace).not.toHaveBeenCalled();
  });

  it("overlapping manual/poll checks share one request", async () => {
    const releases: ((value: Response) => void)[] = [];
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { releases.push(resolve); }));
    vi.stubGlobal("fetch", fetcher);
    const mgr = await import("@/lib/appUpdateManager");
    const a = mgr.checkForAppUpdate({ force: true });
    const b = mgr.checkForAppUpdate({ force: true });
    expect(a).toBe(b);
    releases.forEach(release => release(response()));
    await a;
    expect(fetcher).toHaveBeenCalledTimes(2); // One manifest and one parallel shell, shared by both clicks.
  });

  it("forced updates cannot navigate or delete caches offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const mgr = await import("@/lib/appUpdateManager");
    expect(await mgr.hardReloadToLatest({ force: true })).toBe(false);
    expect(mgr.getAppUpdateState().status).toBe("error");
    expect(replace).not.toHaveBeenCalled();
    expect(removeCache).not.toHaveBeenCalled();
  });

  it("concurrent update clicks navigate once and preserve queues, precaches and the current location", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    const mgr = await import("@/lib/appUpdateManager");
    localStorage.setItem("pending_submissions", '[{"id":"unsent"}]');
    const appliedBefore = localStorage.getItem(mgr.APPLIED_BUILD_ID_KEY);
    const a = mgr.hardReloadToLatest();
    const b = mgr.hardReloadToLatest();
    expect(a).toBe(b);
    expect(await a).toBe(true);
    expect(replace).toHaveBeenCalledTimes(1);
    const destination = new URL(replace.mock.calls[0][0]);
    expect(destination.searchParams.get("project")).toBe("test");
    expect(destination.searchParams.get("tab")).toBe("forms");
    expect(destination.hash).toBe("#section");
    expect(removeCache.mock.calls).toEqual([["html-cache"]]);
    expect(localStorage.getItem("pending_submissions")).toBe('[{"id":"unsent"}]');
    expect(localStorage.getItem(mgr.APPLIED_BUILD_ID_KEY)).toBe(appliedBefore);
  });

  it("invalid HTML blocks navigation without deleting the saved shell", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("next", "Gateway unavailable")));
    const mgr = await import("@/lib/appUpdateManager");
    expect(await mgr.hardReloadToLatest()).toBe(false);
    expect(removeCache).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("HTML fallback compares fetched assets with the running shell on the first check", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("version.json")
      ? { ok: false } as Response : response()));
    const mgr = await import("@/lib/appUpdateManager");
    expect((await mgr.checkForAppUpdate({ force: true })).updateAvailable).toBe(true);
  });

  it("manual checks detect changed published assets even when a stale version manifest says current", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("development")));
    const mgr = await import("@/lib/appUpdateManager");
    const result = await mgr.checkForAppUpdate({ force: true });
    expect(result.updateAvailable).toBe(true);
    expect(result.source).toBe("html");
    expect(replace).not.toHaveBeenCalled();
  });

  it("changed page content with identical app assets does not trigger an update", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("version.json")
      ? { ok: false } as Response : response("next", '<h1>Changed content</h1><script src="/assets/index-current.js"></script>')));
    const mgr = await import("@/lib/appUpdateManager");
    expect((await mgr.checkForAppUpdate({ force: true })).updateAvailable).toBe(false);
  });

  it("reuses the checked shell when installing instead of fetching HTML twice", async () => {
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal('fetch', fetcher);
    const mgr = await import('@/lib/appUpdateManager');
    await mgr.checkForAppUpdate({ force: true });
    expect(await mgr.hardReloadToLatest()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("a pending background check cannot overwrite installation state", async () => {
    let release: ((value: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn((url: string) => String(url).includes('version.json')
      ? new Promise<Response>(resolve => { release = resolve; }) : Promise.resolve(response())));
    const mgr = await import('@/lib/appUpdateManager');
    const check = mgr.checkForAppUpdate({ force: true });
    await mgr.hardReloadToLatest();
    release?.(response('development'));
    await check;
    expect(mgr.getAppUpdateState().status).toBe('updating');
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("new submissions and data events never mark a release available", async () => {
    const mgr = await import('@/lib/appUpdateManager');
    window.dispatchEvent(new CustomEvent('microplan-entry-saved', { detail: { id: 'new-submission' } }));
    window.dispatchEvent(new CustomEvent('eye-report-updated'));
    window.dispatchEvent(new CustomEvent('amehnities:form-progress-changed'));
    expect(mgr.getAppUpdateState().updateAvailable).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});