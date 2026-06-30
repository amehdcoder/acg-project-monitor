import { IRF_ALL_FIELDS, type IrfReport } from "./definition";

// McKinsey-style categorical palette — calm, high-contrast, print-friendly.
export const MCKINSEY_PALETTE = [
  "#0b5394", "#1f9e89", "#e69138", "#cc4125", "#6a4c93",
  "#3d85c6", "#38761d", "#bf9000", "#a64d79", "#45818e",
  "#674ea7", "#990000",
];

const num = (v: any) => (v == null || v === "" ? null : Number(v));
const isFilled = (v: any) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0);

export interface CategoricalFieldAnalysis {
  kind: "categorical";
  key: string;
  label: string;
  activity: string;
  section: string;
  answered: number;
  responseRate: number;
  unique: number;
  top: { name: string; value: number; pct: number; color: string };
  data: { name: string; value: number; pct: number; color: string }[];
}

export interface NumericFieldAnalysis {
  kind: "numeric";
  key: string;
  label: string;
  activity: string;
  section: string;
  answered: number;
  responseRate: number;
  sum: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  sd: number;
  cv: number;
  histogram: { name: string; value: number }[];
}

export type FieldAnalysis = CategoricalFieldAnalysis | NumericFieldAnalysis;

const prettify = (s: string) =>
  String(s).replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

function analyzeNumeric(values: number[]): Omit<NumericFieldAnalysis, "kind" | "key" | "label" | "activity" | "section" | "answered" | "responseRate" | "histogram"> & { histogram: { name: string; value: number }[] } {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const min = sorted[0];
  const max = sorted[n - 1];
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const cv = mean ? Math.round((sd / mean) * 100) : 0;
  const bins = Math.min(7, Math.max(3, Math.ceil(Math.sqrt(n))));
  const range = max - min || 1;
  const binSize = range / bins;
  const histogram = Array.from({ length: bins }, (_, i) => ({
    name: binSize >= 1
      ? `${Math.round(min + i * binSize)}–${Math.round(min + (i + 1) * binSize)}`
      : `${(min + i * binSize).toFixed(1)}`,
    value: 0,
  }));
  for (const v of sorted) {
    let idx = Math.floor((v - min) / binSize);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    histogram[idx].value++;
  }
  return { sum: Math.round(sum * 100) / 100, mean: Math.round(mean * 100) / 100, median, min, max, sd: Math.round(sd * 100) / 100, cv, histogram };
}

