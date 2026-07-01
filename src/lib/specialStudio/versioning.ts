// Special Form Studio — template versioning + publish/unpublish workflow.
//
// Versions are stored inside forms.settings.versions[] (no DB migration).
// Each publish cuts an immutable snapshot; older versions stay available and
// can be previewed, restored (loaded into the editor as a new working draft),
// or re-published. Field users always run settings.publishedVersion.

import type { FormGroup } from "@/components/FormBuilder/types";
import type { FormTheme } from "@/lib/formTheme";
import type { DashboardConfig } from "./presets";

export interface TemplateSnapshot {
  sections: FormGroup[];
  theme: FormTheme;
  description: string | null;
  dashboardEnabled: boolean;
  dashboardConfig: DashboardConfig | null;
}

export interface TemplateVersion {
  v: number;
  label: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  status: "published" | "archived";
  snapshot: TemplateSnapshot;
}

export interface StudioSettings {
  theme?: FormTheme;
  studio?: boolean;
  presetKey?: string;
  dashboardEnabled?: boolean;
  dashboardConfig?: DashboardConfig | null;
  versions?: TemplateVersion[];
  publishedVersion?: number | null;
  [key: string]: unknown;
}

export function readVersions(settings: unknown): TemplateVersion[] {
  const s = (settings || {}) as StudioSettings;
  return Array.isArray(s.versions) ? s.versions : [];
}

export function nextVersionNumber(versions: TemplateVersion[]): number {
  return versions.reduce((max, v) => Math.max(max, v.v), 0) + 1;
}

/**
 * Cut a new published version from the current working state. The previously
 * published version is demoted to "archived"; history is preserved.
 */
export function publishVersion(
  existing: TemplateVersion[],
  snapshot: TemplateSnapshot,
  meta: { userId?: string | null; userName?: string | null; label?: string },
): { versions: TemplateVersion[]; publishedVersion: number } {
  const archived = existing.map((v) =>
    v.status === "published" ? { ...v, status: "archived" as const } : v,
  );
  const v = nextVersionNumber(existing);
  const version: TemplateVersion = {
    v,
    label: meta.label?.trim() || `Version ${v}`,
    createdAt: new Date().toISOString(),
    createdBy: meta.userId ?? null,
    createdByName: meta.userName ?? null,
    status: "published",
    snapshot,
  };
  return { versions: [version, ...archived], publishedVersion: v };
}

/** Mark all versions archived (unpublish) — history stays intact. */
export function unpublishVersions(existing: TemplateVersion[]): TemplateVersion[] {
  return existing.map((v) => ({ ...v, status: "archived" as const }));
}

/** Re-publish an older version by number without losing history. */
export function republishVersion(
  existing: TemplateVersion[],
  versionNumber: number,
): { versions: TemplateVersion[]; publishedVersion: number } | null {
  if (!existing.some((v) => v.v === versionNumber)) return null;
  const versions = existing.map((v) => ({
    ...v,
    status: (v.v === versionNumber ? "published" : "archived") as "published" | "archived",
  }));
  return { versions, publishedVersion: versionNumber };
}

export function findVersion(versions: TemplateVersion[], v: number): TemplateVersion | undefined {
  return versions.find((x) => x.v === v);
}

/** Resolve the snapshot field users should run (published one, else latest). */
export function resolvePublishedSnapshot(settings: unknown): TemplateSnapshot | null {
  const s = (settings || {}) as StudioSettings;
  const versions = readVersions(settings);
  if (!versions.length) return null;
  const pub =
    (s.publishedVersion != null && findVersion(versions, s.publishedVersion)) ||
    versions.find((v) => v.status === "published") ||
    versions[0];
  return pub ? pub.snapshot : null;
}
