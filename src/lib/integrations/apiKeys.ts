// Shared helpers for API key & webhook secret generation and hashing.
// Raw keys/secrets are shown to the admin once; only the SHA-256 hash is stored.

export const randomHex = (bytes: number): string => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const sha256Hex = async (input: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const generateApiKey = (): { raw: string; prefix: string } => {
  const raw = `amk_${randomHex(24)}`;
  return { raw, prefix: raw.slice(0, 12) };
};

export const generateWebhookSecret = (): string => `whs_${randomHex(24)}`;

export const API_SCOPES = ["records:read", "aggregates:read", "reports:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const hasScope = (granted: string[], needed: string): boolean =>
  granted.includes(needed) || granted.includes("*");
