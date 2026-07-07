// ─────────────────────────────────────────────────────────────────────────
// Advanced Analytics Engine (dashboard-agnostic)
// ---------------------------------------------------------------------------
// Reads the SAME normalized submissions + question structure that every
// dashboard already provides to the Narrative Insights engine and produces
// four families of advanced, self-updating analyses — each with a plain,
// non-technical interpretation so any programme officer can act on them:
//
//   • Random Forest  — which fields most strongly drive a key outcome.
//   • Monte Carlo    — probability of different outcomes via random resampling.
//   • Grounded Theory — open codes → categories → core theme from free text.
//   • Discourse Analysis — sentiment, agency, modality & framing of free text.
//
// Everything is pure + local (no AI, no network), O(n) friendly, and recomputed
// via useMemo whenever new submissions flow in, so results update in real-time.
// ─────────────────────────────────────────────────────────────────────────

import type { NarrativeQuestion, NarrativeSubmission } from "@/lib/narrativeInsights";
import { meanConfidenceInterval, oneWayAnova, formatP } from "@/lib/statisticalInference";

const pretty = (s: string) =>
  String(s || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (l) => l.toUpperCase());
const pct = (n: number) => `${Math.round(n)}%`;

function flatten(qs: NarrativeQuestion[] | undefined): NarrativeQuestion[] {
  const out: NarrativeQuestion[] = [];
  const walk = (list: NarrativeQuestion[] | undefined) => {
    for (const q of list || []) {
      if (Array.isArray(q?.questions) && q.questions.length) walk(q.questions);
      else if (q?.id) out.push(q);
    }
  };
  walk(qs);
  return out;
}

const keysFor = (q: NarrativeQuestion) => [q.id, q.name].filter(Boolean) as string[];
function readValue(data: Record<string, any>, q: NarrativeQuestion): any {
  for (const k of keysFor(q)) if (data?.[k] !== undefined) return data[k];
  return undefined;
}

const YES = new Set(["yes", "y", "true", "1", "available", "present", "done", "complete", "completed", "adequate"]);
const NO = new Set(["no", "n", "false", "0", "unavailable", "absent", "not done", "incomplete", "inadequate"]);

/** Convert an answer into a number when it plausibly represents a metric. */
function toNumeric(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.length; // count of multi-select selections
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim().toLowerCase();
  if (YES.has(s)) return 1;
  if (NO.has(s)) return 0;
  const num = parseFloat(s.replace(/[, %]/g, ""));
  return Number.isFinite(num) ? num : null;
}

// ─────────────────────────── feature framing ───────────────────────────

interface Feature {
  key: string;
  label: string;
  values: (number | null)[]; // aligned to submission index
  distinct: number;
  variance: number;
}

function buildFeatures(subs: NarrativeSubmission[], qs: NarrativeQuestion[]): Feature[] {
  const flat = flatten(qs).filter((q) => q.type !== "note");
  const feats: Feature[] = [];
  for (const q of flat) {
    const values = subs.map((s) => toNumeric(readValue(s.data || {}, q)));
    const present = values.filter((v): v is number => v !== null);
    if (present.length < Math.max(4, subs.length * 0.15)) continue; // too sparse
    const distinct = new Set(present).size;
    if (distinct < 2) continue; // constant → useless as feature
    const mean = present.reduce((a, b) => a + b, 0) / present.length;
    const variance = present.reduce((a, b) => a + (b - mean) ** 2, 0) / present.length;
    feats.push({ key: q.id, label: q.label || pretty(q.name || q.id), values, distinct, variance });
  }
  return feats;
}

// Ordinal encoder for status-style answers that plain toNumeric can't map
// (e.g. "Status of MDA": Completed / Ongoing / Not started).
const STATUS_MAP: { re: RegExp; val: number }[] = [
  { re: /complete|finished|\bdone\b/i, val: 1 },
  { re: /ongoing|in\s*progress|partial|continuing|started/i, val: 0.5 },
  { re: /not\s*start|halt|not\s*commenc|pending|yet\s*to|no\b/i, val: 0 },
];
function toNumericOrdinal(v: any): number | null {
  const n = toNumeric(v);
  if (n !== null) return n;
  if (v === null || v === undefined || v === "") return null;
  const s = String(Array.isArray(v) ? v.join(" ") : v);
  for (const m of STATUS_MAP) if (m.re.test(s)) return m.val;
  return null;
}

