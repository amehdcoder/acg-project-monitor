// ─────────────────────────────────────────────────────────────────────────
// Insights → beautiful, colourful Excel export
// ---------------------------------------------------------------------------
// Builds a professionally formatted .xlsx for a single "action list" surfaced
// by the Narrative Insights engine. Crucially, the columns are derived ONLY
// from the dashboard's OWN form questions (plus resolved location fields), so a
// download can never leak columns from a different form. Rows are the ACTUAL
// flagged submissions.
// ─────────────────────────────────────────────────────────────────────────
import ExcelJS from "exceljs";
import type {
  NarrativeActionList, NarrativeSubmission, NarrativeQuestion,
} from "@/lib/narrativeInsights";

const stripTags = (s: any) => String(s ?? "").replace(/<[^>]*>/g, "").trim();
const pretty = (s: string) =>
  String(s).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (l) => l.toUpperCase());

interface FlatQ { id: string; label: string; q: NarrativeQuestion }
function flatten(questions: NarrativeQuestion[]): FlatQ[] {
  const out: FlatQ[] = [];
  const walk = (list?: NarrativeQuestion[]) => {
    for (const q of list || []) {
      if (Array.isArray(q?.questions) && q.questions.length) walk(q.questions);
      else if (q?.id && q.type) out.push({ id: q.id, label: stripTags(q.label || q.name || pretty(q.id)), q });
    }
  };
  walk(questions);
  return out;
}

function displayValue(q: NarrativeQuestion, raw: any): string {
  if (raw === undefined || raw === null || raw === "") return "";
  const labelFor = (val: string) =>
    stripTags(q.options?.find((o) => String(o.value) === String(val) || o.label === val)?.label) || pretty(stripTags(val));
  if (Array.isArray(raw)) return raw.map((v) => labelFor(String(v))).join(", ");
  if (typeof raw === "object") { try { return JSON.stringify(raw); } catch { return String(raw); } }
  const s = String(raw);
  if (q.type === "select_multiple" && s.includes(" ")) return s.split(/\s+/).map(labelFor).join(", ");
  return labelFor(s);
}

const GEO = {
  community: /communit|settlement|village|hamlet/i,
  ward: /(^|_)ward(_|$)|ward[\s_-]*name/i,
  lga: /(^|_)lga(_|$)|local[\s_-]*government/i,
  state: /(^|_)state(_|$)/i,
};
const geoVal = (s: NarrativeSubmission, re: RegExp): string => {
  const d = s.data || {};
  for (const [k, v] of Object.entries(d)) {
    if (re.test(k) && v !== null && v !== undefined && v !== "") {
      return stripTags(Array.isArray(v) ? v.join(", ") : v);
    }
  }
  return "";
};

export interface InsightsExcelMeta {
  formName?: string;
  projectName?: string;
  accentHex?: string; // e.g. "#0EA5A5"
}

/**
 * Download `list` as a styled Excel workbook using the ACTUAL submissions and
 * form questions. Falls back to the pre-built list rows only if no submission
 * ids are available.
 */
