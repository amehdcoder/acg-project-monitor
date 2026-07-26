// Client-side XLSForm validator.
//
// Runs a rule-based check against a built XLSForm workbook to catch the most
// common issues KoboToolbox rejects at import time — BEFORE the admin uploads
// the file. Produces a structured report with errors, warnings and stats.

import * as XLSX from "xlsx";

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  sheet?: "survey" | "choices" | "settings";
  row?: number; // 1-indexed to match Excel row numbers
}

export interface ValidationStats {
  surveyRows: number;
  choicesRows: number;
  questions: number;
  groups: number;
  choiceLists: number;
  languages: string[];
  formTitle: string | null;
  formId: string | null;
  version: string | null;
}

export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: ValidationStats;
}

// XLSForm-recognised base types (Kobo-compatible subset).
const VALID_TYPES = new Set([
  "start", "end", "today", "deviceid", "username", "phonenumber", "phone_number",
  "simserial", "subscriberid", "audit",
  "begin_group", "end_group", "begin_repeat", "end_repeat",
  "text", "integer", "decimal", "range",
  "select_one", "select_multiple", "rank",
  "select_one_from_file", "select_multiple_from_file",
  "date", "time", "dateTime", "datetime",
  "geopoint", "geotrace", "geoshape",
  "image", "audio", "video", "file", "barcode",
  "calculate", "note", "acknowledge", "hidden",
]);

const RESERVED_NAMES = new Set([
  "name", "label", "type", "hint", "constraint", "relevant", "calculation",
]);

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const rowsFromSheet = (wb: XLSX.WorkBook, name: string): Record<string, string>[] => {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  return raw.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[k.trim()] = String(v ?? "").trim();
    return out;
  });
};

