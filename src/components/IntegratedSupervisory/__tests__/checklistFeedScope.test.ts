/**
 * Scope-enforcement tests for the Checklist Dashboard shared feed.
 *
 * Covers both delivery paths a grantee can receive data through:
 *   1. The initial `checklist-feed` edge-function response.
 *   2. Every realtime-triggered refetch (a `kobo_sync_events` insert makes the
 *      dashboard call the same function again).
 *
 * In both cases the payload must be filtered to the caller's `scope_states`,
 * and rows from disallowed States must never reach the dashboard cache.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterRowsToScope, normState, readRowState, rowInScope } from "@/lib/isc/stateScope";

const invoke = vi.fn();
const saveKoboCache = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));
vi.mock("../koboClient", () => ({
  saveKoboCache: (...a: unknown[]) => saveKoboCache(...a),
}));
vi.mock("../koboSchema", () => ({
  flattenAll: (rows: unknown[]) => rows,
  buildDataDictionary: () => [],
  validateDataDictionary: () => ({ ok: true, issues: [] }),
}));

const row = (state: string | null, id: number) => ({
  _id: id,
  _submission_time: `2026-08-0${id}T10:00:00Z`,
  ...(state === null ? {} : { "grp/mda_state": state }),
  community: `community-${id}`,
});

const KANO = row("Kano", 1);
const KANO_SUFFIXED = row("Kano State", 2);
const JIGAWA = row("Jigawa", 3);
const PLATEAU = row("Plateau", 4);
const NO_STATE = row(null, 5);

const ALL_ROWS = [KANO, KANO_SUFFIXED, JIGAWA, PLATEAU, NO_STATE];

/** Simulate the edge function: it filters server-side before responding. */
const feedResponse = (scopeStates: string[]) => ({
  data: {
    feed: { id: "feed-1", name: "ISC", form_uid: "aXyZ", server_url: "https://kf.kobotoolbox.org" },
    form_title: "Integrated Supervisory Checklist",
    survey: [],
    choices: [],
    scope_states: scopeStates,
    results: filterRowsToScope(ALL_ROWS, scopeStates),
    total: ALL_ROWS.length,
  },
  error: null,
});

const statesOf = (rows: Record<string, unknown>[]) =>
  rows.map((r) => normState(readRowState(r))).filter(Boolean);

describe("State scope rules", () => {
  it("keeps only granted States and drops disallowed ones", () => {
    const out = filterRowsToScope(ALL_ROWS, ["Kano"]);
    expect(statesOf(out)).toEqual(["kano", "kano"]);
    expect(out).not.toContain(JIGAWA);
    expect(out).not.toContain(PLATEAU);
  });

  it("matches regardless of case and the 'State' suffix", () => {
    expect(filterRowsToScope(ALL_ROWS, ["  kano STATE "])).toHaveLength(2);
  });

  it("supports multi-State grants", () => {
    const out = filterRowsToScope(ALL_ROWS, ["Kano", "Jigawa"]);
    expect(new Set(statesOf(out))).toEqual(new Set(["kano", "jigawa"]));
    expect(out).not.toContain(PLATEAU);
  });

  it("fails closed for rows with no readable State", () => {
    expect(filterRowsToScope([NO_STATE], ["Kano"])).toHaveLength(0);
    expect(rowInScope(NO_STATE, ["Kano"])).toBe(false);
  });

  it("returns nothing when the granted State has no data", () => {
    expect(filterRowsToScope(ALL_ROWS, ["Sokoto"])).toHaveLength(0);
  });

  it("treats an empty scope as unscoped (admin / all-States grant)", () => {
    expect(filterRowsToScope(ALL_ROWS, [])).toHaveLength(ALL_ROWS.length);
    expect(filterRowsToScope(ALL_ROWS, null)).toHaveLength(ALL_ROWS.length);
  });

  it("ignores blank scope entries instead of widening access", () => {
    expect(filterRowsToScope(ALL_ROWS, ["Kano", "", "  "])).toHaveLength(2);
  });
});

