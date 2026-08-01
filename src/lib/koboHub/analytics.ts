/**
 * Universal Kobo Dashboard Hub — analytics engine.
 *
 * Pure, dependency-free computations shared by every generated widget:
 * categorical distributions, numeric summaries, GPS extraction, text/NLP
 * topic clustering, integrity anomaly scoring and the reconciliation report.
 */
import {
  getFlat, resolveValue, findRepeatArray,
  type HubField, type HubSchema, type HubRepeatBlock,
} from "./schema";

export type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "").trim();

/* ------------------------------------------------------------- filtering */

export interface HubFilters {
  from?: string;
  to?: string;
  state?: string;
  lga?: string;
  ward?: string;
  /** Cross-filters applied by clicking a chart slice: field name → label. */
  slices: Record<string, string>;
}

export const emptyFilters = (): HubFilters => ({ slices: {} });

export function fieldByName(schema: HubSchema, name?: string): HubField | undefined {
  if (!name) return undefined;
  return schema.fields.find((f) => f.name === name);
}

export function labelValue(schema: HubSchema, name: string | undefined, row: Row): string {
  if (!name) return "";
  const f = fieldByName(schema, name);
  const raw = getFlat(row, name);
  return f ? resolveValue(schema, f, raw) : s(raw);
}

export function applyFilters(rows: Row[], schema: HubSchema, f: HubFilters): Row[] {
  const from = f.from ? new Date(f.from).getTime() : null;
  const to = f.to ? new Date(f.to).getTime() + 86_400_000 : null;
  return rows.filter((r) => {
    const t = new Date(s(r._submission_time)).getTime();
    if (from && Number.isFinite(t) && t < from) return false;
    if (to && Number.isFinite(t) && t > to) return false;
    if (f.state && labelValue(schema, schema.geo.state, r) !== f.state) return false;
    if (f.lga && labelValue(schema, schema.geo.lga, r) !== f.lga) return false;
    if (f.ward && labelValue(schema, schema.geo.ward, r) !== f.ward) return false;
    for (const [name, want] of Object.entries(f.slices)) {
      const fld = fieldByName(schema, name);
      const val = fld ? resolveValue(schema, fld, getFlat(r, name)) : s(getFlat(r, name));
      if (fld?.type === "select_multiple") {
        if (!val.split(", ").includes(want)) return false;
      } else if (val !== want) return false;
    }
    return true;
  });
}

export function distinctValues(rows: Row[], schema: HubSchema, name?: string): string[] {
  if (!name) return [];
  const set = new Set<string>();
  const f = fieldByName(schema, name);
  for (const r of rows) {
    const v = f ? resolveValue(schema, f, getFlat(r, name)) : s(getFlat(r, name));
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/* ---------------------------------------------------------- categorical */

export interface CategoryDatum { name: string; value: number; pct: number }

export function categoryDistribution(rows: Row[], schema: HubSchema, field: HubField): CategoryDatum[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const resolved = resolveValue(schema, field, getFlat(r, field.name));
    if (!resolved) continue;
    const parts = field.type === "select_multiple" ? resolved.split(", ") : [resolved];
    for (const p of parts) {
      const key = p.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/* -------------------------------------------------------------- numeric */

export interface NumericSummary {
  count: number; sum: number; mean: number; min: number; max: number; sd: number;
  histogram: { bucket: string; count: number }[];
  trend: { date: string; value: number }[];
}

export function numericSummary(rows: Row[], field: HubField): NumericSummary {
  const values: number[] = [];
  const byDate = new Map<string, number[]>();
  for (const r of rows) {
    const n = Number(getFlat(r, field.name));
    if (!Number.isFinite(n)) continue;
    values.push(n);
    const d = s(r._submission_time).slice(0, 10);
    if (d) { const arr = byDate.get(d) ?? []; arr.push(n); byDate.set(d, arr); }
  }
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = count ? sum / count : 0;
  const sd = count > 1
    ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (count - 1))
    : 0;
  const min = count ? Math.min(...values) : 0;
  const max = count ? Math.max(...values) : 0;

  const buckets = 8;
  const span = max - min;
  const histogram: { bucket: string; count: number }[] = [];
  if (count && span > 0) {
    const width = span / buckets;
    const bins = new Array(buckets).fill(0);
    for (const v of values) {
      const i = Math.min(buckets - 1, Math.floor((v - min) / width));
      bins[i]++;
    }
    bins.forEach((c, i) => histogram.push({
      bucket: `${(min + i * width).toFixed(1)}–${(min + (i + 1) * width).toFixed(1)}`,
      count: c,
    }));
  } else if (count) {
    histogram.push({ bucket: String(min), count });
  }

  const trend = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, arr]) => ({ date, value: arr.reduce((a, b) => a + b, 0) / arr.length }));

  return { count, sum, mean, min, max, sd, histogram, trend };
}

