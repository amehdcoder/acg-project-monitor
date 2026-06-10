// Bulk account-creation template. Exports a beautifully branded Excel template
// (Nigerian coat of arms, Amehnities icon, HANDS logo) and parses a filled
// template back into account rows for bulk creation.

import ExcelJS from "exceljs";
import fgnEmblem from "@/assets/fgn-emblem.png";
import handsEmblem from "@/assets/hands-emblem.png";
import amehIconAsset from "@/assets/amehnities-icon.png.asset.json";

const amehIcon = amehIconAsset.url;

export interface DesignationOption {
  value: string;
  label: string;
}

export interface AccountRow {
  first_name: string;
  last_name: string;
  email: string;
  designation: string;
  designation_label: string;
}

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch {
    return null;
  }
}

/** Build and download the branded account-creation template. */
export async function exportAccountTemplate(designations: DesignationOption[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities";
  wb.created = new Date();

  const ws = wb.addWorksheet("New Accounts", {
    views: [{ state: "frozen", ySplit: 6 }],
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = [
    { key: "first_name", width: 26 },
    { key: "last_name", width: 26 },
    { key: "email", width: 40 },
    { key: "designation", width: 38 },
  ];

  // ---- Branded header band ----
  ws.mergeCells("A1:D4");
  const band = ws.getCell("A1");
  band.value = "AMEHNITIES\nBulk Account Creation Template";
  band.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  band.font = { name: "Calibri", bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  band.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  for (let r = 1; r <= 4; r++) ws.getRow(r).height = 24;

  // ---- Logos ----
  const [fgn, hands, ameh] = await Promise.all([
    fetchImageBase64(fgnEmblem),
    fetchImageBase64(handsEmblem),
    fetchImageBase64(amehIcon),
  ]);
  const addLogo = (b64: string | null, col: number) => {
    if (!b64) return;
    const id = wb.addImage({ base64: b64, extension: "png" });
    ws.addImage(id, {
      tl: { col: col + 0.15, row: 0.2 },
      ext: { width: 64, height: 64 },
      editAs: "oneCell",
    });
  };
  // Nigerian coat of arms (left), Amehnities icon + HANDS logo (right).
  addLogo(fgn, 0);
  addLogo(ameh, 3.05);
  addLogo(hands, 3.55);

  // ---- Instruction row ----
  ws.mergeCells("A5:D5");
  const note = ws.getCell("A5");
  note.value =
    "Fill one row per person. Select a Designation from the dropdown. Email must be valid. Do not edit the header row below.";
  note.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  note.font = { italic: true, size: 11, color: { argb: "FF374151" } };
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4F1" } };
  ws.getRow(5).height = 26;

  // ---- Column headers (row 6) ----
  const headers = ["First Name", "Last Name", "Email Address", "Designation"];
  const headerRow = ws.getRow(6);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB45309" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF92400E" } },
      bottom: { style: "thin", color: { argb: "FF92400E" } },
    };
  });
  headerRow.height = 24;

  // ---- Data rows with validation + zebra striping ----
  const labelList = designations.map((d) => d.label);
  const listFormula = `"${labelList.join(",").slice(0, 250)}"`;
  for (let r = 7; r <= 506; r++) {
    const row = ws.getRow(r);
    if ((r - 7) % 2 === 1) {
      for (let c = 1; c <= 4; c++) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    }
    // Designation dropdown
    ws.getCell(`D${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: [listFormula],
    };
    // Email format hint via custom validation prompt
    ws.getCell(`C${r}`).dataValidation = {
      type: "custom",
      allowBlank: true,
      formulae: [`ISNUMBER(MATCH("*@*.*",C${r},0))`],
      showInputMessage: true,
      promptTitle: "Email",
      prompt: "Enter a valid email address (e.g. name@example.com).",
    };
    for (let c = 1; c <= 4; c++) {
      row.getCell(c).border = { bottom: { style: "hair", color: { argb: "FFE5E7EB" } } };
    }
  }

  // ---- Reference sheet listing valid designations ----
  const ref = wb.addWorksheet("Designations");
  ref.columns = [
    { header: "Designation Label", key: "label", width: 40 },
    { header: "Code", key: "value", width: 36 },
  ];
  const refHead = ref.getRow(1);
  refHead.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  designations.forEach((d) => ref.addRow({ label: d.label, value: d.value }));

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Amehnities_Account_Creation_Template.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse a filled template into account rows. */
export async function importAccountTemplate(
  file: File,
  designations: DesignationOption[],
): Promise<{ rows: AccountRow[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("New Accounts") ?? wb.worksheets[0];
  const errors: string[] = [];
  const rows: AccountRow[] = [];
  if (!ws) return { rows, errors: ["No worksheet found in the file."] };

  const byLabel = new Map<string, DesignationOption>();
  designations.forEach((d) => {
    byLabel.set(norm(d.label), d);
    byLabel.set(norm(d.value), d);
  });

  // Find the header row (the one containing "First Name").
  let headerRowNum = 6;
  ws.eachRow((row, n) => {
    const first = String(row.getCell(1).value ?? "");
    if (norm(first) === "firstname") headerRowNum = n;
  });

  const cellText = (v: any): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") {
      if ("text" in v) return String((v as any).text);
      if ("result" in v) return String((v as any).result);
      if ("richText" in v) return (v as any).richText.map((t: any) => t.text).join("");
    }
    return String(v);
  };

  for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const first = cellText(row.getCell(1).value).trim();
    const last = cellText(row.getCell(2).value).trim();
    const email = cellText(row.getCell(3).value).trim().toLowerCase();
    const desigRaw = cellText(row.getCell(4).value).trim();
    if (!first && !last && !email && !desigRaw) continue;

    const matched = byLabel.get(norm(desigRaw));
    rows.push({
      first_name: first,
      last_name: last,
      email,
      designation: matched?.value ?? "data_collector",
      designation_label: matched?.label ?? desigRaw,
    });
  }

  return { rows, errors };
}
