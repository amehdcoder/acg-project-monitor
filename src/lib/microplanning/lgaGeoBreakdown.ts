import * as XLSX from "xlsx";
import { geoKey } from "./geoCounts";

export interface LgaBreakdownRow {
  state: string;
  lga: string;
  wards: number;
  flhfs: number;
  communities: number;
  settlements: number;
  records: number;
  population: number;
}

export interface LgaBreakdownResult {
  rows: LgaBreakdownRow[];
  totals: Omit<LgaBreakdownRow, "state" | "lga">;
}

/**
 * Unique Wards / Health Facilities / Communities / Settlements per LGA.
 * Uses the same blank-excluding composite keys as the dashboard KPIs so the
 * numbers can never drift from the rest of the page.
 */
export function buildLgaBreakdown(entries: any[]): LgaBreakdownResult {
  const map = new Map<
    string,
    {
      state: string; lga: string;
      wards: Set<string>; flhfs: Set<string>; communities: Set<string>; settlements: Set<string>;
      records: number; population: number;
    }
  >();

  for (const e of entries || []) {
    const s = geoKey(e?.state);
    const l = geoKey(e?.lga);
    if (!l) continue;
    const key = `${s}||${l}`;
    if (!map.has(key)) {
      map.set(key, {
        state: String(e?.state ?? "").trim(),
        lga: String(e?.lga ?? "").trim(),
        wards: new Set(), flhfs: new Set(), communities: new Set(), settlements: new Set(),
        records: 0, population: 0,
      });
    }
    const b = map.get(key)!;
    const w = geoKey(e?.ward);
    const f = geoKey(e?.flhf_name);
    const c = geoKey(e?.community_name);
    const st = geoKey(e?.settlement_name);
    if (w) b.wards.add(w);
    if (f) b.flhfs.add(`${w}||${f}`);
    if (c) b.communities.add(`${w}||${f}||${c}`);
    if (st) b.settlements.add(`${w}||${f}||${c}||${st}`);
    b.records += 1;
    b.population += Number(e?.estimated_total_population) || 0;
  }

  const rows: LgaBreakdownRow[] = Array.from(map.values())
    .map((b) => ({
      state: b.state,
      lga: b.lga,
      wards: b.wards.size,
      flhfs: b.flhfs.size,
      communities: b.communities.size,
      settlements: b.settlements.size,
      records: b.records,
      population: b.population,
    }))
    .sort((a, b) => a.state.localeCompare(b.state) || a.lga.localeCompare(b.lga));

  const totals = rows.reduce(
    (t, r) => ({
      wards: t.wards + r.wards,
      flhfs: t.flhfs + r.flhfs,
      communities: t.communities + r.communities,
      settlements: t.settlements + r.settlements,
      records: t.records + r.records,
      population: t.population + r.population,
    }),
    { wards: 0, flhfs: 0, communities: 0, settlements: 0, records: 0, population: 0 },
  );

  return { rows, totals };
}

/** Professional single-sheet Excel export of the per-LGA geography breakdown. */
export function exportLgaBreakdown(result: LgaBreakdownResult, scopeLabel = "All data"): string {
  const header = [
    "State", "LGA", "Unique Wards", "Unique Health Facilities",
    "Unique Communities", "Unique Settlements", "Records", "Estimated Population",
  ];
  const body = result.rows.map((r) => [
    r.state, r.lga, r.wards, r.flhfs, r.communities, r.settlements, r.records, r.population,
  ]);
  const t = result.totals;

  const aoa = [
    ["Geo Microplanning — Geography Coverage per LGA"],
    ["Generated", new Date().toLocaleString()],
    ["Scope", scopeLabel],
    [],
    header,
    ...body,
    ["TOTAL", "", t.wards, t.flhfs, t.communities, t.settlements, t.records, t.population],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 20 }];
  ws["!freeze"] = { xSplit: 0, ySplit: 5 };
  const ref = XLSX.utils.decode_range(ws["!ref"] as string);
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: ref.e.r - 1, c: header.length - 1 } }),
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Geography per LGA");
  const fileName = `Microplan-Geography-per-LGA-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}
