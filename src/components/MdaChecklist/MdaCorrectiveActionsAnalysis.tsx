import { useMemo } from "react";
import {
  Wrench, AlertTriangle, ListChecks, UserCheck, CalendarClock, Quote, Cloud,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Sub {
  id: string;
  data?: Record<string, any>;
  [k: string]: any;
}

interface Props {
  submissions: Sub[];
}

/** Corrective Actions section field keys (Section 12 of the checklist). */
const ISSUE_KEY = "issues_identified";
const ACTION_KEY = "corrective_actions";
const RESP_KEY = "responsible_person";
const DEADLINE_KEY = "action_deadline";

const STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "were", "with", "that", "this", "have", "has",
  "had", "not", "but", "you", "all", "any", "can", "her", "him", "his", "she", "our",
  "out", "who", "get", "got", "them", "they", "then", "there", "here", "been", "being",
  "from", "into", "over", "some", "such", "than", "too", "very", "will", "would", "should",
  "could", "did", "does", "done", "each", "few", "more", "most", "other", "onto", "off",
  "per", "via", "yet", "also", "about", "after", "again", "before", "how", "its", "may",
  "must", "now", "one", "two", "use", "used", "using", "due", "etc", "was", "were", "a",
  "an", "of", "to", "in", "on", "at", "by", "or", "as", "is", "be", "it", "no", "so",
  "we", "up", "if", "do", "my", "me", "him", "was", "were",
]);

const PALETTE = [
  "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#f59e0b", "#10b981", "#14b8a6", "#0891b2", "#7c3aed", "#db2777",
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function freq(texts: string[]): { word: string; count: number }[] {
  const m = new Map<string, number>();
  for (const t of texts) {
    for (const w of tokenize(t)) m.set(w, (m.get(w) || 0) + 1);
  }
  return [...m.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

const strOf = (s: Sub, key: string): string => {
  const v = s.data?.[key] ?? (s as any)[key];
  if (v == null) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v).trim();
};

function WordCloud({ words }: { words: { word: string; count: number }[] }) {
  const top = words.slice(0, 60);
  if (!top.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No text yet to build a word cloud.
      </div>
    );
  }
  const max = top[0].count;
  const min = top[top.length - 1].count;
  const scale = (c: number) => {
    if (max === min) return 1.6;
    return 0.9 + ((c - min) / (max - min)) * 2.1; // 0.9rem → 3.0rem
  };
  // Shuffle a little so sizes are not strictly descending (cloud feel).
  const arranged = [...top].sort(() => Math.random() - 0.5);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 p-5 dark:from-slate-900/60 dark:to-slate-800/40">
      {arranged.map((w, i) => (
        <span
          key={w.word}
          className="font-bold leading-none transition-transform hover:scale-110"
          style={{
            fontSize: `${scale(w.count)}rem`,
            color: PALETTE[i % PALETTE.length],
            opacity: 0.65 + (w.count / max) * 0.35,
          }}
          title={`${w.word}: mentioned ${w.count} time(s)`}
        >
          {w.word}
        </span>
      ))}
    </div>
  );
}

