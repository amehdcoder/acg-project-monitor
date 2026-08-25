/**
 * Granular permission levels for admins granted the Amehnities AI workspace.
 *
 * A grant row (`admin_page_access`, page_id = "amehnities-ai") carries a
 * `permissions` jsonb blob. Every capability defaults to OFF, so a fresh grant
 * is strictly **view-only**: the admin can open the workspace and read, but
 * cannot upload datasets, export media, drive training or edit AI memory.
 */

export const AI_CAPABILITIES = [
  {
    key: "datasets",
    label: "Dataset access",
    description: "Upload files, open dataset previews and run data analysis.",
  },
  {
    key: "media_export",
    label: "Media & document export",
    description: "Generate images/media and download generated documents.",
  },
  {
    key: "training",
    label: "Model training control",
    description: "Start/pause training, change hyper-parameters, export checkpoints.",
  },
  {
    key: "memory",
    label: "AI memory & review queue",
    description: "Correct answers, resolve the review queue and edit long-term memory.",
  },
] as const;

export type AiCapabilityKey = (typeof AI_CAPABILITIES)[number]["key"];

export type AiPermissions = Partial<Record<AiCapabilityKey, boolean>>;

export const EMPTY_AI_PERMISSIONS: AiPermissions = {};

/** Normalises whatever came out of the database into a clean boolean map. */
export function normalizeAiPermissions(raw: unknown): AiPermissions {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: AiPermissions = {};
  for (const cap of AI_CAPABILITIES) out[cap.key] = src[cap.key] === true;
  return out;
}

/** A grant with no capability enabled is a view-only grant. */
export function isViewOnly(p: AiPermissions | null | undefined): boolean {
  if (!p) return true;
  return !AI_CAPABILITIES.some((c) => p[c.key] === true);
}

export function grantedCapabilityLabels(p: AiPermissions | null | undefined): string[] {
  if (!p) return [];
  return AI_CAPABILITIES.filter((c) => p[c.key] === true).map((c) => c.label);
}

/** Owner-level users implicitly hold every capability. */
export const FULL_AI_PERMISSIONS: AiPermissions = AI_CAPABILITIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: true }),
  {} as AiPermissions,
);
