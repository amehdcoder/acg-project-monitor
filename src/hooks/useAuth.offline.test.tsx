import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  callback: null as null | ((event: string, session: unknown) => void),
  credential: { email: "field@example.org", user_id: "field-user", user: { id: "field-user", email: "field@example.org" }, profile: { is_active: true, approval_status: "approved" }, role: "user", passwordHash: "verified" },
  signOut: vi.fn(async () => ({ error: null })),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  verifyPassword: vi.fn(async (password: string) => password === "correct-password"),
  refreshSession: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  onAuthStateChange: (cb: typeof mocks.callback) => { mocks.callback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
  getSession: mocks.getSession, signOut: mocks.signOut, refreshSession: mocks.refreshSession,
}, functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/offlineAuthCache", () => ({
  getLatestOfflineCredential: async () => mocks.credential,
  getOfflineCredential: async (email: string) => email === mocks.credential.email ? mocks.credential : null,
  listOfflineCredentials: async () => [mocks.credential],
  verifyOfflineCredentialPassword: mocks.verifyPassword,
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
  beforeEach(() => { localStorage.clear(); mocks.callback = null; mocks.signOut.mockClear(); mocks.getSession.mockReset(); mocks.getSession.mockResolvedValue({ data: { session: null } }); Object.defineProperty(navigator, "onLine", { configurable: true, value: false }); });
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
  it("rejects accounts that have never been prepared on this device", async () => {
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let response: { error: Error | null } | undefined;
    await act(async () => { response = await result.current.signIn("new@example.org", "correct-password"); });
    expect(response?.error).toBeInstanceOf(Error);
    expect(result.current.user).toBeNull();
  });
  it("normalizes the entered account without opening another saved account", async () => {
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.signIn(" FIELD@example.org ", "correct-password"); });
    expect(result.current.user?.id).toBe("field-user");
  });
  it("late boot resolution cannot lock an already password-unlocked account", async () => {
    let finish: ((value: { data: { session: null } }) => void) | undefined;
    mocks.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(useAuth, { wrapper });
    await act(async () => { await result.current.signIn("field@example.org", "correct-password"); });
    await act(async () => { finish?.({ data: { session: null } }); });
    expect(result.current.user?.id).toBe("field-user");
  });
  it("sign-out locks immediately even when the auth service rejects", async () => {
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.signIn("field@example.org", "correct-password"); });
    localStorage.setItem("form_draft_preserved", "saved work");
    mocks.signOut.mockRejectedValueOnce(new Error("network unavailable"));
    await act(async () => { await result.current.signOut(); });
    expect(result.current.user).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(localStorage.getItem("form_draft_preserved")).toBe("saved work");
    await act(async () => { mocks.callback?.("SIGNED_IN", { user: mocks.credential.user }); });
    expect(result.current.user).toBeNull();
  });
  it("does not recover an unrelated saved account on a signed-out auth event", async () => {
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { mocks.callback?.("SIGNED_OUT", null); });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(result.current.user).toBeNull();
  });
  it("sign-out cancels an offline password check that is still running", async () => {
    let finish: ((value: boolean) => void) | undefined;
    mocks.verifyPassword.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let pending: Promise<{ error: Error | null }> | undefined;
    act(() => { pending = result.current.signIn("field@example.org", "correct-password"); });
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await act(async () => { await result.current.signOut(); });
    let response: { error: Error | null } | undefined;
    await act(async () => { finish?.(true); response = await pending; });
    expect(response?.error).toBeInstanceOf(Error);
    expect(result.current.user).toBeNull();
  });
});