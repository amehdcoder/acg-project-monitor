import type { SubmissionRecord } from "@/hooks/useDataAnalytics";
import type { FormQuestion } from "@/hooks/useDashboardBuilder";

// ---------- Types ----------
export interface CategoricalInsight {
  kind: "categorical";
  questionId: string;
  label: string;
  data: { name: string; value: number; pct: number }[];
  totalAnswered: number;
  topCategory: string;
  uniqueValues: number;
}

export interface NumericInsight {
  kind: "numeric";
  questionId: string;
  label: string;
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  sum: number;
  histogram: { name: string; value: number }[];
}

export interface TimeSeriesPoint {
  date: string;
  label: string;
  value: number;
}

export interface CollectorStat {
  name: string;
  submissions: number;
  daysWorked: number;
  firstDay: string;
  lastDay: string;
  avgPerDay: number;
}

export interface GeoPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  state?: string | null;
  lga?: string | null;
  submitterName?: string;
  submittedAt?: string;
  data?: Record<string, any>;
}

export interface InsightsResult {
  totalSubmissions: number;
  uniqueCollectors: number;
  uniqueLocations: number;
  activeDays: number;
  avgPerCollector: number;
  lastSubmissionAt: string | null;
  timeSeries: TimeSeriesPoint[];
  byState: { name: string; value: number }[];
  categorical: CategoricalInsight[];
  numeric: NumericInsight[];
  collectors: CollectorStat[];
  geoPoints: GeoPoint[];
  hasGeo: boolean;
}

// ---------- Helpers ----------
const isGeoVal = (v: any): { lat: number; lng: number } | null => {
  if (!v) return null;
  if (typeof v === "object" && !Array.isArray(v)) {
    const lat = Number(v.lat ?? v.latitude);
    const lng = Number(v.lng ?? v.longitude);
    if (isFinite(lat) && isFinite(lng) && lat !== 0 && lng !== 0) return { lat, lng };
  }
  if (typeof v === "string") {
    const parts = v.split(/[ ,]+/).map(Number).filter((n) => !isNaN(n));
    if (parts.length >= 2 && isFinite(parts[0]) && isFinite(parts[1])) {
      return { lat: parts[0], lng: parts[1] };
    }
  }
  return null;
};

const findGeo = (data: Record<string, any>): { lat: number; lng: number } | null => {
  for (const val of Object.values(data || {})) {
    const g = isGeoVal(val);
    if (g) return g;
  }
  return null;
};

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

const prettyLabel = (s: string) =>
  String(s).replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

const isNumericValue = (v: any) =>
  v !== null && v !== undefined && v !== "" && !isNaN(Number(v)) && typeof v !== "boolean";

