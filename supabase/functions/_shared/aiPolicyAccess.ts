// Server-only helpers that protect the assistant's learned guidance.
// - Only the Owner, or people explicitly granted the Amehnities AI page, may
//   read rule/exemplar content.
// - Policy IDs handed to the browser are signed, so feedback can only reward
//   the guidance the server actually used for that user's answer.
// deno-lint-ignore-file no-explicit-any

const enc = new TextEncoder();

async function hmacHex(message: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey("raw", enc.encode(`ai-policy:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const payload = (userId: string, ids: string[]) => `${userId}|${[...ids].sort().join(",")}`;

export async function signPolicyIds(userId: string, ids: string[]): Promise<string> {
  return hmacHex(payload(userId, ids));
}

export async function verifyPolicyIds(userId: string, ids: string[], token: unknown): Promise<boolean> {
  if (!ids.length || typeof token !== "string" || token.length !== 64) return false;
  const expected = await hmacHex(payload(userId, ids));
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function hasAiPolicyAccess(admin: any, userId: string): Promise<boolean> {
  const [{ data: isOwner }, { data: grant }] = await Promise.all([
    admin.rpc("is_owner", { _user_id: userId }),
    admin.from("admin_page_access").select("id").eq("user_id", userId).eq("page_id", "amehnities-ai").maybeSingle(),
  ]);
  return Boolean(isOwner) || Boolean(grant);
}
