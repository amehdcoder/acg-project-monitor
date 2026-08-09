// Medicine & Supply Reconciliation XLSForm generator.
//
// Produces a KoboToolbox-compatible .xlsx workbook for end-of-round drug
// reconciliation. The workbook is generated LIVE from the project's
// microplanning records, so the State → LGA → Ward → FLHF → Community cascade
// (and the medicine quantity allocated to each community/settlement) always
// mirrors what is currently in the Reconciliation tab.
//
// Enumerators see the planned allocation pre-filled. They may override it, but
// only with a mandatory reason — both values plus the reason are submitted so
// the dashboard can place them side by side.
//
// The webhook `supabase/functions/kobo-webhook` routes matching
// `_xform_id_string` values into `public.microplan_reconciliation`.

import * as XLSX from "xlsx";
import { sanitize } from "./xlsformBuilder";

type Row = (string | number)[];

const SURVEY_HEADER = [
  "type", "name", "label", "hint", "required", "constraint",
  "constraint_message", "relevant", "calculation", "appearance", "default",
  "choice_filter", "read_only",
] as const;

const CHOICES_HEADER = [
  "list_name", "name", "label",
  "state", "lga", "ward", "flhf",
  "settlement", "allocated", "entry_id",
] as const;

const SETTINGS_HEADER = ["form_title", "form_id", "version", "style"] as const;

const q = (r: Partial<Record<(typeof SURVEY_HEADER)[number], string>>): Row =>
  SURVEY_HEADER.map((h) => (r as any)[h] ?? "");

const c = (r: Partial<Record<(typeof CHOICES_HEADER)[number], string | number>>): Row =>
  CHOICES_HEADER.map((h) => (r as any)[h] ?? "");

const MEDICINES = [
  ["ivermectin", "Ivermectin"],
  ["albendazole", "Albendazole"],
  ["mectizan", "Mectizan"],
  ["praziquantel", "Praziquantel"],
  ["azithromycin", "Azithromycin"],
  ["vitamin_a", "Vitamin A"],
  ["other", "Other (specify)"],
];

/** One planned community/settlement allocation coming from the microplan. */
export interface ReconAllocationRow {
  entryId: string;
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  community: string;
  settlement?: string | null;
  medicineRequired: number;
}

export interface ReconBuildOptions {
  projectName?: string | null;
  versionInt?: number | null;
  /** Live microplan allocations used to build the geography cascade. */
  allocations?: ReconAllocationRow[];
}

/** Stable, unique, XLSForm-safe code generator scoped to a choice list. */
function coder(prefix: string) {
  const seen = new Map<string, string>();
  return (label: string, scope = "") => {
    const key = `${scope}::${label}`;
    const existing = seen.get(key);
    if (existing) return existing;
    const base = sanitize(label) || prefix;
    let code = `${base}`.slice(0, 40);
    let n = 1;
    const taken = new Set(seen.values());
    while (taken.has(code)) code = `${base.slice(0, 36)}_${++n}`;
    seen.set(key, code);
    return code;
  };
}

interface CascadeSheets {
  choices: Row[];
  hasCascade: boolean;
}

