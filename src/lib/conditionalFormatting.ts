// Shared, professional conditional-formatting helpers used across all dashboards.
// Goal: a single, consistent, insightful colour language for KPIs, table cells
// and badges so every dashboard reads the same way at a glance.

export type Tone = "good" | "ok" | "warn" | "bad" | "neutral";

// Semantic palette (kept in sync with the dashboard chart colours).
export const TONE_COLORS: Record<Tone, { fg: string; bg: string; solid: string }> = {
  good: { fg: "#15803d", bg: "#dcfce7", solid: "#16a34a" },
  ok: { fg: "#1d4ed8", bg: "#dbeafe", solid: "#2563eb" },
  warn: { fg: "#b45309", bg: "#fef3c7", solid: "#f59e0b" },
  bad: { fg: "#b91c1c", bg: "#fee2e2", solid: "#dc2626" },
  neutral: { fg: "#475569", bg: "#f1f5f9", solid: "#64748b" },
};

/**
 * Map a "higher is better" percentage (0-100) to a semantic tone.
 * Thresholds: >=80 good, >=60 ok, >=40 warn, else bad.
 */
export const pctTone = (
  v: number | null | undefined,
  t: { good?: number; ok?: number; warn?: number } = {},
): Tone => {
  if (v == null || Number.isNaN(v)) return "neutral";
  const good = t.good ?? 80;
  const ok = t.ok ?? 60;
  const warn = t.warn ?? 40;
  if (v >= good) return "good";
  if (v >= ok) return "ok";
  if (v >= warn) return "warn";
  return "bad";
};

/**
 * Map a variance percentage (where closer to 0 is better, sign can be ±)
 * to a tone. Used for baseline-vs-actual style comparisons.
 */
export const varianceTone = (
  pct: number | null | undefined,
  t: { ok?: number; warn?: number } = {},
): Tone => {
  if (pct == null || Number.isNaN(pct)) return "neutral";
  const a = Math.abs(pct);
  const ok = t.ok ?? 2; // within tolerance
  const warn = t.warn ?? 10;
  const bad = 20;
  if (a < ok) return "good";
  if (a < warn) return "ok";
  if (a < bad) return "warn";
  return "bad";
};

export const toneColor = (tone: Tone) => TONE_COLORS[tone].solid;
export const toneFg = (tone: Tone) => TONE_COLORS[tone].fg;
export const toneBg = (tone: Tone) => TONE_COLORS[tone].bg;

// Soft tinted row background (used for table conditional formatting).
export const toneRowBg: Record<Tone, string> = {
  good: "bg-emerald-50/40",
  ok: "bg-blue-50/40",
  warn: "bg-amber-50/50",
  bad: "bg-red-50/60",
  neutral: "",
};

// Tailwind text colour for conditional table cell text.
export const toneText: Record<Tone, string> = {
  good: "text-emerald-600",
  ok: "text-blue-600",
  warn: "text-amber-600",
  bad: "text-red-600",
  neutral: "text-muted-foreground",
};