/** Build a Feature for a specific question matched by label/name/id — used to
 *  force Random Forest / Monte Carlo onto a chosen outcome (e.g. "Status of
 *  MDA" or "Did anybody complain of side effects during MDA?"). */
function targetFeature(
  subs: NarrativeSubmission[], qs: NarrativeQuestion[], pattern: RegExp,
): Feature | null {
  const q = flatten(qs).filter((x) => x.type !== "note").find(
    (x) => pattern.test(x.label || "") || pattern.test(x.name || "") || pattern.test(x.id),
  );
  if (!q) return null;
  const values = subs.map((s) => toNumericOrdinal(readValue(s.data || {}, q)));
  const present = values.filter((v): v is number => v !== null);
  if (present.length < Math.max(4, subs.length * 0.1)) return null;
  const distinct = new Set(present).size;
  if (distinct < 2) return null;
  const mean = present.reduce((a, b) => a + b, 0) / present.length;
  const varc = present.reduce((a, b) => a + (b - mean) ** 2, 0) / present.length;
  return { key: q.id, label: q.label || pretty(q.name || q.id), values, distinct, variance: varc };
}

// ─────────────────────────── Random Forest ───────────────────────────
// A compact regression random forest built from bootstrapped variance-reduction
// trees on random feature subsets. We report normalized feature importances
// (share of total variance explained) — i.e. the strongest drivers of a chosen
// outcome. Deterministic seed keeps results stable between renders.

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Row { x: number[]; y: number }

function variance(rows: Row[]): number {
  if (rows.length === 0) return 0;
  const m = rows.reduce((a, r) => a + r.y, 0) / rows.length;
  return rows.reduce((a, r) => a + (r.y - m) ** 2, 0) / rows.length;
}

function buildTree(
  rows: Row[], depth: number, maxDepth: number, minLeaf: number,
  featCount: number, importance: number[], rnd: () => number,
): void {
  if (depth >= maxDepth || rows.length < minLeaf * 2) return;
  const baseVar = variance(rows);
  if (baseVar <= 0) return;
  // random subset of features (sqrt heuristic)
  const nTry = Math.max(1, Math.round(Math.sqrt(featCount)));
  const order = [...Array(featCount).keys()].sort(() => rnd() - 0.5).slice(0, nTry);
  let best: { f: number; thr: number; gain: number; left: Row[]; right: Row[] } | null = null;
  for (const f of order) {
    const vals = [...new Set(rows.map((r) => r.x[f]).filter((v) => Number.isFinite(v)))].sort((a, b) => a - b);
    for (let i = 1; i < vals.length; i++) {
      const thr = (vals[i - 1] + vals[i]) / 2;
      const left = rows.filter((r) => r.x[f] <= thr);
      const right = rows.filter((r) => r.x[f] > thr);
      if (left.length < minLeaf || right.length < minLeaf) continue;
      const gain = baseVar - (left.length * variance(left) + right.length * variance(right)) / rows.length;
      if (gain > 0 && (!best || gain > best.gain)) best = { f, thr, gain, left, right };
    }
  }
  if (!best) return;
  importance[best.f] += best.gain * rows.length;
  buildTree(best.left, depth + 1, maxDepth, minLeaf, featCount, importance, rnd);
  buildTree(best.right, depth + 1, maxDepth, minLeaf, featCount, importance, rnd);
}

export interface RandomForestResult {
  target: string;
  drivers: { label: string; importance: number }[];
  interpretation: string;
  sampleSize: number;
}

function pickTarget(feats: Feature[]): Feature | null {
  if (!feats.length) return null;
  const priority = /coverage|score|percent|%|rate|total|reach|treated|quality|complete|attendance/i;
  const preferred = feats.filter((f) => priority.test(f.label));
  const pool = preferred.length ? preferred : feats;
  // richest signal = most distinct values × variance
  return [...pool].sort((a, b) => b.distinct * b.variance - a.distinct * a.variance)[0] || null;
}

