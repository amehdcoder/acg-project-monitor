// Cryptographic zero-knowledge safeguarding vault.
//
// Safeguarding narratives are the most sensitive text in the whole platform.
// This module makes them unreadable to everyone except the safeguarding
// officers themselves — including us, the database, backups and anyone with
// server access. Nothing here ever sends a key or a passphrase anywhere.
//
// How it works
// ------------
//  * Each officer generates an ECDH P-256 key pair in their own browser. The
//    public key is stored; the private key is encrypted with a key derived
//    from a passphrase only they know (PBKDF2-SHA256, 310,000 rounds) before
//    it is stored. The server therefore holds a private key it cannot open.
//  * Each safeguarding case gets its own random AES-256-GCM content key. The
//    narrative, action taken, outcome and every case note are encrypted with
//    it before they leave the device.
//  * That content key is then sealed separately for each officer, using a
//    fresh ephemeral ECDH key agreement against that officer's public key
//    (ECDH -> HKDF-SHA256 -> AES-GCM key wrap). Only the holder of the
//    matching private key can unseal it.
//  * Removing an officer's sealed key removes their ability to read the case;
//    the encrypted text itself stays untouched.
//
// The unlocked private key lives in memory for the session only. Closing the
// tab locks the vault again — there is no recovery path, by design. If every
// officer forgets their passphrase the narratives are gone; the case metadata
// (severity, status, dates) stays readable so the register still works.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };
const subtle = () => {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("This browser cannot encrypt safeguarding records. Use a modern browser over a secure connection.");
  }
  return crypto.subtle;
};

const PBKDF2_ROUNDS = 310_000;

/* ---------------------------- encoding ---------------------------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  bytes.forEach((b) => { out += String.fromCharCode(b); });
  return btoa(out);
};

const fromB64 = (value: string) => {
  const bin = atob(value);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/* ---------------------------- key material ------------------------ */

export interface WrappedPrivateKey {
  alg: "PBKDF2-AESGCM";
  rounds: number;
  salt: string;
  iv: string;
  data: string;
}

export interface SealedKey {
  epk: JsonWebKey;
  iv: string;
  data: string;
}

export interface CipherPayload {
  v: 1;
  iv: string;
  data: string;
}

const passphraseKey = async (passphrase: string, salt: Uint8Array, rounds: number) => {
  const base = await subtle().importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: rounds, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const fingerprintOf = async (jwk: JsonWebKey) => {
  const digest = await subtle().digest("SHA-256", enc.encode(`${jwk.x}.${jwk.y}`));
  return toB64(digest).replace(/[^A-Za-z0-9]/g, "").slice(0, 16).toUpperCase().match(/.{1,4}/g)!.join("-");
};

/* ---------------------------- session ----------------------------- */

interface VaultSession {
  projectId: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
  fingerprint: string;
}

let session: VaultSession | null = null;
const caseKeys = new Map<string, CryptoKey>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export const isVaultUnlocked = (projectId?: string) =>
  !!session && (!projectId || session.projectId === projectId);

export const vaultFingerprint = () => session?.fingerprint ?? null;

export const lockVault = () => {
  session = null;
  caseKeys.clear();
  notify();
};

/* ---------------------------- enrolment --------------------------- */

export interface VaultKeyRow {
  project_id: string;
  user_id: string;
  public_jwk: JsonWebKey;
  wrapped_private_key: WrappedPrivateKey;
  fingerprint: string;
}

export const fetchMyVaultKey = async (projectId: string): Promise<VaultKeyRow | null> => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await db.from("safeguarding_vault_keys")
    .select("*").eq("project_id", projectId).eq("user_id", auth.user.id).maybeSingle();
  return (data as VaultKeyRow) || null;
};

export const fetchProjectVaultKeys = async (projectId: string): Promise<VaultKeyRow[]> => {
  const { data } = await db.from("safeguarding_vault_keys")
    .select("*").eq("project_id", projectId).limit(200);
  return (data as VaultKeyRow[]) || [];
};

/** Creates this officer's key pair and stores it, private half encrypted. */
export const enrolInVault = async (projectId: string, passphrase: string) => {
  if (passphrase.length < 10) {
    throw new Error("Use a passphrase of at least 10 characters — it is the only thing protecting these records.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You must be signed in.");

  const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicJwk = await subtle().exportKey("jwk", pair.publicKey);
  const pkcs8 = await subtle().exportKey("pkcs8", pair.privateKey);

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrapKey = await passphraseKey(passphrase, salt, PBKDF2_ROUNDS);
  const sealed = await subtle().encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, wrapKey, pkcs8);

  const wrapped: WrappedPrivateKey = {
    alg: "PBKDF2-AESGCM", rounds: PBKDF2_ROUNDS,
    salt: toB64(salt), iv: toB64(iv), data: toB64(sealed),
  };
  const fingerprint = await fingerprintOf(publicJwk);

  const { error } = await db.from("safeguarding_vault_keys").upsert({
    project_id: projectId,
    user_id: auth.user.id,
    public_jwk: publicJwk,
    wrapped_private_key: wrapped,
    fingerprint,
  }, { onConflict: "project_id,user_id" });
  if (error) throw error;

  session = { projectId, privateKey: pair.privateKey, publicJwk, fingerprint };
  notify();
  return fingerprint;
};

