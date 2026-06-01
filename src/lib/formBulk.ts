// Bulk data utilities for forms: export an Excel template that matches a form's
// data structure, and import a populated template back into form_submissions.
//
// Mapping strategy:
//   - Each answerable question becomes a column. The visible header is the
//     question label; on import we map columns back to questions by matching
//     the normalized label (falling back to the question name).
//   - Submission `data` is keyed by question.id (matching the FormFiller).
//   - Choice answers accept either the option label or the stored value.

import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import type { Question, FormGroup } from "@/components/FormBuilder/types";

export interface BulkForm {
  id: string;
  name: string;
  questions?: Question[];
  groups?: FormGroup[];
}

// Question types that hold no answer / can't be filled via spreadsheet.
const NON_DATA_TYPES = new Set<string>([
  "note", "image", "audio", "video", "file", "signature", "geotrace", "geoshape",
]);

export const flattenQuestions = (form: BulkForm): Question[] => {
  const out: Question[] = [];
  (form.questions ?? []).forEach((q) => out.push(q));
  (form.groups ?? []).forEach((g) => (g.questions ?? []).forEach((q) => out.push(q)));
  // Keep only answerable, de-duplicated by id.
  const seen = new Set<string>();
  return out.filter((q) => {
    if (!q || seen.has(q.id) || NON_DATA_TYPES.has(q.type)) return false;
    seen.add(q.id);
    return true;
  });
};

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const typeHint = (q: Question): string => {
  switch (q.type) {
    case "select_one": return "Choose one option";
    case "select_multiple": return "One or more options, comma-separated";
    case "number":
    case "range":
    case "calculate": return "Number";
    case "date": return "Date (YYYY-MM-DD)";
    case "datetime": return "Date & time (YYYY-MM-DD HH:mm)";
    case "time": return "Time (HH:mm)";
    case "geopoint": return "lat,lng";
    default: return "Text";
  }
};

const optionsText = (q: Question): string =>
  (q.options ?? []).map((o) => o.label).join(", ");

/** Build and download an .xlsx template for the given form. */
export async function exportFormTemplate(form: BulkForm): Promise<number> {
  const questions = flattenQuestions(form);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.created = new Date();

  // ---- Data sheet ----
  const ws = wb.addWorksheet("Submissions", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = questions.map((q) => ({
    header: q.label || q.name || q.id,
    key: q.id,
    width: Math.min(Math.max((q.label || q.id).length + 4, 16), 42),
  }));

  // Style header row.
  const header = ws.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F7E4F" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF0A5C39" } } };
  });

  // Dropdown data-validation for select_one columns (skip when option list too long).
  questions.forEach((q, idx) => {
    if (q.type === "select_one" && (q.options?.length ?? 0) > 0) {
      const list = q.options!.map((o) => o.label).join(",");
      if (list.length <= 250) {
        const colLetter = ws.getColumn(idx + 1).letter;
        for (let r = 2; r <= 500; r++) {
          ws.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: !q.required, formulae: [`"${list}"`],
          };
        }
      }
    }
  });

  // ---- Instructions sheet ----
  const help = wb.addWorksheet("Instructions");
  help.columns = [
    { header: "Field", key: "field", width: 40 },
    { header: "Required", key: "req", width: 12 },
    { header: "Format / Allowed values", key: "fmt", width: 70 },
  ];
  const helpHeader = help.getRow(1);
  helpHeader.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F7E4F" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  help.addRow({ field: `Form: ${form.name}`, req: "", fmt: "Fill one row per submission on the “Submissions” sheet. Do not rename column headers." });
  help.addRow({ field: "", req: "", fmt: "" });
  questions.forEach((q) => {
    help.addRow({
      field: q.label || q.name || q.id,
      req: q.required ? "Yes" : "No",
      fmt: q.options?.length ? `${typeHint(q)} — ${optionsText(q)}` : typeHint(q),
    });
  });
  help.eachRow((row, n) => { if (n > 1) row.getCell(1).font = { bold: true }; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${form.name.replace(/[^\w]+/g, "_")}_bulk_template.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return questions.length;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

const coerceValue = (q: Question, raw: any): any => {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const str = typeof raw === "object" && raw?.text ? String(raw.text) : String(raw).trim();
  if (str === "") return undefined;

  if (q.type === "number" || q.type === "range" || q.type === "calculate") {
    const n = Number(str.replace(/,/g, ""));
    return Number.isFinite(n) ? n : str;
  }
  if (q.type === "select_one") {
    const m = (q.options ?? []).find((o) => norm(o.label) === norm(str) || norm(o.value) === norm(str));
    return m ? m.value : str;
  }
  if (q.type === "select_multiple") {
    return str.split(/[,;]/).map((part) => {
      const t = part.trim();
      const m = (q.options ?? []).find((o) => norm(o.label) === norm(t) || norm(o.value) === norm(t));
      return m ? m.value : t;
    }).filter(Boolean);
  }
  if (q.type === "date" || q.type === "datetime") {
    if (raw instanceof Date) {
      return q.type === "date"
        ? raw.toISOString().slice(0, 10)
        : raw.toISOString().slice(0, 16);
    }
    return str;
  }
  return str;
};

/** Parse a populated template and insert rows into form_submissions. */
export async function importFormSubmissions(
  file: File,
  form: BulkForm,
  userId: string,
): Promise<ImportResult> {
  const questions = flattenQuestions(form);
  const byLabel = new Map<string, Question>();
  questions.forEach((q) => {
    byLabel.set(norm(q.label || ""), q);
    if (q.name) byLabel.set(norm(q.name), q);
    byLabel.set(norm(q.id), q);
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("Submissions") ?? wb.worksheets[0];
  if (!ws) return { inserted: 0, skipped: 0, errors: ["No worksheet found in the file."] };

  // Map column index -> question from the header row.
  const colMap = new Map<number, Question>();
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const q = byLabel.get(norm(String(cell.value ?? "")));
    if (q) colMap.set(colNumber, q);
  });
  if (colMap.size === 0) {
    return { inserted: 0, skipped: 0, errors: ["No columns matched this form's fields. Use the exported template."] };
  }

  const rows: { user_id: string; form_id: string; data: Record<string, any>; status: string; submission_type: string; submitted_at: string }[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const data: Record<string, any> = {};
    let hasValue = false;
    colMap.forEach((q, colNumber) => {
      const v = coerceValue(q, row.getCell(colNumber).value);
      if (v !== undefined && !(Array.isArray(v) && v.length === 0)) {
        data[q.id] = v;
        hasValue = true;
      }
    });
    if (!hasValue) { skipped++; continue; }

    // Validate required fields.
    const missing = questions
      .filter((q) => q.required && (data[q.id] === undefined || data[q.id] === ""))
      .map((q) => q.label || q.id);
    if (missing.length) {
      errors.push(`Row ${r}: missing required field(s) — ${missing.join(", ")}`);
      continue;
    }

    rows.push({
      user_id: userId,
      form_id: form.id,
      data,
      status: "sent",
      submission_type: "regular",
      submitted_at: new Date().toISOString(),
    });
  }

  let inserted = 0;
  // Insert in chunks to stay within payload limits.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from("form_submissions").insert(chunk as any);
    if (error) { errors.push(error.message); break; }
    inserted += chunk.length;
  }

  return { inserted, skipped, errors };
}