export default function MdaCorrectiveActionsAnalysis({ submissions }: Props) {
  const analysis = useMemo(() => {
    const issues = submissions.map((s) => strOf(s, ISSUE_KEY)).filter(Boolean);
    const actions = submissions.map((s) => strOf(s, ACTION_KEY)).filter(Boolean);
    const responsibles = submissions.map((s) => strOf(s, RESP_KEY)).filter(Boolean);
    const deadlines = submissions
      .map((s) => strOf(s, DEADLINE_KEY))
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()));

    const respTally = new Map<string, number>();
    for (const r of responsibles) {
      const key = r.trim();
      respTally.set(key, (respTally.get(key) || 0) + 1);
    }
    const topResponsibles = [...respTally.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const now = new Date();
    const upcoming = deadlines.filter((d) => d >= now).sort((a, b) => a.getTime() - b.getTime());
    const overdue = deadlines.filter((d) => d < now);

    const combinedFreq = freq([...issues, ...actions]);
    const issueFreq = freq(issues);
    const actionFreq = freq(actions);

    const withAny = submissions.filter(
      (s) => strOf(s, ISSUE_KEY) || strOf(s, ACTION_KEY),
    ).length;
    const completeness = submissions.length
      ? Math.round((withAny / submissions.length) * 100)
      : 0;

    return {
      issues, actions, responsibles, deadlines,
      topResponsibles, upcoming, overdue,
      combinedFreq, issueFreq, actionFreq, withAny, completeness,
      sampleActions: actions.slice(0, 4),
      sampleIssues: issues.slice(0, 4),
    };
  }, [submissions]);

  const {
    issues, actions, topResponsibles, upcoming, overdue,
    combinedFreq, issueFreq, actionFreq, withAny, completeness,
    sampleActions, sampleIssues,
  } = analysis;

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="border-b bg-gradient-to-r from-[#0c2340] to-[#7c3aed] pb-3">
        <CardTitle className="flex items-center gap-2 text-white">
          <Wrench className="h-5 w-5" />
          Corrective Actions — Insightful Analysis
        </CardTitle>
        <p className="text-xs text-white/70">
          Themes, accountability & timelines extracted from Section 12 of the
          supervisory checklist (issues identified, corrective actions agreed,
          responsible persons & deadlines).
        </p>
      </CardHeader>

      <CardContent className="space-y-6 p-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric icon={AlertTriangle} tint="#f97316" label="Issues logged" value={issues.length} />
          <Metric icon={ListChecks} tint="#10b981" label="Actions agreed" value={actions.length} />
          <Metric icon={CalendarClock} tint="#ef4444" label="Overdue deadlines" value={overdue.length} />
          <Metric icon={UserCheck} tint="#6366f1" label="Response rate" value={`${completeness}%`} />
        </div>

        {/* Word cloud */}
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Cloud className="h-4 w-4 text-primary" /> Word Cloud — most frequent themes
          </h4>
          <WordCloud words={combinedFreq} />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Larger, brighter words appear more often across issues and corrective
            actions. Hover any word to see how many times it was mentioned.
          </p>
        </div>

        {/* Top issue vs action terms */}
        <div className="grid gap-4 md:grid-cols-2">
          <TermList
            title="Top issue keywords"
            icon={AlertTriangle}
            tint="#f97316"
            terms={issueFreq.slice(0, 8)}
          />
          <TermList
            title="Top corrective-action keywords"
            icon={ListChecks}
            tint="#10b981"
            terms={actionFreq.slice(0, 8)}
          />
        </div>

        {/* Accountability + timeline */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <UserCheck className="h-4 w-4 text-indigo-500" /> Responsible persons
            </h4>
            {topResponsibles.length ? (
              <ul className="space-y-1.5">
                {topResponsibles.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-foreground">{r.name}</span>
                    <span className="shrink-0 rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                      {r.count} action{r.count === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No responsible persons recorded.</p>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-rose-500" /> Action timelines
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-emerald-500/10 p-2">
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-300">{upcoming.length}</div>
                <div className="text-xs text-muted-foreground">upcoming</div>
              </div>
              <div className="rounded-md bg-rose-500/10 p-2">
                <div className="text-lg font-bold text-rose-600 dark:text-rose-300">{overdue.length}</div>
                <div className="text-xs text-muted-foreground">overdue</div>
              </div>
            </div>
            {upcoming.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Next deadline:{" "}
                <span className="font-medium text-foreground">
                  {upcoming[0].toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Narrative interpretation */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
          <h4 className="mb-1 font-semibold">Interpretation</h4>
          <p className="text-muted-foreground">
            {issues.length === 0 && actions.length === 0 ? (
              "No corrective-action text has been captured yet. Encourage supervisors to record issues found and actions agreed so trends can be tracked."
            ) : (
              <>
                Supervisors logged <b>{issues.length}</b> issue narrative(s) and agreed{" "}
                <b>{actions.length}</b> corrective action(s), covering <b>{withAny}</b> of{" "}
                <b>{submissions.length}</b> submissions ({completeness}%).{" "}
                {combinedFreq[0] && (
                  <>
                    The most recurring theme is <b>“{combinedFreq[0].word}”</b>
                    {combinedFreq[1] ? <> followed by <b>“{combinedFreq[1].word}”</b></> : null}.{" "}
                  </>
                )}
                {overdue.length > 0
                  ? <>There {overdue.length === 1 ? "is" : "are"} <b>{overdue.length}</b> overdue deadline(s) requiring urgent follow-up.</>
                  : "All recorded deadlines are on schedule."}
              </>
            )}
          </p>
        </div>

        {/* Representative quotes */}
        {(sampleIssues.length > 0 || sampleActions.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2">
            <QuoteList title="Representative issues" tint="#f97316" quotes={sampleIssues} />
            <QuoteList title="Representative actions" tint="#10b981" quotes={sampleActions} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, tint, label, value }: { icon: any; tint: string; label: string; value: number | string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border p-3">
      <div className="absolute right-0 top-0 h-full w-1" style={{ background: tint }} />
      <div className="flex items-center gap-2">
        <div className="rounded-md p-1.5" style={{ backgroundColor: `${tint}1a` }}>
          <Icon className="h-4 w-4" style={{ color: tint }} />
        </div>
        <div>
          <div className="text-lg font-bold text-foreground">{value}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}

function TermList({ title, icon: Icon, tint, terms }: { title: string; icon: any; tint: string; terms: { word: string; count: number }[] }) {
  const max = terms[0]?.count || 1;
  return (
    <div className="rounded-lg border p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4" style={{ color: tint }} /> {title}
      </h4>
      {terms.length ? (
        <ul className="space-y-1.5">
          {terms.map((t) => (
            <li key={t.word} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-foreground">{t.word}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t.count}</span>
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${(t.count / max) * 100}%`, background: tint }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No keywords yet.</p>
      )}
    </div>
  );
}

function QuoteList({ title, tint, quotes }: { title: string; tint: string; quotes: string[] }) {
  if (!quotes.length) return null;
  return (
    <div className="rounded-lg border p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Quote className="h-4 w-4" style={{ color: tint }} /> {title}
      </h4>
      <ul className="space-y-2">
        {quotes.map((q, i) => (
          <li
            key={i}
            className="border-l-2 pl-2.5 text-sm italic text-muted-foreground"
            style={{ borderColor: tint }}
          >
            “{q.length > 160 ? `${q.slice(0, 160)}…` : q}”
          </li>
        ))}
      </ul>
    </div>
  );
}
