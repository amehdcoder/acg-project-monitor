// pyxform validation smoke test.
//
// Writes each generated XLSForm to a temp .xlsx and shells out to `pyxform`
// (via python3) to convert it to XForm XML — the same conversion Kobo runs on
// upload. If pyxform reports any error or a parser warning we fail the suite.
//
// Gracefully skips when python3 / pyxform are not available (local dev).

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMicroplanningXlsForm } from "../xlsformBuilder";
import { buildCoverageXlsForm } from "../generateCoverageXLSForm";
import { buildReconciliationXlsForm } from "../generateReconciliationXLSForm";

const pyxformAvailable = (() => {
  const r = spawnSync("python3", ["-c", "import pyxform"], { encoding: "utf8" });
  return r.status === 0;
})();

const maybe = pyxformAvailable ? describe : describe.skip;

function ensureChoiceStubs(wb: XLSX.WorkBook, lists: string[]) {
  const sheet = wb.Sheets["choices"];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
  const header = rows[0] ?? ["list_name", "name", "label"];
  const listIdx = header.indexOf("list_name");
  const present = new Set(rows.slice(1).map((r) => String(r[listIdx] ?? "")));
  const additions: string[][] = [];
  for (const l of lists) {
    if (!present.has(l)) {
      const row = header.map(() => "");
      row[listIdx] = l;
      const nIdx = header.indexOf("name"); if (nIdx >= 0) row[nIdx] = "stub";
      const lbIdx = header.indexOf("label"); if (lbIdx >= 0) row[lbIdx] = "Stub";
      additions.push(row);
    }
  }
  if (additions.length) {
    wb.Sheets["choices"] = XLSX.utils.aoa_to_sheet([...rows, ...additions]);
  }
}

function convert(wb: XLSX.WorkBook, base: string): { xml: string; log: string } {
  ensureChoiceStubs(wb, ["states", "lgas", "wards", "flhfs", "communities", "settlements"]);
  const dir = mkdtempSync(join(tmpdir(), "xlsform-"));
  const xlsx = join(dir, `${base}.xlsx`);
  const xml = join(dir, `${base}.xml`);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  writeFileSync(xlsx, buf);

  const script = `
import json, sys
from pyxform.xls2xform import xls2xform_convert
warnings = xls2xform_convert(xlsform_path=r"${xlsx}", xform_path=r"${xml}", validate=False)
print(json.dumps({"warnings": warnings or []}))
`;
  const out = execFileSync("python3", ["-c", script], { encoding: "utf8" });
  const parsed = JSON.parse(out.trim().split("\n").pop() as string);
  return {
    xml: existsSync(xml) ? readFileSync(xml, "utf8") : "",
    log: (parsed.warnings as string[]).join("\n"),
  };
}

maybe("pyxform validation (KoboCollect import smoke)", () => {
  it("microplanning XLSForm converts to valid XForm XML", async () => {
    const wb = await buildMicroplanningXlsForm(undefined, {
      projectName: "PyXForm Test",
      projectStates: ["__none__"],
    });
    const { xml, log } = convert(wb, "microplan");
    expect(xml.length, `pyxform produced no XML.\n${log}`).toBeGreaterThan(500);
    expect(xml).toMatch(/<h:html/);
    expect(xml).toMatch(/<community_repeat/);
    // Fail on parser warnings that would surface as import errors in KoboCollect.
    expect(log).not.toMatch(/error|invalid|malformed/i);
  });

  it("coverage XLSForm converts cleanly", () => {
    const wb = buildCoverageXlsForm({ projectName: "PyXForm Coverage" });
    const { xml, log } = convert(wb, "coverage");
    expect(xml).toMatch(/<h:html/);
    expect(log).not.toMatch(/error|invalid|malformed/i);
  });

  it("reconciliation XLSForm converts cleanly", () => {
    const wb = buildReconciliationXlsForm({ projectName: "PyXForm Recon" });
    const { xml, log } = convert(wb, "recon");
    expect(xml).toMatch(/<h:html/);
    expect(log).not.toMatch(/error|invalid|malformed/i);
  });
});

if (!pyxformAvailable) {
  // eslint-disable-next-line no-console
  console.warn("[pyxformValidate] python3/pyxform unavailable — skipping XLSForm→XML conversion tests.");
}
