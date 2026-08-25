/**
 * Multi-file ingestion for Amehnities AI.
 *
 * Every supported upload is parsed in the browser into a common
 * `ParsedAttachment` shape: a short human summary, a text excerpt the model can
 * reason over, and — for tabular files — the actual rows so the Python sandbox
 * can run real statistics on them.
 *
 * Supported: CSV/TSV, XLSX/XLS, JSON, PDF, DOCX, TXT/MD, and images.
 */

export type AttachmentKind = "table" | "document" | "json" | "image" | "text" | "unsupported";

export interface ParsedAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: AttachmentKind;
  /** One-line description shown in the UI and sent to the model. */
  summary: string;
  /** Text the model reads (truncated). */
  excerpt: string;
  /** Tabular rows (CSV/XLSX/array JSON) for the analysis sandbox. */
  rows?: Record<string, unknown>[];
  columns?: string[];
  /** Data URL for images so they can be shown and sent as multimodal input. */
  dataUrl?: string;
  error?: string;
}

const MAX_EXCERPT = 12000;
const MAX_ROWS = 20000;
const MAX_PDF_PAGES = 25;

const uid = () => `att_${Math.random().toString(36).slice(2, 10)}`;

const extOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";

function truncate(text: string, max = MAX_EXCERPT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [truncated, ${text.length - max} more characters]`;
}

/** Compact preview of a table: header + first rows, as delimited text. */
export function tablePreview(rows: Record<string, unknown>[], columns: string[], limit = 25): string {
  const head = columns.join(" | ");
  const body = rows.slice(0, limit).map((r) => columns.map((c) => fmt(r[c])).join(" | ")).join("\n");
  return `${head}\n${"-".repeat(Math.min(head.length, 80))}\n${body}`;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(Math.round(v * 1e6) / 1e6);
  return String(v).slice(0, 120);
}

/** Numeric/categorical profile the model can reason about without seeing every row. */
export function profileTable(rows: Record<string, unknown>[], columns: string[]): string {
  const lines: string[] = [];
  for (const col of columns.slice(0, 40)) {
    const values = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== "");
    const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    const missing = rows.length - values.length;
    if (nums.length >= Math.max(3, values.length * 0.8)) {
      const sorted = [...nums].sort((a, b) => a - b);
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      lines.push(
        `${col}: numeric — n=${nums.length}, missing=${missing}, min=${round(sorted[0])}, median=${round(median)}, mean=${round(mean)}, max=${round(sorted[sorted.length - 1])}`,
      );
    } else {
      const counts = new Map<string, number>();
      values.forEach((v) => {
        const k = String(v).slice(0, 60);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      });
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([k, c]) => `${k} (${c})`).join(", ");
      lines.push(`${col}: categorical — distinct=${counts.size}, missing=${missing}, top: ${top}`);
    }
  }
  return lines.join("\n");
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Minimal, quote-aware CSV/TSV parser. */
export function parseDelimited(text: string, delimiter?: string): { rows: Record<string, unknown>[]; columns: string[] } {
  const d = delimiter ?? (text.slice(0, 2000).split("\t").length > text.slice(0, 2000).split(",").length ? "\t" : ",");
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === d) { record.push(field); field = ""; continue; }
    if (ch === "\n") { record.push(field); records.push(record); record = []; field = ""; continue; }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field.length || record.length) { record.push(field); records.push(record); }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return { rows: [], columns: [] };

  const columns = nonEmpty[0].map((c, i) => c.trim() || `column_${i + 1}`);
  const rows = nonEmpty.slice(1, MAX_ROWS + 1).map((r) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((c, i) => {
      const raw = (r[i] ?? "").trim();
      const num = raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
      obj[c] = num !== undefined ? num : raw;
    });
    return obj;
  });
  return { rows, columns };
}

async function parseSpreadsheet(file: File): Promise<{ rows: Record<string, unknown>[]; columns: string[]; sheets: string[] }> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheets = wb.SheetNames;
  const first = wb.Sheets[sheets[0]];
  const json = XLSX.utils.sheet_to_json(first, { defval: "" }) as Record<string, unknown>[];
  const rows = json.slice(0, MAX_ROWS);
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { rows, columns, sheets };
}

async function parsePdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  const out: string[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: { str?: string }) => it.str ?? "").join(" ");
    out.push(`--- page ${i} ---\n${text}`);
  }
  if (doc.numPages > pages) out.push(`… [${doc.numPages - pages} further pages not read]`);
  return out.join("\n\n");
}

/** DOCX text extraction straight from the OOXML body (no extra dependency). */
async function parseDocx(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("Not a readable Word document");
  const xml = await entry.async("string");
  return xml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });

/** Parse a single upload into the common attachment shape. */
export async function parseFile(file: File): Promise<ParsedAttachment> {
  const base: ParsedAttachment = {
    id: uid(),
    name: file.name,
    type: file.type || extOf(file.name),
    size: file.size,
    kind: "unsupported",
    summary: "",
    excerpt: "",
  };
  const ext = extOf(file.name);

  try {
    if (ext === "csv" || ext === "tsv" || file.type === "text/csv") {
      const { rows, columns } = parseDelimited(await file.text());
      return {
        ...base, kind: "table", rows, columns,
        summary: `${rows.length.toLocaleString()} rows × ${columns.length} columns`,
        excerpt: `COLUMN PROFILE\n${profileTable(rows, columns)}\n\nSAMPLE ROWS\n${tablePreview(rows, columns)}`,
      };
    }

    if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
      const { rows, columns, sheets } = await parseSpreadsheet(file);
      return {
        ...base, kind: "table", rows, columns,
        summary: `${rows.length.toLocaleString()} rows × ${columns.length} columns (sheet "${sheets[0]}"${sheets.length > 1 ? ` of ${sheets.length}` : ""})`,
        excerpt: `COLUMN PROFILE\n${profileTable(rows, columns)}\n\nSAMPLE ROWS\n${tablePreview(rows, columns)}`,
      };
    }

    if (ext === "json" || file.type === "application/json") {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === "object") {
        const rows = parsed.slice(0, MAX_ROWS) as Record<string, unknown>[];
        const columns = [...new Set(rows.flatMap((r) => Object.keys(r ?? {})))];
        return {
          ...base, kind: "table", rows, columns,
          summary: `JSON array — ${rows.length.toLocaleString()} records × ${columns.length} fields`,
          excerpt: `COLUMN PROFILE\n${profileTable(rows, columns)}\n\nSAMPLE ROWS\n${tablePreview(rows, columns)}`,
        };
      }
      return {
        ...base, kind: "json",
        summary: `JSON object — ${Object.keys(parsed ?? {}).length} top-level keys`,
        excerpt: truncate(JSON.stringify(parsed, null, 2)),
      };
    }

    if (ext === "pdf" || file.type === "application/pdf") {
      const text = await parsePdf(file);
      return {
        ...base, kind: "document",
        summary: `PDF — ${text.split(/\s+/).length.toLocaleString()} words extracted`,
        excerpt: truncate(text),
      };
    }

    if (ext === "docx") {
      const text = await parseDocx(file);
      return {
        ...base, kind: "document",
        summary: `Word document — ${text.split(/\s+/).length.toLocaleString()} words`,
        excerpt: truncate(text),
      };
    }

    if (file.type.startsWith("image/")) {
      const dataUrl = await readAsDataUrl(file);
      return {
        ...base, kind: "image", dataUrl,
        summary: `Image — ${(file.size / 1024).toFixed(0)} KB`,
        excerpt: "[image attached — described visually by the assistant]",
      };
    }

    if (["txt", "md", "log", "xml", "yaml", "yml"].includes(ext) || file.type.startsWith("text/")) {
      const text = await file.text();
      return {
        ...base, kind: "text",
        summary: `Text file — ${text.split(/\s+/).length.toLocaleString()} words`,
        excerpt: truncate(text),
      };
    }

    return { ...base, summary: "Unsupported file type", error: `Cannot read .${ext} files` };
  } catch (err) {
    return { ...base, summary: "Could not be read", error: (err as Error)?.message ?? "Parse failed" };
  }
}

/** Parse many files, never failing the batch because one file is bad. */
export async function parseFiles(files: File[]): Promise<ParsedAttachment[]> {
  return Promise.all(files.map((f) => parseFile(f)));
}
