/**
 * Universal Kobo Analytics — fully editable WHO-standard dashboard model.
 *
 * A dashboard is a plain, serialisable list of widgets bound to fields of the
 * *inferred* Kobo schema. Because widgets reference field names (not indexes),
 * a dashboard survives schema drift: a widget whose field disappeared is simply
 * marked "unbound" and can be remapped in the editor.
 *
 * Everything is stored per connection in localStorage, so dashboards work
 * offline and are instantly restorable.
 */
import {
  getFlat, resolveValue, findRepeatArray,
  type HubField, type HubSchema,
} from "./schema";

export type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "").trim();

/* ------------------------------------------------------------- WHO theme */

/** Official WHO-family data palette (blue primary, categorical support set). */
export const WHO_PALETTE = [
  "#0093D5", "#00205C", "#6EC9E0", "#EE8300", "#8A1538",
  "#2E7D32", "#F2C14E", "#5A5A5A", "#9C27B0", "#00897B",
];

export const WHO_SEQUENTIAL = ["#D6ECF8", "#A6D8F0", "#6EC9E0", "#0093D5", "#005C99", "#00205C"];

export type WidgetKind =
  | "kpi" | "bar" | "column" | "pie" | "donut" | "line" | "area"
  | "stacked" | "table" | "treemap" | "text";

export type Agg = "count" | "sum" | "avg" | "min" | "max" | "distinct" | "pct";

export interface HubWidget {
  id: string;
  title: string;
  subtitle?: string;
  kind: WidgetKind;
  /** Dimension (category / x-axis). Empty for a raw KPI over all rows. */
  dimension?: string;
  /** Optional series split (stacked / grouped charts). */
  series?: string;
  /** Numeric field used by sum/avg/min/max. */
  measure?: string;
  agg: Agg;
  /** "parent" or a repeat block name — repeat sources are auto-flattened. */
  source: string;
  /** Grid width in 12-column units. */
  span: number;
  height: number;
  limit: number;
  colorIndex: number;
  showValues: boolean;
  sort: "desc" | "asc" | "alpha";
  /** Free markdown-ish note for narrative widgets. */
  body?: string;
}

export interface HubDashboard {
  connectionId: string;
  name: string;
  subtitle: string;
  widgets: HubWidget[];
  updatedAt: string;
}

const KEY = (id: string) => `amehnities.koboHub.dashboard:${id}`;

