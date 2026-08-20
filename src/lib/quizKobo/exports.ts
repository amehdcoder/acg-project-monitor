/**
 * CSV + printable PDF exports for the Kobo-powered quiz analytics dashboard.
 * Shared by the persistent Analytics header bar.
 */
import jsPDF from "jspdf";
import type { ImprovementSummary, PairedParticipant, PairedTTest } from "./analytics";

export interface KoboExportContext {
  formTitle: string;
  groupLabel: string;
  passingScore: number;
  pairs: PairedParticipant[];
  stats: PairedTTest | null;
  summary: ImprovementSummary;
}

export const fmtP = (p: number) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);

const fileBaseFor = (groupLabel: string, stamp: Date) =>
  `quiz-analytics-${groupLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp.toISOString().slice(0, 10)}`;

export function exportKoboCSV(ctx: KoboExportContext) {
  const { pairs, stats, summary } = ctx;


  const stamp = new Date();
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const meta: (string | number)[][] = [
    ["Quiz Analytics"],
    ["Form", ctx.formTitle],
    ["MDA intervention filter", ctx.groupLabel],
    ["Generated", stamp.toLocaleString()],
    ["Pre-tests", summary.preCount], ["Post-tests", summary.postCount],
    ["Paired participants", stats?.n ?? 0],
    ["Mean pre %", stats ? stats.meanPre.toFixed(1) : ""],
    ["Mean post %", stats ? stats.meanPost.toFixed(1) : ""],
    ["Mean gain %", stats ? stats.meanGain.toFixed(1) : ""],
    ["t", stats ? stats.t.toFixed(3) : ""], ["df", stats?.df ?? ""],
    ["p-value", stats ? stats.p.toFixed(4) : ""], ["Cohen's d", stats ? stats.cohensD.toFixed(3) : ""],
    ["Pass rate pre %", summary.prePassRate.toFixed(1)],
    ["Pass rate post %", summary.postPassRate.toFixed(1)],
    [],
  ];

  const header = ["Name of Independent Monitor", "MDA group", "Pre %", "Post %", "Delta", "Status"];
  const body = pairs.map((p) => [
    p.name, p.group ?? "", p.pre?.toFixed(1) ?? "", p.post?.toFixed(1) ?? "",
    p.delta?.toFixed(1) ?? "", p.trend === "incomplete" ? "Awaiting pair" : p.trend,
  ]);
  const csv = [...meta, header, ...body].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${fileBaseFor(ctx.groupLabel, stamp)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function exportKoboPDF(ctx: KoboExportContext) {
  const { pairs, stats, summary, passingScore } = ctx;
  const stamp = new Date();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 46;
  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text("Quiz Pre/Post Test Analytics Report", 40, y); y += 18;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  doc.text(ctx.formTitle, 40, y); y += 13;
  doc.text(`MDA intervention: ${ctx.groupLabel}   |   Generated: ${stamp.toLocaleString()}`, 40, y); y += 22;
  doc.setTextColor(0);

  doc.setFont("helvetica", "bold").setFontSize(12).text("Summary", 40, y); y += 14;
  doc.setFont("helvetica", "normal").setFontSize(10);
  const lines = [
    `Pre-tests: ${summary.preCount}    Post-tests: ${summary.postCount}    Paired participants: ${stats?.n ?? 0}`,
    stats
      ? `Mean score: ${stats.meanPre.toFixed(1)}% -> ${stats.meanPost.toFixed(1)}% (gain ${stats.meanGain > 0 ? "+" : ""}${stats.meanGain.toFixed(1)} pp)`
      : "Mean score: awaiting paired submissions",
    stats
      ? `Paired t-test: t = ${stats.t.toFixed(3)}, df = ${stats.df}, ${fmtP(stats.p)}, Cohen's d = ${stats.cohensD.toFixed(3)}`
      : "Paired t-test: not available",
    `Pass rate (>= ${passingScore}%): pre ${summary.prePassRate.toFixed(1)}% -> post ${summary.postPassRate.toFixed(1)}%`,
    `Improved: ${summary.improved}    Declined: ${summary.declined}    Unchanged: ${summary.unchanged}`,
    stats
      ? (stats.significant ? "Conclusion: statistically significant improvement." : "Conclusion: no statistically significant change.")
      : "",
  ].filter(Boolean);
  lines.forEach((l) => { doc.text(doc.splitTextToSize(l, W - 80), 46, y); y += 14; });
  y += 10;

  doc.setFont("helvetica", "bold").setFontSize(12).text("Independent Monitor results", 40, y); y += 16;
  const cols = [46, 250, 330, 400, 460, 510];
  const head = ["Independent Monitor", "MDA group", "Pre %", "Post %", "Delta", "Status"];
  const drawHead = () => {
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255);
    doc.setFillColor(37, 99, 235).rect(40, y - 11, W - 80, 16, "F");
    head.forEach((h, i) => doc.text(h, cols[i], y));
    doc.setTextColor(0).setFont("helvetica", "normal");
    y += 16;
  };
  drawHead();
  pairs.forEach((p, i) => {
    if (y > H - 60) { doc.addPage(); y = 50; drawHead(); }
    if (i % 2 === 0) { doc.setFillColor(245, 247, 250).rect(40, y - 10, W - 80, 14, "F"); }
    doc.setFontSize(9);
    const row = [
      p.name.slice(0, 34), (p.group ?? "—").slice(0, 14),
      p.pre != null ? p.pre.toFixed(1) : "—",
      p.post != null ? p.post.toFixed(1) : "—",
      p.delta == null ? "—" : `${p.delta > 0 ? "+" : ""}${p.delta.toFixed(1)}`,
      p.trend === "incomplete" ? "Awaiting pair" : p.trend,
    ];
    row.forEach((c, ci) => doc.text(String(c), cols[ci], y));
    y += 14;
  });

  doc.setFontSize(8).setTextColor(120);
  doc.text("Score bands: Excellent >= 80% | Good >= 70% | Moderate >= 60% | below 60% needs additional training.", 40, H - 34, { maxWidth: W - 80 });
  doc.save(`${fileBaseFor(ctx.groupLabel, stamp)}.pdf`);
}
