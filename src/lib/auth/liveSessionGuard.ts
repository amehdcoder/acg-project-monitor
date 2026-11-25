// Stops signed-in screens from silently querying the backend as a signed-out
// visitor. When the live session is lost (spurious sign-out, expired refresh)
// while the app still shows the user as signed in, row-level security answers
// with empty lists — projects vanish and admin-only controls disappear, and the
// empty result overwrites the device cache. This guard refuses such requests
// with an explicit 401 (so callers keep their cached data) and asks the auth
// provider to restore the live session.
// Installed as the very first import in main.tsx, before the backend client
// captures window.fetch.

export const LIVE_SESSION_NEEDED = "auth:live-session-needed";
export const LIVE_SESSION_RESTORED = "auth:live-session-restored";

let expectedUserId: string | null = null;
/** Set by the auth provider: the account the app currently shows as signed in. */
export function setExpectedUser(id: string | null) { expectedUserId = id; }

const BACKEND = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
// Endpoints that legitimately run without an account session.
const PUBLIC_FUNCTIONS = /\/functions\/v1\/(auth-precheck|project-collect|public-|ccff|community-feedback)/;

/** Role claimed by a bearer token: "anon" for the publishable key or a non-JWT key. */
export function bearerRole(auth: string | null | undefined): string | null {
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const part = token.split(".")[1];
  if (!part) return "anon";
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.role === "string" ? json.role : null;
  } catch { return null; }
}

/** True when a signed-in screen is about to read/write data as a signed-out visitor. */
export function shouldBlock(url: string, auth: string | null, userId: string | null): boolean {
  if (!userId || !BACKEND || !url.startsWith(BACKEND)) return false;
  const path = url.slice(BACKEND.length);
  const data = path.startsWith("/rest/v1/") || (path.startsWith("/functions/v1/") && !PUBLIC_FUNCTIONS.test(path));
  return data && bearerRole(auth) === "anon";
}

let lastAsk = 0;
function askForLiveSession() {
  const now = Date.now();
  if (now - lastAsk < 5000) return;
  lastAsk = now;
  window.setTimeout(() => window.dispatchEvent(new Event(LIVE_SESSION_NEEDED)), 0);
}

function installGuard() {
  if (typeof window === "undefined" || (window as any).__liveSessionGuard) return;
  (window as any).__liveSessionGuard = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (shouldBlock(url, headers.get("authorization"), expectedUserId)) {
        askForLiveSession();
        return Promise.resolve(new Response(JSON.stringify({ code: "PGRST301", message: "Your session needs to be renewed. Please sign in again.", details: null, hint: null }), { status: 401, headers: { "Content-Type": "application/json" } }));
      }
    } catch { /* never break requests because of the guard */ }
    return original(input as RequestInfo, init);
  };
}

installGuard();
