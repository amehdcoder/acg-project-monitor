/**
 * MDA analyses / drill-down CSV export
 * ────────────────────────────────────────────────────────────────────────
 * Flattens checklist submissions (respecting whatever filtered subset is
 * passed in) into a tidy CSV with one column per checklist question, resolving
 * option values to their human labels. Used by both the analyses header export
 * and the drill-down sheet export, so the exported rows always match exactly
 * what the user is currently looking at (project / LGA / date range / drill
 * filters).
 */

interface CsvOption { id?: string; label?: string; value?: string }
interface CsvQuestion {
  id: string; name?: string; label?: string; type?: string;
  options?: CsvOption[]; questions?: CsvQuestion[];
}
export interface CsvRow {
  id: string;
  state?: string | null; lga?: string | null; ward?: string | null;
  submitter?: string | null; submittedAt?: string | null; status?: string | null;
  data?: Record<string, any>;
}

const stripTags = (s?: any) => String(s ?? "").replace(/<[^>]*>/g, "").trim();

interface FlatQ { key: string; label: string; q: CsvQuestion }
function flatten(questions: CsvQuestion[]): FlatQ[] {
  const out: FlatQ[] = [];
  const walk = (qs?: CsvQuestion[]) => {
    for (const item of qs || []) {
      const isGroup = Array.isArray(item.questions) && !item.type;
      if (isGroup) walk(item.questions);
      else if (item.type) {
        const key = item.name || item.id;
        out.push({ key, label: stripTags(item.label) || key, q: item });
      }
    }
  };
  walk(questions);
  return out;
}

function displayValue(q: CsvQuestion, raw: any): string {
  if (raw === undefined || raw === null || raw === "") return "";
  const labelFor = (val: string) =>
    stripTags(q.options?.find((o) => String(o.value) === String(val) || o.label === val)?.label) || stripTags(val);
  if (Array.isArray(raw)) return raw.map((v) => labelFor(String(v))).join(" | ");
  if (typeof raw === "object") { try { return JSON.stringify(raw); } catch { return String(raw); } }
  const s = String(raw);
  if (q.type === "select_multiple" && s.includes(" ")) return s.split(/\s+/).map(labelFor).join(" | ");
  return labelFor(s);
}

function esc(v: any): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
}

export function downloadCsv(filename: string, content: string) {
  // BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build a flattened submissions CSV with one column per checklist question. */
export function buildSubmissionsCsv(rows: CsvRow[], questions: CsvQuestion[]): string {
  const flat = flatten(questions);
  const baseHeaders = [
    "Submission ID", "State", "LGA", "Ward", "Community", "Settlement",
    "Monitor", "Submitted At", "Status",
  ];
  const headers = [...baseHeaders, ...flat.map((f) => f.label)];
  const dataRows = rows.map((r) => {
    const d = r.data || {};
    return [
      r.id,
      stripTags(r.state ?? d.state),
      stripTags(r.lga ?? d.lga),
      stripTags(r.ward ?? d.ward),
      stripTags(d.community_name ?? d.community),
      stripTags(d.settlement_name ?? d.settlement),
      stripTags(r.submitter),
      r.submittedAt ? new Date(r.submittedAt).toISOString() : "",
      r.status ?? "",
      ...flat.map((f) => displayValue(f.q, d[f.key])),
    ];
  });
  return toCsv(headers, dataRows);
}

/** Slug a label for use in a filename. */
export function slugify(s: string): string {
  return String(s || "export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "export";
}
