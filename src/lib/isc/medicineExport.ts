/**
 * One-click export of the Medicine Accountability dashboard and its
 * reconciliation sub-tab to CSV and PDF for supervision meetings.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  medicineLabel, type AccountabilitySummary, type SupplyIntegrity,
} from "./medicineAccountability";
import type { DrillReport, MedicineAlert } from "./medicineDrilldown";
import { KPI_DOCS } from "./medicineKpiDocs";
import type { ReconIssue, ReconStats } from "./reconciliationReport";

const stamp = () => new Date().toISOString().slice(0, 10);
const r0 = (n: number) => Math.round(n);
const p1 = (n: number) => `${(n * 100).toFixed(1)}%`;

export interface ExportBundle {
  summary: AccountabilitySummary;
  integrity: SupplyIntegrity;
  alerts: MedicineAlert[];
  drilldowns: DrillReport[];
  scope: string;
}

/* ── shared writers ──────────────────────────────────────────────────────── */

interface Section { title: string; head: string[]; rows: (string | number)[][] }

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function sectionsToCsv(title: string, scope: string, sections: Section[]) {
  const esc = (c: unknown) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  const lines: string[] = [
    esc(title),
    esc(`Scope: ${scope}`),
    esc(`Exported: ${new Date().toLocaleString()}`),
    "",
  ];
  for (const s of sections) {
    lines.push(esc(s.title));
    lines.push(s.head.map(esc).join(","));
    for (const r of s.rows) lines.push(r.map(esc).join(","));
    lines.push("");
  }
  return lines.join("\n");
}

function sectionsToPdf(title: string, scope: string, sections: Section[], filename: string, notes?: string[]) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();

  pdf.setFillColor(15, 76, 129);
  pdf.rect(0, 0, W, 56, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(15);
  pdf.text(title, 32, 26);
  pdf.setFontSize(9);
  pdf.text(`${scope}  ·  Exported ${new Date().toLocaleString()}`, 32, 42);

  let y = 78;
  for (const s of sections) {
    if (y > pdf.internal.pageSize.getHeight() - 120) { pdf.addPage(); y = 48; }
    pdf.setTextColor(15, 76, 129);
    pdf.setFontSize(11);
    pdf.text(s.title, 32, y);
    autoTable(pdf, {
      startY: y + 8,
      head: [s.head],
      body: s.rows.map((r) => r.map((c) => String(c ?? ""))),
      styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [15, 76, 129], textColor: 255, fontSize: 7.5 },
      alternateRowStyles: { fillColor: [244, 247, 250] },
      margin: { left: 32, right: 32 },
      theme: "grid",
    });
    y = (pdf as any).lastAutoTable.finalY + 26;
  }

  if (notes?.length) {
    if (y > pdf.internal.pageSize.getHeight() - 120) { pdf.addPage(); y = 48; }
    pdf.setTextColor(15, 76, 129);
    pdf.setFontSize(11);
    pdf.text("Definitions & data-quality notes", 32, y);
    pdf.setFontSize(8);
    pdf.setTextColor(70, 70, 70);
    y += 16;
    for (const n of notes) {
      const wrapped = pdf.splitTextToSize(`• ${n}`, W - 64) as string[];
      if (y + wrapped.length * 10 > pdf.internal.pageSize.getHeight() - 32) { pdf.addPage(); y = 48; }
      pdf.text(wrapped, 32, y);
      y += wrapped.length * 10 + 4;
    }
  }

  pdf.save(filename);
}

/* ── dashboard sections ──────────────────────────────────────────────────── */

