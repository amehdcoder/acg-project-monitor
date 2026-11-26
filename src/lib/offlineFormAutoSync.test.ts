import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authCallback: null as null | ((event: string, session: any) => void),
  realtimeCallback: null as null | (() => void),
  warm: vi.fn(async () => ({ ok: true })),
  removeChannel: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (callback: typeof mocks.authCallback) => {
        mocks.authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    channel: () => ({
      on: (_type: string, _filter: unknown, callback: () => void) => {
        mocks.realtimeCallback = callback;
        return { subscribe: () => ({}) };
      },
    }),
    removeChannel: mocks.removeChannel,
  },
}));
vi.mock("@/lib/offlineFormCache", () => ({ warmCacheUserFormsDetailed: mocks.warm }));

import { initOfflineFormAutoSync, requestOfflineFormSync } from "./offlineFormAutoSync";

describe("automatic offline form updates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.warm.mockClear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("starts downloading immediately on the first online session", async () => {
    initOfflineFormAutoSync();
    mocks.authCallback?.("SIGNED_IN", { user: { id: "user-1" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.warm).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("refreshes after a realtime form edit without requiring the Forms page", async () => {
    initOfflineFormAutoSync();
    mocks.authCallback?.("INITIAL_SESSION", { user: { id: "user-1" } });
    await vi.advanceTimersByTimeAsync(0);
    mocks.warm.mockClear();
    mocks.realtimeCallback?.();
    await vi.advanceTimersByTimeAsync(349);
    expect(mocks.warm).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.warm).toHaveBeenCalledTimes(1);
  });

  it("does not contact the server while offline", async () => {
    initOfflineFormAutoSync();
    mocks.authCallback?.("SIGNED_IN", { user: { id: "user-1" } });
    await vi.advanceTimersByTimeAsync(0);
    mocks.warm.mockClear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    requestOfflineFormSync();
    await vi.runOnlyPendingTimersAsync();
    expect(mocks.warm).not.toHaveBeenCalled();
  });
});