function buildCascadeChoices(allocations: ReconAllocationRow[]): CascadeSheets {
  const choices: Row[] = [];
  if (!allocations.length) return { choices, hasCascade: false };

  const stateCode = coder("st");
  const lgaCode = coder("lga");
  const wardCode = coder("ward");
  const flhfCode = coder("flhf");
  const commCode = coder("comm");

  const states = new Map<string, string>();
  const lgas = new Map<string, Row>();
  const wards = new Map<string, Row>();
  const flhfs = new Map<string, Row>();
  const comms = new Map<string, Row>();

  for (const a of allocations) {
    const state = (a.state || "Unknown").trim();
    const lga = (a.lga || "Unknown").trim();
    const ward = (a.ward || "Unknown").trim();
    const flhf = (a.flhf || "Unknown").trim();
    const community = (a.community || "Unknown").trim();

    const sc = stateCode(state);
    const lc = lgaCode(lga, state);
    const wc = wardCode(ward, `${state}|${lga}`);
    const fc = flhfCode(flhf, `${state}|${lga}|${ward}`);
    const cc = commCode(`${community}${a.settlement ? ` (${a.settlement})` : ""}`, `${state}|${lga}|${ward}|${flhf}`);

    if (!states.has(sc)) states.set(sc, sc);
    if (!lgas.has(`${sc}|${lc}`)) lgas.set(`${sc}|${lc}`, c({ list_name: "recon_lga", name: lc, label: lga, state: sc }));
    if (!wards.has(`${sc}|${lc}|${wc}`)) wards.set(`${sc}|${lc}|${wc}`, c({ list_name: "recon_ward", name: wc, label: ward, state: sc, lga: lc }));
    if (!flhfs.has(`${sc}|${lc}|${wc}|${fc}`)) flhfs.set(`${sc}|${lc}|${wc}|${fc}`, c({ list_name: "recon_flhf", name: fc, label: flhf, state: sc, lga: lc, ward: wc }));
    if (!comms.has(cc)) {
      comms.set(cc, c({
        list_name: "recon_community", name: cc,
        label: a.settlement ? `${community} — ${a.settlement}` : community,
        state: sc, lga: lc, ward: wc, flhf: fc,
        settlement: a.settlement ?? "",
        allocated: Number.isFinite(a.medicineRequired) ? a.medicineRequired : 0,
        entry_id: a.entryId,
      }));
    }
  }

  // Emit state rows in first-seen order using original labels.
  const stateLabels = new Map<string, string>();
  for (const a of allocations) {
    const state = (a.state || "Unknown").trim();
    stateLabels.set(stateCode(state), state);
  }
  for (const [code, label] of stateLabels) {
    choices.push(c({ list_name: "recon_state", name: code, label }));
  }
  choices.push(...lgas.values(), ...wards.values(), ...flhfs.values(), ...comms.values());
  return { choices, hasCascade: true };
}

