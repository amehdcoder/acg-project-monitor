// Special Form Studio — XLSForm (.xlsx) export at full fidelity.
//
// Serializes a special form (sections + questions) into a valid ODK-standard
// XLSForm with survey / choices / settings sheets, preserving every field,
// type, required flag, skip logic (relevant), constraint, calculation,
// choice_filter, appearance and all choice options.

import * as XLSX from "xlsx";
import type { FormGroup, Question, QuestionType } from "@/components/FormBuilder/types";

const slug = (s: string) =>
  (s || "list").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "list";

function baseType(t: QuestionType, q: Question, listName: string): string {
  switch (t) {
    case "text": return "text";
    case "number": return q.number?.kind === "decimal" ? "decimal" : "integer";
    case "select_one": return `select_one ${listName}`;
    case "select_multiple": return `select_multiple ${listName}`;
    case "rank": return `rank ${listName}`;
    case "date": return "date";
    case "time": return "time";
    case "datetime": return "dateTime";
    case "geopoint": return "geopoint";
    case "geotrace": return "geotrace";
    case "geoshape": return "geoshape";
    case "image": return "image";
    case "signature": return "image";
    case "audio": return "audio";
    case "video": return "video";
    case "file": return "file";
    case "barcode": return "barcode";
    case "calculate": return "calculate";
    case "range": return "range";
    case "acknowledge": return "acknowledge";
    case "note": return "note";
    case "matrix": return "note";
    default: return "text";
  }
}

interface SurveyRow {
  type: string;
  name: string;
  label: string;
  hint?: string;
  required?: string;
  relevant?: string;
  constraint?: string;
  constraint_message?: string;
  calculation?: string;
  choice_filter?: string;
  appearance?: string;
  default?: string;
}

interface ChoiceRow {
  list_name: string;
  name: string;
  label: string;
}

export function buildXlsFormWorkbook(
  formName: string,
  sections: FormGroup[],
): XLSX.WorkBook {
  const survey: SurveyRow[] = [];
  const choices: ChoiceRow[] = [];
  const usedNames = new Set<string>();
  let auto = 0;

  const uniqueName = (raw?: string) => {
    let n = slug(raw || `q_${++auto}`);
    while (usedNames.has(n)) n = `${n}_${++auto}`;
    usedNames.add(n);
    return n;
  };

  for (const sec of sections) {
    const groupName = uniqueName(sec.name || sec.label || "group");
    survey.push({ type: "begin_group", name: groupName, label: sec.label || groupName });

    for (const q of sec.questions || []) {
      const qName = uniqueName(q.name || q.label);
      let listName = "";
      if (q.type === "select_one" || q.type === "select_multiple" || q.type === "rank") {
        listName = `${qName}_choices`;
        for (const o of q.options || []) {
          choices.push({ list_name: listName, name: o.value || slug(o.label), label: o.label });
        }
      }
      let appearance = q.appearance || "";
      if (q.type === "signature") appearance = appearance || "signature";

      survey.push({
        type: baseType(q.type, q, listName),
        name: qName,
        label: q.label || qName,
        hint: q.hint || "",
        required: q.required ? "yes" : "",
        relevant: q.relevant || "",
        constraint: q.constraint || "",
        constraint_message: q.constraintMessage || "",
        calculation: q.calculation || "",
        choice_filter: q.choiceFilter || "",
        appearance,
        default: q.defaultValue || "",
      });
    }

    survey.push({ type: "end_group", name: `${groupName}_end`, label: "" } as SurveyRow);
  }

  const surveyHeader = [
    "type", "name", "label", "hint", "required", "relevant",
    "constraint", "constraint_message", "calculation", "choice_filter",
    "appearance", "default",
  ];
  const surveySheet = XLSX.utils.json_to_sheet(survey, { header: surveyHeader });
  const choicesSheet = XLSX.utils.json_to_sheet(
    choices.length ? choices : [{ list_name: "", name: "", label: "" }],
    { header: ["list_name", "name", "label"] },
  );
  const settingsSheet = XLSX.utils.json_to_sheet(
    [{ form_title: formName, form_id: slug(formName), version: new Date().toISOString().slice(0, 10).replace(/-/g, "") }],
    { header: ["form_title", "form_id", "version"] },
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, surveySheet, "survey");
  XLSX.utils.book_append_sheet(wb, choicesSheet, "choices");
  XLSX.utils.book_append_sheet(wb, settingsSheet, "settings");
  return wb;
}

export function downloadXlsForm(formName: string, sections: FormGroup[]) {
  const wb = buildXlsFormWorkbook(formName, sections);
  const safe = slug(formName);
  XLSX.writeFile(wb, `${safe || "special-form"}.xlsx`);
}
