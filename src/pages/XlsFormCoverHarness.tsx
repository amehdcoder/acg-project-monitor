/**
 * Dev-only harness that builds the microplanning XLSForm client-side and
 * exposes both the parsed survey sheet and the raw workbook as globals so a
 * Playwright test can inspect the cover page WITHOUT downloading the file
 * through the authenticated UI.
 *
 * The builder runs with `projectStates: ["__none__"]` so GRID3 lookups skip
 * (no matching state → empty entries loop) and the build finishes in <1s.
 *
 * Exposes:
 *   window.__xlsformBuilt__       — true once the workbook is ready
 *   window.__xlsformSurveyRows__  — string[][] of the `survey` sheet
 *   window.__xlsformSheetNames__  — string[] workbook sheets
 *   window.__xlsformError__       — string if build failed
 */
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import NotFound from "./NotFound";
import { buildMicroplanningXlsForm } from "@/lib/microplanning/xlsformBuilder";

declare global {
  interface Window {
    __xlsformBuilt__?: boolean;
    __xlsformSurveyRows__?: string[][];
    __xlsformSheetNames__?: string[];
    __xlsformError__?: string;
  }
}

export default function XlsFormCoverHarness() {
  if (!import.meta.env.DEV) return <NotFound />;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [surveyRows, setSurveyRows] = useState<string[][]>([]);

  useEffect(() => {
    (async () => {
      try {
        const wb = await buildMicroplanningXlsForm(undefined, {
          projectName: "E2E Cover Test",
          projectStates: ["__none__"],
        });
        const sheet = wb.Sheets["survey"];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
        window.__xlsformSurveyRows__ = rows as string[][];
        window.__xlsformSheetNames__ = wb.SheetNames;
        window.__xlsformBuilt__ = true;
        setSurveyRows(rows as string[][]);
        setStatus("ready");
      } catch (e) {
        window.__xlsformError__ = (e as Error).message;
        setStatus("error");
      }
    })();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>XLSForm Cover Harness</h1>
      <div>Status: <span data-testid="xlsform-status">{status}</span></div>
      <div>Survey rows: <span data-testid="xlsform-row-count">{surveyRows.length}</span></div>
    </div>
  );
}
