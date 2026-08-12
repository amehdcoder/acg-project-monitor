/**
 * Bulk CSV import/export for the medicine allocation matrix.
 *
 * Columns: Level, State, LGA, Ward, Medicine, Programme, Unit, Allocation
 * A "Level" of LGA ignores the Ward column; a Level of Ward targets one ward.
 */
import { geoNorm, type LgaNode } from "./geoAllocation";

export interface AllocationCsvRow {
  level: "LGA" | "Ward";
  state: string;
  lga: string;
  ward: string;
  medicine: string;
  unit: string;
  allocation: number;
}

export interface AllocationCsvParse {
  lgaTotals: Record<string, number>;
  wardTotals: Record<string, number>;
  medicine?: string;
  unit?: string;
  matched: number;
  errors: string[];
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cell = "", row: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function parseAllocationCsv(text: string, tree: LgaNode[]): AllocationCsvParse {
  const out: AllocationCsvParse = { lgaTotals: {}, wardTotals: {}, matched: 0, errors: [] };
  const rows = splitCsv(text);
  if (!rows.length) { out.errors.push("The file is empty."); return out; }

  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const cLevel = idx("level");
  const cState = idx("state");
  const cLga = idx("lga");
  const cWard = idx("ward");
  const cMed = idx("medicine", "medicine name");
  const cUnit = idx("unit");
  const cAlloc = idx("allocation", "total", "quantity", "units");

  if (cLga < 0 || cAlloc < 0) {
    out.errors.push('Required columns are missing. The file must contain at least "LGA" and "Allocation".');
    return out;
  }

  const lgaByName = new Map<string, LgaNode>();
  for (const L of tree) {
    lgaByName.set(geoNorm(L.lga), L);
    lgaByName.set(`${geoNorm(L.state)}|${geoNorm(L.lga)}`, L);
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const at = `Row ${i + 1}`;
    const lgaName = (r[cLga] ?? "").trim();
    const stateName = cState >= 0 ? (r[cState] ?? "").trim() : "";
    const wardName = cWard >= 0 ? (r[cWard] ?? "").trim() : "";
    const level = (cLevel >= 0 ? (r[cLevel] ?? "").trim().toLowerCase() : wardName ? "ward" : "lga");
    const amount = Math.max(0, Math.round(Number(String(r[cAlloc] ?? "").replace(/[, ]/g, "")) || 0));
    if (cMed >= 0 && !out.medicine && (r[cMed] ?? "").trim()) out.medicine = (r[cMed] ?? "").trim();
    if (cUnit >= 0 && !out.unit && (r[cUnit] ?? "").trim()) out.unit = (r[cUnit] ?? "").trim();

    if (!lgaName) { out.errors.push(`${at}: no LGA name.`); continue; }
    if (amount <= 0) { out.errors.push(`${at}: allocation for “${lgaName}” is not a positive number.`); continue; }

    const L = lgaByName.get(`${geoNorm(stateName)}|${geoNorm(lgaName)}`) ?? lgaByName.get(geoNorm(lgaName));
    if (!L) { out.errors.push(`${at}: LGA “${lgaName}” is not in the current microplan scope.`); continue; }

    if (level.startsWith("ward")) {
      if (!wardName) { out.errors.push(`${at}: level is Ward but no ward name was given.`); continue; }
      const W = L.wards.find((w) => geoNorm(w.ward) === geoNorm(wardName));
      if (!W) { out.errors.push(`${at}: ward “${wardName}” not found in ${L.lga}.`); continue; }
      out.wardTotals[W.key] = amount;
    } else {
      out.lgaTotals[L.key] = amount;
    }
    out.matched++;
  }
  return out;
}

export function downloadAllocationCsvTemplate(tree: LgaNode[], medicine: string, unit: string) {
  const lines = ["Level,State,LGA,Ward,Medicine,Unit,Allocation"];
  const esc = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  for (const L of tree) {
    lines.push(["LGA", L.state, L.lga, "", medicine, unit, ""].map((v) => esc(String(v))).join(","));
    for (const w of L.wards) {
      lines.push(["Ward", L.state, L.lga, w.ward, medicine, unit, ""].map((v) => esc(String(v))).join(","));
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `medicine-allocation-template-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