/** Analyze every SAIRF field across all reports. Returns categorical & numeric breakdowns. */
export function analyzeFields(rows: IrfReport[]): { categorical: CategoricalFieldAnalysis[]; numeric: NumericFieldAnalysis[] } {
  const categorical: CategoricalFieldAnalysis[] = [];
  const numeric: NumericFieldAnalysis[] = [];
  const total = rows.length || 1;

  for (const f of IRF_ALL_FIELDS) {
    const raw = rows.map((r) => (r as any)[f.key]).filter(isFilled);
    if (!raw.length) continue;

    if (f.type === "number") {
      const nums = raw.map(num).filter((v): v is number => v != null && Number.isFinite(v));
      if (nums.length < 1) continue;
      numeric.push({
        kind: "numeric", key: f.key, label: f.label, activity: f.activity, section: f.sectionId,
        answered: nums.length, responseRate: Math.round((nums.length / total) * 100),
        ...analyzeNumeric(nums),
      });
      continue;
    }

    if (f.type === "select" || f.type === "boolean") {
      const counts = new Map<string, number>();
      for (const v of raw) {
        const items = Array.isArray(v) ? v : [v];
        for (const it of items) {
          if (!isFilled(it)) continue;
          const key = f.type === "boolean"
            ? (it === true || it === "true" || it === "yes" ? "Yes" : "No")
            : prettify(String(it));
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      if (!counts.size) continue;
      const answered = [...counts.values()].reduce((a, b) => a + b, 0);
      const data = [...counts.entries()]
        .map(([name, value], i) => ({ name, value, pct: Math.round((value / answered) * 1000) / 10, color: MCKINSEY_PALETTE[i % MCKINSEY_PALETTE.length] }))
        .sort((a, b) => b.value - a.value)
        .map((d, i) => ({ ...d, color: MCKINSEY_PALETTE[i % MCKINSEY_PALETTE.length] }));
      categorical.push({
        kind: "categorical", key: f.key, label: f.label, activity: f.activity, section: f.sectionId,
        answered, responseRate: Math.round((answered / total) * 100), unique: counts.size,
        top: data[0], data,
      });
    }
  }

  return { categorical, numeric };
}

export interface Interpretation {
  headline: string;
  bullets: { tone: "positive" | "warning" | "neutral"; text: string }[];
}

/** Generate a dynamic, executive interpretation of the SAIRF dataset. */
export function interpretDataset(
  rows: IrfReport[],
  stats: { peopleReached: number; stakeholdersEngaged: number; ncTotal: number; ncResolved: number; ncResolutionRate: number; awarenessActivities: number; lgas: number; totalReports: number },
  fields: { categorical: CategoricalFieldAnalysis[]; numeric: NumericFieldAnalysis[] },
  duplicateCount: number,
): Interpretation {
  const fmt = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));
  const bullets: Interpretation["bullets"] = [];

  const headline = stats.totalReports
    ? `${fmt(stats.totalReports)} SAIRF reports across ${stats.lgas} LGA${stats.lgas === 1 ? "" : "s"} reached an estimated ${fmt(stats.peopleReached)} people and engaged ${fmt(stats.stakeholdersEngaged)} stakeholders.`
    : "No SAIRF reports available for interpretation yet.";

  // Reach efficiency
  const reachPer = stats.totalReports ? Math.round(stats.peopleReached / stats.totalReports) : 0;
  if (reachPer > 0) {
    bullets.push({ tone: reachPer >= 500 ? "positive" : "neutral", text: `Each report reaches ~${fmt(reachPer)} people on average — ${reachPer >= 500 ? "a strong amplification ratio for community ACSM activities." : "consider scaling mass-media channels to lift per-report reach."}` });
  }

  // Non-compliance resolution
  if (stats.ncTotal > 0) {
    bullets.push({
      tone: stats.ncResolutionRate >= 70 ? "positive" : stats.ncResolutionRate >= 40 ? "neutral" : "warning",
      text: `${stats.ncResolutionRate}% of the ${fmt(stats.ncTotal)} non-compliance cases have been resolved (${fmt(stats.ncResolved)} closed). ${stats.ncResolutionRate < 70 ? "Pending refusals warrant targeted follow-up with religious and traditional leaders." : "Resolution discipline is healthy — sustain the follow-up cadence."}`,
    });
  }

  // Outcome / participation quality
  const outcome = fields.categorical.find((c) => c.key === "outcome_level") || fields.categorical.find((c) => c.key === "participation_level");
  if (outcome) {
    const high = outcome.data.find((d) => d.name === "High");
    const low = outcome.data.find((d) => d.name === "Low");
    if (high) bullets.push({ tone: high.pct >= 50 ? "positive" : "neutral", text: `${high.pct}% of engagements rated "High" ${outcome.key === "outcome_level" ? "outcome" : "participation"}${low ? `, while ${low.pct}% rated "Low"` : ""} — ${high.pct >= 50 ? "field acceptance is encouraging." : "there is headroom to deepen community engagement quality."}` });
  }

  // Most consistent / most variable numeric indicator
  if (fields.numeric.length) {
    const ranked = [...fields.numeric].filter((n) => n.answered >= 3);
    const variable = ranked.slice().sort((a, b) => b.cv - a.cv)[0];
    if (variable && variable.cv > 100) {
      bullets.push({ tone: "warning", text: `"${variable.label}" varies widely between reports (CV ${variable.cv}%), suggesting uneven field effort or data-entry inconsistency worth validating.` });
    }
    const biggest = ranked.slice().sort((a, b) => b.sum - a.sum)[0];
    if (biggest) bullets.push({ tone: "neutral", text: `Highest-volume indicator is "${biggest.label}" totalling ${fmt(biggest.sum)} across ${biggest.answered} reports (mean ${fmt(biggest.mean)}).` });
  }

  // Awareness mix
  if (stats.awarenessActivities > 0) {
    bullets.push({ tone: "neutral", text: `${fmt(stats.awarenessActivities)} awareness touch-points were delivered (broadcasts, IEC distribution and dialogues) — the backbone of demand generation.` });
  }

  // Data quality / duplicates
  if (duplicateCount > 0) {
    bullets.push({ tone: "warning", text: `${fmt(duplicateCount)} likely duplicate submission(s) detected; review them so headline totals are not double-counted.` });
  }

  return { headline, bullets };
}