/** Opens the vault for this session using the officer's passphrase. */
export const unlockVault = async (projectId: string, passphrase: string) => {
  const row = await fetchMyVaultKey(projectId);
  if (!row) throw new Error("You have no vault key on this project yet — set one up first.");
  const wrapped = row.wrapped_private_key;
  const wrapKey = await passphraseKey(passphrase, fromB64(wrapped.salt), wrapped.rounds || PBKDF2_ROUNDS);
  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = await subtle().decrypt(
      { name: "AES-GCM", iv: fromB64(wrapped.iv) as unknown as BufferSource },
      wrapKey,
      fromB64(wrapped.data) as unknown as BufferSource,
    );
  } catch {
    throw new Error("That passphrase does not open the vault.");
  }
  const privateKey = await subtle().importKey(
    "pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"],
  );
  session = { projectId, privateKey, publicJwk: row.public_jwk, fingerprint: row.fingerprint };
  caseKeys.clear();
  notify();
  return row.fingerprint;
};

/** Changes the passphrase without changing the key pair or resealing cases. */
export const changeVaultPassphrase = async (
  projectId: string, current: string, next: string,
) => {
  if (next.length < 10) throw new Error("Use a passphrase of at least 10 characters.");
  const row = await fetchMyVaultKey(projectId);
  if (!row) throw new Error("No vault key found on this project.");
  const oldKey = await passphraseKey(passphrase0(current), fromB64(row.wrapped_private_key.salt), row.wrapped_private_key.rounds);
  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = await subtle().decrypt(
      { name: "AES-GCM", iv: fromB64(row.wrapped_private_key.iv) as unknown as BufferSource },
      oldKey,
      fromB64(row.wrapped_private_key.data) as unknown as BufferSource,
    );
  } catch {
    throw new Error("The current passphrase is not correct.");
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const newKey = await passphraseKey(next, salt, PBKDF2_ROUNDS);
  const sealed = await subtle().encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, newKey, pkcs8);
  const { error } = await db.from("safeguarding_vault_keys").update({
    wrapped_private_key: {
      alg: "PBKDF2-AESGCM", rounds: PBKDF2_ROUNDS,
      salt: toB64(salt), iv: toB64(iv), data: toB64(sealed),
    },
  }).eq("project_id", projectId).eq("user_id", row.user_id);
  if (error) throw error;
};

const passphrase0 = (v: string) => v;

/* ---------------------------- sealing ----------------------------- */

const deriveWrapKey = async (privateKey: CryptoKey, publicJwk: JsonWebKey) => {
  const peer = await subtle().importKey("jwk", publicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await subtle().deriveBits({ name: "ECDH", public: peer }, privateKey, 256);
  const hkdfBase = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("amehnities-safeguarding-vault"), info: enc.encode("case-key-wrap") },
    hkdfBase,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const sealCaseKey = async (caseKey: CryptoKey, recipientJwk: JsonWebKey): Promise<SealedKey> => {
  const ephemeral = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const wrapKey = await deriveWrapKey(ephemeral.privateKey, recipientJwk);
  const raw = await subtle().exportKey("raw", caseKey);
  const iv = randomBytes(12);
  const data = await subtle().encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, wrapKey, raw);
  return {
    epk: await subtle().exportKey("jwk", ephemeral.publicKey),
    iv: toB64(iv),
    data: toB64(data),
  };
};

const openCaseKey = async (sealed: SealedKey) => {
  if (!session) throw new Error("The safeguarding vault is locked.");
  const wrapKey = await deriveWrapKey(session.privateKey, sealed.epk);
  const raw = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(sealed.iv) as unknown as BufferSource },
    wrapKey,
    fromB64(sealed.data) as unknown as BufferSource,
  );
  return subtle().importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
};

/* ---------------------------- case content ------------------------ */

/** The fields that never leave the device in readable form. */
export interface ProtectedNarrative {
  narrative: string;
  action_taken: string;
  outcome: string;
}

export const PROTECTED_PLACEHOLDER = "🔒 Sealed — open the vault to read this narrative.";

const encryptJson = async (key: CryptoKey, value: unknown): Promise<CipherPayload> => {
  const iv = randomBytes(12);
  const data = await subtle().encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource }, key, enc.encode(JSON.stringify(value)),
  );
  return { v: 1, iv: toB64(iv), data: toB64(data) };
};

const decryptJson = async <T,>(key: CryptoKey, payload: CipherPayload): Promise<T> => {
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(payload.iv) as unknown as BufferSource },
    key,
    fromB64(payload.data) as unknown as BufferSource,
  );
  return JSON.parse(dec.decode(plain)) as T;
};

