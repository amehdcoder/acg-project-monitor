// Form-scoped, LGA-wise free-text intelligence for the SAIRF dashboard.
//
// Several qualitative fields share the same column key across different activity
// forms (e.g. `issues_raised` exists on both Community Dialogue and Compound
// Meeting). To keep the analysis meaningful, every field is analysed strictly
// within its own form (`form_category`), then broken down by LGA with theme
// detection, sentiment, key phrases and representative verbatim quotes.

import type { IrfReport } from "@/lib/irf/definition";

export interface FreeTextSpec {
  formId: string;      // irf_reports.form_category
  formName: string;
  color: string;
  field: string;       // column / answers key
  label: string;       // human label (matches the form question)
}

/** The exact fields requested for form-scoped narrative intelligence. */
export const FREE_TEXT_SPECS: FreeTextSpec[] = [
  { formId: "community_dialogue", formName: "Community Dialogue", color: "#16a34a", field: "issues_raised", label: "Issues / misconceptions raised" },
  { formId: "community_dialogue", formName: "Community Dialogue", color: "#16a34a", field: "issues_resolved", label: "Issues resolved" },
  { formId: "compound_meeting", formName: "Compound Meeting", color: "#7c3aed", field: "key_messages", label: "Key messages delivered" },
  { formId: "compound_meeting", formName: "Compound Meeting", color: "#7c3aed", field: "issues_raised", label: "Issues / concerns raised" },
  { formId: "town_announcers", formName: "Town Announcers", color: "#ea580c", field: "issues", label: "Issues observed" },
  { formId: "advocacy_supervision", formName: "Advocacy Supervision", color: "#0891b2", field: "purpose", label: "Purpose of advocacy" },
  { formId: "advocacy_supervision", formName: "Advocacy Supervision", color: "#0891b2", field: "commitments", label: "Commitments / decisions made" },
  { formId: "advocacy_supervision", formName: "Advocacy Supervision", color: "#0891b2", field: "support_mode", label: "Type of support" },
];

const STOPWORDS = new Set(
  "a an and the of to in on for with at by from is was are were be been being this that these those it its as or but if then so we our us they their them he she his her i you your not no yes all any can will just into out over under more most other some such own very during about after before above below between also did does has have had having who whom which what when where why how than too only here there up down off again further once each few both was has been will".split(" "),
);

const THEMES: { theme: string; color: string; words: string[] }[] = [
  { theme: "Misconceptions & rumours", color: "#dc2626", words: ["myth", "rumor", "rumour", "misconcept", "belief", "superstit", "fake", "false", "wrong", "distrust", "suspicio"] },
  { theme: "Fear & safety concerns", color: "#f59e0b", words: ["fear", "afraid", "side effect", "sideeffect", "unsafe", "harm", "danger", "reaction", "sick", "sterili", "infertil"] },
  { theme: "Religious / cultural", color: "#7c3aed", words: ["religio", "islam", "haram", "imam", "mosque", "pastor", "church", "tradition", "cultur", "sermon", "emir", "chief"] },
  { theme: "Access & logistics", color: "#0ea5e9", words: ["access", "distance", "far", "transport", "stockout", "shortage", "supply", "logistic", "drug", "medicine", "delay", "timing"] },
  { theme: "Trust & sensitisation", color: "#0891b2", words: ["sensiti", "aware", "educat", "explain", "clarif", "dialogue", "engage", "mobil", "inform", "announc"] },
  { theme: "Acceptance & commitment", color: "#16a34a", words: ["accept", "agree", "commit", "support", "endorse", "approve", "pledge", "cooperat", "willing", "welcome", "embrace"] },
  { theme: "Resistance & refusal", color: "#991b1b", words: ["refus", "reject", "resist", "declin", "against", "non-compli", "noncompli", "hesit", "boycott"] },
  { theme: "Funding & resources", color: "#bf9000", words: ["fund", "money", "budget", "financ", "resource", "release", "donate", "provide", "material", "incentiv", "stipend"] },
];

const POSITIVE = ["support", "commit", "endorse", "agree", "success", "good", "improve", "approve", "resolved", "resolve", "achiev", "effective", "strong", "willing", "positive", "accept", "welcome", "cooperat"];
const NEGATIVE = ["refus", "reject", "resist", "fear", "myth", "rumor", "rumour", "challeng", "gap", "delay", "lack", "poor", "weak", "shortage", "against", "misconcept", "fail", "unsafe", "distrust"];

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
const tokenize = (s: string) => clean(s).split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

function sentimentOf(text: string): "positive" | "negative" | "neutral" {
  const l = text.toLowerCase();
  const pos = POSITIVE.some((w) => l.includes(w));
  const neg = NEGATIVE.some((w) => l.includes(w));
  if (pos && !neg) return "positive";
  if (neg && !pos) return "negative";
  return "neutral";
}

export interface LgaTextRow {
  lga: string;
  responses: number;
  keywords: { word: string; count: number }[];
  themes: { theme: string; color: string; count: number }[];
  sentiment: { positive: number; negative: number; neutral: number };
  topQuote: string | null;
}

export interface FreeTextFieldAnalysis {
  formId: string;
  formName: string;
  color: string;
  field: string;
  label: string;
  responses: number;
  respondingLgas: number;
  themes: { theme: string; color: string; mentions: number; share: number }[];
  phrases: { phrase: string; count: number }[];
  sentiment: { positive: number; negative: number; neutral: number };
  byLga: LgaTextRow[];
  topQuotes: { lga: string; text: string; sentiment: string }[];
}

