// Cover-page contract tests for the microplanning XLSForm.
//
// 1. Unit tests: build the workbook and assert the first user-visible screen
//    contains ONLY the `home` cover image (no label, no hint, no other rows
//    rendered before it), plus the runtime guard rejects tampered workbooks.
// 2. Snapshot test: freezes the cover-related `.xlsx` structure so any future
//    schema drift (new metadata rows, changed appearance, new hint columns,
//    reordered header) fails loudly in CI instead of silently shipping.

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  buildMicroplanningXlsForm,
  assertCoverPageIsHomeImageOnly,
  sanitizeInterpolations,
} from "../xlsformBuilder";

// `__none__` short-circuits GRID3 state lookups so the builder finishes in <1s
// without hitting the network — same trick the /__test/xlsform-cover harness uses.
const buildFixture = () =>
  buildMicroplanningXlsForm(undefined, {
    projectName: "Cover Test",
    projectStates: ["__none__"],
  });

const surveyRows = (wb: XLSX.WorkBook): string[][] => {
  const sheet = wb.Sheets["survey"];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
};

const META_TYPES = new Set([
  "start", "end", "today", "deviceid", "username", "phonenumber", "phone_number", "audit",
]);

describe("microplanning XLSForm cover page", () => {
  it("first user-visible row is the home cover note with no label, hint, or extra controls", async () => {
    const wb = await buildFixture();
    const rows = surveyRows(wb);
    const header = rows[0];
    const col = (h: string) => header.indexOf(h);

    // Everything ABOVE the cover row must be ODK metadata (invisible in the
    // KoboCollect UI) or the `grp_welcome` field-list wrapper. This is what
    // makes the home image a true full-page cover.
    const WRAPPER_NAMES = new Set(["grp_welcome", "grp_welcome_end"]);
    const firstVisibleIdx = rows
      .slice(1)
      .findIndex((r) => {
        const t = String(r[col("type")] ?? "").trim();
        const n = String(r[col("name")] ?? "").trim();
        if (!t || META_TYPES.has(t)) return false;
        if ((t === "begin_group" || t === "end_group") && WRAPPER_NAMES.has(n)) return false;
        return true;
      });
    expect(firstVisibleIdx).toBeGreaterThanOrEqual(0);

    const preRows = rows.slice(1, 1 + firstVisibleIdx);
    for (const r of preRows) {
      const t = String(r[col("type")] ?? "").trim();
      const n = String(r[col("name")] ?? "").trim();
      const isMeta = META_TYPES.has(t);
      const isWrapper = (t === "begin_group" || t === "end_group") && WRAPPER_NAMES.has(n);
      expect(isMeta || isWrapper).toBe(true);
    }


    const cover = rows[1 + firstVisibleIdx];
    expect(String(cover[col("type")])).toBe("note");
    expect(String(cover[col("name")])).toBe("welcome_cover_note");
    expect(String(cover[col("image")])).toBe("home");
    expect(String(cover[col("appearance")])).toMatch(/no-label/);
    expect(String(cover[col("label")]).trim()).toBe("");
    expect(String(cover[col("hint")]).trim()).toBe("");
    // No calculation / relevance / constraint on the cover — it must render unconditionally.
    for (const forbidden of ["relevant", "constraint", "calculation", "choice_filter", "required"]) {
      expect(String(cover[col(forbidden)] ?? "").trim()).toBe("");
    }
  });

  it("runtime guard passes on a freshly built workbook", async () => {
    const wb = await buildFixture();
    expect(() => assertCoverPageIsHomeImageOnly(wb)).not.toThrow();
  });

  it("runtime guard rejects a workbook whose cover row lost its image", async () => {
    const wb = await buildFixture();
    const sheet = wb.Sheets["survey"];
    const rows = surveyRows(wb);
    const iImage = rows[0].indexOf("image");
    const coverIdx = rows.findIndex((r, i) => i > 0 && r[rows[0].indexOf("name")] === "welcome_cover_note");
    rows[coverIdx][iImage] = "";
    wb.Sheets["survey"] = XLSX.utils.aoa_to_sheet(rows);
    expect(() => assertCoverPageIsHomeImageOnly(wb)).toThrow(/image must be "home"/);
  });

  it("runtime guard rejects a workbook whose cover row gained a hint", async () => {
    const wb = await buildFixture();
    const rows = surveyRows(wb);
    const iHint = rows[0].indexOf("hint");
    const coverIdx = rows.findIndex((r, i) => i > 0 && r[rows[0].indexOf("name")] === "welcome_cover_note");
    rows[coverIdx][iHint] = "unexpected hint";
    wb.Sheets["survey"] = XLSX.utils.aoa_to_sheet(rows);
    expect(() => assertCoverPageIsHomeImageOnly(wb)).toThrow(/no hint/);
  });

  it("runtime guard rejects a workbook whose cover was preceded by a visible control", async () => {
    const wb = await buildFixture();
    const rows = surveyRows(wb);
    const injected = rows[0].map(() => "");
    injected[rows[0].indexOf("type")] = "text";
    injected[rows[0].indexOf("name")] = "sneaky_input";
    injected[rows[0].indexOf("label")] = "Should not appear on cover";
    rows.splice(1, 0, injected);
    wb.Sheets["survey"] = XLSX.utils.aoa_to_sheet(rows);
    expect(() => assertCoverPageIsHomeImageOnly(wb)).toThrow(/first visible row must be a note/);
  });
});

