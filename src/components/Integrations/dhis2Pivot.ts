// Turns a DHIS2 analytics response into pivot matrices and chart series.
export type Analytics = {
  headers: { name: string; column: string }[];
  rows: string[][];
  items: Record<string, string>;
  dimensions: Record<string, string[]>;
};

export const DIM_LABEL: Record<string, string> = { dx: "Data", pe: "Period", ou: "Org unit", co: "Disaggregation" };
export const dimLabel = (a: Analytics, d: string) => DIM_LABEL[d] ?? a.items[d] ?? a.headers.find((h) => h.name === d)?.column ?? d;
export const nameOf = (a: Analytics, id: string) => a.items[id] ?? id;

export function dataDims(a: Analytics) {
  return a.headers.map((h) => h.name).filter((n) => !["value", "numerator", "denominator", "factor", "multiplier", "divisor"].includes(n));
}

/** Ordered unique ids for a dimension, following DHIS2 metadata order. */
function orderOf(a: Analytics, dim: string, idx: number) {
  const present = new Set(a.rows.map((r) => r[idx]));
  const meta = (a.dimensions[dim] ?? []).filter((id) => present.has(id));
  const rest = [...present].filter((id) => !meta.includes(id));
  return [...meta, ...rest];
}

export type Pivot = {
  rowKeys: string[][]; colKeys: string[][];
  cell: (r: string[], c: string[]) => number | null;
  rowTotal: (r: string[]) => number; colTotal: (c: string[]) => number; grand: number;
};

function combos(lists: string[][]): string[][] {
  return lists.reduce<string[][]>((acc, l) => acc.flatMap((a) => l.map((x) => [...a, x])), [[]]);
}

export function pivot(a: Analytics, rowDims: string[], colDims: string[]): Pivot {
  const hi = (d: string) => a.headers.findIndex((h) => h.name === d);
  const vi = hi("value");
  const map = new Map<string, number>();
  const rowT = new Map<string, number>(); const colT = new Map<string, number>();
  let grand = 0;
  for (const r of a.rows) {
    const v = Number(r[vi]); if (!Number.isFinite(v)) continue;
    const rk = rowDims.map((d) => r[hi(d)]).join("|"); const ck = colDims.map((d) => r[hi(d)]).join("|");
    map.set(`${rk}#${ck}`, (map.get(`${rk}#${ck}`) ?? 0) + v);
    rowT.set(rk, (rowT.get(rk) ?? 0) + v); colT.set(ck, (colT.get(ck) ?? 0) + v); grand += v;
  }
  const keep = (keys: string[][], t: Map<string, number>) => keys.filter((k) => t.has(k.join("|")));
  return {
    rowKeys: keep(combos(rowDims.map((d) => orderOf(a, d, hi(d)))), rowT),
    colKeys: keep(combos(colDims.map((d) => orderOf(a, d, hi(d)))), colT),
    cell: (r, c) => map.get(`${r.join("|")}#${c.join("|")}`) ?? null,
    rowTotal: (r) => rowT.get(r.join("|")) ?? 0,
    colTotal: (c) => colT.get(c.join("|")) ?? 0,
    grand,
  };
}

export const fmt = (v: number | null | undefined) =>
  v == null ? "" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10);

export const DHIS2_COLORS = ["#a8bf24", "#518cc3", "#d74554", "#ff9e21", "#968f8f", "#ba3ba1", "#ffda54", "#45e7a6", "#dd8c6d", "#3c3c3c", "#cb4d4d", "#b1d3e0"];
