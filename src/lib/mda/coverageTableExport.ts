/**
 * Integrated MDA coverage table export (CSV + PDF)
 * ────────────────────────────────────────────────────────────────────────
 * Rebuilds the LGA × Ward coverage matrix and the households-sampled-per-
 * community read-out from Repeat Household Coverage Survey rows, then exports
 * them as a tidy CSV or a presentation-ready PDF. Kept in sync with the
 * on-screen tables in MdaCoverageMatrix / RepeatHcsAnalysis.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { testAgainstBenchmark } from "@/lib/ces/coverageStats";
import { toCsv, downloadCsv } from "@/lib/mda/csvExport";

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const fmt1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—");

interface PersonRow { offered?: string; swallowed?: string }
interface HouseholdRecord {
  anyone_treated?: string;
  offered_count?: number;
  swallowed_count?: number;
  people?: PersonRow[];
}
export interface CoverageExportRow {
  state: string | null;
  lga: string | null;
  ward: string | null;
  community_name: string | null;
  target_households: number | null;
  households: HouseholdRecord[] | null;
}

const personsOffered = (h: HouseholdRecord) =>
  Math.max(Number(h.offered_count) || 0, (h.people || []).filter((p) => norm(p.offered) === "y").length);
const personsSwallowed = (h: HouseholdRecord) =>
  Math.max(Number(h.swallowed_count) || 0, (h.people || []).filter((p) => norm(p.swallowed) === "y").length);

interface WardRow {
  lga: string; ward: string;
  sampled: number; interviewed: number; treatedHh: number; eligible: number; swallowed: number;
}

function ci(successes: number, total: number): [number, number] | null {
  if (total <= 0) return null;
  return testAgainstBenchmark(Math.min(successes, total), total, 100).ci95;
}

function quality(txCov: number, target: number): string {
  if (txCov >= target) return "GOOD";
  if (txCov >= target - 5) return "FAIR";
  return "LOW";
}

function buildMatrix(surveys: CoverageExportRow[]): { rows: WardRow[]; totals: WardRow } {
  const map = new Map<string, WardRow>();
  for (const s of surveys) {
    const lga = s.lga || "—";
    const ward = s.ward || "Unspecified";
    const key = `${norm(lga)}|${norm(ward)}`;
    let r = map.get(key);
    if (!r) { r = { lga, ward, sampled: 0, interviewed: 0, treatedHh: 0, eligible: 0, swallowed: 0 }; map.set(key, r); }
    const hh = s.households || [];
    r.interviewed += hh.length;
    r.sampled += Math.max(Number(s.target_households) || 0, hh.length);
    for (const h of hh) {
      if (norm(h.anyone_treated) === "yes") r.treatedHh += 1;
      r.eligible += personsOffered(h);
      r.swallowed += personsSwallowed(h);
    }
  }
  const rows = [...map.values()].sort((a, b) => a.lga.localeCompare(b.lga) || a.ward.localeCompare(b.ward));
  const totals = rows.reduce<WardRow>((acc, r) => {
    acc.sampled += r.sampled; acc.interviewed += r.interviewed; acc.treatedHh += r.treatedHh;
    acc.eligible += r.eligible; acc.swallowed += r.swallowed; return acc;
  }, { lga: "TOTAL", ward: "ALL", sampled: 0, interviewed: 0, treatedHh: 0, eligible: 0, swallowed: 0 });
  return { rows, totals };
}

const MATRIX_HEADERS = [
  "LGA", "Ward", "Sampled HH", "Interviewed HH", "Treatment Took Place",
  "Household Coverage (%)", "HH Cov. Lower (%)", "HH Cov. Upper (%)",
  "Eligible Persons", "Offered & Swallowed", "Therapeutic Coverage (%)",
  "Tx Cov. Lower (%)", "Tx Cov. Upper (%)", "Data Quality",
];

function matrixRowCells(r: WardRow, txTarget: number): (string | number)[] {
  const hhCov = pct(r.treatedHh, r.interviewed);
  const txCov = pct(r.swallowed, r.eligible);
  const hhCI = ci(r.treatedHh, r.interviewed);
  const txCI = ci(r.swallowed, r.eligible);
  return [
    r.lga, r.ward, r.sampled, r.interviewed, r.treatedHh,
    fmt1(hhCov), hhCI ? fmt1(hhCI[0]) : "—", hhCI ? fmt1(hhCI[1]) : "—",
    r.eligible, r.swallowed, fmt1(txCov),
    txCI ? fmt1(txCI[0]) : "—", txCI ? fmt1(txCI[1]) : "—", quality(txCov, txTarget),
  ];
}

interface CommRow { label: string; sub: string; count: number }
function buildCommunities(surveys: CoverageExportRow[]): CommRow[] {
  const map = new Map<string, CommRow>();
  for (const s of surveys) {
    const key = `${norm(s.state)}|${norm(s.lga)}|${norm(s.community_name)}`;
    let c = map.get(key);
    if (!c) { c = { label: s.community_name || "Unspecified", sub: `${s.ward || "—"} · ${s.lga || "—"}`, count: 0 }; map.set(key, c); }
    c.count += (s.households || []).length;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ─────────────────────────── CSV ─────────────────────────── */
export function exportCoverageCsv(surveys: CoverageExportRow[], txTarget: number, filename = "mda-coverage-tables") {
  const { rows, totals } = buildMatrix(surveys);
  const comm = buildCommunities(surveys);

  const matrixSection = toCsv(MATRIX_HEADERS, [
    ...rows.map((r) => matrixRowCells(r, txTarget)),
    matrixRowCells(totals, txTarget),
  ]);
  const commSection = toCsv(
    ["Community", "Ward · LGA", "Households Sampled"],
    comm.map((c) => [c.label, c.sub, c.count]),
  );

  const content = [
    "MDA Coverage by LGA and Ward",
    matrixSection,
    "",
    "Households Sampled per Community",
    commSection,
  ].join("\r\n");
  downloadCsv(filename, content);
}

/* ─────────────────────────── PDF ─────────────────────────── */
export function exportCoveragePdf(surveys: CoverageExportRow[], txTarget: number, filename = "mda-coverage-tables") {
  const { rows, totals } = buildMatrix(surveys);
  const comm = buildCommunities(surveys);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(12, 35, 64);
  doc.rect(0, 0, W, 54, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("MDA Coverage by LGA and Ward", 32, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 210, 235);
  doc.text(
    `Household & Therapeutic Coverage Summary · Target ${txTarget}% · ${new Date().toLocaleString()}`,
    32, 42,
  );

  autoTable(doc, {
    startY: 66,
    head: [MATRIX_HEADERS],
    body: rows.map((r) => matrixRowCells(r, txTarget)),
    foot: [matrixRowCells(totals, txTarget)],
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [30, 99, 199], textColor: 255, fontSize: 7 },
    footStyles: { fillColor: [12, 35, 64], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [238, 242, 251] },
    margin: { left: 24, right: 24 },
  });

  const afterMatrix = (doc as any).lastAutoTable?.finalY ?? 66;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(12, 35, 64);
  doc.text("Households Sampled per Community", 32, afterMatrix + 26);

  autoTable(doc, {
    startY: afterMatrix + 34,
    head: [["Community", "Ward · LGA", "Households Sampled"]],
    body: comm.map((c) => [c.label, c.sub, c.count]),
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [20, 184, 166], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    margin: { left: 24, right: 24 },
  });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