// ---------- Main analysis ----------
export function computeInsights(
  submissions: SubmissionRecord[],
  questions: FormQuestion[]
): InsightsResult {
  const total = submissions.length;

  // Collectors
  const collectorMap = new Map<string, { days: Set<string>; count: number; dates: string[] }>();
  const allDays = new Set<string>();
  const stateCounts = new Map<string, number>();
  const locationSet = new Set<string>();
  let lastSubmissionAt: string | null = null;

  for (const s of submissions) {
    const name = s.submitter_name || "Unknown";
    if (!collectorMap.has(name)) collectorMap.set(name, { days: new Set(), count: 0, dates: [] });
    const c = collectorMap.get(name)!;
    c.count++;
    if (s.submitted_at) {
      const d = dayKey(s.submitted_at);
      c.days.add(d);
      c.dates.push(s.submitted_at);
      allDays.add(d);
      if (!lastSubmissionAt || s.submitted_at > lastSubmissionAt) lastSubmissionAt = s.submitted_at;
    }
    const st = s.state || s.location;
    if (st) {
      stateCounts.set(st, (stateCounts.get(st) || 0) + 1);
      locationSet.add(st);
    }
  }

  const collectors: CollectorStat[] = [...collectorMap.entries()]
    .map(([name, c]) => {
      const sorted = c.dates.slice().sort();
      return {
        name,
        submissions: c.count,
        daysWorked: c.days.size,
        firstDay: sorted[0] ? dayKey(sorted[0]) : "",
        lastDay: sorted[sorted.length - 1] ? dayKey(sorted[sorted.length - 1]) : "",
        avgPerDay: c.days.size ? Math.round((c.count / c.days.size) * 10) / 10 : 0,
      };
    })
    .sort((a, b) => b.submissions - a.submissions);

  // Time series (by day)
  const dayCounts = new Map<string, number>();
  for (const s of submissions) {
    if (!s.submitted_at) continue;
    const d = dayKey(s.submitted_at);
    dayCounts.set(d, (dayCounts.get(d) || 0) + 1);
  }
  const timeSeries: TimeSeriesPoint[] = [...dayCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({
      date,
      label: new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      value,
    }));

  const byState = [...stateCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  // Per-question analysis
  const categorical: CategoricalInsight[] = [];
  const numeric: NumericInsight[] = [];

  for (const q of questions) {
    const qid = q.id;
    const label = q.label || prettyLabel(qid);
    const rawValues = submissions
      .map((s) => s.data?.[qid])
      .filter((v) => v !== null && v !== undefined && v !== "");

    if (rawValues.length === 0) continue;

    const numericish = rawValues.filter(isNumericValue);
    const treatNumeric =
      ["number", "integer", "decimal", "range"].includes((q.type || "").toLowerCase()) ||
      (numericish.length === rawValues.length && numericish.length >= 3 && new Set(rawValues.map(String)).size > 5);

    if (treatNumeric && numericish.length > 0) {
      const nums = numericish.map(Number).sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = sum / nums.length;
      const median = nums[Math.floor(nums.length / 2)];
      const min = nums[0];
      const max = nums[nums.length - 1];
      // histogram (up to 8 bins)
      const bins = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(nums.length))));
      const range = max - min || 1;
      const binSize = range / bins;
      const hist = Array.from({ length: bins }, (_, i) => ({
        name:
          binSize >= 1
            ? `${Math.round(min + i * binSize)}-${Math.round(min + (i + 1) * binSize)}`
            : `${(min + i * binSize).toFixed(1)}`,
        value: 0,
      }));
      for (const n of nums) {
        let idx = Math.floor((n - min) / binSize);
        if (idx >= bins) idx = bins - 1;
        if (idx < 0) idx = 0;
        hist[idx].value++;
      }
      numeric.push({
        kind: "numeric",
        questionId: qid,
        label,
        count: nums.length,
        min,
        max,
        mean: Math.round(mean * 100) / 100,
        median,
        sum: Math.round(sum * 100) / 100,
        histogram: hist,
      });
    } else {
      // categorical — flatten arrays (multi-select)
      const counts = new Map<string, number>();
      for (const v of rawValues) {
        const items = Array.isArray(v) ? v : [v];
        for (const it of items) {
          if (it === null || it === undefined || it === "") continue;
          const key = prettyLabel(String(it));
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      if (counts.size === 0 || counts.size > 30) continue; // skip free-text-like
      const totalAnswered = [...counts.values()].reduce((a, b) => a + b, 0);
      const data = [...counts.entries()]
        .map(([name, value]) => ({ name, value, pct: Math.round((value / totalAnswered) * 1000) / 10 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
      categorical.push({
        kind: "categorical",
        questionId: qid,
        label,
        data,
        totalAnswered,
        topCategory: data[0]?.name || "—",
        uniqueValues: counts.size,
      });
    }
  }

  // Geo points
  const geoPoints: GeoPoint[] = [];
  for (const s of submissions) {
    const g = findGeo(s.data || {});
    if (g) {
      geoPoints.push({
        id: s.id,
        lat: g.lat,
        lng: g.lng,
        title: s.submitter_name || s.form_name || "Submission",
        state: s.state,
        lga: (s.data?.lga as string) || null,
        submitterName: s.submitter_name,
        submittedAt: s.submitted_at,
        data: s.data,
      });
    }
  }

  return {
    totalSubmissions: total,
    uniqueCollectors: collectorMap.size,
    uniqueLocations: locationSet.size,
    activeDays: allDays.size,
    avgPerCollector: collectorMap.size ? Math.round((total / collectorMap.size) * 10) / 10 : 0,
    lastSubmissionAt,
    timeSeries,
    byState,
    categorical,
    numeric,
    collectors,
    geoPoints,
    hasGeo: geoPoints.length > 0,
  };
}

// Tableau-inspired categorical palette
export const TABLEAU_PALETTE = [
  "#4E79A7", "#F28E2B", "#59A14F", "#E15759", "#76B7B2",
  "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC",
  "#86BCB6", "#D37295",
];