describe("fetchScopedSubmissions — edge-function responses", () => {
  beforeEach(() => {
    invoke.mockReset();
    saveKoboCache.mockReset();
  });

  it("returns only the grantee's State and caches only those rows", async () => {
    const { fetchScopedSubmissions } = await import("../checklistFeed");
    invoke.mockResolvedValue(feedResponse(["Jigawa"]));

    const res = await fetchScopedSubmissions("feed-1");

    expect(res.scopeStates).toEqual(["Jigawa"]);
    expect(statesOf(res.cache.results as Record<string, unknown>[])).toEqual(["jigawa"]);
    const cached = saveKoboCache.mock.calls[0][0];
    expect(statesOf(cached.results)).toEqual(["jigawa"]);
  });

  it("negative: a server payload leaking a disallowed State is still dropped client-side", async () => {
    const { fetchScopedSubmissions } = await import("../checklistFeed");
    // Simulate a stale cache / compromised payload that ignores the scope.
    invoke.mockResolvedValue({
      data: { ...feedResponse(["Kano"]).data, results: ALL_ROWS },
      error: null,
    });

    const res = await fetchScopedSubmissions("feed-1");

    expect(statesOf(res.cache.results as Record<string, unknown>[])).toEqual(["kano", "kano"]);
    expect(res.cache.results).not.toContainEqual(JIGAWA);
    expect(res.cache.results).not.toContainEqual(PLATEAU);
    expect(res.cache.results).not.toContainEqual(NO_STATE);
  });

  it("admins / unscoped grants receive every row", async () => {
    const { fetchScopedSubmissions } = await import("../checklistFeed");
    invoke.mockResolvedValue(feedResponse([]));

    const res = await fetchScopedSubmissions();
    expect(res.cache.results).toHaveLength(ALL_ROWS.length);
  });

  it("surfaces backend authorisation errors instead of returning data", async () => {
    const { fetchScopedSubmissions } = await import("../checklistFeed");
    invoke.mockResolvedValue({ data: null, error: { message: "Forbidden" } });
    await expect(fetchScopedSubmissions()).rejects.toThrow(/Forbidden/);
  });
});

describe("realtime refetches stay inside scope", () => {
  beforeEach(() => {
    invoke.mockReset();
    saveKoboCache.mockReset();
  });

  it("a sync event that carries out-of-scope submissions adds nothing for the grantee", async () => {
    const { fetchScopedSubmissions } = await import("../checklistFeed");

    // First load: grantee scoped to Kano sees the two Kano rows.
    invoke.mockResolvedValue(feedResponse(["Kano"]));
    const first = await fetchScopedSubmissions("feed-1");
    expect(first.cache.results).toHaveLength(2);

    // A realtime kobo_sync_events INSERT fires → dashboard refetches. The new
    // submissions landed in Plateau, outside the grant.
    const newPlateau = row("Plateau", 6);
    invoke.mockResolvedValue({
      data: {
        ...feedResponse(["Kano"]).data,
        results: filterRowsToScope([...ALL_ROWS, newPlateau], ["Kano"]),
        total: ALL_ROWS.length + 1,
      },
      error: null,
    });
    const second = await fetchScopedSubmissions("feed-1");

    expect(second.cache.results).toHaveLength(2);
    expect(second.cache.results).not.toContainEqual(newPlateau);
    expect(second.total).toBe(ALL_ROWS.length + 1); // count of all submissions, not visible rows
  });

  it("a sync event carrying an in-scope submission does reach the grantee", async () => {
    const { fetchScopedSubmissions } = await import("../checklistFeed");
    const newKano = row("Kano State", 7);
    invoke.mockResolvedValue({
      data: {
        ...feedResponse(["Kano"]).data,
        results: filterRowsToScope([...ALL_ROWS, newKano], ["Kano"]),
      },
      error: null,
    });

    const res = await fetchScopedSubmissions("feed-1");
    expect(res.cache.results).toHaveLength(3);
    expect(res.cache.results).toContainEqual(newKano);
  });
});
