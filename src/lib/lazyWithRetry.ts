import { lazy, ComponentType } from "react";

/**
 * lazyWithRetry: wraps React.lazy with automatic retry + a one-time hard refresh
 * to recover from "Loading chunk failed" errors that occur after a new deploy
 * invalidates previously cached chunks. Prevents the classic white-screen-of-death.
 */
const RELOAD_KEY = "__chunk_reload_attempted__";

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
  delayMs = 400,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const mod = await factory();
        // success — clear the reload guard so future failures can self-heal again
        try { sessionStorage.removeItem(RELOAD_KEY); } catch {}
        return mod;
      } catch (err) {
        lastErr = err;
        const msg = (err as Error)?.message || "";
        const isChunkError =
          /Loading chunk|Failed to fetch dynamically imported|ChunkLoadError|Importing a module script failed/i.test(msg);
        if (!isChunkError) throw err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
          continue;
        }
        // Final fallback: hard refresh once to pull the latest index.html / chunk map
        try {
          const already = sessionStorage.getItem(RELOAD_KEY);
          if (!already) {
            sessionStorage.setItem(RELOAD_KEY, "1");
            // Best-effort cache purge so the next load sees fresh assets
            try {
              const keys = await caches.keys();
              await Promise.all(keys.map((k) => caches.delete(k)));
            } catch {}
            const url = new URL(window.location.href);
            url.searchParams.set("__chunk_retry", String(Date.now()));
            window.location.replace(url.toString());
            // Return a never-resolving promise so React doesn't render the error
            return new Promise(() => {}) as unknown as { default: T };
          }
        } catch {}
        throw lastErr;
      }
    }
    throw lastErr;
  });
}
