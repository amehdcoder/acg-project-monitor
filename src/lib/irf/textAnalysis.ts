// Narrative & free-text analysis for the SARMAAN ACSM (SAIRF) dashboard.
//
// Aggregates every text/longtext field captured across the standalone activity
// forms (narrative, purpose, commitments, issues raised/resolved, outcomes, etc.)
// plus free-form `answers` values, then surfaces professional, insightful
// summaries: keyword frequency, theme detection and representative excerpts.

import type { IrfReport } from "@/lib/irf/definition";

// Known free-text columns on irf_reports worth analysing.
const TEXT_COLUMNS = [
  "narrative",
  "issues_raised",
  "issues_resolved",
  "state_advocacy_outcomes",
  "emirate_council_support",
  "traditional_leaders_support",
  "religious_leaders_support_mode",
  "mdas_names",
  "policy_makers_names",
  "iec_locations",
  "noncompliance_type",
  "resolution_method",
] as const;

const STOPWORDS = new Set(
  ("a an and the of to in on for with at by from is was are were be been being this that these those it its as or but if then so we our us they their them he she his her i you your not no yes all any can will just into out over under more most other some such own very during about after before above below between also did does has have had having who whom which what when where why how than too only here there up down off again further once each few both".split(
    " ",
  )),
);

// Thematic lexicon — maps a public-health theme to trigger words.
const THEMES: { theme: string; color: string; words: string[] }[] = [
  { theme: "Commitment & Support", color: "#16a34a", words: ["commit", "support", "endorse", "approve", "pledge", "agree", "fund", "release", "donate", "provide"] },
  { theme: "Resistance & Non-compliance", color: "#dc2626", words: ["refus", "reject", "resist", "non-compli", "noncompli", "decline", "against", "myth", "rumor", "rumour", "misconcept", "fear", "hesit"] },
  { theme: "Engagement & Mobilisation", color: "#0891b2", words: ["engage", "mobil", "sensiti", "announc", "dialogue", "meeting", "advoca", "aware", "campaign", "outreach"] },
  { theme: "Religious & Traditional", color: "#7c3aed", words: ["imam", "mosque", "church", "pastor", "religi", "emir", "chief", "tradition", "leader", "council"] },
  { theme: "Health System", color: "#0ea5e9", words: ["health", "facility", "clinic", "phc", "worker", "drug", "medicine", "vaccin", "treatment", "coverage"] },
  { theme: "Challenges & Gaps", color: "#f59e0b", words: ["challeng", "gap", "delay", "shortage", "lack", "insuffic", "logistic", "transport", "security", "weak", "poor"] },
];

export interface TextThemeStat { theme: string; color: string; mentions: number; reports: number; share: number; }
export interface KeywordStat { word: string; count: number; }
export interface TextExcerpt { id: string; field: string; lga: string | null; text: string; period: string | null; }
export interface FieldCoverage { field: string; label: string; answered: number; total: number; pct: number; avgWords: number; }

export interface IrfTextAnalysis {
  totalEntries: number;
  totalWords: number;
  uniqueWords: number;
  avgWordsPerEntry: number;
  keywords: KeywordStat[];
  themes: TextThemeStat[];
  excerpts: TextExcerpt[];
  fieldCoverage: FieldCoverage[];
  sentiment: { positive: number; negative: number; neutral: number };
}

const FIELD_LABELS: Record<string, string> = {
  narrative: "Narrative / notes",
  issues_raised: "Issues raised",
  issues_resolved: "Issues resolved",
  state_advocacy_outcomes: "State advocacy outcomes",
  emirate_council_support: "Emirate council support",
  traditional_leaders_support: "Traditional leaders support",
  religious_leaders_support_mode: "Religious leaders support",
  mdas_names: "MDAs engaged",
  policy_makers_names: "Policy makers",
  iec_locations: "IEC locations",
  noncompliance_type: "Non-compliance type",
  resolution_method: "Resolution method",
};

const prettyKey = (k: string) => FIELD_LABELS[k] || k.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

const tokenize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

