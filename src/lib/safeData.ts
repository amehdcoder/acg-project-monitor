/**
 * Defensive data helpers for rendering API responses under heavy load.
 *
 * The backend can return a 429 (rate limit), 504 (gateway timeout), an empty
 * body, or a malformed shape when concurrent traffic spikes. Components that
 * assume `data.items` or `.map(...)` will throw a runtime error and blank the
 * screen. Route every render-time array/object access through these helpers so
 * transient failures degrade to an empty state instead of crashing.
 *
 * Usage:
 *   {safeArray(query.data).map(item => …)}
 *   {safeArray(query.data?.rows).map(row => …)}
 *   const name = safeGet(profile, "user.name", "Unknown");
 */

export function safeArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];
  // Common Supabase envelope { data: [...] }
  if (typeof value === "object" && Array.isArray((value as any).data)) {
    return (value as any).data as T[];
  }
  if (typeof value === "object" && Array.isArray((value as any).items)) {
    return (value as any).items as T[];
  }
  return [];
}

export function safeObj<T extends object = Record<string, unknown>>(
  value: unknown,
  fallback: T = {} as T,
): T {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }
  return fallback;
}

export function safeGet<T = unknown>(
  source: unknown,
  path: string,
  fallback: T,
): T {
  if (source == null) return fallback;
  const parts = path.split(".");
  let cursor: any = source;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== "object") return fallback;
    cursor = cursor[part];
  }
  return (cursor ?? fallback) as T;
}

export function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * True when an error is a transient overload from the backend that should
 * NOT be treated as a permanent failure — keep last-good data, show a soft
 * toast, and let react-query retry with backoff.
 */
export function isTransientBackendError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as any;
  const status = e.status ?? e.statusCode ?? e.code;
  if (status === 429 || status === 504 || status === 503 || status === 502) return true;
  const msg = String(e.message ?? "").toLowerCase();
  if (msg.includes("timeout")) return true;
  if (msg.includes("rate limit")) return true;
  if (msg.includes("gateway")) return true;
  if (msg.includes("failed to fetch")) return true;
  if (msg.includes("networkerror")) return true;
  return false;
}

export function describeBackendError(error: unknown): string {
  if (!error) return "Request failed";
  const e = error as any;
  const status = e.status ?? e.statusCode;
  if (status === 429) return "Server is busy — showing last available data";
  if (status === 504 || status === 502 || status === 503) {
    return "Backend is temporarily unavailable — showing last available data";
  }
  const msg = String(e.message ?? "").toLowerCase();
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return "Network hiccup — showing last available data";
  }
  return e.message ? String(e.message) : "Request failed";
}