function dashboardSections(b: ExportBundle): Section[] {
  const { summary, integrity, alerts, drilldowns } = b;
  const s: Section[] = [];

  s.push({
    title: "Headline indicators",
    head: ["Indicator", "Value", "Supporting detail"],
    rows: [
      ["Units received (Level 1)", r0(summary.totals.received).toLocaleString(), `Net usable ${r0(summary.totals.netUsable).toLocaleString()}`],
      ["Distributed to facilities", r0(summary.totals.issuedToFlhf).toLocaleString(), `To CDDs ${r0(summary.totals.issuedToCdd).toLocaleString()}`],
      ["Wastage / stock loss rate", p1(summary.wastageRate), `${r0(summary.totals.damaged).toLocaleString()} units damaged or expired on arrival`],
      ["Tiered stock balance", r0(summary.totals.lgaBalance + summary.totals.flhfBalance).toLocaleString(), `LGA ${r0(summary.totals.lgaBalance).toLocaleString()} · facilities ${r0(summary.totals.flhfBalance).toLocaleString()}`],
      ["Stockout vulnerability", `${summary.stockoutIndex.atRisk} (${p1(summary.stockoutIndex.pct)})`, `${summary.stockoutIndex.stockout} of ${summary.stockoutIndex.facilities} facilities at zero stock`],
      ["Downstream push rate", p1(summary.pushRate), `${p1(summary.pushRateOnTime)} within ${summary.targetWindowDays} days`],
      ["Cascade lead time (LGA → FLHF)", summary.leadTimes[1].avgDays !== null ? `${summary.leadTimes[1].avgDays!.toFixed(1)} days` : "—", `State→LGA ${summary.leadTimes[0].avgDays?.toFixed(1) ?? "—"} · FLHF→CDD ${summary.leadTimes[2].avgDays?.toFixed(1) ?? "—"}`],
      ["Proof-of-delivery compliance", p1(summary.podCompliance.overall), `L1 ${p1(summary.podCompliance.l1)} · L2 ${p1(summary.podCompliance.l2)} · L3 ${p1(summary.podCompliance.l3)}`],
      ["Transit shrinkage rate", p1(integrity.shrinkage.overall.rate), `${r0(integrity.shrinkage.overall.variance).toLocaleString()} units unaccounted`],
      [`Expiry risk index (${integrity.expiryRisk.windowDays}d)`, p1(integrity.expiryRisk.index), `${r0(integrity.expiryRisk.stockAtRisk).toLocaleString()} of ${r0(integrity.expiryRisk.totalStock).toLocaleString()} units short-dated`],
      ["Buffer retention ratio", integrity.buffer.ratio === null ? "—" : `${integrity.buffer.ratio.toFixed(2)} : 1`, `${p1(integrity.buffer.retainedShare)} retained · ${integrity.buffer.band}`],
      ["Reverse logistics — units returned", r0(summary.reverse.returned).toLocaleString(), `${summary.reverse.transactions} return transactions · ${p1(summary.reverse.returnRate)} of stock issued to CDDs`],
      ["Reverse logistics — recovery rate", p1(summary.reverse.recoveryRate), `${r0(summary.reverse.usable).toLocaleString()} usable · ${r0(summary.reverse.damaged + summary.reverse.expired).toLocaleString()} damaged/expired (loss ${p1(summary.reverse.lossRate)})`],
      ["Facility equity index (CV)", integrity.equity.rows.length ? integrity.equity.weightedCv.toFixed(2) : "—", `${integrity.equity.facilities} facilities · ${integrity.equity.lgas} LGAs`],
    ],
  });

  s.push({
    title: "Accountability by state",
    head: ["State", "Allocated", "Received", "Damaged", "Net usable", "To FLHF", "To CDD", "LGA balance", "FLHF balance", "Wastage", "Push rate"],
    rows: summary.byState.map((r) => [
      r.state, r0(r.allocated), r0(r.received), r0(r.damaged), r0(r.netUsable), r0(r.issuedToFlhf), r0(r.issuedToCdd),
      r0(r.lgaBalance), r0(r.flhfBalance), p1(r.wastageRate), p1(r.pushRate),
    ]),
  });

  s.push({
    title: "Accountability by LGA",
    head: ["State", "LGA", "Allocated", "Received", "Damaged", "Net usable", "To FLHF", "To CDD", "LGA balance", "FLHF balance", "Wastage", "Push rate"],
    rows: summary.byLga.map((r) => [
      r.state, r.lga, r0(r.allocated), r0(r.received), r0(r.damaged), r0(r.netUsable), r0(r.issuedToFlhf), r0(r.issuedToCdd),
      r0(r.lgaBalance), r0(r.flhfBalance), p1(r.wastageRate), p1(r.pushRate),
    ]),
  });

  s.push({
    title: "Accountability by medicine",
    head: ["Medicine", "Allocated", "Received", "Damaged", "Net usable", "To FLHF", "To CDD", "Wastage", "Push rate"],
    rows: summary.byMedicine.map((r) => [
      medicineLabel(r.medicine), r0(r.allocated), r0(r.received), r0(r.damaged), r0(r.netUsable),
      r0(r.issuedToFlhf), r0(r.issuedToCdd), p1(r.wastageRate), p1(r.pushRate),
    ]),
  });

  if (summary.reverse.transactions) {
    s.push({
      title: "Level 4 — reverse logistics by leg",
      head: ["Return leg", "Transactions", "Returned", "Usable", "Damaged", "Expired", "Return rate", "Documented"],
      rows: summary.reverse.legs.map((r) => [
        r.label, r.transactions, r0(r.returned), r0(r.usable), r0(r.damaged), r0(r.expired),
        p1(r.returnRate), p1(r.documentationRate),
      ]),
    });
    s.push({
      title: "Level 4 — returns by medicine",
      head: ["Medicine", "Returned", "Usable", "Damaged", "Expired"],
      rows: summary.reverse.byMedicine.map((r) => [
        medicineLabel(r.medicine), r0(r.returned), r0(r.usable), r0(r.damaged), r0(r.expired),
      ]),
    });
    s.push({
      title: "Level 4 — returns by LGA",
      head: ["State", "LGA", "Returned", "Usable", "Unusable", "Return rate"],
      rows: summary.reverse.byLga.map((r) => [
        r.state, r.lga, r0(r.returned), r0(r.usable), r0(r.unusable), p1(r.returnRate),
      ]),
    });
    if (summary.reverse.topReasons.length) {
      s.push({
        title: "Level 4 — reasons for return",
        head: ["Reason", "Transactions", "Units"],
        rows: summary.reverse.topReasons.map((r) => [r.reason, r.count, r0(r.units)]),
      });
    }
    if (summary.reverse.missingReturns.length) {
      s.push({
        title: "Level 4 — sites with no return recorded",
        head: ["State", "LGA", "Health facility", "Issued to facility", "Issued to CDDs"],
        rows: summary.reverse.missingReturns.map((r) => [r.state, r.lga, r.facility, r0(r.issued), r0(r.toCdd)]),
      });
    }
  }

  if (alerts.length) {
    s.push({
      title: "Active alerts",
      head: ["Severity", "KPI", "Scope", "Finding", "Value", "Threshold", "Recommended action"],
      rows: alerts.map((a) => [a.severity, a.kpi, a.scope, `${a.title} — ${a.detail}`, a.value, a.threshold, a.action]),
    });
  }

  for (const d of drilldowns) {
    for (const t of d.tables) {
      if (!t.rows.length) continue;
      s.push({
        title: `${d.title} — ${t.title}`,
        head: t.columns.map((c) => c.label),
        rows: t.rows.map((r) => t.columns.map((c) => (r as any)[c.key] ?? "")),
      });
    }
  }

  return s;
}