const POSITIVE = ["support", "commit", "endorse", "agree", "success", "good", "improve", "approve", "resolved", "achiev", "effective", "strong", "willing", "positive"];
const NEGATIVE = ["refus", "reject", "resist", "fear", "myth", "rumor", "rumour", "challeng", "gap", "delay", "lack", "poor", "weak", "shortage", "against", "misconcept", "fail"];

function collectTexts(r: IrfReport): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  TEXT_COLUMNS.forEach((c) => {
    const v = (r as any)[c];
    if (typeof v === "string" && v.trim().length > 1) out.push({ field: c, text: v.trim() });
  });
  // Free-form answers object.
  const ans = (r as any).answers;
  if (ans && typeof ans === "object") {
    Object.entries(ans).forEach(([k, v]) => {
      if (typeof v === "string" && v.trim().length > 3 && /[a-z]/i.test(v)) out.push({ field: k, text: v.trim() });
    });
  }
  return out;
}

export function analyzeText(rows: IrfReport[]): IrfTextAnalysis {
  const wordCounts = new Map<string, number>();
  const themeMentions = new Map<string, number>();
  const themeReports = new Map<string, Set<string>>();
  const excerpts: TextExcerpt[] = [];
  const fieldStats = new Map<string, { answered: number; words: number }>();
  let totalEntries = 0;
  let totalWords = 0;
  let pos = 0, neg = 0, neu = 0;

  THEMES.forEach((t) => { themeMentions.set(t.theme, 0); themeReports.set(t.theme, new Set()); });

  rows.forEach((r) => {
    const texts = collectTexts(r);
    texts.forEach(({ field, text }) => {
      totalEntries += 1;
      const tokens = tokenize(text);
      totalWords += tokens.length;
      tokens.forEach((w) => wordCounts.set(w, (wordCounts.get(w) || 0) + 1));

      const fs = fieldStats.get(field) || { answered: 0, words: 0 };
      fs.answered += 1; fs.words += tokens.length;
      fieldStats.set(field, fs);

      const lower = text.toLowerCase();
      let entryPos = false, entryNeg = false;
      THEMES.forEach((t) => {
        const hit = t.words.some((w) => lower.includes(w));
        if (hit) {
          themeMentions.set(t.theme, (themeMentions.get(t.theme) || 0) + 1);
          themeReports.get(t.theme)!.add(r.id);
        }
      });
      if (POSITIVE.some((w) => lower.includes(w))) entryPos = true;
      if (NEGATIVE.some((w) => lower.includes(w))) entryNeg = true;
      if (entryPos && !entryNeg) pos += 1;
      else if (entryNeg && !entryPos) neg += 1;
      else neu += 1;

      if (field === "narrative" || text.length > 40) {
        excerpts.push({
          id: r.id, field: prettyKey(field), lga: r.lga,
          text: text.length > 240 ? text.slice(0, 240) + "…" : text,
          period: r.reporting_period || (r.reporting_month || "").slice(0, 7) || null,
        });
      }
    });
  });

  const keywords = [...wordCounts.entries()].map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count).slice(0, 30);

  const themes: TextThemeStat[] = THEMES.map((t) => {
    const mentions = themeMentions.get(t.theme) || 0;
    const reports = themeReports.get(t.theme)!.size;
    return { theme: t.theme, color: t.color, mentions, reports, share: totalEntries ? Math.round((mentions / totalEntries) * 100) : 0 };
  }).sort((a, b) => b.mentions - a.mentions);

  const fieldCoverage: FieldCoverage[] = [...fieldStats.entries()].map(([field, s]) => ({
    field, label: prettyKey(field), answered: s.answered, total: rows.length,
    pct: rows.length ? Math.round((s.answered / rows.length) * 100) : 0,
    avgWords: s.answered ? Math.round(s.words / s.answered) : 0,
  })).sort((a, b) => b.answered - a.answered);

  return {
    totalEntries, totalWords, uniqueWords: wordCounts.size,
    avgWordsPerEntry: totalEntries ? Math.round(totalWords / totalEntries) : 0,
    keywords, themes,
    excerpts: excerpts.sort((a, b) => b.text.length - a.text.length).slice(0, 24),
    fieldCoverage,
    sentiment: { positive: pos, negative: neg, neutral: neu },
  };
}
