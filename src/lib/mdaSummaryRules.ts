/**
 * Adaptive Supervision Summary — Rule System
 * ────────────────────────────────────────────────────────────────────────
 * The Integrated MDA Supervisory Checklist can be freely edited: fields that
 * feed a summary card may be removed, retyped, or re-added. This module makes
 * the adaptive summary safe by enforcing that a SUBSTITUTE metric is only ever
 * chosen when it is *mathematically compatible* with the original card's intent.
 *
 * Each canonical card declares an intent `kind`:
 *   • "percentage" — a bounded 0–100 ratio (coverage, rate, proportion…)
 *   • "score"      — an index/score (0–100 typical, higher = better)
 *   • "count"      — an unbounded tally of people / items / events
 *   • "category"   — a discrete classification (low / medium / high…)
 *
 * A substitute can only fill a vacated slot when its INFERRED kind equals the
 * canonical kind. This prevents nonsense like a head-count standing in for a
 * coverage percentage. The chosen substitute always reports its SOURCE so the
 * UI can label it transparently ("Substituted from …").
 */

export type MetricKind = "percentage" | "score" | "count" | "category";

export interface FieldMeta {
  name: string;
  label: string;
  type: string;
}

export const NUMERIC_TYPES = new Set(["number", "integer", "decimal", "calculate", "range"]);

const PCT_HINTS = ["coverage", "percent", "percentage", "rate", "proportion", "ratio"];
const SCORE_HINTS = ["score", "index", "rating", "grade"];
const COUNT_HINTS = ["count", "number", "total", "treated", "eligible", "visited", "reported", "cases", "households", "persons", "individuals"];

export const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const stripTags = (s: string) => String(s || "").replace(/<[^>]*>/g, "").trim();

/**
 * Infer the metric kind of an arbitrary field from its type, name/label hints
 * and (when available) its current value.
 */
export function inferKind(field: FieldMeta, value: any): MetricKind {
  const text = `${field.name} ${field.label}`.toLowerCase();
  const n = num(value);
  const isNumeric = NUMERIC_TYPES.has(field.type) || n != null;

  if (!isNumeric) return "category";
  if (PCT_HINTS.some((h) => text.includes(h)) && (n == null || n <= 100)) return "percentage";
  if (SCORE_HINTS.some((h) => text.includes(h)) && (n == null || n <= 100)) return "score";
  if (COUNT_HINTS.some((h) => text.includes(h))) return "count";
  // Default numeric → treat a 0–100 value cautiously as a score, otherwise count.
  return n != null && n <= 100 ? "score" : "count";
}

export type Tint = "sky" | "emerald" | "amber" | "violet" | "rose" | "teal";

export interface CanonicalMetric {
  key: string;
  title: string;
  kind: MetricKind;
  /** Source field names in priority order. */
  fieldNames: string[];
  tint: Tint;
  /** Icon name resolved by the component. */
  icon: "ClipboardCheck" | "ShieldCheck" | "Users" | "Percent" | "BarChart3";
}

export const CANONICAL_METRICS: CanonicalMetric[] = [
  { key: "implementation_score", title: "Implementation Score", kind: "score", fieldNames: ["implementation_score"], tint: "sky", icon: "ClipboardCheck" },
  { key: "risk_category", title: "Risk Category", kind: "category", fieldNames: ["risk_category"], tint: "emerald", icon: "ShieldCheck" },
  { key: "treated", title: "Individuals Treated", kind: "count", fieldNames: ["individuals_treated", "persons_treated"], tint: "amber", icon: "Users" },
  { key: "coverage", title: "Coverage Achieved", kind: "percentage", fieldNames: ["coverage_achieved", "verified_coverage"], tint: "violet", icon: "Percent" },
];

export interface ResolvedCard {
  key: string;
  title: string;
  kind: MetricKind;
  tint: Tint;
  icon: CanonicalMetric["icon"];
  value: string;
  band: string;
  /** When the card was filled by a compatible substitute, the source label. */
  substitutedFrom?: string;
}

