/**
 * Complete project data workbook — WHO / Nigeria NTD Programme presentation
 * standard. Colourful, print-ready and self-describing: cover & method, the
 * full community register, LGA and Ward rollups, age & disability
 * disaggregation and a data-quality sheet.
 */
import ExcelJS from "exceljs";
import { DISABILITY_TYPES, pwdTotalFor } from "./disabilityTypes";
import { effectiveDistanceKm, withRecomputedDistances } from "./distance";
import { geoKey } from "./geoCounts";

const WHO_DARK = "FF002E5D";
const WHO_BLUE = "FF0093D5";
const BAND = "FFEAF6FC";
const GREEN = "FF00A85A";
const AMBER = "FFF5A623";
const RED = "FFD64545";
const PURPLE = "FF7B4FBF";

const NUM = "#,##0";
const DEC = "#,##0.0";

const n = (v: unknown) => (Number(v) || 0);

export interface ProjectDataRow extends Record<string, unknown> {
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
  community_name?: string | null;
  settlement_name?: string | null;
}

export interface ProjectDataMeta {
  project: string;
  scope: string;
  campaign?: string;
  exclusions?: { level: "LGA" | "Ward"; state: string; lga: string; ward?: string }[];
}

function titleBlock(ws: ExcelJS.Worksheet, title: string, subtitle: string, span: number) {
  ws.mergeCells(1, 1, 1, span);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: "Arial", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHO_DARK } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, span);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: "Arial", size: 9, italic: true, color: { argb: "FFFFFFFF" } };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHO_BLUE } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 20;
}

function headerRow(ws: ExcelJS.Worksheet, rowIdx: number, labels: string[], fill = WHO_BLUE) {
  const row = ws.getRow(rowIdx);
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1);
    c.value = l;
    c.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });
  row.height = 30;
  ws.views = [{ state: "frozen", ySplit: rowIdx }];
  ws.autoFilter = { from: { row: rowIdx, column: 1 }, to: { row: rowIdx, column: labels.length } };
}

function styleBody(ws: ExcelJS.Worksheet, firstRow: number, lastRow: number, cols: number) {
  for (let r = firstRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Arial", size: 9 };
      cell.border = {
        top: { style: "hair", color: { argb: "FFCCCCCC" } },
        bottom: { style: "hair", color: { argb: "FFCCCCCC" } },
        left: { style: "hair", color: { argb: "FFCCCCCC" } },
        right: { style: "hair", color: { argb: "FFCCCCCC" } },
      };
      if ((r - firstRow) % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
    }
  }
}

function totalRow(ws: ExcelJS.Worksheet, rowIdx: number, values: (string | number)[], fill = WHO_DARK) {
  const row = ws.getRow(rowIdx);
  values.forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v as any;
    c.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    if (typeof v === "number") c.numFmt = NUM;
    c.border = { top: { style: "medium" } };
  });
  row.height = 20;
}

/* ── aggregation ─────────────────────────────────────────────────────── */

export interface AggRow {
  key: string;
  state: string;
  lga: string;
  ward?: string;
  records: number;
  wards: number;
  flhfs: number;
  communities: number;
  settlements: number;
  households: number;
  population: number;
  age0_4: number;
  age5_14: number;
  age15p: number;
  pwd: number;
  avgDistanceKm: number | null;
}

interface Bucket {
  state: string; lga: string; ward?: string;
  wards: Set<string>; flhfs: Set<string>; communities: Set<string>; settlements: Set<string>;
  records: number; households: number; population: number;
  age0_4: number; age5_14: number; age15p: number; pwd: number;
  dist: number[];
}

const emptyBucket = (state: string, lga: string, ward?: string): Bucket => ({
  state, lga, ward,
  wards: new Set(), flhfs: new Set(), communities: new Set(), settlements: new Set(),
  records: 0, households: 0, population: 0, age0_4: 0, age5_14: 0, age15p: 0, pwd: 0, dist: [],
});