export function randomForest(
  subs: NarrativeSubmission[], qs: NarrativeQuestion[], targetOverride?: Feature,
): RandomForestResult | null {
  const feats = buildFeatures(subs, qs);
  if (!targetOverride && feats.length < 3) return null;
  const target = targetOverride || pickTarget(feats);
  if (!target) return null;
  const predictors = feats.filter((f) => f.key !== target.key);
  if (predictors.length < 2) return null;

  // Rows with complete predictor+target values.
  const rows: Row[] = [];
  subs.forEach((_, i) => {
    const y = target.values[i];
    if (y === null) return;
    const x = predictors.map((p) => p.values[i]);
    if (x.some((v) => v === null)) return;
    rows.push({ x: x as number[], y });
  });
  if (rows.length < 8) return null;

  const rnd = mulberry32(1337 + rows.length);
  const importance = new Array(predictors.length).fill(0);
  const trees = 40;
  for (let t = 0; t < trees; t++) {
    const boot: Row[] = Array.from({ length: rows.length }, () => rows[Math.floor(rnd() * rows.length)]);
    buildTree(boot, 0, 6, 3, predictors.length, importance, rnd);
  }
  const total = importance.reduce((a, b) => a + b, 0) || 1;
  const drivers = predictors
    .map((p, i) => ({ label: p.label, importance: (importance[i] / total) * 100 }))
    .filter((d) => d.importance > 0.5)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);
  if (!drivers.length) return null;

  const top = drivers[0];
  const second = drivers[1];
  const interpretation =
    `Across ${rows.length} complete records, “${top.label}” is the single biggest driver of ${target.label.toLowerCase()} ` +
    `(${pct(top.importance)} of the explained pattern)` +
    (second ? `, followed by “${second.label}” (${pct(second.importance)}).` : ".") +
    ` In plain terms: to move ${target.label.toLowerCase()}, focus first on ${top.label.toLowerCase()}.`;

  return { target: target.label, drivers, interpretation, sampleSize: rows.length };
}

// ─────────────────────────── Monte Carlo ───────────────────────────
// Bootstrap resampling of the observed outcome to estimate the probability of
// different future results and a 90% credible band — answering "what's likely
// to happen next if current patterns hold?".

export interface MonteCarloResult {
  metric: string;
  mean: number;
  p05: number;
  p95: number;
  probAbove: { threshold: number; probability: number };
  isRate: boolean;
  interpretation: string;
  runs: number;
}

export function monteCarlo(
  subs: NarrativeSubmission[], qs: NarrativeQuestion[], targetOverride?: Feature,
): MonteCarloResult | null {
  const feats = buildFeatures(subs, qs);
  const target = targetOverride || pickTarget(feats);
  if (!target) return null;
  const observed = target.values.filter((v): v is number => v !== null);
  if (observed.length < 6) return null;

  const isRate = observed.every((v) => v >= 0 && v <= 1) || /%|percent|rate|coverage/i.test(target.label);
  const rnd = mulberry32(97 + observed.length);
  const runs = 4000;
  const sampleSize = Math.max(1, Math.round(observed.length / 2));
  const means: number[] = [];
  for (let r = 0; r < runs; r++) {
    let sum = 0;
    for (let i = 0; i < sampleSize; i++) sum += observed[Math.floor(rnd() * observed.length)];
    means.push(sum / sampleSize);
  }
  means.sort((a, b) => a - b);
  const q = (p: number) => means[Math.min(means.length - 1, Math.floor(p * means.length))];
  const mean = means.reduce((a, b) => a + b, 0) / means.length;

  // Probability the metric clears a meaningful benchmark (80% for rates, the
  // observed median for raw counts).
  const observedSorted = [...observed].sort((a, b) => a - b);
  const median = observedSorted[Math.floor(observedSorted.length / 2)];
  const threshold = isRate ? (observed.every((v) => v <= 1) ? 0.8 : 80) : median;
  const probAbove = means.filter((m) => m >= threshold).length / means.length;

  const fmt = (v: number) => (isRate && observed.every((x) => x <= 1) ? pct(v * 100) : v.toFixed(1));
  const interpretation =
    `Simulating ${runs.toLocaleString()} random draws from the collected ${target.label.toLowerCase()}, the most likely ` +
    `result is around ${fmt(mean)}, and 9 out of 10 outcomes fall between ${fmt(q(0.05))} and ${fmt(q(0.95))}. ` +
    `There is a ${pct(probAbove * 100)} chance of meeting the ${fmt(threshold)} benchmark if current patterns continue` +
    `${probAbove < 0.5 ? " — a real risk that warrants intervention now." : " — broadly on track, keep monitoring."}`;

  return {
    metric: target.label,
    mean, p05: q(0.05), p95: q(0.95),
    probAbove: { threshold, probability: probAbove },
    isRate, interpretation, runs,
  };
}