const fmtPct = (n: number) => `${Math.round(n * 100) / 100}%`;
const fmtCount = (n: number) => n.toLocaleString();

function renderValue(kind: MetricKind, raw: any): { value: string; band: string } | null {
  if (kind === "category") {
    const s = String(raw || "").trim();
    if (!s) return null;
    const low = s.toLowerCase();
    return {
      value: s.charAt(0).toUpperCase() + s.slice(1),
      band: low === "low" ? "Acceptable" : low === "medium" ? "Monitor" : low === "high" ? "Action needed" : "Recorded",
    };
  }
  const n = num(raw);
  if (n == null) return null;
  if (kind === "percentage") return { value: fmtPct(n), band: n >= 80 ? "On target" : n >= 50 ? "Below target" : "Critical gap" };
  if (kind === "score") return { value: `${n}%`, band: n >= 80 ? "Good" : n >= 60 ? "Fair" : "Needs Attention" };
  return { value: fmtCount(n), band: "Recorded" };
}

/**
 * Build the adaptive summary cards.
 *
 * @param getValue   reads a field's current response value by field name
 * @param has        true when a field name still exists in the (edited) form
 * @param fields     current form fields (for substitute discovery)
 */
export function buildAdaptiveCards(
  getValue: (name: string) => any,
  has: (name: string) => boolean,
  fields: FieldMeta[],
  maxCards = 4,
): ResolvedCard[] {
  const cards: ResolvedCard[] = [];
  const used = new Set<string>();

  // Index fields by name for quick lookup.
  const byName = new Map<string, FieldMeta>();
  fields.forEach((f) => byName.set(f.name, f));

  for (const metric of CANONICAL_METRICS) {
    // 1) Try the canonical source(s) first.
    let filled = false;
    for (const fname of metric.fieldNames) {
      if (!has(fname)) continue;
      const rendered = renderValue(metric.kind, getValue(fname));
      if (!rendered) continue;
      used.add(fname);
      cards.push({ key: metric.key, title: metric.title, kind: metric.kind, tint: metric.tint, icon: metric.icon, ...rendered });
      filled = true;
      break;
    }
    if (filled) continue;

    // 2) Canonical source gone/empty → look for a COMPATIBLE substitute, i.e.
    //    a field whose inferred kind matches this metric's intent exactly.
    const candidate = fields.find((f) => {
      if (used.has(f.name)) return false;
      if (metric.fieldNames.includes(f.name)) return false;
      const v = getValue(f.name);
      if (v === undefined || v === null || v === "") return false;
      return inferKind(f, v) === metric.kind;
    });
    if (candidate) {
      const rendered = renderValue(metric.kind, getValue(candidate.name));
      if (rendered) {
        used.add(candidate.name);
        cards.push({
          key: `${metric.key}__sub`,
          title: metric.title,
          kind: metric.kind,
          tint: metric.tint,
          icon: metric.icon,
          substitutedFrom: stripTags(candidate.label) || candidate.name,
          ...rendered,
        });
        continue;
      }
    }
    // 3) No compatible source → leave the slot empty (never show an incompatible metric).
  }

  // 4) If we still have free slots, surface any other meaningful numeric fields
  //    as clearly-labelled auto-computed extras (kept compatible by construction).
  if (cards.length < maxCards) {
    for (const f of fields) {
      if (cards.length >= maxCards) break;
      if (used.has(f.name)) continue;
      if (!NUMERIC_TYPES.has(f.type)) continue;
      const v = getValue(f.name);
      const n = num(v);
      if (n == null) continue;
      used.add(f.name);
      const kind = inferKind(f, v);
      const rendered = renderValue(kind, v)!;
      cards.push({
        key: `extra_${f.name}`,
        title: stripTags(f.label) || f.name,
        kind,
        tint: (["teal", "rose", "amber", "violet"] as Tint[])[cards.length % 4],
        icon: kind === "percentage" || kind === "score" ? "Percent" : "BarChart3",
        substitutedFrom: undefined,
        ...rendered,
      });
    }
  }

  return cards;
}