/* ------------------------------------------------------------ geospatial */

export interface GeoPoint {
  lat: number; lng: number;
  label: string; category: string; when: string; extra: Record<string, string>;
}

export function parsePoint(v: unknown): { lat: number; lng: number } | null {
  if (!v) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.long ?? o.lon ?? o.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  const p = s(v).split(/[\s,]+/).map(Number);
  if (p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  if (p[0] === 0 && p[1] === 0) return null;
  return { lat: p[0], lng: p[1] };
}

export function geoPoints(
  rows: Row[], schema: HubSchema, field: HubField, colourField?: HubField,
): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (const r of rows) {
    const pt = parsePoint(getFlat(r, field.name));
    if (!pt) continue;
    const community = labelValue(schema, schema.geo.community, r);
    const person = labelValue(schema, schema.personName, r) || labelValue(schema, schema.designation, r);
    out.push({
      ...pt,
      label: community || s(r._id),
      category: colourField ? resolveValue(schema, colourField, getFlat(r, colourField.name)) : "",
      when: s(r._submission_time).slice(0, 16).replace("T", " "),
      extra: {
        State: labelValue(schema, schema.geo.state, r),
        LGA: labelValue(schema, schema.geo.lga, r),
        Ward: labelValue(schema, schema.geo.ward, r),
        Collector: person,
      },
    });
  }
  return out;
}

/* ------------------------------------------------------------ text / NLP */

const STOP = new Set(("a an and are as at be but by for from had has have he her his i in is it its of on or she that the their them there they this to was were will with we you your not no yes our us do does did " +
  "because so if when what which who how very can could would should").split(" "));

export interface TopicCluster { term: string; count: number; samples: string[] }

export function textTopics(rows: Row[], field: HubField, limit = 24): {
  topics: TopicCluster[]; responses: number;
} {
  const freq = new Map<string, TopicCluster>();
  let responses = 0;
  for (const r of rows) {
    const text = s(getFlat(r, field.name));
    if (!text || text.length < 2) continue;
    responses++;
    const seen = new Set<string>();
    for (const w of text.toLowerCase().split(/[^a-z0-9']+/)) {
      if (w.length < 3 || STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      const t = freq.get(w) ?? { term: w, count: 0, samples: [] };
      t.count++;
      if (t.samples.length < 3) t.samples.push(text.slice(0, 160));
      freq.set(w, t);
    }
  }
  const topics = [...freq.values()].sort((a, b) => b.count - a.count).slice(0, limit);
  return { topics, responses };
}

/* ------------------------------------------------------------- integrity */

export interface IntegrityIssue {
  id: string; severity: "critical" | "warning"; kind: string; detail: string;
}

export interface IntegrityReport {
  score: number;
  issues: IntegrityIssue[];
  checked: number;
}

/**
 * Lightweight isolation-style screen: submission velocity per collector,
 * duplicated coordinates, and null-island / out-of-range GPS.
 */
export function integrityScan(rows: Row[], schema: HubSchema): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const geoField = schema.fields.find((f) => f.type === "geopoint");
  const coordSeen = new Map<string, number>();
  const byPerson = new Map<string, number[]>();

  for (const r of rows) {
    const id = s(r._id) || s(r._uuid);
    const person = labelValue(schema, schema.personName, r) || "Unattributed";
    const t = new Date(s(r._submission_time)).getTime();
    if (Number.isFinite(t)) {
      const arr = byPerson.get(person) ?? []; arr.push(t); byPerson.set(person, arr);
    }
    if (geoField) {
      const pt = parsePoint(getFlat(r, geoField.name));
      if (!pt) {
        issues.push({ id, severity: "warning", kind: "Missing GPS", detail: `Submission ${id} has no valid coordinate.` });
      } else {
        const key = `${pt.lat.toFixed(5)},${pt.lng.toFixed(5)}`;
        coordSeen.set(key, (coordSeen.get(key) ?? 0) + 1);
        if (Math.abs(pt.lat) > 90 || Math.abs(pt.lng) > 180) {
          issues.push({ id, severity: "critical", kind: "Impossible coordinate", detail: `Submission ${id} at ${key}.` });
        }
      }
    }
    if (!labelValue(schema, schema.geo.ward, r) && schema.geo.ward) {
      issues.push({ id, severity: "warning", kind: "Missing geography", detail: `Submission ${id} has no ward.` });
    }
  }

  for (const [key, n] of coordSeen) {
    if (n >= 5) {
      issues.push({ id: key, severity: "critical", kind: "Coordinate cluster", detail: `${n} submissions share the exact coordinate ${key}.` });
    }
  }

  for (const [person, times] of byPerson) {
    const sorted = [...times].sort((a, b) => a - b);
    let rapid = 0;
    for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] < 60_000) rapid++;
    if (rapid >= 3) {
      issues.push({
        id: person, severity: "critical", kind: "Velocity anomaly",
        detail: `${person} filed ${rapid} submissions less than 60s apart.`,
      });
    }
  }

  const critical = issues.filter((i) => i.severity === "critical").length;
  const warn = issues.length - critical;
  const penalty = rows.length ? ((critical * 3 + warn) / rows.length) * 40 : 0;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  return { score, issues: issues.slice(0, 300), checked: rows.length };
}