const finalise = (key: string, b: Bucket): AggRow => ({
  key,
  state: b.state,
  lga: b.lga,
  ward: b.ward,
  records: b.records,
  wards: b.wards.size,
  flhfs: b.flhfs.size,
  communities: b.communities.size,
  settlements: b.settlements.size,
  households: b.households,
  population: b.population,
  age0_4: b.age0_4,
  age5_14: b.age5_14,
  age15p: b.age15p,
  pwd: b.pwd,
  avgDistanceKm: b.dist.length ? b.dist.reduce((s, d) => s + d, 0) / b.dist.length : null,
});

/** Per-LGA and per-Ward rollups computed with the dashboard's composite keys. */
export function buildProjectAggregates(entries: ProjectDataRow[]) {
  const lgaMap = new Map<string, Bucket>();
  const wardMap = new Map<string, Bucket>();

  for (const e of entries || []) {
    const s = geoKey(e?.state);
    const l = geoKey(e?.lga);
    const w = geoKey(e?.ward);
    const f = geoKey((e as any)?.flhf_name);
    const c = geoKey((e as any)?.community_name);
    const st = geoKey((e as any)?.settlement_name);
    const lKey = `${s}||${l}`;
    const wKey = `${s}||${l}||${w}`;

    const push = (map: Map<string, Bucket>, key: string, mk: () => Bucket) => {
      if (!map.has(key)) map.set(key, mk());
      const b = map.get(key)!;
      if (w) b.wards.add(w);
      if (f) b.flhfs.add(`${w}||${f}`);
      if (c) b.communities.add(`${w}||${f}||${c}`);
      if (st) b.settlements.add(`${w}||${f}||${c}||${st}`);
      b.records += 1;
      b.households += n((e as any).number_of_households);
      b.population += n((e as any).estimated_total_population);
      b.age0_4 += n((e as any).estimated_children_0_4);
      b.age5_14 += n((e as any).estimated_children_5_14);
      b.age15p += n((e as any).estimated_adults_15_plus);
      b.pwd += pwdTotalFor(e as any);
      const d = effectiveDistanceKm(e as any);
      if (typeof d === "number" && Number.isFinite(d)) b.dist.push(d);
    };

    if (l) push(lgaMap, lKey, () => emptyBucket(String(e?.state ?? "").trim(), String(e?.lga ?? "").trim()));
    if (l && w) push(wardMap, wKey, () => emptyBucket(String(e?.state ?? "").trim(), String(e?.lga ?? "").trim(), String(e?.ward ?? "").trim()));
  }

  const byName = (a: AggRow, b: AggRow) =>
    a.state.localeCompare(b.state) || a.lga.localeCompare(b.lga) || (a.ward ?? "").localeCompare(b.ward ?? "");

  const lgas = Array.from(lgaMap, ([k, b]) => finalise(k, b)).sort(byName);
  const wards = Array.from(wardMap, ([k, b]) => finalise(k, b)).sort(byName);

  const totals = lgas.reduce(
    (t, r) => ({
      records: t.records + r.records,
      wards: t.wards + r.wards,
      flhfs: t.flhfs + r.flhfs,
      communities: t.communities + r.communities,
      settlements: t.settlements + r.settlements,
      households: t.households + r.households,
      population: t.population + r.population,
      age0_4: t.age0_4 + r.age0_4,
      age5_14: t.age5_14 + r.age5_14,
      age15p: t.age15p + r.age15p,
      pwd: t.pwd + r.pwd,
    }),
    { records: 0, wards: 0, flhfs: 0, communities: 0, settlements: 0, households: 0, population: 0, age0_4: 0, age5_14: 0, age15p: 0, pwd: 0 },
  );

  return { lgas, wards, totals };
}

/* ── workbook ────────────────────────────────────────────────────────── */

const LABEL = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const HIDDEN = new Set(["user_id", "project_id", "created_by", "updated_by", "idempotency_key"]);