// ─────────────────────────── Hypothesis testing ───────────────────────────
// Tests whether a coverage/outcome metric differs significantly across LGAs
// (one-way ANOVA) and whether it differs from a benchmark (t-based CI).

export interface HypothesisTest {
  metric: string;
  groupsTested: number;
  anovaP: number | null;
  significant: boolean;
  ciLow: number;
  ciHigh: number;
  interpretation: string;
}

function pickMetricByName(feats: Feature[], pattern: RegExp): Feature | null {
  return feats.find((f) => pattern.test(f.label)) || null;
}

export function hypothesisTest(
  subs: NarrativeSubmission[], qs: NarrativeQuestion[], pattern: RegExp, metricName: string,
): HypothesisTest | null {
  const feats = buildFeatures(subs, qs);
  const feat = pickMetricByName(feats, pattern) || pickTarget(feats);
  if (!feat) return null;

  const all: number[] = [];
  const byLga: Record<string, number[]> = {};
  subs.forEach((s, i) => {
    const v = feat.values[i];
    if (v === null) return;
    all.push(v);
    const g = (s.lga || "Unknown").trim() || "Unknown";
    (byLga[g] ||= []).push(v);
  });
  if (all.length < 6) return null;

  const ci = meanConfidenceInterval(all);
  const groups = Object.values(byLga).filter((g) => g.length >= 2);
  const anova = groups.length >= 2 ? oneWayAnova(groups) : null;
  const significant = !!anova?.significant;

  const meanTxt = ci ? ci.mean.toFixed(1) : "n/a";
  const interpretation = anova
    ? `${metricName} varies ${significant ? "significantly" : "only modestly"} across ${anova.groups} LGAs ` +
      `(${formatP(anova.pValue)}). ${significant
        ? "The gaps between LGAs are unlikely to be chance — the lagging LGAs need targeted support, not blanket action."
        : "Differences between LGAs look like normal variation — a uniform strategy is reasonable for now."} ` +
      `Overall mean ≈ ${meanTxt}${feat.label.match(/%|percent|coverage|rate/i) ? "%" : ""}.`
    : `${metricName} averages ${meanTxt} across ${all.length} records; not enough LGA spread yet for a group comparison.`;

  return {
    metric: feat.label,
    groupsTested: anova?.groups ?? 0,
    anovaP: anova?.pValue ?? null,
    significant,
    ciLow: ci?.ciLow ?? 0,
    ciHigh: ci?.ciHigh ?? 0,
    interpretation,
  };
}

// ─────────────────────────── Text mining base ───────────────────────────

const STOP = new Set(
  ("the a an and or but if then of to in on at by for with from is are was were be been being this that these those it its as we they you i he she " +
    "his her their our your not no yes will would can could should may might do does did have has had there here what which who whom whose when where why how " +
    "all any some more most other into than too very just also about over under out up down off only own same so nor").split(/\s+/),
);

