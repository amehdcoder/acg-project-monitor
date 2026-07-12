/**
 * Deep-link intent persistence.
 *
 * When a protected route is opened while the user is signed out (including an
 * OFFLINE cold boot that lands directly on a deep link such as
 * `/satellite-messenger` or `/?tab=forms`), we remember exactly where the user
 * was heading. After authentication (or session hydration) finishes we resolve
 * back to that path so the app always lands on the correct cached view instead
 * of dumping everyone on `/`.
 *
 * Uses sessionStorage first (survives the /auth redirect within the same tab)
 * with a localStorage mirror so an offline relaunch of the installed PWA can
 * still recover the last intended destination.
 */

const KEY = "amehnities_deep_link_intent_v1";

// Never resolve back to auth/utility routes — they are not real destinations.
const IGNORED = [/^\/auth\b/, /^\/reset-password\b/, /^\/__test\b/];

const isIgnored = (path: string) => IGNORED.some((re) => re.test(path));

/** Remember the path the user tried to reach before authenticating. */
export function rememberDeepLink(path: string): void {
  try {
    if (!path || isIgnored(path)) return;
    sessionStorage.setItem(KEY, path);
    localStorage.setItem(KEY, path);
  } catch {
    /* storage may be blocked */
  }
}

/** Read (without clearing) the stored intent, if any. */
export function peekDeepLink(): string | null {
  try {
    return sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Read and clear the stored intent. Returns a safe fallback when empty. */
export function consumeDeepLink(fallback = "/"): string {
  let path: string | null = null;
  try {
    path = sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  if (!path || isIgnored(path)) return fallback;
  return path;
}
