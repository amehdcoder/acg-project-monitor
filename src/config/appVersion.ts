/**
 * Global app version configuration.
 *
 * `LATEST_PUBLISHED_VERSION` is the version string of the most recently
 * published client build. The running app reports this value to the backend
 * (via the heartbeat) as each user's `current_version`, and the App Version
 * Audit dashboard compares every user's stored version against it.
 *
 * Bump this whenever a new build is published.
 */
export const LATEST_PUBLISHED_VERSION = "2.1.0";

export interface VersionParts {
  major: number;
  minor: number;
  patch: number;
}

/** Parse a semver-ish string into numeric parts. Missing/invalid → all zeros. */
export const parseVersion = (version: string | null | undefined): VersionParts => {
  const [major = 0, minor = 0, patch = 0] = String(version ?? "")
    .trim()
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
  return { major, minor, patch };
};

/**
 * Returns how many "steps" behind `version` is relative to `latest`.
 * 0 = same or ahead, 1 = exactly one patch/minor/major step behind,
 * >1 = multiple versions behind.
 */
export const versionsBehind = (
  version: string | null | undefined,
  latest: string = LATEST_PUBLISHED_VERSION,
): number => {
  const a = parseVersion(version);
  const b = parseVersion(latest);
  if (a.major < b.major) return b.major - a.major > 0 ? 2 : 1;
  if (a.major > b.major) return 0;
  if (a.minor < b.minor) return b.minor - a.minor > 1 ? 2 : 1;
  if (a.minor > b.minor) return 0;
  if (a.patch < b.patch) return b.patch - a.patch > 1 ? 2 : 1;
  return 0;
};

export type VersionStatus = "current" | "pending" | "drift";

/**
 * Classify a user's version + last sync time into an audit status.
 * - "current": matches the latest published version
 * - "pending": exactly one version behind
 * - "drift": multiple versions behind, unknown version, or hasn't synced
 *   since the offline ledger migration cutoff.
 */
export const OFFLINE_LEDGER_MIGRATION_CUTOFF = new Date("2026-07-12T00:00:00Z");

export const classifyVersionStatus = (
  version: string | null | undefined,
  lastSeenAt?: string | null,
  latest: string = LATEST_PUBLISHED_VERSION,
): VersionStatus => {
  const staleSync =
    !lastSeenAt || new Date(lastSeenAt) < OFFLINE_LEDGER_MIGRATION_CUTOFF;

  if (!version) return "drift";

  const behind = versionsBehind(version, latest);
  if (behind === 0) return staleSync ? "drift" : "current";
  if (behind === 1) return staleSync ? "drift" : "pending";
  return "drift";
};