export function validateMicroplanningXlsForm(wb: XLSX.WorkBook): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const push = (list: ValidationIssue[], i: ValidationIssue) => list.push(i);

  const err = (code: string, message: string, extra: Partial<ValidationIssue> = {}) =>
    push(errors, { severity: "error", code, message, ...extra });
  const warn = (code: string, message: string, extra: Partial<ValidationIssue> = {}) =>
    push(warnings, { severity: "warning", code, message, ...extra });

  const requiredSheets = ["survey", "choices", "settings"];
  for (const s of requiredSheets) {
    if (!wb.Sheets[s]) err("missing_sheet", `Required sheet "${s}" is missing.`);
  }

  const survey = rowsFromSheet(wb, "survey");
  const choices = rowsFromSheet(wb, "choices");
  const settings = rowsFromSheet(wb, "settings");

  // ---- Settings ----
  const setRow = settings[0] ?? {};
  const formTitle = setRow.form_title || null;
  const formId = setRow.form_id || null;
  const version = setRow.version || null;
  if (!formTitle) err("settings_missing_title", "settings.form_title is required.", { sheet: "settings" });
  if (!formId) err("settings_missing_id", "settings.form_id is required.", { sheet: "settings" });
  else if (!NAME_RE.test(formId)) err("settings_invalid_id", `form_id "${formId}" must start with a letter/underscore and contain only letters, digits, underscores.`, { sheet: "settings" });
  if (!version) warn("settings_missing_version", "settings.version is empty — Kobo will auto-assign one.", { sheet: "settings" });

  // ---- Survey structure ----
  const seenNames = new Map<string, number>(); // name → first excel row
  const definedNames = new Set<string>();
  const groupStack: { name: string; row: number; kind: "group" | "repeat" }[] = [];
  let questions = 0;
  let groupCount = 0;

  const referencedChoiceLists = new Set<string>();

  survey.forEach((row, idx) => {
    const excelRow = idx + 2; // +1 for 1-index, +1 for header
    const type = (row.type || "").trim();
    const name = (row.name || "").trim();
    const label = (row.label || "").trim();
    if (!type) {
      err("survey_missing_type", `Row ${excelRow}: "type" is empty.`, { sheet: "survey", row: excelRow });
      return;
    }

    const [head, listName, ...rest] = type.split(/\s+/);
    if (rest.length > 0) {
      warn("survey_type_extra_tokens", `Row ${excelRow}: type "${type}" has unexpected trailing tokens.`, { sheet: "survey", row: excelRow });
    }
    if (!VALID_TYPES.has(head)) {
      err("survey_unknown_type", `Row ${excelRow}: unknown question type "${head}".`, { sheet: "survey", row: excelRow });
    }

    // Group / repeat balance
    if (head === "begin_group" || head === "begin_repeat") {
      groupStack.push({ name: name || `_g${idx}`, row: excelRow, kind: head === "begin_group" ? "group" : "repeat" });
      groupCount += 1;
    } else if (head === "end_group" || head === "end_repeat") {
      const open = groupStack.pop();
      const wantKind = head === "end_group" ? "group" : "repeat";
      if (!open) {
        err("survey_unbalanced_end", `Row ${excelRow}: "${head}" without a matching begin.`, { sheet: "survey", row: excelRow });
      } else if (open.kind !== wantKind) {
        err("survey_mismatched_group", `Row ${excelRow}: "${head}" doesn't match "${open.kind === "group" ? "begin_group" : "begin_repeat"}" on row ${open.row}.`, { sheet: "survey", row: excelRow });
      }
    }

    // Choice list references
    if (head === "select_one" || head === "select_multiple" || head === "rank") {
      if (!listName) err("survey_missing_choice_list", `Row ${excelRow}: "${head}" needs a choice list name (e.g. "${head} yes_no").`, { sheet: "survey", row: excelRow });
      else referencedChoiceLists.add(listName);
    }

    // Name checks (skip end_* which don't need unique names)
    if (name && !head.startsWith("end_")) {
      if (!NAME_RE.test(name)) {
        err("survey_invalid_name", `Row ${excelRow}: name "${name}" is invalid. Use letters, digits, underscores; start with letter or underscore.`, { sheet: "survey", row: excelRow });
      }
      if (RESERVED_NAMES.has(name.toLowerCase())) {
        warn("survey_reserved_name", `Row ${excelRow}: name "${name}" is a reserved XLSForm keyword.`, { sheet: "survey", row: excelRow });
      }
      if (seenNames.has(name)) {
        err("survey_duplicate_name", `Row ${excelRow}: name "${name}" is duplicated (first at row ${seenNames.get(name)}).`, { sheet: "survey", row: excelRow });
      } else {
        seenNames.set(name, excelRow);
        definedNames.add(name);
      }
    }

    // Labels for user-visible questions
    const needsLabel = !["calculate", "start", "end", "today", "deviceid", "username", "phonenumber",
      "phone_number", "simserial", "subscriberid", "audit", "hidden", "end_group", "end_repeat"].includes(head);
    if (needsLabel && !label) {
      warn("survey_missing_label", `Row ${excelRow}: "${head}" "${name}" has no label — collectors won't see any prompt.`, { sheet: "survey", row: excelRow });
    }

    if (head === "calculate" && !(row.calculation || "").trim()) {
      err("survey_calc_missing_expr", `Row ${excelRow}: calculate "${name}" has no calculation expression.`, { sheet: "survey", row: excelRow });
    }

    // required must be yes / no / true / false / empty
    if (row.required && !["yes", "no", "true", "false", "true()", "false()"].includes(row.required.toLowerCase())) {
      err("survey_invalid_required", `Row ${excelRow}: required must be "yes" or empty (got "${row.required}").`, { sheet: "survey", row: excelRow });
    }

    if (needsLabel && !head.startsWith("begin_") && !head.startsWith("end_")) questions += 1;
  });

  // Any unclosed groups?
  for (const open of groupStack) {
    err("survey_unclosed_group", `${open.kind === "group" ? "begin_group" : "begin_repeat"} "${open.name}" (row ${open.row}) was never closed.`, { sheet: "survey", row: open.row });
  }

  // ---- Cross-refs: choice_filter / relevant / constraint / calculation use ${name} → must exist ----
  const REF_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const scanRefs = (rowIdx: number, expr: string, field: string) => {
    if (!expr) return;
    for (const m of expr.matchAll(REF_RE)) {
      const ref = m[1];
      if (!definedNames.has(ref)) {
        warn("survey_unknown_reference", `Row ${rowIdx + 2}: ${field} references \${${ref}} which is not defined in the survey.`, { sheet: "survey", row: rowIdx + 2 });
      }
    }
  };
  survey.forEach((row, idx) => {
    scanRefs(idx, row.relevant || "", "relevant");
    scanRefs(idx, row.constraint || "", "constraint");
    scanRefs(idx, row.calculation || "", "calculation");
    scanRefs(idx, row.choice_filter || "", "choice_filter");
    scanRefs(idx, row.default || "", "default");
  });

  // ---- Choices sheet ----
  const listMembers = new Map<string, number>();
  const listDupCheck = new Map<string, Set<string>>();
  // Invalid XML 1.0 control chars (except \t \n \r) are rejected by PyXForm.
  const INVALID_XML_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
  choices.forEach((row, idx) => {
    const excelRow = idx + 2;
    const list = (row.list_name || "").trim();
    const name = (row.name || "").trim();
    const label = (row.label || "").trim();
    if (!list && !name && !label) return; // blank spacer row
    if (!list) err("choices_missing_list", `choices row ${excelRow}: list_name is empty.`, { sheet: "choices", row: excelRow });
    if (!name) err("choices_missing_name", `choices row ${excelRow}: name is empty.`, { sheet: "choices", row: excelRow });
    else if (!NAME_RE.test(name) && !/^__[a-z0-9_]+__$/i.test(name)) {
      warn("choices_invalid_name", `choices row ${excelRow}: name "${name}" is unusual — Kobo prefers letters/digits/underscores.`, { sheet: "choices", row: excelRow });
    }
    if (name && INVALID_XML_RE.test(name)) {
      err("choices_invalid_xml_char", `choices row ${excelRow}: name "${name}" contains an invalid XML control character.`, { sheet: "choices", row: excelRow });
    }
    if (label && INVALID_XML_RE.test(label)) {
      err("choices_invalid_xml_char_label", `choices row ${excelRow}: label contains an invalid XML control character.`, { sheet: "choices", row: excelRow });
    }
    if (!label) warn("choices_missing_label", `choices row ${excelRow}: label is empty.`, { sheet: "choices", row: excelRow });
    if (list) {
      listMembers.set(list, (listMembers.get(list) ?? 0) + 1);
      let set = listDupCheck.get(list);
      if (!set) { set = new Set(); listDupCheck.set(list, set); }
      if (name && set.has(name)) {
        err("choices_duplicate", `choices row ${excelRow}: (list_name="${list}", name="${name}") is duplicated.`, { sheet: "choices", row: excelRow });
      } else if (name) set.add(name);
    }
  });

  // Every referenced list must have at least one option.
  for (const list of referencedChoiceLists) {
    if (!listMembers.has(list)) {
      err("choices_list_missing", `Survey references choice list "${list}" but the choices sheet has no rows for it.`);
    } else if ((listMembers.get(list) ?? 0) < 1) {
      warn("choices_list_empty", `Choice list "${list}" has no options.`);
    }
  }

  // Warn about lists defined but not referenced.
  for (const list of listMembers.keys()) {
    if (!referencedChoiceLists.has(list)) {
      warn("choices_list_unused", `Choice list "${list}" is defined but never referenced in survey.`);
    }
  }

  const languages = Array.from(
    new Set(
      Object.keys(wb.Sheets["survey"] ?? {})
        .filter((k) => k.startsWith("label::"))
        .map((k) => k.replace(/^label::/, "")),
    ),
  );

  const stats: ValidationStats = {
    surveyRows: survey.length,
    choicesRows: choices.length,
    questions,
    groups: groupCount,
    choiceLists: listMembers.size,
    languages,
    formTitle,
    formId,
    version,
  };

  return { ok: errors.length === 0, errors, warnings, stats };
}