const num = (v: any) => v;
const lgaOf = (r: IrfReport) => {
  const v = (r.lga ?? "").toString().trim();
  return v && v.toLowerCase() !== "unspecified" ? v : "Unspecified";
};

function detectThemes(text: string): { theme: string; color: string }[] {
  const l = text.toLowerCase();
  return THEMES.filter((t) => t.words.some((w) => l.includes(w))).map((t) => ({ theme: t.theme, color: t.color }));
}

/** Analyse one form-scoped field across all reports, grouped by LGA. */
export function analyzeFreeTextField(rows: IrfReport[], spec: FreeTextSpec): FreeTextFieldAnalysis {
  const scoped = rows.filter((r) => ((r as any).form_category || "") === spec.formId);

  const lgaMap = new Map<string, {
    responses: number;
    words: Map<string, number>;
    themes: Map<string, { color: string; count: number }>;
    sentiment: { positive: number; negative: number; neutral: number };
    best: { text: string; len: number } | null;
  }>();

  const globalWords = new Map<string, number>();
  const globalPhrases = new Map<string, number>();
  const globalThemes = new Map<string, number>();
  const globalSent = { positive: 0, negative: 0, neutral: 0 };
  const topQuotes: { lga: string; text: string; sentiment: string; len: number }[] = [];
  let responses = 0;

  for (const r of scoped) {
    const raw = num((r as any)[spec.field]);
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    if (text.length < 2 || !/[a-z]/i.test(text)) continue;
    responses += 1;
    const lga = lgaOf(r);
    const bucket = lgaMap.get(lga) || {
      responses: 0, words: new Map(), themes: new Map(),
      sentiment: { positive: 0, negative: 0, neutral: 0 }, best: null,
    };
    bucket.responses += 1;

    const tokens = tokenize(text);
    tokens.forEach((w) => {
      bucket.words.set(w, (bucket.words.get(w) || 0) + 1);
      globalWords.set(w, (globalWords.get(w) || 0) + 1);
    });
    for (let i = 0; i < tokens.length - 1; i++) {
      const ph = `${tokens[i]} ${tokens[i + 1]}`;
      globalPhrases.set(ph, (globalPhrases.get(ph) || 0) + 1);
    }

    detectThemes(text).forEach(({ theme, color }) => {
      const cur = bucket.themes.get(theme) || { color, count: 0 };
      cur.count += 1;
      bucket.themes.set(theme, cur);
      globalThemes.set(theme, (globalThemes.get(theme) || 0) + 1);
    });

    const sent = sentimentOf(text);
    bucket.sentiment[sent] += 1;
    globalSent[sent] += 1;

    if (!bucket.best || text.length > bucket.best.len) bucket.best = { text, len: text.length };
    if (text.length > 25) topQuotes.push({ lga, text: text.length > 260 ? text.slice(0, 260) + "…" : text, sentiment: sent, len: text.length });

    lgaMap.set(lga, bucket);
  }

  const byLga: LgaTextRow[] = [...lgaMap.entries()].map(([lga, b]) => ({
    lga,
    responses: b.responses,
    keywords: [...b.words.entries()].map(([word, count]) => ({ word, count })).sort((a, c) => c.count - a.count).slice(0, 8),
    themes: [...b.themes.entries()].map(([theme, v]) => ({ theme, color: v.color, count: v.count })).sort((a, c) => c.count - a.count),
    sentiment: b.sentiment,
    topQuote: b.best ? (b.best.text.length > 220 ? b.best.text.slice(0, 220) + "…" : b.best.text) : null,
  })).sort((a, c) => c.responses - a.responses);

  const themes = THEMES
    .map((t) => ({ theme: t.theme, color: t.color, mentions: globalThemes.get(t.theme) || 0 }))
    .filter((t) => t.mentions > 0)
    .map((t) => ({ ...t, share: responses ? Math.round((t.mentions / responses) * 100) : 0 }))
    .sort((a, c) => c.mentions - a.mentions);

  const phrases = [...globalPhrases.entries()]
    .filter(([, c]) => c > 1)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, c) => c.count - a.count)
    .slice(0, 12);

  return {
    formId: spec.formId, formName: spec.formName, color: spec.color, field: spec.field, label: spec.label,
    responses, respondingLgas: byLga.length, themes, phrases, sentiment: globalSent, byLga,
    topQuotes: topQuotes.sort((a, c) => c.len - a.len).slice(0, 6).map(({ lga, text, sentiment }) => ({ lga, text, sentiment })),
  };
}

export interface FreeTextGroup {
  formId: string;
  formName: string;
  color: string;
  fields: FreeTextFieldAnalysis[];
}

/** Analyse all requested free-text fields, grouped by form. */
export function analyzeFreeTextIntel(rows: IrfReport[]): FreeTextGroup[] {
  const groups = new Map<string, FreeTextGroup>();
  for (const spec of FREE_TEXT_SPECS) {
    const analysis = analyzeFreeTextField(rows, spec);
    const g = groups.get(spec.formId) || { formId: spec.formId, formName: spec.formName, color: spec.color, fields: [] };
    g.fields.push(analysis);
    groups.set(spec.formId, g);
  }
  return [...groups.values()];
}
