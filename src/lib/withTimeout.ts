// Small, dependency-free helpers to make network-gated UI resilient to poor
// connectivity and backend overload. The golden rule everywhere in the app:
// a loading gate must ALWAYS resolve, even if the underlying request never does.

/**
 * Race a promise against a timeout. On timeout the promise REJECTS with an
 * Error labelled `label`, so callers can fall back to cached/empty data instead
 * of hanging forever on a slow or wedged network.
 */
export function withTimeout<T>(p: Promise<T>, ms = 12000, label = "request_timeout"): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

/**
 * Race a promise against a timeout but RESOLVE with `fallback` instead of
 * rejecting. Ideal for read queries that gate a loading spinner: the UI always
 * proceeds with a safe default (usually empty data) when the network stalls.
 */
export function withTimeoutFallback<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}