/* -------------------------------------------------------- reconciliation */

export interface ReconRow {
  issue: string; severity: "critical" | "warning" | "info"; count: number; detail: string;
}

export function reconcile(rows: Row[], schema: HubSchema, apiCount: number): {
  summary: ReconRow[]; parentCount: number; childCount: number;
} {
  const summary: ReconRow[] = [];
  const uuids = new Map<string, number>();
  let missingGeo = 0;
  let orphans = 0;
  let childCount = 0;

  for (const r of rows) {
    const u = s(r._uuid);
    uuids.set(u, (uuids.get(u) ?? 0) + 1);
    const wardOk = schema.geo.ward ? !!labelValue(schema, schema.geo.ward, r) : true;
    const stateOk = schema.geo.state ? !!labelValue(schema, schema.geo.state, r) : true;
    if (!wardOk || !stateOk) missingGeo++;
    for (const rep of schema.repeats) {
      const arr = findRepeatArray(r, rep.name);
      childCount += arr.length;
      if (!u && arr.length) orphans += arr.length;
    }
  }
  const dupes = [...uuids.values()].filter((n) => n > 1).length;

  summary.push({
    issue: "API vs local submission parity", severity: apiCount === rows.length ? "info" : "critical",
    count: Math.abs(apiCount - rows.length),
    detail: `KoboToolbox reports ${apiCount}; ${rows.length} stored locally.`,
  });
  summary.push({
    issue: "Duplicate submission UUIDs", severity: dupes ? "critical" : "info", count: dupes,
    detail: dupes ? `${dupes} UUID(s) appear more than once.` : "All submission UUIDs unique.",
  });
  summary.push({
    issue: "Submissions missing geography", severity: missingGeo ? "warning" : "info", count: missingGeo,
    detail: missingGeo ? `${missingGeo} submission(s) lack a state or ward value.` : "All submissions carry geography.",
  });
  summary.push({
    issue: "Orphaned repeat children", severity: orphans ? "critical" : "info", count: orphans,
    detail: orphans ? `${orphans} repeat row(s) have no parent UUID.` : "Every repeat row is linked to a parent.",
  });
  summary.push({
    issue: "Flattened repeat rows", severity: "info", count: childCount,
    detail: `${childCount} child row(s) across ${schema.repeats.length} repeat block(s).`,
  });

  return { summary, parentCount: rows.length, childCount };
}

/* -------------------------------------------------------------- exports */

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    const t = s(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function repeatBlockRows(rows: Row[], block: HubRepeatBlock) {
  return rows.flatMap((r) =>
    findRepeatArray(r, block.name).map((c: any, i: number) => ({
      parent_uuid: s(r._uuid),
      parent_id: s(r._id),
      submission_time: s(r._submission_time),
      index: i + 1,
      ...(c ?? {}),
    })),
  );
}