export async function exportActionListExcel(
  list: NarrativeActionList,
  submissions: NarrativeSubmission[],
  questions: NarrativeQuestion[],
  meta: InsightsExcelMeta = {},
): Promise<void> {
  const accent = (meta.accentHex || "#0EA5A5").replace("#", "").toUpperCase();
  const flat = flatten(questions);
  const flagged = list.flaggedQuestionId;

  // Restrict to exactly the flagged submissions (guarantees no cross-form leak).
  const idSet = new Set(list.submissionIds || []);
  const subs = idSet.size
    ? submissions.filter((s) => idSet.has(s.id))
    : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.created = new Date();
  const ws = wb.addWorksheet(list.title.slice(0, 28) || "Issues", {
    views: [{ state: "frozen", ySplit: 4 }],
    properties: { defaultRowHeight: 18 },
  });

  // ── Column plan: index → location → flagged question → other questions → meta
  const orderedQ = [
    ...flat.filter((f) => f.id === flagged),
    ...flat.filter((f) => f.id !== flagged),
  ];
  const headers: string[] = [
    "#", "State", "LGA", "Ward", "Community",
    ...orderedQ.map((f) => (f.id === flagged ? `⚑ ${f.label}` : f.label)),
    "Submitted By", "Date",
  ];

  // ── Title band ──
  const lastColLetter = ws.getColumn(headers.length).letter;
  ws.mergeCells(`A1:${lastColLetter}1`);
  const t1 = ws.getCell("A1");
  t1.value = list.title;
  t1.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  t1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${accent}` } };
  ws.getRow(1).height = 26;

  ws.mergeCells(`A2:${lastColLetter}2`);
  const t2 = ws.getCell("A2");
  t2.value = [meta.projectName, meta.formName].filter(Boolean).join("  •  ") || "Program monitoring";
  t2.font = { size: 10, color: { argb: "FF334155" } };
  t2.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  ws.mergeCells(`A3:${lastColLetter}3`);
  const t3 = ws.getCell("A3");
  t3.value = `${list.description}   —   ${subs.length || (list.rows?.length ?? 0)} record(s)   •   Generated ${new Date().toLocaleString("en-GB")}`;
  t3.font = { size: 9, italic: true, color: { argb: "FF64748B" } };
  t3.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  // ── Header row (row 4) ──
  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: h.startsWith("⚑") ? "FFB91C1C" : "FF0C2340" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: `FF${accent}` } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
  headerRow.height = 30;

  // ── Data rows ──
  const rowsSource: (string | number)[][] = subs.length
    ? subs.map((s, idx) => [
        idx + 1,
        geoVal(s, GEO.state) || stripTags(s.data?.state) || "—",
        stripTags(s.lga) || geoVal(s, GEO.lga) || "—",
        stripTags(s.ward) || geoVal(s, GEO.ward) || "—",
        geoVal(s, GEO.community) || "—",
        ...orderedQ.map((f) => displayValue(f.q, s.data?.[f.id]) || "—"),
        stripTags(s.submitter_name) || "—",
        s.submitted_at ? new Date(s.submitted_at).toLocaleDateString("en-GB") : "—",
      ])
    : (list.rows || []).map((r, idx) => [
        idx + 1,
        String(r.state ?? "—"), String(r.lga ?? "—"), String(r.ward ?? "—"),
        String(r.community ?? "—"),
        ...orderedQ.map(() => "—"),
        String(r.submitter ?? "—"), String(r.date ?? "—"),
      ]);

  rowsSource.forEach((r, i) => {
    const row = ws.addRow(r);
    const zebra = i % 2 === 1;
    row.eachCell((cell, col) => {
      cell.font = { size: 9.5, color: { argb: "FF1E293B" } };
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "center" : "left", wrapText: true };
      cell.fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: col === 6 ? "FFFFF7ED" : zebra ? "FFF1F5F9" : "FFFFFFFF" },
      };
      cell.border = {
        top: { style: "hair", color: { argb: "FFE2E8F0" } },
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
        left: { style: "hair", color: { argb: "FFE2E8F0" } },
        right: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
    });
    // Highlight the flagged answer cell (column 6, first question column).
    const flagCell = row.getCell(6);
    flagCell.font = { size: 9.5, bold: true, color: { argb: "FF9A3412" } };
  });

  // ── Column widths ──
  const widths = [5, 14, 16, 16, 20, ...orderedQ.map((f, i) => (i === 0 ? 26 : Math.min(34, Math.max(14, f.label.length + 4)))), 18, 12];
  ws.columns.forEach((c, i) => { c.width = widths[i] || 16; });

  // AutoFilter over header + data.
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const fname = `${(list.title || "issues").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}.xlsx`;
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
