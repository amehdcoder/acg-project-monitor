/**
 * Robust retry-and-recover flow for the /auth screen.
 *
 * Goals (in priority order):
 *  1. Preserve the offline app shell (never delete the Workbox precache), so a
 *     recovery attempt on a weak network can never strand the user on Chrome's
 *     generic "site can't be reached" page.
 *  2. Clear ONLY the caches that can legitimately wedge the sign-in screen:
 *     stale auth/session tokens, runtime API responses and dynamic import
 *     chunks — nothing that holds the installable app shell.
 *  3. Guarantee a clean reload: only reload once the branded host is proven
 *     reachable; otherwise keep the current shell intact and tell the caller.
 *
 * This is intentionally standalone (no imports from the update manager) so it
 * stays tiny and safe to call from the auth screen without pulling in the whole
 * PWA update graph.
 */

const RECOVERY_GUARD_KEY = "__auth_recovery_attempted__";
const SHELL_PROBE_PATH = "/version.json";

/** Prove the branded host is reachable before any destructive/reload step. */
export const canReachAppShell = async (timeoutMs = 7000): Promise<boolean> => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SHELL_PROBE_PATH}?__auth_probe=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
};

/** Cache names that are SAFE to delete (never the app-shell precache). */
const isDisposableCache = (name: string): boolean => {
  const n = name.toLowerCase();
  // Keep anything that holds the installable/offline shell.
  if (n.includes("precache") || n.includes("app-shell") || n.includes("install")) {
    return false;
  }
  // Only dispose runtime/API/auth/chunk caches.
  return (
    n.includes("runtime") ||
    n.includes("api") ||
    n.includes("auth") ||
    n.includes("supabase") ||
    n.includes("chunk") ||
    n.includes("dynamic") ||
    n.includes("pages") ||
    n.includes("data")
  );
};

/** Clear stale Supabase auth tokens from web storage (keeps everything else). */
const clearStaleAuthTokens = () => {
  try {
    const kill: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Supabase v2 stores the session under sb-<ref>-auth-token.
      if (/^sb-.*-auth-token/i.test(k) || k.toLowerCase().includes("auth-token")) {
        kill.push(k);
      }
    }
    kill.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* private mode / quota — ignore */
  }
  try {
    sessionStorage.removeItem("__auth_recovery_attempted__");
  } catch {
    /* ignore */
  }
};

/**
 * Retry-and-recover for the auth screen.
 *
 * Returns:
 *  - "reloading" — reachable; caches cleared and a clean reload was issued.
 *  - "offline"   — host unreachable; shell preserved, nothing destroyed.
 */
export const recoverAuthAndReload = async (): Promise<"reloading" | "offline"> => {
  // 1. Never destroy anything until we know we can come back online.
  const reachable = await canReachAppShell();
  if (!reachable) return "offline";

  // 2. Clear ONLY the disposable caches (auth/runtime/chunks) — keep the shell.
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(
        names.filter(isDisposableCache).map((n) => caches.delete(n).catch(() => false)),
      );
    }
  } catch {
    /* cache API blocked — reload still recovers most cases */
  }

  // 3. Drop stale auth session artifacts so sign-in starts from a clean slate.
  clearStaleAuthTokens();

  // 4. Guarantee a clean, cache-busted reload (single attempt guard).
  try {
    sessionStorage.setItem(RECOVERY_GUARD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("__auth_recover", String(Date.now()));
  window.location.replace(url.toString());
  return "reloading";
};