describe("hint interpolation sanitizer", () => {
  it("strips ${position(..)} and other XPath expressions from hint text", () => {
    expect(sanitizeInterpolations("Community #${position(..)}")).toBe("Community #");
    expect(sanitizeInterpolations("Row ${.}")).toBe("Row ");
    expect(sanitizeInterpolations("Total: ${count(../x)}")).toBe("Total: ");
  });

  it("preserves valid ${question_name} interpolations", () => {
    expect(sanitizeInterpolations("Hello ${ward}!")).toBe("Hello ${ward}!");
    expect(sanitizeInterpolations("${flhf_lat_grid3}, ${flhf_lng_grid3}"))
      .toBe("${flhf_lat_grid3}, ${flhf_lng_grid3}");
  });
});

describe("cover-page .xlsx structure snapshot", () => {
  // Freezes the cover-related contract: survey header shape, metadata rows
  // that precede the cover, and the cover row itself. Any future change to the
  // XLSForm schema affecting the cover will fail this snapshot and force a
  // deliberate `-u` update — surfacing schema drift early.
  it("matches the frozen cover-region snapshot", async () => {
    const wb = await buildFixture();
    const rows = surveyRows(wb);
    const header = rows[0];
    const iType = header.indexOf("type");
    const iName = header.indexOf("name");
    const coverIdx = rows.findIndex(
      (r, i) => i > 0 && r[iName] === "welcome_cover_note",
    );
    const preRows = rows.slice(1, coverIdx).map((r) => ({
      type: String(r[iType] ?? ""),
      name: String(r[iName] ?? ""),
    }));
    const coverRow = Object.fromEntries(
      header.map((h, i) => [h, String(rows[coverIdx][i] ?? "")]),
    );

    expect({
      sheetNames: wb.SheetNames,
      surveyHeader: header,
      preCoverMetaRows: preRows,
      coverRow,
    }).toMatchInlineSnapshot(`
      {
        "coverRow": {
          "appearance": "w100 no-label",
          "calculation": "",
          "choice_filter": "",
          "constraint": "",
          "constraint_message": "",
          "default": "",
          "hint": "",
          "image": "home",
          "label": " ",
          "name": "welcome_cover_note",
          "relevant": "",
          "repeat_count": "",
          "required": "",
          "required_message": "",
          "type": "note",
        },
        "preCoverMetaRows": [
          {
            "name": "start",
            "type": "start",
          },
          {
            "name": "end",
            "type": "end",
          },
          {
            "name": "today",
            "type": "today",
          },
          {
            "name": "deviceid",
            "type": "deviceid",
          },
          {
            "name": "username",
            "type": "username",
          },
          {
            "name": "phonenumber",
            "type": "phonenumber",
          },
          {
            "name": "grp_welcome",
            "type": "begin_group",
          },
        ],
        "sheetNames": [
          "survey",
          "choices",
          "settings",
        ],
        "surveyHeader": [
          "type",
          "name",
          "label",
          "hint",
          "required",
          "required_message",
          "relevant",
          "constraint",
          "constraint_message",
          "calculation",
          "choice_filter",
          "appearance",
          "default",
          "image",
          "repeat_count",
        ],
      }
    `);
  });
});
