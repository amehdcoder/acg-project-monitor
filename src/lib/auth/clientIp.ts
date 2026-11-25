/** Public, optional connection metadata: never attach an account's access token. */
export async function lookupClientIp(): Promise<string | null> {
  if (!navigator.onLine) return null;
  const base = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "");
  if (!base || !key) return null;
  try {
    const response = await fetch(`${base}/functions/v1/get-client-ip`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("ip" in data)) return null;
    return typeof data.ip === "string" && data.ip.trim() && data.ip !== "unknown" ? data.ip.trim() : null;
  } catch {
    // Offline, timed out or unavailable: this must never interrupt the workspace.
    return null;
  }
}