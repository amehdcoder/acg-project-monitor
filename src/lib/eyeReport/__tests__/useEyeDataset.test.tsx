import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ saved: vi.fn(), sync: vi.fn(), callbacks: [] as { type: string; callback: () => void }[], remove: vi.fn() }));
vi.mock("../incrementalData", () => ({ savedEyeRows: mocks.saved, syncEyeRows: mocks.sync }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  channel: () => { const channel = { on: (_: string, filter: { event: string }, callback: () => void) => { mocks.callbacks.push({ type: filter.event, callback }); return channel; }, subscribe: () => channel }; return channel; },
  removeChannel: mocks.remove,
} }));
import { useEyeDataset } from "../useEyeDataset";
const rows = [{ id: "report", project_id: "project", report_date: "2026-11-02", consulted: 324 }];
beforeEach(() => { vi.clearAllMocks(); mocks.callbacks = []; });
it("shows saved totals before the network completes and retains them through realtime refresh", async () => {
  mocks.saved.mockResolvedValue(rows);
  let complete: (value: unknown) => void = () => {};
  mocks.sync.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const { result, unmount } = renderHook(() => useEyeDataset("alice", "project", "eye_daily_reports"));
  await waitFor(() => expect(result.current.rows).toEqual(rows));
  expect(result.current.loading).toBe(false); expect(result.current.refreshing).toBe(true);
  await act(async () => complete({ rows, fromCache: false, unavailable: false, checkedAt: 123 }));
  expect(result.current.checkedAt).toBe(123);
  act(() => mocks.callbacks.find(c => c.type === "UPDATE")?.callback());
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2));
  expect(result.current.rows).toEqual(rows); expect(result.current.loading).toBe(false);
  expect(mocks.sync.mock.calls[1]).toEqual(["alice", "project", "eye_daily_reports", false]);
  unmount(); expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it("discards late results after an account change", async () => {
  mocks.saved.mockImplementation((user: string) => Promise.resolve(user === "alice" ? rows : []));
  let finishAlice: (value: unknown) => void = () => {};
  mocks.sync.mockImplementation((user: string) => user === "alice" ? new Promise(resolve => { finishAlice = resolve; }) : Promise.resolve({ rows: [], fromCache: false, unavailable: false, checkedAt: 200 }));
  const { result, rerender } = renderHook(({ user }) => useEyeDataset(user, "project", "eye_daily_reports"), { initialProps: { user: "alice" } });
  await waitFor(() => expect(result.current.rows).toEqual(rows));
  rerender({ user: "bob" });
  expect(result.current.rows).toEqual([]);
  await waitFor(() => expect(result.current.checkedAt).toBe(200));
  await act(async () => finishAlice({ rows, fromCache: false, unavailable: false, checkedAt: 123 }));
  expect(result.current.rows).toEqual([]);
});