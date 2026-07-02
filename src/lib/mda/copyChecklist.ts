// Utilities for copying the Integrated MDA Supervisory Checklist from one
// project into another. The copied checklist remains 100% editable in the
// destination project (it is a standard flat groups/questions payload), and
// can optionally be restricted to a single state so field users only ever
// pick the supervision location/cascade within that state.

import type { FormGroup, Question, QuestionOption } from "@/components/FormBuilder/types";
import { getAllStates } from "@/lib/nigeriaAdminData";

/** Match the slug rule used when the checklist cascade options were built. */
export const slugifyState = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export interface StateChoice {
  /** Option value stored on the State question (e.g. "jigawa"). */
  value: string;
  /** Human label (e.g. "Jigawa"). */
  label: string;
}

/** All Nigerian states as selectable destination-state choices. */
export function getStateChoices(): StateChoice[] {
  return getAllStates().map((name) => ({ value: slugifyState(name), label: name }));
}

const isGroup = (g: any): g is FormGroup =>
  g && typeof g === "object" && Array.isArray(g.questions);

function restrictQuestionToState(q: Question, stateValue: string): Question {
  const opts = (q.options ?? []) as QuestionOption[];
  if (q.name === "state") {
    const filtered = opts.filter((o) => o.value === stateValue);
    return {
      ...q,
      options: filtered.length ? filtered : opts,
      // Preselect the destination state (single option) so users "just" pick
      // the location cascade beneath it.
      defaultValue: stateValue,
    } as Question;
  }
  if (q.name === "lga") {
    return { ...q, options: opts.filter((o) => o.parentValue === stateValue) };
  }
  if (q.name === "ward") {
    const prefix = `${stateValue}__`;
    return { ...q, options: opts.filter((o) => String(o.parentValue ?? "").startsWith(prefix)) };
  }
  return q;
}

/**
 * Return a deep clone of the checklist groups, with the State/LGA/Ward cascade
 * restricted to a single state (and that state preselected + locked).
 * Passing an empty/undefined state returns an unrestricted clone.
 */
export function restrictChecklistToState(
  questions: FormGroup[],
  stateValue?: string | null,
): FormGroup[] {
  const cloned: FormGroup[] = JSON.parse(JSON.stringify(questions ?? []));
  if (!stateValue) return cloned;
  return cloned.map((g) => {
    if (!isGroup(g)) return g;
    return { ...g, questions: g.questions.map((q) => restrictQuestionToState(q as Question, stateValue)) };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Full checklist + linked dashboard copy
// ─────────────────────────────────────────────────────────────────────────────

/** Settings keys that define the MDA checklist AND its linked dashboard. */
export interface MdaCopySettings {
  isMdaChecklist?: boolean;
  /** Flags the FormFiller/dashboard experience. */
  n?: boolean;
  coverageEvaluation?: boolean;
  /** Whether the linked dashboard is visible to non-admin members. */
  dashboardPublished?: boolean;
  [key: string]: any;
}

export interface CopySource {
  name: string;
  description: string | null;
  questions: FormGroup[];
  settings: MdaCopySettings | null;
  project_id: string;
}

export interface BuildCopyOptions {
  /** Restrict the destination checklist to a single state slug. */
  stateValue?: string | null;
  /** Publish the linked dashboard immediately (default false → unpublished). */
  publishDashboard?: boolean;
  /** Finalize the checklist immediately (status "published") instead of draft. */
  finalizeChecklist?: boolean;
  /** Friendly name of the source project (stored for provenance). */
  sourceProjectName?: string;
}

export interface CopyPayload {
  name: string;
  description: string | null;
  questions: FormGroup[];
  settings: MdaCopySettings;
  status: "draft" | "published";
}

/**
 * Produce an INSERT-ready payload that copies the COMPLETE checklist AND its
 * linked dashboard configuration into the destination project. The copy is a
 * standard forms payload so it stays 100% editable in the Form Builder, and it
 * carries the dashboard flags so the linked dashboard renders identically.
 */
export function buildChecklistCopyPayload(
  source: CopySource,
  opts: BuildCopyOptions = {},
): CopyPayload {
  const {
    stateValue = null,
    publishDashboard = false,
    finalizeChecklist = false,
    sourceProjectName,
  } = opts;

  const questions = restrictChecklistToState(source.questions, stateValue);

  // Preserve the full dashboard config: the MDA dashboard is derived from these
  // flags, so copying them reproduces the exact linked dashboard.
  const settings: MdaCopySettings = {
    ...(source.settings ?? {}),
    isMdaChecklist: source.settings?.isMdaChecklist ?? true,
    n: source.settings?.n ?? true,
    coverageEvaluation: source.settings?.coverageEvaluation ?? true,
    dashboardPublished: publishDashboard,
    ...(sourceProjectName ? { copiedFromProject: sourceProjectName } : {}),
    ...(stateValue ? { stateRestricted: stateValue } : {}),
  };

  return {
    name: source.name,
    description: source.description,
    questions,
    settings,
    status: finalizeChecklist ? "published" : "draft",
  };
}

/** True when the form's linked dashboard should be visible to a given viewer. */
export function isDashboardPublished(settings: MdaCopySettings | null | undefined): boolean {
  // Backward-compat: forms created before this flag existed are treated as
  // published so existing dashboards keep rendering.
  if (!settings) return true;
  return settings.dashboardPublished !== false;
}
