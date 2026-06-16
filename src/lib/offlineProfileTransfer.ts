// Encrypted export / import of offline credential *device profiles*.
//
// The device key in deviceCrypto.ts is intentionally NON-EXTRACTABLE, so the
// at-rest device cache can never be copied off the device. That is great for
// security but means a user who clears their browser data loses offline login.
//
// This module provides a deliberate, passphrase-protected escape hatch: the
// user can export their cached offline credential profiles into a single
// portable file that is encrypted with a passphrase THEY choose (PBKDF2 →
// AES-GCM, independent of the device key). On a new device / after a data wipe
// they import that file with the same passphrase to restore offline login —
// without ever needing to be online or to retype their account password.

import {
  listOfflineCredentials,
  restoreOfflineCredential,
  type OfflineAuthCredential,
} from "@/lib/offlineAuthCache";
import { logOfflineAuditEvent } from "@/lib/offlineAuditLog";

const MAGIC = "amehnities-offline-profile";
const FORMAT_VERSION = 1;
const PBKDF2_ITERATIONS = 210_000;

interface ProfileEnvelope {
  magic: string;
  version: number;
  createdAt: string;
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
}

const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const fromB64 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const deriveKey = async (passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> => {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

/**
 * Build an encrypted, downloadable profile bundle of all cached offline
 * credentials on this device. Returns the JSON text and a count.
 */
export const exportOfflineProfiles = async (
  passphrase: string,
): Promise<{ json: string; count: number }> => {
  if (!passphrase || passphrase.length < 8) {
    throw new Error("Choose a passphrase of at least 8 characters.");
  }
  const credentials = await listOfflineCredentials();
  if (!credentials.length) {
    throw new Error("No offline credentials are cached on this device to export.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify({ credentials }));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  const envelope: ProfileEnvelope = {
    magic: MAGIC,
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    kdf: "pbkdf2-sha256",
    iterations: PBKDF2_ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(ct),
  };

  await logOfflineAuditEvent("cache_export", {
    email: credentials[0]?.email,
    success: true,
    details: { profiles: credentials.length, emails: credentials.map((c) => c.email) },
  });

  return { json: JSON.stringify(envelope, null, 2), count: credentials.length };
};

/** Trigger a browser download of an exported profile bundle. */
export const downloadOfflineProfiles = async (passphrase: string): Promise<number> => {
  const { json, count } = await exportOfflineProfiles(passphrase);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `offline-profile-${new Date().toISOString().slice(0, 10)}.amprofile.json`;
  a.click();
  URL.revokeObjectURL(url);
  return count;
};

/**
 * Restore offline credential profiles from an encrypted bundle. Re-seals each
 * credential into the device cache with the (current) device key.
 */
export const importOfflineProfiles = async (
  fileText: string,
  passphrase: string,
): Promise<{ restored: number; emails: string[] }> => {
  let envelope: ProfileEnvelope;
  try {
    envelope = JSON.parse(fileText);
  } catch {
    throw new Error("That file is not a valid profile bundle.");
  }
  if (envelope?.magic !== MAGIC) {
    throw new Error("Unrecognised file — this is not an Amehnities offline profile.");
  }

  const salt = fromB64(envelope.salt);
  const iv = fromB64(envelope.iv);
  const key = await deriveKey(passphrase, salt, envelope.iterations || PBKDF2_ITERATIONS);

  let parsed: { credentials: OfflineAuthCredential[] };
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      fromB64(envelope.ciphertext) as BufferSource,
    );
    parsed = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    await logOfflineAuditEvent("cache_import", { success: false, details: { reason: "wrong_passphrase_or_corrupt" } });
    throw new Error("Could not decrypt — the passphrase is wrong or the file is corrupt.");
  }

  const credentials = Array.isArray(parsed?.credentials) ? parsed.credentials : [];
  if (!credentials.length) throw new Error("The bundle contains no credential profiles.");

  const emails: string[] = [];
  for (const cred of credentials) {
    try {
      await restoreOfflineCredential(cred);
      if (cred.email) emails.push(cred.email);
    } catch (e) {
      console.warn("Skipped a profile during import:", e);
    }
  }

  await logOfflineAuditEvent("cache_import", {
    email: emails[0],
    success: emails.length > 0,
    details: { restored: emails.length, emails },
  });

  if (!emails.length) throw new Error("No valid profiles could be restored from the bundle.");
  return { restored: emails.length, emails };
};