function collectText(subs: NarrativeSubmission[], qs: NarrativeQuestion[]): string[] {
  const flat = flatten(qs);
  const textQs = flat.filter((q) => q.type === "text" || q.type === "note" || !q.options?.length);
  const docs: string[] = [];
  for (const s of subs) {
    const parts: string[] = [];
    for (const q of textQs) {
      const v = readValue(s.data || {}, q);
      if (typeof v === "string" && v.trim().length > 12 && /[a-zA-Z]/.test(v) && v.split(/\s+/).length >= 3) {
        parts.push(v.trim());
      }
    }
    if (parts.length) docs.push(parts.join(". "));
  }
  return docs;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

// ─────────────────────────── Grounded Theory ───────────────────────────
// Open coding (frequent terms) → axial grouping (co-occurring codes) →
// a "core category" (the most connected theme) with an interpretation.

export interface GroundedTheoryResult {
  documents: number;
  codes: { code: string; count: number }[];
  categories: { name: string; codes: string[]; weight: number }[];
  coreCategory: string;
  interpretation: string;
}

export function groundedTheory(subs: NarrativeSubmission[], qs: NarrativeQuestion[]): GroundedTheoryResult | null {
  const docs = collectText(subs, qs);
  if (docs.length < 4) return null;
  const tokenSets = docs.map((d) => tokenize(d));
  const freq = new Map<string, number>();
  for (const toks of tokenSets) for (const t of new Set(toks)) freq.set(t, (freq.get(t) || 0) + 1);
  const codes = [...freq.entries()]
    .filter(([, c]) => c >= Math.max(2, docs.length * 0.15))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([code, count]) => ({ code, count }));
  if (codes.length < 2) return null;

  // Axial coding: group codes that frequently co-occur in the same document.
  const codeList = codes.map((c) => c.code);
  const cooc = (a: string, b: string) =>
    tokenSets.filter((s) => s.includes(a) && s.includes(b)).length;
  const used = new Set<string>();
  const categories: { name: string; codes: string[]; weight: number }[] = [];
  for (const c of codeList) {
    if (used.has(c)) continue;
    const group = [c];
    used.add(c);
    for (const other of codeList) {
      if (used.has(other)) continue;
      if (cooc(c, other) >= Math.max(2, docs.length * 0.1)) { group.push(other); used.add(other); }
    }
    const weight = group.reduce((a, g) => a + (freq.get(g) || 0), 0);
    categories.push({ name: pretty(group[0]), codes: group, weight });
  }
  categories.sort((a, b) => b.weight - a.weight);
  const core = categories[0];
  const coreCategory = core.name;
  const interpretation =
    `From ${docs.length} free-text responses, the recurring concept is “${coreCategory}”` +
    (core.codes.length > 1 ? ` — closely tied to ${core.codes.slice(1, 3).map(pretty).join(" & ")}. ` : ". ") +
    `This is what field teams are consistently raising, so it should shape the next supervision briefing and corrective plan.`;

  return { documents: docs.length, codes, categories: categories.slice(0, 5), coreCategory, interpretation };
}

// ─────────────────────────── Discourse Analysis ───────────────────────────
// Reads HOW issues are expressed: sentiment balance, sense of agency
// (we/team vs external), urgency/modality, and problem-vs-solution framing.

const POS = new Set("good great success successful improved improve effective adequate available complete completed resolved strong positive achieved met on track cooperative willing".split(/\s+/));
const NEG = new Set("poor bad fail failed failure lack lacking shortage delay delayed refuse refused refusal problem issue challenge difficult insufficient inadequate missing absent stockout unavailable weak concern complaint".split(/\s+/));
const MODAL = new Set("must should need needs require required urgent immediately ensure recommend recommended".split(/\s+/));
const AGENCY_SELF = new Set("we our us team supervisor supervisors staff facility ward".split(/\s+/));
const AGENCY_EXT = new Set("they their community communities parents government donor others external".split(/\s+/));
const SOLUTION = new Set("plan train retrain provide supply deploy engage sensitize mobilize follow monitor support strengthen".split(/\s+/));

export interface DiscourseResult {
  documents: number;
  sentiment: { positive: number; negative: number; neutral: number };
  urgency: number;
  agency: "internal" | "external" | "balanced";
  framing: "problem-focused" | "solution-focused" | "balanced";
  interpretation: string;
}

