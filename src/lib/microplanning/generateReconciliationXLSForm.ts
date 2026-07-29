// Medicine & Supply Reconciliation XLSForm generator.
//
// Produces a KoboToolbox-compatible .xlsx workbook for end-of-round drug
// reconciliation. The webhook `supabase/functions/kobo-webhook` routes
// matching `_xform_id_string` values into `public.microplan_reconciliation`.

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

const MEDICINES = [
  ["ivermectin", "Ivermectin"],
  ["albendazole", "Albendazole"],
  ["mectizan", "Mectizan"],
  ["praziquantel", "Praziquantel"],
  ["azithromycin", "Azithromycin"],
  ["vitamin_a", "Vitamin A"],
  ["other", "Other (specify)"],
];

export interface ReconBuildOptions {
  projectName?: string | null;
  versionInt?: number | null;
}

export function buildReconciliationXlsForm(options: ReconBuildOptions = {}): XLSX.WorkBook {
  const { projectName, versionInt } = options;
  const stamp = (versionInt ?? Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""))).toString();
  const slug = sanitize(projectName || "medicine_reconciliation");
  const formId = `${slug}_reconciliation_${stamp}`;
  const title = projectName ? `${projectName} — Medicine Reconciliation` : "Medicine & Supply Reconciliation";

  const survey: Row[] = [SURVEY_HEADER as unknown as Row];
  survey.push(q({ type: "start", name: "start" }));
  survey.push(q({ type: "end", name: "end" }));
  survey.push(q({ type: "today", name: "today" }));
  survey.push(q({ type: "deviceid", name: "deviceid" }));
  survey.push(q({ type: "username", name: "username" }));

  survey.push(q({
    type: "note", name: "intro",
    label: `<b>${title}</b><br/>Reconcile medicines received vs. administered at end of round.`,
  }));

  survey.push(q({ type: "begin_group", name: "admin", label: "1. Facility", appearance: "field-list" }));
  survey.push(q({ type: "text", name: "state", label: "State", required: "yes" }));
  survey.push(q({ type: "text", name: "lga", label: "LGA", required: "yes" }));
  survey.push(q({ type: "text", name: "ward", label: "Ward", required: "yes" }));
  survey.push(q({ type: "text", name: "flhf_name", label: "FLHF (Health Facility)", required: "yes" }));
  survey.push(q({ type: "date", name: "reporting_date", label: "Reporting Date", required: "yes", default: "today()" }));
  survey.push(q({ type: "end_group", name: "admin_end" }));

  survey.push(q({ type: "begin_repeat", name: "medicine_repeat", label: "2. Medicines", appearance: "field-list" }));
  survey.push(q({ type: "select_one medicine_type", name: "medicine_name", label: "Medicine / Drug", required: "yes", appearance: "minimal" }));
  survey.push(q({ type: "text", name: "medicine_other", label: "Specify Medicine", relevant: "${medicine_name} = 'other'", required: "yes" }));
  survey.push(q({ type: "decimal", name: "received_quantity", label: "Received Quantity", required: "yes", constraint: ". >= 0" }));
  survey.push(q({ type: "decimal", name: "administered_quantity", label: "Administered Quantity", required: "yes", constraint: ". >= 0" }));
  survey.push(q({ type: "decimal", name: "wasted_quantity", label: "Wasted / Damaged Quantity", constraint: ". >= 0", default: "0" }));
  survey.push(q({ type: "decimal", name: "returned_quantity", label: "Unopened Returned Quantity", constraint: ". >= 0", default: "0" }));
  survey.push(q({ type: "text", name: "discrepancy_notes", label: "Discrepancy Notes", appearance: "multiline" }));
  survey.push(q({ type: "end_repeat", name: "medicine_repeat_end" }));

  const choices: Row[] = [CHOICES_HEADER as unknown as Row];
  MEDICINES.forEach(([n, l]) => choices.push(["medicine_type", n, l]));

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

export function downloadReconciliationXlsForm(options: ReconBuildOptions = {}): string {
  const wb = buildReconciliationXlsForm(options);
  const slug = sanitize(options.projectName || "medicine_reconciliation");
  const filename = `${slug}_reconciliation_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}
