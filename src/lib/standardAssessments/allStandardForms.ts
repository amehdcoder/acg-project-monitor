/**
 * Central registry of every Standard Form that can be assigned to an
 * individual user from the User Management page.
 *
 * This combines the clinical/validated assessments (STANDARD_ASSESSMENTS)
 * with the platform's other built-in standard forms — Safeguarding,
 * Programme Activity, Geo-enabled Microplanning Entry, project tools, etc.
 *
 * The `code` is what is persisted to `user_standard_form_assignments`.
 */

import { STANDARD_ASSESSMENTS } from "@/lib/standardAssessments/definitions";

export interface StandardFormOption {
  code: string;
  name: string;
  group: string;
}

/** Built-in standard forms that live outside the clinical assessment set. */
const EXTRA_STANDARD_FORMS: StandardFormOption[] = [
  // Safeguarding & office forms
  { code: "srf", name: "Safeguarding Reporting Form (SRF)", group: "Safeguarding Forms" },
  { code: "incident", name: "Safeguarding Incident Form", group: "Safeguarding Forms" },
  { code: "leave", name: "Leave Application Form", group: "Office Forms" },
  { code: "stationery", name: "Office Stationery Request Form", group: "Office Forms" },

  // Geo-enabled microplanning
  { code: "microplan_entry", name: "Geo-enabled Microplanning Entry Form", group: "Microplanning" },

  // Programme activity
  { code: "uprp", name: "Participants Bank Details Verification Form", group: "Programme Activity Forms" },
  { code: "attendance", name: "Digital Attendance", group: "Programme Activity Forms" },

  // Meeting & planning tools
  { code: "action_tracker", name: "Meeting Action Points Tracker", group: "Programme Activity Forms" },
  { code: "workplan", name: "Work Plan Tracker", group: "Programme Activity Forms" },

  // Mental health guided flow
  { code: "mental_health", name: "GAD-7 & PHQ-9 Guided Assessment", group: "Mental Health Forms" },

  // Project-specific tools
  { code: "bloomberg_form", name: "Bloomberg School Enrolment Validation", group: "Project Tools" },
  { code: "bloomberg_dash", name: "Bloomberg Validation Dashboard", group: "Project Tools" },
  { code: "seeclear_form", name: "See Clear Facility Monitoring Checklist", group: "Project Tools" },
  { code: "seeclear_dash", name: "See Clear Monitoring Dashboard", group: "Project Tools" },
  { code: "acsm_form", name: "ACSM Reporting Form", group: "Project Tools" },
  { code: "acsm_dash", name: "ACSM Dashboard", group: "Project Tools" },
  { code: "sbc_form", name: "SBC Reporting Form", group: "Project Tools" },
  { code: "sbc_dash", name: "SBC Dashboard", group: "Project Tools" },
  { code: "irf_form", name: "SARMAAN ACSM Indicator Reporting Forms (SAIRF)", group: "Project Tools" },
  { code: "irf_dash", name: "SARMAAN ACSM Campaign Indicator Tracking Dashboard", group: "Project Tools" },
];

/** The full, de-duplicated list of assignable standard forms. */
export const ALL_STANDARD_FORMS: StandardFormOption[] = (() => {
  const assessments: StandardFormOption[] = Object.values(STANDARD_ASSESSMENTS).map((def: any) => ({
    code: def.code as string,
    name: def.name as string,
    group: "Assessment Forms",
  }));
  const seen = new Set<string>();
  return [...assessments, ...EXTRA_STANDARD_FORMS].filter((o) => {
    if (seen.has(o.code)) return false;
    seen.add(o.code);
    return true;
  });
})();
