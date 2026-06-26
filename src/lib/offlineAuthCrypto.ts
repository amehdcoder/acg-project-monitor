// Secure offline credential hashing.
//
// Offline login needs to verify a password on-device without contacting the
// server. Storing a plain SHA-256 of the password is weak (no salt, single
// round → trivially precomputed). We use PBKDF2-SHA256 with a per-account
// random salt and many iterations, all via the Web Crypto API so it works on
// every supported device with no dependencies.
//
// Backward compatibility: older caches stored `passwordHash` as a single
// unsalted SHA-256 hex digest with no `salt`. `verifyOfflinePassword` falls
// back to that scheme when no salt is present, so existing users are not
// locked out until their next online login re-caches with the stronger hash.

// OWASP-recommended floor for PBKDF2-SHA256. Stored per-record, so raising it
// only affects newly-cached credentials; older caches keep verifying with their
// own saved iteration count until the next online login re-hashes them.
const PBKDF2_ITERATIONS = 310_000;

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
};

/** Legacy single-round unsalted SHA-256 (kept only for verifying old caches). */
export const legacySha256 = async (password: string): Promise<string> => {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
};

const derivePbkdf2 = async (
  password: string,
  saltHex: string,
  iterations: number,
): Promise<string> => {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex) as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
};

export interface OfflineCredentialHash {
  passwordHash: string;
  salt: string;
  iterations: number;
  algo: "pbkdf2-sha256";
}

/** Build a salted PBKDF2 hash to persist in the offline auth cache. */
export const hashOfflinePassword = async (
  password: string,
): Promise<OfflineCredentialHash> => {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const passwordHash = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
  return { passwordHash, salt, iterations: PBKDF2_ITERATIONS, algo: "pbkdf2-sha256" };
};

/**
 * Verify a typed password against a cached credential record. Supports both
 * the new salted PBKDF2 records and the legacy unsalted SHA-256 records.
 */
export const verifyOfflinePassword = async (
  password: string,
  cache: { passwordHash?: string; salt?: string; iterations?: number },
): Promise<boolean> => {
  if (!cache?.passwordHash) return false;
  if (cache.salt) {
    const computed = await derivePbkdf2(
      password,
      cache.salt,
      cache.iterations || PBKDF2_ITERATIONS,
    );
    return computed === cache.passwordHash;
  }
  // Legacy fallback.
  const legacy = await legacySha256(password);
  return legacy === cache.passwordHash;
};
