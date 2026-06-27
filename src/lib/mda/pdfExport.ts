/**
 * MDA drill-down PDF export
 * ────────────────────────────────────────────────────────────────────────
 * Produces a clean, presentation-ready PDF of whatever filtered community
 * subset is currently shown in the drill-down sheet. One row per submission
 * with the key location / supervisor columns, followed by per-question detail
 * pages. Mirrors the CSV export so the two stay in sync.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface PdfOption { id?: string; label?: string; value?: string }
interface PdfQuestion {
  id: string; name?: string; label?: string; type?: string;
  options?: PdfOption[]; questions?: PdfQuestion[];
}
export interface PdfRow {
  id: string;
  state?: string | null; lga?: string | null; ward?: string | null;
  submitter?: string | null; submittedAt?: string | null; status?: string | null;
  data?: Record<string, any>;
}

const stripTags = (s?: any) => String(s ?? "").replace(/<[^>]*>/g, "").trim();

interface FlatQ { key: string; label: string; q: PdfQuestion }
function flatten(questions: PdfQuestion[]): FlatQ[] {
  const out: FlatQ[] = [];
  const walk = (qs?: PdfQuestion[]) => {
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

function displayValue(q: PdfQuestion, raw: any): string {
  if (raw === undefined || raw === null || raw === "") return "—";
  const labelFor = (val: string) =>
    stripTags(q.options?.find((o) => String(o.value) === String(val) || o.label === val)?.label) || stripTags(val);
  if (Array.isArray(raw)) return raw.map((v) => labelFor(String(v))).join(", ");
  if (typeof raw === "object") { try { return JSON.stringify(raw); } catch { return String(raw); } }
  const s = String(raw);
  if (q.type === "select_multiple" && s.includes(" ")) return s.split(/\s+/).map(labelFor).join(", ");
  return labelFor(s);
}

function communityOf(r: PdfRow): string {
  const d = r.data || {};
  return stripTags(d.community_name ?? d.community ?? d.settlement_name ?? d.settlement) || "—";
}

const NAVY: [number, number, number] = [12, 35, 64];

/** Download the filtered drill-down rows as a formatted PDF report. */
export function exportDrilldownPdf(
  rows: PdfRow[],
  questions: PdfQuestion[],
  title: string,
  subtitle?: string,
) {
  const flat = flatten(questions);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header banner ──
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 56, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(stripTags(title) || "MDA Drill-down", 32, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const meta = `${subtitle ? stripTags(subtitle) + "  •  " : ""}${rows.length} submission${rows.length === 1 ? "" : "s"}  •  Generated ${new Date().toLocaleString()}`;
  doc.text(meta, 32, 44);

  // ── Summary table (one row per submission) ──
  autoTable(doc, {
    startY: 70,
    head: [["#", "State", "LGA", "Ward", "Community", "Supervisor", "Submitted", "Status"]],
    body: rows.map((r, i) => [
      String(i + 1),
      stripTags(r.state ?? r.data?.state) || "—",
      stripTags(r.lga ?? r.data?.lga) || "—",
      stripTags(r.ward ?? r.data?.ward) || "—",
      communityOf(r),
      stripTags(r.submitter) || "—",
      r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—",
      stripTags(r.status) || "—",
    ]),
    styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 32, right: 32 },
  });

  // ── Per-submission detail ──
  rows.forEach((r, i) => {
    const answered = flat
      .map((f) => [f.label, displayValue(f.q, r.data?.[f.key])] as [string, string])
      .filter(([, v]) => v && v !== "—");
    if (answered.length === 0) return;
    doc.addPage();
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageW, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${i + 1}. ${communityOf(r)}`, 32, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `${[stripTags(r.state ?? r.data?.state), stripTags(r.lga ?? r.data?.lga), stripTags(r.ward ?? r.data?.ward)].filter(Boolean).join(" › ")}  •  ID ${r.id}`,
      32, 33,
    );
    autoTable(doc, {
      startY: 52,
      head: [["Question", "Answer"]],
      body: answered,
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: { 0: { cellWidth: pageW * 0.45, textColor: [71, 85, 105] }, 1: { fontStyle: "bold" } },
      margin: { left: 32, right: 32 },
    });
  });

  const safe = (stripTags(title) || "mda-drilldown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  doc.save(`${safe || "mda-drilldown"}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
