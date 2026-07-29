// KoboCollect appearance conformance + no-HTML regression.
// Ensures every select_one/select_multiple question renders as a dropdown
// (minimal / minimal autocomplete) on KoboCollect Android and that no raw
// HTML tags leak into any survey/choices cell — pyxform escapes them and
// KoboCollect shows them as literal text, which breaks the UX.

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildMicroplanningXlsForm } from "../xlsformBuilder";
import { buildCoverageXlsForm } from "../generateCoverageXLSForm";
import { buildReconciliationXlsForm } from "../generateReconciliationXLSForm";

const FORBIDDEN = /<\s*\/?\s*(font|b|span|div|br)(\s|>|\/)/i;

const rowsOf = (wb: XLSX.WorkBook, sheet: string): string[][] =>
  XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheet], { header: 1, defval: "" }) as string[][];

async function loadBooks() {
  const microplan = await buildMicroplanningXlsForm(undefined, {
    projectName: "Appearance Test",
    projectStates: ["__none__"],
  });
  return {
    microplan,
    coverage: buildCoverageXlsForm({ projectName: "Appearance Test" }),
    reconciliation: buildReconciliationXlsForm({ projectName: "Appearance Test" }),
  };
}

describe.each([
  ["microplan"],
  ["coverage"],
  ["reconciliation"],
] as const)("XLSForm %s — KoboCollect appearance", (which) => {
  it("every select_one / select_multiple field uses minimal or minimal autocomplete", async () => {
    const books = await loadBooks();
    const wb = books[which];
    const survey = rowsOf(wb, "survey");
    const h = survey[0];
    const typeIdx = h.indexOf("type");
    const appIdx = h.indexOf("appearance");
    const nameIdx = h.indexOf("name");

    const offenders: string[] = [];
    for (const r of survey.slice(1)) {
      const t = String(r[typeIdx] ?? "").trim();
      if (!/^select_(one|multiple)\b/.test(t)) continue;
      const app = String(r[appIdx] ?? "").toLowerCase().trim();
      const ok = /\bminimal\b/.test(app);
      if (!ok) offenders.push(`${String(r[nameIdx])} → "${app}"`);
    }
    expect(offenders, `select fields missing minimal appearance:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no forbidden HTML tags in labels/hints/headers/choices", async () => {
    const books = await loadBooks();
    const wb = books[which];
    for (const sheet of ["survey", "choices"]) {
      const rows = rowsOf(wb, sheet);
      rows.forEach((r, i) =>
        r.forEach((cell) => {
          const s = String(cell ?? "");
          expect(
            FORBIDDEN.test(s),
            `forbidden HTML tag in ${which}.${sheet} row ${i + 1}: ${s.slice(0, 120)}`,
          ).toBe(false);
        }),
      );
    }
  });
});