export function discourseAnalysis(subs: NarrativeSubmission[], qs: NarrativeQuestion[]): DiscourseResult | null {
  const docs = collectText(subs, qs);
  if (docs.length < 4) return null;
  let pos = 0, neg = 0, modal = 0, self = 0, ext = 0, sol = 0, prob = 0, total = 0;
  let docPos = 0, docNeg = 0;
  for (const d of docs) {
    const toks = tokenize(d);
    let dp = 0, dn = 0;
    for (const t of toks) {
      total++;
      if (POS.has(t)) { pos++; dp++; }
      if (NEG.has(t)) { neg++; dn++; prob++; }
      if (MODAL.has(t)) modal++;
      if (AGENCY_SELF.has(t)) self++;
      if (AGENCY_EXT.has(t)) ext++;
      if (SOLUTION.has(t)) sol++;
    }
    if (dp > dn) docPos++; else if (dn > dp) docNeg++;
  }
  const neutral = docs.length - docPos - docNeg;
  const sentiment = {
    positive: Math.round((docPos / docs.length) * 100),
    negative: Math.round((docNeg / docs.length) * 100),
    neutral: Math.round((neutral / docs.length) * 100),
  };
  const urgency = Math.round((modal / Math.max(1, total)) * 1000) / 10;
  const agency = self > ext * 1.2 ? "internal" : ext > self * 1.2 ? "external" : "balanced";
  const framing = sol > prob * 1.2 ? "solution-focused" : prob > sol * 1.2 ? "problem-focused" : "balanced";

  const agencyTxt = agency === "internal"
    ? "teams frame themselves as responsible for outcomes (a good sign of ownership)"
    : agency === "external"
      ? "responsibility is largely placed on communities/external factors — pair accountability with community engagement"
      : "responsibility is shared between teams and communities";
  const framingTxt = framing === "solution-focused"
    ? "language is action-oriented, proposing fixes"
    : framing === "problem-focused"
      ? "language dwells on problems more than solutions — prompt teams to record proposed actions"
      : "problems and solutions are mentioned in balance";

  const interpretation =
    `Across ${docs.length} narratives, tone is ${sentiment.negative > sentiment.positive ? "predominantly critical" : sentiment.positive > sentiment.negative ? "broadly positive" : "mixed"} ` +
    `(${sentiment.positive}% positive / ${sentiment.negative}% negative). ${agencyTxt.charAt(0).toUpperCase() + agencyTxt.slice(1)}; ${framingTxt}. ` +
    `${urgency > 2 ? "Frequent urgency markers signal issues needing prompt escalation." : "Few urgency markers — no widespread emergency language."}`;

  return { documents: docs.length, sentiment, urgency, agency, framing, interpretation };
}

// ─────────────────────────── Orchestrator ───────────────────────────

export interface AdvancedAnalyticsResult {
  hasData: boolean;
  randomForest: RandomForestResult | null;
  monteCarlo: MonteCarloResult | null;
  hypothesis: HypothesisTest[];
  groundedTheory: GroundedTheoryResult | null;
  discourse: DiscourseResult | null;
}

export interface AdvancedAnalyticsOptions {
  /** Extra named hypothesis tests, e.g. therapeutic & household coverage. */
  hypotheses?: { name: string; pattern: RegExp }[];
}

export function buildAdvancedAnalytics(
  subs: NarrativeSubmission[],
  qs: NarrativeQuestion[],
  opts: AdvancedAnalyticsOptions = {},
): AdvancedAnalyticsResult {
  const submissions = subs || [];
  const questions = qs || [];
  const hypotheses = (opts.hypotheses || []).map((h) => hypothesisTest(submissions, questions, h.pattern, h.name)).filter(Boolean) as HypothesisTest[];
  const rf = randomForest(submissions, questions);
  const mc = monteCarlo(submissions, questions);
  const gt = groundedTheory(submissions, questions);
  const da = discourseAnalysis(submissions, questions);
  return {
    hasData: !!(rf || mc || gt || da || hypotheses.length),
    randomForest: rf,
    monteCarlo: mc,
    hypothesis: hypotheses,
    groundedTheory: gt,
    discourse: da,
  };
}