export const newWidgetId = () =>
  `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export function loadDashboard(connectionId: string): HubDashboard | null {
  try {
    const raw = localStorage.getItem(KEY(connectionId));
    return raw ? (JSON.parse(raw) as HubDashboard) : null;
  } catch { return null; }
}

export function saveDashboard(d: HubDashboard) {
  try {
    localStorage.setItem(KEY(d.connectionId), JSON.stringify({ ...d, updatedAt: new Date().toISOString() }));
  } catch { /* quota */ }
}

export function clearDashboard(connectionId: string) {
  try { localStorage.removeItem(KEY(connectionId)); } catch { /* ignore */ }
}

/* ------------------------------------------------------- auto-generation */

const NUMERIC = new Set(["integer", "decimal"]);
const CATEGORICAL = new Set(["select_one", "select_multiple", "boolean"]);

function widget(w: Partial<HubWidget>): HubWidget {
  return {
    id: newWidgetId(),
    title: "Untitled",
    kind: "bar",
    agg: "count",
    source: "parent",
    span: 4,
    height: 260,
    limit: 12,
    colorIndex: 0,
    showValues: true,
    sort: "desc",
    ...w,
  };
}

/**
 * Generate a sensible WHO-style starting dashboard from any inferred schema:
 * headline KPIs, a submission trend, geography breakdowns, categorical charts
 * for the most informative select questions and numeric indicator panels.
 */
export function autoDashboard(schema: HubSchema, connectionId: string, rows: Row[] = []): HubDashboard {
  const widgets: HubWidget[] = [];

  widgets.push(widget({
    title: "Total submissions", kind: "kpi", agg: "count", span: 3, height: 130, colorIndex: 0,
    subtitle: "All records synced from KoboToolbox",
  }));

  const geoOrder: (keyof HubSchema["geo"])[] = ["state", "lga", "ward", "community"];
  const geoPresent = geoOrder.filter((g) => schema.geo[g]);
  geoPresent.slice(0, 2).forEach((g, i) => {
    widgets.push(widget({
      title: `${g.toUpperCase()} coverage`, kind: "kpi", agg: "distinct",
      dimension: schema.geo[g], span: 3, height: 130, colorIndex: i + 1,
      subtitle: `Distinct ${g}s reached`,
    }));
  });

  const firstNumeric = schema.fields.find((f) => NUMERIC.has(f.type));
  if (firstNumeric) {
    widgets.push(widget({
      title: firstNumeric.label, kind: "kpi", agg: "sum", measure: firstNumeric.name,
      span: 3, height: 130, colorIndex: 3, subtitle: "Cumulative total",
    }));
  }

  widgets.push(widget({
    title: "Submission trend", kind: "line", agg: "count", dimension: "__date",
    span: 12, height: 280, limit: 90, colorIndex: 0, sort: "alpha",
    subtitle: "Daily reporting volume",
  }));

  geoPresent.slice(0, 2).forEach((g, i) => {
    widgets.push(widget({
      title: `Submissions by ${g}`, kind: "bar", agg: "count", dimension: schema.geo[g],
      span: 6, height: 320, limit: 15, colorIndex: i,
    }));
  });

  const cats = schema.fields
    .filter((f) => CATEGORICAL.has(f.type) && !Object.values(schema.geo).includes(f.name))
    .slice(0, 6);
  cats.forEach((f, i) => {
    widgets.push(widget({
      title: f.label, kind: i % 3 === 0 ? "donut" : "bar", agg: "count",
      dimension: f.name, span: 4, height: 300, limit: 10, colorIndex: i % WHO_PALETTE.length,
    }));
  });

  schema.fields.filter((f) => NUMERIC.has(f.type)).slice(0, 3).forEach((f, i) => {
    widgets.push(widget({
      title: `${f.label} — total by ${geoPresent[1] ?? geoPresent[0] ?? "response"}`,
      kind: "column", agg: "sum", measure: f.name,
      dimension: schema.geo[geoPresent[1] ?? geoPresent[0] ?? "state"] ?? undefined,
      span: 6, height: 300, limit: 12, colorIndex: (i + 4) % WHO_PALETTE.length,
    }));
  });

  schema.repeats.slice(0, 2).forEach((rep, i) => {
    const dim = rep.fields.find((f) => CATEGORICAL.has(f.type)) ?? rep.fields[0];
    widgets.push(widget({
      title: `${rep.label} — ${dim?.label ?? "records"}`, kind: "bar", agg: "count",
      dimension: dim?.name, source: rep.name, span: 6, height: 300, limit: 12,
      colorIndex: (i + 2) % WHO_PALETTE.length,
      subtitle: "Flattened repeat-group analysis",
    }));
  });

  return {
    connectionId,
    name: schema.title || "Kobo analytics dashboard",
    subtitle: "WHO-standard analytical view · auto-generated from the live form schema",
    widgets,
    updatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------- computing */

export interface WidgetDatum { name: string; value: number; pct: number }

export interface WidgetResult {
  data: WidgetDatum[];
  /** Series keys when a split dimension is used. */
  seriesKeys: string[];
  stacked: Record<string, unknown>[];
  kpi: number;
  total: number;
  unbound: boolean;
  n: number;
}

export const sourceRows = (rows: Row[], schema: HubSchema, source: string): Row[] => {
  if (!source || source === "parent") return rows;
  const block = schema.repeats.find((r) => r.name === source);
  if (!block) return [];
  const out: Row[] = [];
  for (const r of rows) {
    findRepeatArray(r, block.name).forEach((child: any, i: number) => {
      out.push({
        ...(child ?? {}),
        _submission_time: r._submission_time,
        _uuid: r._uuid,
        _id: r._id,
        __index: i + 1,
      });
    });
  }
  return out;
};

export function fieldOf(schema: HubSchema, name?: string): HubField | undefined {
  if (!name) return undefined;
  const all = [...schema.fields, ...schema.repeats.flatMap((r) => r.fields)];
  return all.find((f) => f.name === name) ?? all.find((f) => f.leaf === name.split("/").pop());
}

const dimValue = (schema: HubSchema, name: string | undefined, row: Row): string[] => {
  if (!name) return ["All"];
  if (name === "__date") return [s(row._submission_time).slice(0, 10) || "Unknown"];
  if (name === "__month") return [s(row._submission_time).slice(0, 7) || "Unknown"];
  const f = fieldOf(schema, name);
  const raw = getFlat(row, name);
  const val = f ? resolveValue(schema, f, raw) : s(raw);
  if (!val) return ["(blank)"];
  return f?.type === "select_multiple" ? val.split(", ").filter(Boolean) : [val];
};

function reduceAgg(agg: Agg, values: number[], hits: number, distinct: Set<string>): number {
  switch (agg) {
    case "sum": return values.reduce((a, b) => a + b, 0);
    case "avg": return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    case "min": return values.length ? Math.min(...values) : 0;
    case "max": return values.length ? Math.max(...values) : 0;
    case "distinct": return distinct.size;
    default: return hits;
  }
}

export function computeWidget(rows: Row[], schema: HubSchema, w: HubWidget): WidgetResult {
  const base = sourceRows(rows, schema, w.source);
  const needsField = !!w.dimension && w.dimension !== "__date" && w.dimension !== "__month";
  const unbound = needsField && !fieldOf(schema, w.dimension);

  const groups = new Map<string, { values: number[]; hits: number; distinct: Set<string> }>();
  const seriesSet = new Set<string>();
  const stackMap = new Map<string, Record<string, number>>();

  for (const r of base) {
    const num = w.measure ? Number(getFlat(r, w.measure)) : NaN;
    const keys = dimValue(schema, w.dimension, r);
    const serieses = w.series ? dimValue(schema, w.series, r) : [];
    for (const k of keys) {
      const g = groups.get(k) ?? { values: [], hits: 0, distinct: new Set<string>() };
      g.hits++;
      if (Number.isFinite(num)) g.values.push(num);
      g.distinct.add(k);
      groups.set(k, g);
      if (serieses.length) {
        const bucket = stackMap.get(k) ?? {};
        for (const sv of serieses) {
          seriesSet.add(sv);
          bucket[sv] = (bucket[sv] ?? 0) + (w.agg === "sum" && Number.isFinite(num) ? num : 1);
        }
        stackMap.set(k, bucket);
      }
    }
  }

  let data: WidgetDatum[] = [...groups.entries()].map(([name, g]) => ({
    name,
    value: reduceAgg(w.agg, g.values, g.hits, g.distinct),
    pct: 0,
  }));

  if (w.sort === "alpha") data.sort((a, b) => a.name.localeCompare(b.name));
  else if (w.sort === "asc") data.sort((a, b) => a.value - b.value);
  else data.sort((a, b) => b.value - a.value);

  const total = data.reduce((a, b) => a + b.value, 0);
  data = data.slice(0, Math.max(1, w.limit || 12)).map((d) => ({
    ...d, pct: total ? (d.value / total) * 100 : 0,
  }));

  // Overall KPI value
  const allValues: number[] = [];
  const allDistinct = new Set<string>();
  for (const r of base) {
    if (w.measure) { const n = Number(getFlat(r, w.measure)); if (Number.isFinite(n)) allValues.push(n); }
    if (w.dimension) dimValue(schema, w.dimension, r).forEach((k) => { if (k && k !== "(blank)") allDistinct.add(k); });
  }
  const kpi = w.agg === "count" ? base.length : reduceAgg(w.agg, allValues, base.length, allDistinct);

  const stacked = data.map((d) => ({ name: d.name, ...(stackMap.get(d.name) ?? {}) }));

  return {
    data, seriesKeys: [...seriesSet].slice(0, 12), stacked,
    kpi, total, unbound, n: base.length,
  };
}

/** Dimension options offered in the widget editor, including virtual fields. */
export function dimensionOptions(schema: HubSchema, source: string) {
  const list = source === "parent"
    ? schema.fields
    : (schema.repeats.find((r) => r.name === source)?.fields ?? []);
  return [
    { name: "__date", label: "Submission date (daily)" },
    { name: "__month", label: "Submission month" },
    ...list
      .filter((f) => !["geopoint", "geotrace", "note", "meta"].includes(f.type))
      .map((f) => ({ name: f.name, label: f.label || f.leaf })),
  ];
}

export function measureOptions(schema: HubSchema, source: string) {
  const list = source === "parent"
    ? schema.fields
    : (schema.repeats.find((r) => r.name === source)?.fields ?? []);
  return list.filter((f) => NUMERIC.has(f.type)).map((f) => ({ name: f.name, label: f.label || f.leaf }));
}

export const blankWidget = (): HubWidget => widget({ title: "New widget" });
