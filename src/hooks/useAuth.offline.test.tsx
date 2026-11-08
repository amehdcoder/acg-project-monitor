import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  callback: null as null | ((event: string, session: unknown) => void),
  credential: { email: "field@example.org", user_id: "field-user", user: { id: "field-user", email: "field@example.org" }, profile: { is_active: true, approval_status: "approved" }, role: "user", passwordHash: "verified" },
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  onAuthStateChange: (cb: typeof mocks.callback) => { mocks.callback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
  getSession: async () => ({ data: { session: null } }), signOut: mocks.signOut,
}, functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/offlineAuthCache", () => ({
  getLatestOfflineCredential: async () => mocks.credential,
  getOfflineCredential: async (email: string) => email === mocks.credential.email ? mocks.credential : null,
  listOfflineCredentials: async () => [mocks.credential],
  verifyOfflineCredentialPassword: async (password: string) => password === "correct-password",
  refreshOfflineCredentialSnapshot: vi.fn(), removeOfflineCredential: vi.fn(), saveOfflineCredential: vi.fn(),
}));
vi.mock("@/lib/offlineAuthThrottle", () => ({ checkOfflineLock: async () => ({ locked: false }), registerOfflineFailure: async () => ({ locked: false }), clearOfflineFailures: vi.fn() }));
vi.mock("@/lib/offlineAuditLog", () => ({ logOfflineAuditEvent: vi.fn(), flushOfflineAuditQueue: vi.fn() }));
vi.mock("@/lib/offlineFormCache", () => ({ warmCacheUserForms: vi.fn() }));
vi.mock("@/lib/bloomberg/offlineSchoolCache", () => ({ prewarmBloombergOffline: vi.fn() }));
vi.mock("@/lib/prefetchProjects", () => ({ prefetchProjects: vi.fn() }));
vi.mock("@/lib/metrics", () => ({ startTimer: () => vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
import { AuthProvider, useAuth } from "./useAuth";
const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("offline account access", () => {
  beforeEach(() => { localStorage.clear(); mocks.callback = null; mocks.signOut.mockClear(); Object.defineProperty(navigator, "onLine", { configurable: true, value: false }); });
  it("does not auto-open the latest cached account after sign-out", async () => {
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });
  it("unlocks only the entered cached account with its correct password", async () => {
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let response: { error: Error | null } | undefined;
    await act(async () => { response = await result.current.signIn("field@example.org", "wrong-password"); });
    expect(response?.error).toBeInstanceOf(Error);
    expect(result.current.user).toBeNull();
    await act(async () => { response = await result.current.signIn("field@example.org", "correct-password"); });
    expect(response?.error).toBeNull();
    expect(result.current.user?.id).toBe("field-user");
    expect(result.current.session).toBeNull();
    await act(async () => { mocks.callback?.("INITIAL_SESSION", null); });
    expect(result.current.user?.id).toBe("field-user");
  });
  it("stays signed out after offline sign-out and reopening", async () => {
    const first = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(async () => { await first.result.current.signIn("field@example.org", "correct-password"); });
    await act(async () => { await first.result.current.signOut(); });
    expect(first.result.current.user).toBeNull();
    first.unmount();
    const next = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(next.result.current.loading).toBe(false));
    expect(next.result.current.user).toBeNull();
  });
});