export function buildReconciliationXlsForm(options: ReconBuildOptions = {}): XLSX.WorkBook {
  const { projectName, versionInt, allocations = [] } = options;
  const stamp = (versionInt ?? Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""))).toString();
  const slug = sanitize(projectName || "medicine_reconciliation");
  const formId = `${slug}_reconciliation_${stamp}`;
  const title = projectName ? `${projectName} — Medicine Reconciliation` : "Medicine & Supply Reconciliation";

  const { choices: cascadeChoices, hasCascade } = buildCascadeChoices(allocations);

  const survey: Row[] = [SURVEY_HEADER as unknown as Row];
  survey.push(q({ type: "start", name: "start" }));
  survey.push(q({ type: "end", name: "end" }));
  survey.push(q({ type: "today", name: "today" }));
  survey.push(q({ type: "deviceid", name: "deviceid" }));
  survey.push(q({ type: "username", name: "username" }));

  survey.push(q({
    type: "note", name: "intro",
    label: `**${title}**\n\nReconcile medicines received vs. administered at end of round.`,
  }));

  survey.push(q({ type: "begin_group", name: "admin", label: "1. Location", appearance: "field-list" }));

  if (hasCascade) {
    survey.push(q({ type: "select_one recon_state", name: "state", label: "State", required: "yes", appearance: "minimal" }));
    survey.push(q({ type: "select_one recon_lga", name: "lga", label: "LGA", required: "yes", appearance: "minimal", choice_filter: "state=${state}" }));
    survey.push(q({ type: "select_one recon_ward", name: "ward", label: "Ward", required: "yes", appearance: "minimal", choice_filter: "state=${state} and lga=${lga}" }));
    survey.push(q({ type: "select_one recon_flhf", name: "flhf_name", label: "FLHF (Health Facility)", required: "yes", appearance: "minimal", choice_filter: "state=${state} and lga=${lga} and ward=${ward}" }));
    survey.push(q({
      type: "select_one recon_community", name: "community_name", label: "Community / Settlement", required: "yes",
      appearance: "minimal search",
      choice_filter: "state=${state} and lga=${lga} and ward=${ward} and flhf=${flhf_name}",
    }));
    survey.push(q({
      type: "calculate", name: "settlement_name",
      calculation: "instance('recon_community')/root/item[name=${community_name}]/settlement",
    }));
    survey.push(q({
      type: "calculate", name: "microplan_entry_id",
      calculation: "instance('recon_community')/root/item[name=${community_name}]/entry_id",
    }));
    survey.push(q({
      type: "calculate", name: "allocated_quantity",
      calculation: "instance('recon_community')/root/item[name=${community_name}]/allocated",
    }));
    survey.push(q({
      type: "note", name: "allocated_note",
      label: "**Planned allocation for this community:** ${allocated_quantity} unit(s)",
      relevant: "${community_name} != ''",
    }));
  } else {
    survey.push(q({ type: "text", name: "state", label: "State", required: "yes" }));
    survey.push(q({ type: "text", name: "lga", label: "LGA", required: "yes" }));
    survey.push(q({ type: "text", name: "ward", label: "Ward", required: "yes" }));
    survey.push(q({ type: "text", name: "flhf_name", label: "FLHF (Health Facility)", required: "yes" }));
    survey.push(q({ type: "text", name: "community_name", label: "Community", required: "yes" }));
    survey.push(q({ type: "text", name: "settlement_name", label: "Settlement" }));
    survey.push(q({ type: "decimal", name: "allocated_quantity", label: "Planned Allocated Quantity", constraint: ". >= 0" }));
  }

  survey.push(q({ type: "date", name: "reporting_date", label: "Reporting Date", required: "yes", default: "today()" }));
  survey.push(q({ type: "end_group", name: "admin_end" }));

  // --- Allocation override -------------------------------------------------
  survey.push(q({ type: "begin_group", name: "allocation_override", label: "2. Allocation Verification", appearance: "field-list" }));
  survey.push(q({
    type: "select_one yes_no", name: "allocation_overridden",
    label: "Was a quantity different from the planned allocation actually allocated?",
    required: "yes", appearance: "minimal",
  }));
  survey.push(q({
    type: "decimal", name: "override_quantity", label: "Actual Quantity Allocated",
    relevant: "${allocation_overridden} = 'yes'", required: "yes",
    constraint: ". >= 0", constraint_message: "Quantity cannot be negative.",
  }));
  survey.push(q({
    type: "text", name: "override_reason",
    label: "Reason for the different quantity",
    hint: "Mandatory — explain why another quantity was allocated to this community/settlement.",
    relevant: "${allocation_overridden} = 'yes'", required: "yes",
    constraint: "string-length(.) >= 5", constraint_message: "Please give a clear reason (at least 5 characters).",
    appearance: "multiline",
  }));
  survey.push(q({
    type: "calculate", name: "effective_allocation",
    calculation: "if(${allocation_overridden} = 'yes', ${override_quantity}, ${allocated_quantity})",
  }));
  survey.push(q({ type: "end_group", name: "allocation_override_end" }));

  survey.push(q({ type: "begin_repeat", name: "medicine_repeat", label: "3. Medicines", appearance: "field-list" }));
  survey.push(q({ type: "select_one medicine_type", name: "medicine_name", label: "Medicine / Drug", required: "yes", appearance: "minimal" }));
  survey.push(q({ type: "text", name: "medicine_other", label: "Specify Medicine", relevant: "${medicine_name} = 'other'", required: "yes" }));
  survey.push(q({ type: "decimal", name: "received_quantity", label: "Received Quantity", required: "yes", constraint: ". >= 0" }));
  survey.push(q({ type: "decimal", name: "administered_quantity", label: "Administered Quantity", required: "yes", constraint: ". >= 0" }));
  survey.push(q({ type: "decimal", name: "wasted_quantity", label: "Wasted / Damaged Quantity", constraint: ". >= 0", default: "0" }));
  survey.push(q({ type: "decimal", name: "returned_quantity", label: "Unopened Returned Quantity", constraint: ". >= 0", default: "0" }));
  survey.push(q({ type: "text", name: "discrepancy_notes", label: "Discrepancy Notes", appearance: "multiline" }));
  survey.push(q({ type: "end_repeat", name: "medicine_repeat_end" }));

  const choices: Row[] = [CHOICES_HEADER as unknown as Row];
  MEDICINES.forEach(([n, l]) => choices.push(c({ list_name: "medicine_type", name: n, label: l })));
  choices.push(c({ list_name: "yes_no", name: "yes", label: "Yes" }));
  choices.push(c({ list_name: "yes_no", name: "no", label: "No" }));
  choices.push(...cascadeChoices);

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
