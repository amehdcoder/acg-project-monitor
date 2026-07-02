// Statistical analysis for the SARMAAN ACSM (SAIRF) executive dashboard.
//
// Produces descriptive statistics and a 95% confidence interval for each key
// numeric indicator, plus a simple month-over-month growth signal. Designed to be
// robust to small samples and missing values.

import type { IrfReport } from "@/lib/irf/definition";
import { computeIrfReach } from "@/lib/irf/normalize";

export interface IndicatorStat {
  key: string;
  label: string;
  color: string;
  n: number;        // number of reports contributing a value
  sum: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  sd: number;       // sample standard deviation
  ciLow: number;    // 95% CI lower bound of the mean
  ciHigh: number;   // 95% CI upper bound of the mean
  cv: number;       // coefficient of variation (%) — data consistency signal
}

export interface IrfStatistics {
  indicators: IndicatorStat[];
  momGrowthPct: number | null; // latest vs previous month total reach growth
  reportsPerActiveMonth: number;
}

const INDICATORS: { key: string; label: string; color: string }[] = [
  { key: "total_reach", label: "Estimated reach / report", color: "#0891b2" },
  { key: "attendance_men", label: "Men in attendance", color: "#2563eb" },
  { key: "attendance_women", label: "Women in attendance", color: "#db2777" },
  { key: "persons_engaged", label: "Officials engaged (advocacy)", color: "#0ea5e9" },
  { key: "announcers_supervised", label: "Town announcers supervised", color: "#ea580c" },
  { key: "town_announcements", label: "Announcements made", color: "#f59e0b" },
  { key: "meetings_held", label: "Compound meetings held", color: "#7c3aed" },
  { key: "community_dialogue_sessions", label: "Dialogue sessions", color: "#16a34a" },
  { key: "questions_asked", label: "Questions / contributions", color: "#a64d79" },
  { key: "policy_makers_engaged", label: "Policy makers engaged", color: "#45818e" },
  { key: "iec_materials_distributed", label: "IEC materials distributed", color: "#674ea7" },
];

const num = (v: any) => (v == null || v === "" ? null : Number(v));

function describe(values: number[]): Omit<IndicatorStat, "key" | "label" | "color"> {
  const n = values.length;
  if (!n) return { n: 0, sum: 0, mean: 0, median: 0, min: 0, max: 0, sd: 0, ciLow: 0, ciHigh: 0, cv: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const se = n > 0 ? sd / Math.sqrt(n) : 0;
  const margin = 1.96 * se; // normal approximation
  return {
    n, sum,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    min: sorted[0], max: sorted[n - 1],
    sd: Math.round(sd * 100) / 100,
    ciLow: Math.max(0, Math.round((mean - margin) * 100) / 100),
    ciHigh: Math.round((mean + margin) * 100) / 100,
    cv: mean ? Math.round((sd / mean) * 1000) / 10 : 0,
  };
}

export function analyzeStatistics(rows: IrfReport[]): IrfStatistics {
  const indicators: IndicatorStat[] = INDICATORS.map((ind) => {
    const values = rows.map((r) => num((r as any)[ind.key])).filter((v): v is number => v != null && Number.isFinite(v));
    return { key: ind.key, label: ind.label, color: ind.color, ...describe(values) };
  }).filter((s) => s.n > 0 && s.sum > 0);

  // Month-over-month reach growth.
  const byMonth = new Map<string, number>();
  rows.forEach((r) => {
    const key = (r.reporting_month || r.created_at || "").slice(0, 7);
    if (!key) return;
    byMonth.set(key, (byMonth.get(key) || 0) + computeIrfReach(r));
  });
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  let momGrowthPct: number | null = null;
  if (months.length >= 2) {
    const prev = months[months.length - 2][1];
    const last = months[months.length - 1][1];
    momGrowthPct = prev > 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : null;
  }

  return {
    indicators,
    momGrowthPct,
    reportsPerActiveMonth: months.length ? Math.round((rows.length / months.length) * 10) / 10 : rows.length,
  };
}
