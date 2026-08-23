/**
 * Exporters for the daily new-evidence ledger of the Integrated MDA
 * Supervisory Checklist — CSV (analysis) and PDF (briefing pack), both
 * carrying the stacked corroboration notes behind every finding.
 */
import jsPDF from "jspdf";
import type { EvidenceLedger, EvidenceFact } from "./evidencePatterns";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const notesOf = (f: EvidenceFact) =>
  f.notes.map((n) => `${n.day} ×${n.count}`).join(" | ");

const stamp = () => new Date().toISOString().slice(0, 10);

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportEvidenceLedgerCSV(ledger: EvidenceLedger, filename?: string) {
  const lines: string[] = [];

  lines.push("DAILY EVIDENCE SUMMARY");
  lines.push(["Field day", "Submissions", "New evidence", "Corroborations", "Cumulative distinct findings"].map(esc).join(","));
  for (const d of ledger.days) {
    lines.push([d.day, d.submissions, d.newFacts, d.repeatFacts, d.cumulative].map(esc).join(","));
  }

  lines.push("");
  lines.push("FINDINGS REGISTER");
  lines.push(
    ["Finding", "What it means", "Location", "Severity", "Standing", "Sightings", "Distinct days", "First seen", "Last seen", "Corroboration notes"]
      .map(esc).join(","),
  );
  for (const f of ledger.facts) {
    lines.push([
      f.theme, f.statement, f.place, f.severity,
      f.undeniable ? "Undeniable" : "Awaiting corroboration",
      f.occurrences, f.days.length, f.firstSeen, f.lastSeen, notesOf(f),
    ].map(esc).join(","));
  }

  download(
    new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    filename || `mda-evidence-ledger-${stamp()}.csv`,
  );
}

export function exportEvidenceLedgerPDF(ledger: EvidenceLedger, filename?: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 0;

  const header = (title: string) => {
    doc.setFillColor(22, 104, 220);
    doc.rect(0, 0, W, 60, "F");
    doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(15);
    doc.text("Integrated MDA Supervisory Checklist", M, 28);
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.text(title, M, 45);
    doc.setTextColor(0);
    y = 82;
  };

  const ensure = (need: number) => {
    if (y + need > H - 48) {
      doc.addPage();
      header("Daily new-evidence ledger (continued)");
    }
  };

  header(`Daily new-evidence ledger — generated ${new Date().toLocaleString()}`);

  // KPI strip
  const kpis: [string, string][] = [
    ["Field days", String(ledger.days.length)],
    ["Distinct findings", String(ledger.facts.length)],
    ["Undeniable", String(ledger.undeniable.length)],
    ["New on latest day", String(ledger.days[ledger.days.length - 1]?.newFacts ?? 0)],
  ];
  const cw = (W - M * 2) / kpis.length;
  kpis.forEach(([l, v], i) => {
    const x = M + i * cw;
    doc.setDrawColor(220).setFillColor(245, 247, 250);
    doc.roundedRect(x, y, cw - 8, 42, 5, 5, "FD");
    doc.setFontSize(7.5).setTextColor(110).setFont("helvetica", "bold");
    doc.text(l.toUpperCase(), x + 8, y + 15);
    doc.setFontSize(15).setTextColor(20).text(v, x + 8, y + 33);
  });
  y += 62;
  doc.setTextColor(0);

  // Daily table
  ensure(60);
  doc.setFont("helvetica", "bold").setFontSize(11).text("Evidence accumulation by field day", M, y);
  y += 14;
  const cols = [M, M + 110, M + 210, M + 320, M + 430];
  doc.setFontSize(8).setTextColor(90);
  ["Field day", "Submissions", "New evidence", "Corroborations", "Cumulative"].forEach((h, i) => doc.text(h, cols[i], y));
  doc.setTextColor(0).setFont("helvetica", "normal");
  y += 6;
  doc.setDrawColor(225).line(M, y, W - M, y);
  y += 12;
  for (const d of ledger.days) {
    ensure(16);
    doc.setFontSize(8.5);
    [d.day, String(d.submissions), String(d.newFacts), String(d.repeatFacts), String(d.cumulative)]
      .forEach((t, i) => doc.text(t, cols[i], y));
    y += 13;
  }
  y += 12;

  // Findings with stacked corroboration notes
  const section = (title: string, facts: EvidenceFact[], color: [number, number, number]) => {
    if (!facts.length) return;
    ensure(46);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...color);
    doc.text(`${title} (${facts.length})`, M, y);
    doc.setTextColor(0);
    y += 14;
    facts.forEach((f, i) => {
      const noteLines = doc.splitTextToSize(
        `Corroboration stack: ${notesOf(f) || "single sighting"}`, W - M * 2 - 16,
      ) as string[];
      const bodyLines = doc.splitTextToSize(`${f.statement} — ${f.place}`, W - M * 2 - 16) as string[];
      const boxH = 26 + bodyLines.length * 11 + noteLines.length * 10;
      ensure(boxH + 8);
      doc.setDrawColor(...color).setFillColor(250, 250, 252);
      doc.roundedRect(M, y, W - M * 2, boxH, 4, 4, "FD");
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...color);
      doc.text(`${i + 1}. ${f.theme}`, M + 8, y + 15);
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(40);
      let ly = y + 27;
      bodyLines.forEach((l) => { doc.text(l, M + 8, ly); ly += 11; });
      doc.setFontSize(7.8).setTextColor(105);
      doc.text(
        `${f.occurrences} sighting${f.occurrences === 1 ? "" : "s"} across ${f.days.length} field day${f.days.length === 1 ? "" : "s"} · ${f.firstSeen} → ${f.lastSeen}`,
        M + 8, ly,
      );
      ly += 10;
      noteLines.forEach((l) => { doc.text(l, M + 8, ly); ly += 10; });
      doc.setTextColor(0);
      y += boxH + 8;
    });
    y += 8;
  };

  section("Undeniable findings — corroborated across multiple field days", ledger.undeniable, [190, 24, 60]);
  section("Emerging findings — first surfaced on the latest field day", ledger.emerging, [217, 119, 6]);

  // Methodology footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7).setTextColor(120);
    doc.text(
      "A finding is a unique problem-plus-location pair. It is promoted to Undeniable once observed on \u2265 2 separate field days and \u2265 3 times in total.",
      M, H - 30, { maxWidth: W - M * 2 },
    );
    doc.text(`Page ${p} of ${pages}`, W - M, H - 16, { align: "right" });
  }

  doc.save(filename || `mda-evidence-ledger-${stamp()}.pdf`);
}
