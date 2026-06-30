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
  /** Per-LGA distribution: one row per LGA with a count for every category. */
  byLga: { lga: string; total: number; segments: Record<string, number> }[];
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
  /** Per-LGA totals so the field can be read geographically. */
  byLga: { lga: string; sum: number; answered: number }[];
}

/** Plain-language meaning of the coefficient of variation (CV). */
export const CV_MEANING =
  "CV (coefficient of variation) = the spread of the numbers relative to their average. Lower means LGAs report consistently; higher means results are uneven across reports.";

/** Short qualitative reading of a CV value, with its meaning attached. */
export function cvLabel(cv: number): string {
  if (cv <= 30) return `${cv}% — low variation (consistent across reports)`;
  if (cv <= 60) return `${cv}% — moderate variation`;
  if (cv <= 100) return `${cv}% — high variation (uneven effort)`;
  return `${cv}% — very high variation (likely outliers or data-entry issues)`;
}


export type FieldAnalysis = CategoricalFieldAnalysis | NumericFieldAnalysis;

const prettify = (s: string) =>
  String(s).replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

function analyzeNumeric(values: number[]): Omit<NumericFieldAnalysis, "kind" | "key" | "label" | "activity" | "section" | "answered" | "responseRate" | "histogram" | "byLga"> & { histogram: { name: string; value: number }[] } {
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

  const lgaOf = (r: IrfReport) => {
    const v = (r.lga ?? "").toString().trim();
    return v && v.toLowerCase() !== "unspecified" ? v : "Unspecified";
  };

  for (const f of IRF_ALL_FIELDS) {
    const raw = rows.map((r) => (r as any)[f.key]).filter(isFilled);
    if (!raw.length) continue;

    if (f.type === "number") {
      const nums = raw.map(num).filter((v): v is number => v != null && Number.isFinite(v));
      if (nums.length < 1) continue;

      // Per-LGA totals
      const lgaMap = new Map<string, { sum: number; answered: number }>();
      for (const r of rows) {
        const val = num((r as any)[f.key]);
        if (val == null || !Number.isFinite(val)) continue;
        const k = lgaOf(r);
        const cur = lgaMap.get(k) || { sum: 0, answered: 0 };
        cur.sum += val;
        cur.answered += 1;
        lgaMap.set(k, cur);
      }
      const byLga = [...lgaMap.entries()]
        .map(([lga, v]) => ({ lga, sum: Math.round(v.sum * 100) / 100, answered: v.answered }))
        .sort((a, b) => b.sum - a.sum);

      numeric.push({
        kind: "numeric", key: f.key, label: f.label, activity: f.activity, section: f.sectionId,
        answered: nums.length, responseRate: Math.round((nums.length / total) * 100),
        ...analyzeNumeric(nums), byLga,
      });
      continue;
    }

    if (f.type === "select" || f.type === "boolean") {
      const counts = new Map<string, number>();
      const norm = (it: any) =>
        f.type === "boolean"
          ? (it === true || it === "true" || it === "yes" ? "Yes" : "No")
          : prettify(String(it));
      for (const v of raw) {
        const items = Array.isArray(v) ? v : [v];
        for (const it of items) {
          if (!isFilled(it)) continue;
          const key = norm(it);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      if (!counts.size) continue;
      const answered = [...counts.values()].reduce((a, b) => a + b, 0);
      const data = [...counts.entries()]
        .map(([name, value], i) => ({ name, value, pct: Math.round((value / answered) * 1000) / 10, color: MCKINSEY_PALETTE[i % MCKINSEY_PALETTE.length] }))
        .sort((a, b) => b.value - a.value)
        .map((d, i) => ({ ...d, color: MCKINSEY_PALETTE[i % MCKINSEY_PALETTE.length] }));

      // Per-LGA distribution across the categories
      const lgaMap = new Map<string, Record<string, number>>();
      for (const r of rows) {
        const v = (r as any)[f.key];
        if (!isFilled(v)) continue;
        const items = Array.isArray(v) ? v : [v];
        const k = lgaOf(r);
        const seg = lgaMap.get(k) || {};
        for (const it of items) {
          if (!isFilled(it)) continue;
          const cat = norm(it);
          seg[cat] = (seg[cat] || 0) + 1;
        }
        lgaMap.set(k, seg);
      }
      const byLga = [...lgaMap.entries()]
        .map(([lga, segments]) => ({
          lga,
          total: Object.values(segments).reduce((a, b) => a + b, 0),
          segments,
        }))
        .sort((a, b) => b.total - a.total);

      categorical.push({
        kind: "categorical", key: f.key, label: f.label, activity: f.activity, section: f.sectionId,
        answered, responseRate: Math.round((answered / total) * 100), unique: counts.size,
        top: data[0], data, byLga,
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

export type InsightTone = "positive" | "warning" | "neutral";
export interface FieldInsight { tone: InsightTone; text: string; recommendation?: string; }

const nf = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));

/**
 * Produce a decision-oriented insight for a categorical field: concentration,
 * acceptance signals, data-coverage caveats and a concrete recommendation.
 */
export function categoricalInsight(a: CategoricalFieldAnalysis): FieldInsight {
  // Acceptance-style fields (High/Medium/Low) get a tailored reading.
  const high = a.data.find((d) => /^high$/i.test(d.name));
  const low = a.data.find((d) => /^low$/i.test(d.name));
  const yes = a.data.find((d) => /^yes$/i.test(d.name));
  if (high || low) {
    const h = high?.pct ?? 0;
    const l = low?.pct ?? 0;
    if (h >= 50) return { tone: "positive", text: `Strong field acceptance — ${h}% rated “High”.`, recommendation: "Document and replicate what is working in these high-performing engagements." };
    if (l >= 40) return { tone: "warning", text: `${l}% rated “Low” — acceptance is lagging.`, recommendation: "Prioritise refresher training and community entry through trusted leaders here." };
    return { tone: "neutral", text: `Mixed acceptance: ${h}% High vs ${l}% Low.`, recommendation: "Convert “Medium” engagements upward with targeted follow-up visits." };
  }
  if (yes && a.unique <= 2) {
    if (yes.pct >= 80) return { tone: "positive", text: `${yes.pct}% answered “Yes” — near-universal compliance.` };
    if (yes.pct <= 40) return { tone: "warning", text: `Only ${yes.pct}% answered “Yes”.`, recommendation: "Investigate the gap and reinforce the underlying activity." };
    return { tone: "neutral", text: `${yes.pct}% answered “Yes”.` };
  }
  // Generic concentration insight.
  if (a.top.pct >= 60) return { tone: "neutral", text: `Concentrated: “${a.top.name}” dominates at ${a.top.pct}% of responses.`, recommendation: a.responseRate < 60 ? "Improve coverage — fewer than 60% of reports answered this." : undefined };
  if (a.unique >= 5) return { tone: "neutral", text: `Diverse mix across ${a.unique} categories; “${a.top.name}” leads (${a.top.pct}%).` };
  return { tone: "neutral", text: `“${a.top.name}” is most common (${a.top.pct}%).`, recommendation: a.responseRate < 60 ? "Low coverage — encourage teams to complete this field." : undefined };
}

/**
 * Produce a decision-oriented insight for a numeric indicator: spread,
 * outlier risk, coverage and a recommendation.
 */
export function numericInsight(a: NumericFieldAnalysis): FieldInsight {
  if (a.responseRate < 50) return { tone: "warning", text: `Only ${a.responseRate}% of reports captured this — totals understate true effort.`, recommendation: "Make this field mandatory or coach teams to complete it." };
  if (a.cv > 100) return { tone: "warning", text: `Highly uneven (CV ${a.cv}%): range ${nf(a.min)}–${nf(a.max)} around a mean of ${nf(a.mean)}.`, recommendation: "Validate the high/low outliers — likely data-entry or uneven field effort." };
  if (Math.abs(a.mean - a.median) > a.mean * 0.5 && a.mean > 0) return { tone: "neutral", text: `Skewed distribution — a few large reports lift the mean (${nf(a.mean)}) above the median (${nf(a.median)}).`, recommendation: "Use the median as the typical value when target-setting." };
  return { tone: "positive", text: `Consistent effort: ${nf(a.sum)} total, typically ${nf(a.median)} per report (CV ${a.cv}%).` };
}