const docNotes = () =>
  KPI_DOCS.map((d) => `${d.label}: ${d.definition} Formula: ${d.formula} Data quality: ${d.quality.join(" ")}`);

export function exportAccountabilityCsv(b: ExportBundle) {
  const csv = sectionsToCsv("Medicine Accountability & Cascade Tracking", b.scope, dashboardSections(b));
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `medicine-accountability-${stamp()}.csv`);
}

export function exportAccountabilityPdf(b: ExportBundle) {
  sectionsToPdf(
    "Medicine Accountability & Cascade Tracking",
    b.scope,
    dashboardSections(b),
    `medicine-accountability-${stamp()}.pdf`,
    docNotes(),
  );
}

/* ── reconciliation sub-tab ──────────────────────────────────────────────── */

export interface ReconBundle { issues: ReconIssue[]; stats: ReconStats; scope: string }

function reconSections(b: ReconBundle): Section[] {
  const { stats, issues } = b;
  return [
    {
      title: "Reconciliation summary",
      head: ["Measure", "Value"],
      rows: [
        ["Submissions reported by Kobo", stats.koboReported],
        ["Submissions cached locally", stats.cachedSubmissions],
        ["Parent checklist records", stats.parents],
        ["Respondent interviews expected", stats.expectedRespondents],
        ["Flattened respondent rows", stats.flattenedRespondents],
        ["Errors", stats.errors],
        ["Warnings", stats.warnings],
      ],
    },
    {
      title: `Reconciliation findings (${issues.length})`,
      head: ["Severity", "Issue", "Submission ID", "UUID", "Submitted", "Geography", "Expected", "Actual", "Detail"],
      rows: issues.map((i) => [i.severity, i.type, i.submissionId, i.uuid, i.submittedAt, i.geography, i.expected, i.actual, i.detail]),
    },
  ];
}

export function exportReconciliationCsv(b: ReconBundle) {
  const csv = sectionsToCsv("Kobo ↔ Flattened Data Reconciliation", b.scope, reconSections(b));
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `kobo-reconciliation-${stamp()}.csv`);
}

export function exportReconciliationPdf(b: ReconBundle) {
  sectionsToPdf(
    "Kobo ↔ Flattened Data Reconciliation",
    b.scope,
    reconSections(b),
    `kobo-reconciliation-${stamp()}.pdf`,
    [
      "Repeat count mismatch: the number of Respondent_Interview items on the raw submission differs from the flattened rows the dashboards consume.",
      "Duplicate submission UUID: the same Kobo UUID appears more than once in the cached payload — usually a re-sync artefact.",
      "Orphaned respondent row: a flattened row references a parent submission that is not present in the cache.",
      "Missing geography: one or more of State, LGA, Ward or Community could not be resolved from the submission.",
    ],
  );
}
