import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { decideUpdate } from "@/lib/appUpdateDecision";

// ---------------------------------------------------------------------------
// End-to-end regression coverage for the "Update now" banner.
//
// The banner has repeatedly regressed into a permanent false-positive state
// caused by stale service-worker "updatefound" events and unreachable version
// probes. These tests lock the contract down: the banner may ONLY appear when a
// probe returns a *known* build id that differs from the running build.
// ---------------------------------------------------------------------------

describe("decideUpdate (pure banner logic)", () => {
  const current = "build-100";

  it("shows an update only when a newer, known build id is reported", () => {
    const d = decideUpdate({ currentBuildId: current, latestBuildId: "build-200", source: "version" });
    expect(d.updateAvailable).toBe(true);
    expect(d.status).toBe("available");
    expect(d.latestBuildId).toBe("build-200");
  });

  it("does NOT show an update when the reported build matches the running build", () => {
    const d = decideUpdate({ currentBuildId: current, latestBuildId: current, source: "version" });
    expect(d.updateAvailable).toBe(false);
    expect(d.status).toBe("current");
  });

  it("treats a stale service-worker event with no build id as 'current' (no false positive)", () => {
    const d = decideUpdate({ currentBuildId: current, latestBuildId: null, source: "service-worker" });
    expect(d.updateAvailable).toBe(false);
    expect(d.status).toBe("current");
    expect(d.latestBuildId).toBe(current);
  });

  it("treats an empty/whitespace build id as unknown (no false positive)", () => {
    for (const bad of ["", "   "]) {
      const d = decideUpdate({ currentBuildId: current, latestBuildId: bad, source: "html" });
      expect(d.updateAvailable).toBe(false);
    }
  });
});

describe("markServiceWorkerUpdateAvailable (stale SW integration)", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockVersion = (buildId: string | null, ok = true) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("version.json")) {
          return {
            ok,
            json: async () => (buildId ? { buildId } : {}),
            text: async () => "",
          } as unknown as Response;
        }
        return { ok: true, json: async () => ({}), text: async () => "" } as unknown as Response;
      }),
    );
  };

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("stale SW event + same build => banner stays hidden", async () => {
    // CURRENT_BUILD_ID resolves to "development" in tests; echo it back.
    mockVersion("development");
    const mgr = await import("@/lib/appUpdateManager");
    mgr.markServiceWorkerUpdateAvailable();
    await flush();
    expect(mgr.getAppUpdateState().updateAvailable).toBe(false);
  });

  it("stale SW event + unreachable version.json => banner stays hidden", async () => {
    mockVersion(null, false);
    const mgr = await import("@/lib/appUpdateManager");
    mgr.markServiceWorkerUpdateAvailable();
    await flush();
    expect(mgr.getAppUpdateState().updateAvailable).toBe(false);
  });

  it("SW event + genuinely newer build => banner appears", async () => {
    mockVersion("build-next-999");
    const mgr = await import("@/lib/appUpdateManager");
    mgr.markServiceWorkerUpdateAvailable();
    await flush();
    const state = mgr.getAppUpdateState();
    expect(state.updateAvailable).toBe(true);
    expect(state.latestBuildId).toBe("build-next-999");
  });

  it("checkForAppUpdate ignores a transient version.json failure (no false positive)", async () => {
    mockVersion(null, false);
    // Disable auto-update so no reload side effects fire during the test.
    localStorage.setItem("app_settings", JSON.stringify({ autoUpdateApp: false }));
    const mgr = await import("@/lib/appUpdateManager");
    await mgr.checkForAppUpdate({ force: true, source: "version" });
    expect(mgr.getAppUpdateState().updateAvailable).toBe(false);
  });
});
