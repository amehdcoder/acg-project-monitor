// Aggregation engine for the Dashboard Studio.
// Turns raw source rows + a widget spec into chart-ready data.

export type Aggregation = "count" | "sum" | "avg" | "min" | "max" | "count_distinct";

export interface StudioWidgetStyle {
  palette?: string[];
  showLegend?: boolean;
  legendPosition?: "top" | "bottom" | "right" | "left";
  showGrid?: boolean;
  showDataLabels?: boolean;
  xAxisTitle?: string;
  yAxisTitle?: string;
  numberFormat?: "plain" | "comma" | "percent" | "currency";
  decimals?: number;
  fontFamily?: string;
  background?: string;
  borderColor?: string;
  borderRadius?: number;
  stacked?: boolean;
  smooth?: boolean;
  donut?: boolean;
  sortDir?: "asc" | "desc" | "none";
  limit?: number;
}

export type StudioChartType =
  | "bar"
  | "column"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "scorecard"
  | "combo"
  | "scatter"
  | "radar"
  | "table"
  | "pivot"
  | "gauge"
  | "treemap"
  | "text";

export interface StudioWidgetConfig {
  dataSourceId?: string;
  chartType?: StudioChartType;
  dimension?: string; // groupBy field id
  metric?: string; // value field id (for sum/avg...)
  aggregation?: Aggregation;
  secondaryMetric?: string;
  secondaryAggregation?: Aggregation;
  filters?: { field: string; op: string; value: string }[];
  style?: StudioWidgetStyle;
  textContent?: string;
  kpiTarget?: number;
  compareField?: string; // for scatter y
}

export const DEFAULT_PALETTE = [
  "#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4",
  "#8b5cf6", "#ef4444", "#14b8a6", "#eab308", "#3b82f6",
];

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function applyFilters(
  rows: Record<string, unknown>[],
  filters?: StudioWidgetConfig["filters"],
): Record<string, unknown>[] {
  if (!filters || filters.length === 0) return rows;
  return rows.filter((r) =>
    filters.every((f) => {
      if (!f.field) return true;
      const cell = String(r[f.field] ?? "").toLowerCase();
      const val = String(f.value ?? "").toLowerCase();
      switch (f.op) {
        case "eq": return cell === val;
        case "neq": return cell !== val;
        case "contains": return cell.includes(val);
        case "gt": return toNum(r[f.field]) > toNum(f.value);
        case "lt": return toNum(r[f.field]) < toNum(f.value);
        default: return true;
      }
    }),
  );
}

function aggregateValues(values: unknown[], agg: Aggregation): number {
  const nums = values.map(toNum);
  switch (agg) {
    case "count": return values.length;
    case "count_distinct": return new Set(values.map((v) => String(v))).size;
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "avg": return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case "min": return nums.length ? Math.min(...nums) : 0;
    case "max": return nums.length ? Math.max(...nums) : 0;
    default: return values.length;
  }
}

export interface AggPoint {
  name: string;
  value: number;
  value2?: number;
  [k: string]: unknown;
}

/** Group rows by dimension and aggregate metric(s). */
export function aggregateChart(
  rawRows: Record<string, unknown>[],
  cfg: StudioWidgetConfig,
): AggPoint[] {
  const rows = applyFilters(rawRows, cfg.filters);
  const dim = cfg.dimension;
  const agg = cfg.aggregation ?? "count";
  const metric = cfg.metric;

  if (!dim) {
    // Single aggregate
    const value = aggregateValues(metric ? rows.map((r) => r[metric]) : rows, agg);
    return [{ name: "Total", value }];
  }

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const key = String(r[dim] ?? "—");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let points: AggPoint[] = [...groups.entries()].map(([name, grp]) => {
    const value = aggregateValues(metric ? grp.map((r) => r[metric]) : grp, agg);
    const point: AggPoint = { name, value };
    if (cfg.secondaryMetric) {
      point.value2 = aggregateValues(
        grp.map((r) => r[cfg.secondaryMetric!]),
        cfg.secondaryAggregation ?? "sum",
      );
    }
    return point;
  });

  const dir = cfg.style?.sortDir ?? "desc";
  if (dir !== "none") {
    points.sort((a, b) => (dir === "asc" ? a.value - b.value : b.value - a.value));
  }
  const limit = cfg.style?.limit;
  if (limit && limit > 0) points = points.slice(0, limit);
  return points;
}

/** Single scorecard value. */
export function scorecardValue(
  rawRows: Record<string, unknown>[],
  cfg: StudioWidgetConfig,
): number {
  const rows = applyFilters(rawRows, cfg.filters);
  return aggregateValues(cfg.metric ? rows.map((r) => r[cfg.metric!]) : rows, cfg.aggregation ?? "count");
}

/** Scatter points using metric (x) and compareField (y). */
export function scatterPoints(
  rawRows: Record<string, unknown>[],
  cfg: StudioWidgetConfig,
): { x: number; y: number; name: string }[] {
  const rows = applyFilters(rawRows, cfg.filters);
  return rows.map((r, i) => ({
    x: toNum(cfg.metric ? r[cfg.metric] : i),
    y: toNum(cfg.compareField ? r[cfg.compareField] : 0),
    name: String(cfg.dimension ? r[cfg.dimension] : i),
  }));
}

export function formatNumber(v: number, style?: StudioWidgetStyle): string {
  const d = style?.decimals ?? 0;
  switch (style?.numberFormat) {
    case "percent": return `${v.toFixed(d)}%`;
    case "currency": return `₦${v.toLocaleString(undefined, { maximumFractionDigits: d })}`;
    case "comma": return v.toLocaleString(undefined, { maximumFractionDigits: d });
    default: return d ? v.toFixed(d) : String(Math.round(v));
  }
}
