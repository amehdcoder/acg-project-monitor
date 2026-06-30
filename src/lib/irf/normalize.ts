// Normalisation layer for SAIRF (SARMAAN ACSM) reports.
//
// The single combined IRF was split into four category activity forms
// (Advocacy Supervision, Town Announcers, Compound Meeting, Community Dialogue).
// Some captured fields are written to dedicated columns, but several key numbers
// — officials engaged, announcers supervised, compound meetings held, and the
// select fields for support mode / announcement channel — are stored inside the
// `answers` JSON. Every dashboard computation must read those, otherwise headline
// KPIs (e.g. "Stakeholders Engaged") silently report zero.
//
// `normalizeIrfRow` flattens the `answers` JSON onto the row so every captured
// field is reachable as a top-level property. Real columns always win over JSON.

import type { IrfReport } from "./definition";

export function normalizeIrfRow(r: IrfReport): IrfReport {
  const answers = (r as any).answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return r;
  const merged: any = { ...r };
  for (const [k, v] of Object.entries(answers)) {
    const cur = merged[k];
    if (cur == null || cur === "") merged[k] = v;
  }
  return merged as IrfReport;
}

export const normalizeIrfRows = (rows: IrfReport[]): IrfReport[] => rows.map(normalizeIrfRow);

/**
 * Category-form fields that live in `answers` (or are new columns) and are NOT
 * part of the legacy IRF_ALL_FIELDS definition. They are appended to the
 * field-by-field analysis so the standalone activity forms are fully covered.
 */
export const IRF_EXTRA_FIELDS: {
  key: string;
  label: string;
  type: "number" | "select" | "boolean";
  activity: string;
  sectionId: string;
}[] = [
  { key: "persons_engaged", label: "Officials engaged (advocacy)", type: "number", activity: "Advocacy visit", sectionId: "advocacy_supervision" },
  { key: "announcers_supervised", label: "Town announcers supervised", type: "number", activity: "Town announcers", sectionId: "town_announcers" },
  { key: "meetings_held", label: "Compound meetings held", type: "number", activity: "Compound meeting", sectionId: "compound_meeting" },
  { key: "outcome_level", label: "Level of acceptance / outcome", type: "select", activity: "Outcome", sectionId: "outcome" },
  { key: "support_mode", label: "Type of support secured", type: "select", activity: "Advocacy visit", sectionId: "advocacy_supervision" },
  { key: "message_channel", label: "Announcement channel", type: "select", activity: "Town announcers", sectionId: "town_announcers" },
  { key: "reporting_level", label: "Reporting level", type: "select", activity: "Report", sectionId: "report" },
];

/** Keys whose numeric values are used for duplicate-signature fingerprinting. */
export const IRF_ANSWER_METRIC_KEYS = ["persons_engaged", "announcers_supervised", "meetings_held"] as const;