/** Loads (and caches) the content key for one case. */
export const caseKeyFor = async (concernId: string): Promise<CryptoKey | null> => {
  if (!session) return null;
  const cached = caseKeys.get(concernId);
  if (cached) return cached;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await db.from("safeguarding_case_keys")
    .select("sealed_key").eq("concern_id", concernId).eq("recipient_id", auth.user.id).maybeSingle();
  if (!data) return null;
  const key = await openCaseKey((data as { sealed_key: SealedKey }).sealed_key);
  caseKeys.set(concernId, key);
  return key;
};

/**
 * Encrypts a case's narrative and seals the content key for every officer on
 * the project who has set up a vault key.
 */
export const sealConcern = async (
  projectId: string, concernId: string, content: ProtectedNarrative,
) => {
  const officers = await fetchProjectVaultKeys(projectId);
  if (!officers.length) throw new Error("No safeguarding officer on this project has set up a vault key yet.");

  let key = await caseKeyFor(concernId);
  let fresh = false;
  if (!key) {
    key = await subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    caseKeys.set(concernId, key);
    fresh = true;
  }

  const cipher = await encryptJson(key, content);
  const { data: auth } = await supabase.auth.getUser();

  if (fresh) {
    const rows = await Promise.all(officers.map(async (o) => ({
      project_id: projectId,
      concern_id: concernId,
      recipient_id: o.user_id,
      sealed_key: await sealCaseKey(key!, o.public_jwk),
      created_by: auth.user?.id ?? null,
    })));
    const { error } = await db.from("safeguarding_case_keys")
      .upsert(rows, { onConflict: "concern_id,recipient_id" });
    if (error) throw error;
  }

  return cipher;
};

/** Gives officers who joined later access to a case this officer can read. */
export const shareConcernWithNewOfficers = async (projectId: string, concernId: string) => {
  const key = await caseKeyFor(concernId);
  if (!key) throw new Error("You cannot open this case, so you cannot share it.");
  const officers = await fetchProjectVaultKeys(projectId);
  const { data: existing } = await db.from("safeguarding_case_keys")
    .select("recipient_id").eq("concern_id", concernId);
  const have = new Set(((existing as { recipient_id: string }[]) || []).map((r) => r.recipient_id));
  const missing = officers.filter((o) => !have.has(o.user_id));
  if (!missing.length) return 0;
  const { data: auth } = await supabase.auth.getUser();
  const rows = await Promise.all(missing.map(async (o) => ({
    project_id: projectId,
    concern_id: concernId,
    recipient_id: o.user_id,
    sealed_key: await sealCaseKey(key, o.public_jwk),
    created_by: auth.user?.id ?? null,
  })));
  const { error } = await db.from("safeguarding_case_keys")
    .upsert(rows, { onConflict: "concern_id,recipient_id" });
  if (error) throw error;
  return rows.length;
};

/** Withdraws an officer's ability to open a case. */
export const revokeConcernAccess = async (concernId: string, recipientId: string) => {
  const { error } = await db.from("safeguarding_case_keys")
    .delete().eq("concern_id", concernId).eq("recipient_id", recipientId);
  if (error) throw error;
};

/** Opens a sealed case for display, or returns null when it stays sealed. */
export const openConcern = async (
  concernId: string, cipher: CipherPayload | null,
): Promise<ProtectedNarrative | null> => {
  if (!cipher || !session) return null;
  try {
    const key = await caseKeyFor(concernId);
    if (!key) return null;
    return await decryptJson<ProtectedNarrative>(key, cipher);
  } catch {
    return null;
  }
};

/* ---------------------------- notes ------------------------------- */

export const sealNote = async (concernId: string, note: string): Promise<CipherPayload> => {
  const key = await caseKeyFor(concernId);
  if (!key) throw new Error("Open the vault before adding a note to a sealed case.");
  return encryptJson(key, { note });
};

export const openNote = async (concernId: string, cipher: CipherPayload | null) => {
  if (!cipher) return null;
  try {
    const key = await caseKeyFor(concernId);
    if (!key) return null;
    const value = await decryptJson<{ note: string }>(key, cipher);
    return value.note;
  } catch {
    return null;
  }
};

/* ---------------------------- react glue -------------------------- */

export interface VaultState {
  /** This officer has a key pair on the project. */
  enrolled: boolean;
  /** The private key is loaded in memory for this session. */
  unlocked: boolean;
  fingerprint: string | null;
  /** Officers on the project who have set up a key. */
  officersWithKeys: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useSafeguardingVault = (projectId?: string, enabled = true): VaultState => {
  const [enrolled, setEnrolled] = useState(false);
  const [officersWithKeys, setOfficersWithKeys] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId || !enabled) { setLoading(false); return; }
    setLoading(true);
    const [mine, all] = await Promise.all([
      fetchMyVaultKey(projectId), fetchProjectVaultKeys(projectId),
    ]);
    setEnrolled(!!mine);
    setOfficersWithKeys(all.length);
    setLoading(false);
  }, [projectId, enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  return {
    enrolled,
    unlocked: isVaultUnlocked(projectId) && tick >= 0,
    fingerprint: vaultFingerprint(),
    officersWithKeys,
    loading,
    refresh,
  };
};