export async function exportProjectDataWorkbook(entries: ProjectDataRow[], meta: ProjectDataMeta) {
  const rows = (entries || []).map((r) => withRecomputedDistances(r as any));
  const { lgas, wards, totals } = buildProjectAggregates(rows as ProjectDataRow[]);
  const stamp = new Date().toLocaleString();
  const subtitle = `${meta.project} · ${meta.scope}${meta.campaign ? ` · ${meta.campaign}` : ""} · Generated ${stamp}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Amehnities — NTD Geo Microplanning";
  wb.created = new Date();

  /* Cover & Method */
  const cover = wb.addWorksheet("Cover & Method", { properties: { tabColor: { argb: WHO_DARK } } });
  cover.columns = [{ width: 42 }, { width: 78 }];
  titleBlock(cover, "Complete Project Data — NTD Geo Microplanning Register", subtitle, 2);
  const facts: [string, string | number][] = [
    ["Project", meta.project],
    ["Reporting scope", meta.scope],
    ["Campaign type", meta.campaign || "All campaigns"],
    ["Programme standard", "WHO PC-NTD guidance & Nigeria NTD Programme MDA microplanning norms"],
    ["Geography counting rule", "Blank-excluding composite keys (State ‖ LGA ‖ Ward ‖ Facility ‖ Community ‖ Settlement)"],
    ["Age disaggregation", "0–4 years, 5–14 years, 15+ years as captured in the microplan"],
    ["Disability disaggregation", DISABILITY_TYPES.map((d) => d.label).join(", ")],
    ["Distance metric", "Haversine great-circle distance, recomputed from current GPS at export time"],
    ["Records exported", rows.length],
    ["States", new Set(lgas.map((r) => geoKey(r.state)).filter(Boolean)).size],
    ["LGAs", lgas.length],
    ["Wards", totals.wards],
    ["Health facilities", totals.flhfs],
    ["Communities", totals.communities],
    ["Settlements", totals.settlements],
    ["Households", totals.households],
    ["Total estimated population", totals.population],
    ["Persons with disability", totals.pwd],
    ["Archived geographies excluded", meta.exclusions?.length ?? 0],
    ["Generated", stamp],
  ];
  let r = 4;
  for (const [k, v] of facts) {
    const a = cover.getCell(r, 1);
    const b = cover.getCell(r, 2);
    a.value = k;
    a.font = { name: "Arial", size: 10, bold: true, color: { argb: WHO_DARK } };
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
    b.value = v as any;
    b.font = { name: "Arial", size: 10 };
    if (typeof v === "number") b.numFmt = NUM;
    for (const cell of [a, b]) cell.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
    r += 1;
  }
  if (meta.exclusions?.length) {
    r += 1;
    const h = cover.getCell(r, 1);
    h.value = "Archived (excluded) geographies";
    h.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBER } };
    r += 1;
    for (const x of meta.exclusions) {
      cover.getCell(r, 1).value = x.level;
      cover.getCell(r, 2).value = [x.state, x.lga, x.ward].filter(Boolean).join(" › ");
      r += 1;
    }
  }

  /* LGA Summary */
  const lgaHeaders = ["State", "LGA", "Records", "Wards", "Health Facilities", "Communities", "Settlements", "Households", "Total Population", "0–4 yrs", "5–14 yrs", "15+ yrs", "Persons with Disability", "Avg. Distance to FLHF (km)"];
  const lgaWs = wb.addWorksheet("LGA Summary", { properties: { tabColor: { argb: WHO_BLUE } } });
  lgaWs.columns = lgaHeaders.map((h, i) => ({ width: i < 2 ? 22 : Math.max(12, Math.min(24, h.length + 4)) }));
  titleBlock(lgaWs, "Coverage & Population Summary by LGA", subtitle, lgaHeaders.length);
  headerRow(lgaWs, 4, lgaHeaders);
  lgas.forEach((row, i) => {
    lgaWs.getRow(5 + i).values = [
      row.state, row.lga, row.records, row.wards, row.flhfs, row.communities, row.settlements,
      row.households, row.population, row.age0_4, row.age5_14, row.age15p, row.pwd,
      row.avgDistanceKm == null ? "" : Number(row.avgDistanceKm.toFixed(1)),
    ];
  });
  styleBody(lgaWs, 5, 4 + lgas.length, lgaHeaders.length);
  for (let i = 0; i < lgas.length; i++) {
    for (let c = 3; c <= lgaHeaders.length; c++) lgaWs.getRow(5 + i).getCell(c).numFmt = c === lgaHeaders.length ? DEC : NUM;
  }
  totalRow(lgaWs, 5 + lgas.length, [
    "TOTAL", "", totals.records, totals.wards, totals.flhfs, totals.communities, totals.settlements,
    totals.households, totals.population, totals.age0_4, totals.age5_14, totals.age15p, totals.pwd, "",
  ]);

  /* Ward Summary */
  const wardHeaders = ["State", "LGA", "Ward", "Records", "Health Facilities", "Communities", "Settlements", "Households", "Total Population", "0–4 yrs", "5–14 yrs", "15+ yrs", "Persons with Disability", "Avg. Distance to FLHF (km)"];
  const wardWs = wb.addWorksheet("Ward Summary", { properties: { tabColor: { argb: GREEN } } });
  wardWs.columns = wardHeaders.map((h, i) => ({ width: i < 3 ? 22 : Math.max(12, Math.min(24, h.length + 4)) }));
  titleBlock(wardWs, "Coverage & Population Summary by Ward", subtitle, wardHeaders.length);
  headerRow(wardWs, 4, wardHeaders, GREEN);
  wards.forEach((row, i) => {
    wardWs.getRow(5 + i).values = [
      row.state, row.lga, row.ward, row.records, row.flhfs, row.communities, row.settlements,
      row.households, row.population, row.age0_4, row.age5_14, row.age15p, row.pwd,
      row.avgDistanceKm == null ? "" : Number(row.avgDistanceKm.toFixed(1)),
    ];
  });
  styleBody(wardWs, 5, 4 + wards.length, wardHeaders.length);
  for (let i = 0; i < wards.length; i++) {
    for (let c = 4; c <= wardHeaders.length; c++) wardWs.getRow(5 + i).getCell(c).numFmt = c === wardHeaders.length ? DEC : NUM;
  }
  totalRow(wardWs, 5 + wards.length, [
    "TOTAL", "", "", wards.reduce((s, x) => s + x.records, 0),
    wards.reduce((s, x) => s + x.flhfs, 0), wards.reduce((s, x) => s + x.communities, 0),
    wards.reduce((s, x) => s + x.settlements, 0), wards.reduce((s, x) => s + x.households, 0),
    wards.reduce((s, x) => s + x.population, 0), wards.reduce((s, x) => s + x.age0_4, 0),
    wards.reduce((s, x) => s + x.age5_14, 0), wards.reduce((s, x) => s + x.age15p, 0),
    wards.reduce((s, x) => s + x.pwd, 0), "",
  ], GREEN);

  /* Age & Disability disaggregation */
  const disHeaders = ["State", "LGA", "Ward", "Community / Settlement", "Total Population", "0–4 yrs", "5–14 yrs", "15+ yrs", ...DISABILITY_TYPES.map((d) => d.label), "Total PWD"];
  const disWs = wb.addWorksheet("Age & Disability", { properties: { tabColor: { argb: PURPLE } } });
  disWs.columns = disHeaders.map((h, i) => ({ width: i < 4 ? 24 : Math.max(12, Math.min(22, h.length + 3)) }));
  titleBlock(disWs, "Age & Disability Disaggregation — Inclusive MDA Planning", subtitle, disHeaders.length);
  headerRow(disWs, 4, disHeaders, PURPLE);
  rows.forEach((e: any, i) => {
    disWs.getRow(5 + i).values = [
      e.state ?? "", e.lga ?? "", e.ward ?? "",
      e.settlement_name || e.community_name || "",
      n(e.estimated_total_population), n(e.estimated_children_0_4), n(e.estimated_children_5_14), n(e.estimated_adults_15_plus),
      ...DISABILITY_TYPES.map((d) => n(e[d.field])),
      pwdTotalFor(e),
    ];
  });
  styleBody(disWs, 5, 4 + rows.length, disHeaders.length);
  for (let i = 0; i < rows.length; i++) {
    for (let c = 5; c <= disHeaders.length; c++) disWs.getRow(5 + i).getCell(c).numFmt = NUM;
  }

  /* Complete register — every captured field */
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, 1000)) {
    for (const k of Object.keys(row || {})) {
      if (HIDDEN.has(k) || k.startsWith("__") || seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  }
  const lead = ["state", "lga", "ward", "flhf_name", "community_name", "settlement_name"].filter((k) => seen.has(k));
  const ordered = [...lead, ...keys.filter((k) => !lead.includes(k))];
  const regHeaders = ordered.map(LABEL);
  const reg = wb.addWorksheet("Complete Register", { properties: { tabColor: { argb: AMBER } } });
  reg.columns = regHeaders.map((h) => ({ width: Math.max(14, Math.min(30, h.length + 4)) }));
  titleBlock(reg, "Complete Project Register — every captured microplan record", subtitle, regHeaders.length);
  headerRow(reg, 4, regHeaders, WHO_DARK);
  rows.forEach((e: any, i) => {
    reg.getRow(5 + i).values = ordered.map((k) => {
      const v = e?.[k];
      if (v == null) return "";
      return typeof v === "object" ? JSON.stringify(v) : (v as any);
    });
  });
  styleBody(reg, 5, 4 + rows.length, regHeaders.length);

  /* Data quality */
  const missing = (pred: (e: any) => boolean) => rows.filter(pred).length;
  const dq = wb.addWorksheet("Data Quality", { properties: { tabColor: { argb: RED } } });
  dq.columns = [{ width: 52 }, { width: 16 }, { width: 14 }];
  titleBlock(dq, "Data Quality & Completeness Checks", subtitle, 3);
  headerRow(dq, 4, ["Check", "Records affected", "% of total"], RED);
  const checks: [string, number][] = [
    ["Missing ward name", missing((e) => !geoKey(e.ward))],
    ["Missing health facility name", missing((e) => !geoKey(e.flhf_name))],
    ["Missing community and settlement name", missing((e) => !geoKey(e.community_name) && !geoKey(e.settlement_name))],
    ["Missing estimated total population", missing((e) => !n(e.estimated_total_population))],
    ["Missing household count", missing((e) => !n(e.number_of_households))],
    ["Households greater than estimated population", missing((e) => n(e.number_of_households) > n(e.estimated_total_population) && n(e.estimated_total_population) > 0)],
    ["Age bands do not sum to total population", missing((e) => {
      const tot = n(e.estimated_total_population);
      const sum = n(e.estimated_children_0_4) + n(e.estimated_children_5_14) + n(e.estimated_adults_15_plus);
      return tot > 0 && sum > 0 && Math.abs(sum - tot) > 1;
    })],
    ["No GPS coordinates for community or settlement", missing((e) => !e.community_latitude && !e.settlement_latitude)],
    ["No computable distance to health facility", missing((e) => effectiveDistanceKm(e) == null)],
  ];
  checks.forEach(([label, count], i) => {
    const row = dq.getRow(5 + i);
    row.values = [label, count, rows.length ? count / rows.length : 0];
    row.getCell(2).numFmt = NUM;
    row.getCell(3).numFmt = "0.0%";
    const tone = count === 0 ? GREEN : count / Math.max(1, rows.length) > 0.1 ? RED : AMBER;
    row.getCell(2).font = { name: "Arial", size: 9, bold: true, color: { argb: tone } };
  });
  styleBody(dq, 5, 4 + checks.length, 3);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "Project";
  const fileName = `NTD-Microplan-Complete-Data-${slug(meta.project)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return fileName;
}
