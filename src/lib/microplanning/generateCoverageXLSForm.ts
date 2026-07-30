// Coverage Reporting XLSForm generator.
//
// Produces an ODK / KoboToolbox-compatible .xlsx with `survey`, `choices`,
// and `settings` sheets for MDA/NTD Coverage submissions. Includes an admin
// cascade (State → LGA → Ward → FLHF → Community) inside a `community_repeat`
// group so field teams can capture multiple communities per FLHF in a single
// submission. The webhook `supabase/functions/kobo-webhook` routes matching
// `_xform_id_string` values into `public.microplan_coverage`.

import * as XLSX from "xlsx";
import { sanitize } from "./xlsformBuilder";

type Row = (string | number)[];

const SURVEY_HEADER = [
  "type", "name", "label", "hint", "required", "constraint",
  "constraint_message", "relevant", "calculation", "appearance", "default",
] as const;

const CHOICES_HEADER = ["list_name", "name", "label"] as const;
const SETTINGS_HEADER = ["form_title", "form_id", "version", "style"] as const;

const q = (r: Partial<Record<(typeof SURVEY_HEADER)[number], string>>): Row =>
  SURVEY_HEADER.map((h) => (r as any)[h] ?? "");

const ch = (list: string, name: string, label: string): Row =>
  [list, name, label];

export interface CoverageBuildOptions {
  projectName?: string | null;
  versionInt?: number | null;
}

export function buildCoverageXlsForm(options: CoverageBuildOptions = {}): XLSX.WorkBook {
  const { projectName, versionInt } = options;
  const stamp = (versionInt ?? Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""))).toString();
  const slug = sanitize(projectName || "coverage_reporting");
  const formId = `${slug}_coverage_${stamp}`;
  const title = projectName ? `${projectName} — MDA Coverage Reporting` : "MDA Coverage Reporting";

  const survey: Row[] = [SURVEY_HEADER as unknown as Row];
  survey.push(q({ type: "start", name: "start" }));
  survey.push(q({ type: "end", name: "end" }));
  survey.push(q({ type: "today", name: "today" }));
  survey.push(q({ type: "deviceid", name: "deviceid" }));
  survey.push(q({ type: "username", name: "username" }));

  survey.push(q({
    type: "note", name: "intro",
    label: `**${title}**\n\nRecord treatment coverage per community. Use the + button to add another community under the same FLHF.`,
  }));

  // Header cascade — captured once at the top of the form
  survey.push(q({ type: "begin_group", name: "admin", label: "1. Location", appearance: "field-list" }));
  survey.push(q({ type: "text", name: "state", label: "State", required: "yes" }));
  survey.push(q({ type: "text", name: "lga", label: "LGA", required: "yes" }));
  survey.push(q({ type: "text", name: "ward", label: "Ward", required: "yes" }));
  survey.push(q({ type: "text", name: "flhf_name", label: "FLHF (Health Facility)", required: "yes" }));
  survey.push(q({ type: "date", name: "reporting_date", label: "Reporting Date", required: "yes", default: "today()" }));
  survey.push(q({ type: "end_group", name: "admin_end" }));

  // Community repeat
  survey.push(q({ type: "begin_repeat", name: "community_repeat", label: "2. Community Coverage", appearance: "field-list" }));
  survey.push(q({ type: "text", name: "community_name", label: "Community Name", required: "yes" }));
  // NOTE: `target_population` intentionally removed from the pipeline — the
  // eligible/target denominator is derived from planning data on the dashboard.

  survey.push(q({ type: "integer", name: "total_treated", label: "Number Treated", required: "yes", constraint: ". >= 0" }));
  survey.push(q({ type: "integer", name: "total_vaccinated", label: "Number Vaccinated", constraint: ". >= 0" }));
  survey.push(q({ type: "integer", name: "doses_administered", label: "Doses Administered", constraint: ". >= 0" }));
  survey.push(q({ type: "integer", name: "refusals", label: "Refusals", constraint: ". >= 0" }));
  survey.push(q({ type: "integer", name: "missed_population", label: "Missed Population", constraint: ". >= 0" }));
  // Dual GPS — native geopoint first, manual decimal lat/long as fallback.
  survey.push(q({ type: "geopoint", name: "community_gps", label: "Community GPS" }));
  survey.push(q({
    type: "decimal", name: "manual_latitude", label: "Latitude (type manually if GPS unavailable)",
    constraint: ". >= -90 and . <= 90", constraint_message: "Latitude must be between -90 and 90.",
  }));
  survey.push(q({
    type: "decimal", name: "manual_longitude", label: "Longitude (type manually if GPS unavailable)",
    constraint: ". >= -180 and . <= 180", constraint_message: "Longitude must be between -180 and 180.",
  }));
  survey.push(q({
    type: "calculate", name: "latitude",
    calculation: "if(${community_gps} = '', ${manual_latitude}, selected-at(${community_gps}, 0))",
  }));
  survey.push(q({
    type: "calculate", name: "longitude",
    calculation: "if(${community_gps} = '', ${manual_longitude}, selected-at(${community_gps}, 1))",
  }));
  survey.push(q({ type: "text", name: "notes", label: "Notes / Observations" }));
  survey.push(q({ type: "end_repeat", name: "community_repeat_end" }));


  const choices: Row[] = [CHOICES_HEADER as unknown as Row];
  // Placeholder list to satisfy strict validators
  choices.push(ch("_placeholder", "n_a", "N/A"));

  const settings: Row[] = [
    SETTINGS_HEADER as unknown as Row,
    [title, formId, stamp, "theme-grid pages"],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(survey), "survey");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(choices), "choices");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(settings), "settings");
  return wb;
}

export function downloadCoverageXlsForm(options: CoverageBuildOptions = {}): string {
  const wb = buildCoverageXlsForm(options);
  const slug = sanitize(options.projectName || "coverage_reporting");
  const filename = `${slug}_coverage_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}
