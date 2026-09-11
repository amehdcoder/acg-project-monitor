// Cross-tab queue mutex + retry policy shared by every offline sync worker.
//
// Multiple triggers (reconnect, tab focus, interval timer) and multiple open
// tabs can all try to drain the same IndexedDB queue at once. That race is the
// classic source of duplicate submissions, so every worker must hold this lease
// before touching the queue. The lease lives in localStorage (shared across
// tabs of the same origin) and expires automatically so a crashed tab can never
// wedge the queue permanently.

const LEASE_MS = 60_000;

type Lease = { owner: string; until: number };

const tabId = (() => {
  try {
    return crypto.randomUUID?.() || `tab-${Date.now()}-${Math.random()}`;
  } catch {
    return `tab-${Date.now()}`;
  }
})();

const readLease = (key: string): Lease | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Lease) : null;
  } catch {
    return null;
  }
};

const writeLease = (key: string, lease: Lease | null) => {
  try {
    if (lease) localStorage.setItem(key, JSON.stringify(lease));
    else localStorage.removeItem(key);
  } catch {
    /* private mode — in-process guard still applies */
  }
};

const inProcess = new Set<string>();

/**
 * Run `fn` while holding the named queue lock. Returns `null` immediately when
 * another worker (this tab or another) already holds it — callers should treat
 * that as "someone else is draining the queue" and simply skip this tick.
 */
export async function withQueueLock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (inProcess.has(name)) return null;
  const key = `amehnities_sync_lock_${name}`;
  const now = Date.now();
  const existing = readLease(key);
  if (existing && existing.owner !== tabId && existing.until > now) return null;

  inProcess.add(name);
  writeLease(key, { owner: tabId, until: now + LEASE_MS });
  // Keep the lease alive while a long backlog drains.
  const heartbeat = window.setInterval(() => {
    writeLease(key, { owner: tabId, until: Date.now() + LEASE_MS });
  }, LEASE_MS / 3);
  try {
    return await fn();
  } finally {
    window.clearInterval(heartbeat);
    const held = readLease(key);
    if (!held || held.owner === tabId) writeLease(key, null);
    inProcess.delete(name);
  }
}

/**
 * Exponential backoff with full jitter. Keeps hundreds of devices reconnecting
 * after the same outage from stampeding the server in lockstep.
 */
export function backoffDelay(attempt: number, baseMs = 2_000, capMs = 300_000): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

/** A 5xx / network-class failure is worth retrying; 4xx generally is not. */
export function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") return status >= 500 || status === 408 || status === 429;
  return true; // network / timeout / unknown — retry
}

/** Cap on parallel uploads per worker, per the ODK/Kobo concurrency guidance. */
export const MAX_CONCURRENT_UPLOADS = 2;

/** Run tasks with a small fixed concurrency cap, preserving input order. */
export async function runCapped<T>(
  tasks: (() => Promise<T>)[],
  limit = MAX_CONCURRENT_UPLOADS,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}
