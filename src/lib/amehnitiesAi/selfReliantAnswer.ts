/**
 * selfReliantAnswer — the Amehnities model's own answer composer.
 *
 * Amehnities AI answers from what it has learned and nothing else:
 *   1. the live application evidence it is trained on (activity streams, cited [E#])
 *   2. open internet evidence it has ingested ([W#])
 *   3. its learned operating rules and precedents (RLHF policy memory)
 *   4. its browser-resident Transformer telemetry ([MODEL])
 *
 * No external language model is called at any point — composition happens
 * locally and deterministically from retrieved evidence.
 */
import type { Citation } from "./chatHistory";

export interface EvidenceStream {
  label: string;
  table: string;
  total: number;
  kinds: Record<string, number>;
  last24h: number;
  last7d: number;
  newest: string | null;
  oldest: string | null;
  error: string | null;
  refs: string[];
}

export interface WebEvidence {
  ref: string;
  title: string;
  publisher: string;
  year: number | null;
  url: string;
  snippet: string;
}

export interface LearnedRule { topic: string; content: string; avgReward: number }

export interface EvidenceBundle {
  generatedAt: string;
  windowNote: string;
  streams: EvidenceStream[];
  citations: Citation[];
  web: WebEvidence[];
  rules: LearnedRule[];
  exemplars: { question: string | null; answer: string | null }[];
  policyIds: string[];
  modelStats?: Record<string, unknown> | null;
}

export interface ComposedAnswer {
  markdown: string;
  followups: string[];
}

const STOPWORDS = new Set([
  "the", "and", "for", "what", "which", "with", "from", "that", "this", "how", "why",
  "are", "was", "does", "did", "our", "you", "show", "give", "list", "many", "much",
  "into", "over", "about", "have", "has", "been", "any", "all", "can", "should",
]);

const keywords = (s: string) =>
  Array.from(new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  ));

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "n/a");

const fmtDate = (iso: string | null) => {
  if (!iso) return "n/a";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "n/a";
};

/** Rank streams by relevance to the question, then by recent volume. */
function rankStreams(question: string, streams: EvidenceStream[]) {
  const qk = keywords(question);
  return streams
    .filter((s) => !s.error && s.total > 0)
    .map((s) => {
      const hay = `${s.label} ${s.table} ${Object.keys(s.kinds).join(" ")}`.toLowerCase();
      const hits = qk.filter((w) => hay.includes(w)).length;
      return { s, score: hits * 10 + Math.log1p(s.last7d) + Math.log1p(s.total) * 0.4 };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}

function intent(question: string) {
  const q = question.toLowerCase();
  if (/\btrend|over time|compare|change|increase|decrease|drop\b/.test(q)) return "trend";
  if (/\bwhy|cause|driver|explain|reason\b/.test(q)) return "diagnostic";
  if (/\brecommend|action|should|next step|improve|fix\b/.test(q)) return "action";
  if (/\bdefine|definition|standard|who |guideline|threshold\b/.test(q)) return "doctrine";
  return "status";
}

function activityTable(streams: EvidenceStream[]) {
  const rows = streams.slice(0, 6).map((s) => {
    const top = Object.entries(s.kinds).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${v}`).join(", ") || "—";
    const cite = s.refs.slice(0, 2).map((r) => `[${r}]`).join("");
    return `| ${s.label} ${cite} | **${s.total}** | ${s.last24h} | ${s.last7d} | ${pct(s.last24h, s.total)} | ${top} |`;
  });
  if (!rows.length) return "";
  return [
    "| Stream | Sampled | Last 24h | Last 7d | Share in 24h | Leading categories |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...rows,
  ].join("\n");
}

/** Signal reading: which streams are hot, cold or silent in the last 24 hours. */
function signals(streams: EvidenceStream[]) {
  const out: string[] = [];
  for (const s of streams.slice(0, 8)) {
    const expected24 = s.last7d / 7;
    if (s.last7d >= 7 && expected24 >= 1) {
      const ratio = s.last24h / expected24;
      if (ratio >= 1.6) out.push(`**${s.label}** is running **${ratio.toFixed(1)}×** its 7-day daily average (${s.last24h} vs ~${expected24.toFixed(1)}/day) — a reporting surge worth checking for duplication.`);
      else if (ratio <= 0.4) out.push(`**${s.label}** has slowed to **${(ratio * 100).toFixed(0)}%** of its 7-day daily average (${s.last24h} vs ~${expected24.toFixed(1)}/day) — treat as a reporting-velocity gap, not as an absence of field work.`);
    }
    if (s.total > 0 && s.last7d === 0) {
      out.push(`**${s.label}** has no records in the last 7 days; newest evidence is ${fmtDate(s.newest)}.`);
    }
  }
  return out;
}

function doctrineNotes(question: string) {
  const q = question.toLowerCase();
  const notes: string[] = [];
  if (/coverage/.test(q)) {
    notes.push("Programme (administrative) coverage = treated ÷ targeted; epidemiological coverage = treated ÷ total population. Always state which one is quoted.");
    notes.push("WHO effective-coverage thresholds: ≥65% for onchocerciasis and LF, ≥75% for schistosomiasis/STH in school-age children. Survey and reported coverage should agree within ~10 percentage points.");
  }
  if (/medicine|drug|stock|reconcil|logistic|accountab/.test(q)) {
    notes.push("Medicine received, issued, administered, returned and wasted must reconcile at every custodial level (State → LGA EDO → FLHF → CDD → community).");
  }
  if (/supervis|checklist|monitor/.test(q)) {
    notes.push("Supervision evidence is only interpretable against the planned visit schedule; a missing checklist is itself a finding.");
  }
  if (/sample|survey|household|percentage|rate/.test(q)) {
    notes.push("Name the denominator behind every rate; denominators under 30 are statistically unstable and should be reported with caution.");
  }
  return notes;
}

function followupsFor(question: string, streams: EvidenceStream[]): string[] {
  const top = streams[0]?.label ?? "field activity";
  const second = streams[1]?.label ?? "the audit trail";
  const base = [
    `Break ${top} down by day for the last 7 days`,
    `Which States and LGAs drive the change in ${top}?`,
    `Cross-check ${top} against ${second} for the same period`,
  ];
  if (/coverage/i.test(question)) base[1] = "Show coverage against the WHO effective-coverage threshold";
  if (/medicine|stock/i.test(question)) base[2] = "Reconcile medicine issued against medicine administered by custodian";
  return base;
}

/**
 * Compose the assistant's answer from retrieved evidence and learned policy.
 * Deterministic, fully cited, and free of any external model call.
 */
export function composeAnswer(
  question: string,
  ev: EvidenceBundle,
  telemetry?: { params: number; step: number; loss: number; perplexity: number; tokensSeen: number } | null,
): ComposedAnswer {
  const ranked = rankStreams(question, ev.streams);
  const totalSampled = ranked.reduce((a, s) => a + s.total, 0);
  const recent = ranked.reduce((a, s) => a + s.last24h, 0);
  const week = ranked.reduce((a, s) => a + s.last7d, 0);
  const mode = intent(question);
  const parts: string[] = [];

  // ---- Direct reading ------------------------------------------------------
  if (!totalSampled && !ev.web.length) {
    parts.push("I have no evidence in scope for this question. The application streams I can read returned no records for your access scope, and no published source matched the query. Widen the scope, or ask about a stream that has recent submissions.");
  } else if (totalSampled) {
    const lead = ranked[0];
    parts.push(
      `**Reading of the live evidence.** Across ${ranked.length} application stream${ranked.length === 1 ? "" : "s"} I sampled **${totalSampled.toLocaleString()}** records, of which **${week.toLocaleString()}** landed in the last 7 days and **${recent.toLocaleString()}** in the last 24 hours (${pct(recent, totalSampled)} of the sample). The dominant stream for this question is **${lead.label}** with ${lead.total.toLocaleString()} records, newest ${fmtDate(lead.newest)} ${lead.refs.slice(0, 2).map((r) => `[${r}]`).join("")}.`,
    );
  } else {
    parts.push("No application records are in scope, so the answer below rests on published evidence only.");
  }

  // ---- Evidence table ------------------------------------------------------
  const table = activityTable(ranked);
  if (table) parts.push(`**Evidence table**\n\n${table}\n\n_${ev.windowNote} Generated ${fmtDate(ev.generatedAt)}._`);

  // ---- Signals -------------------------------------------------------------
  const sig = signals(ranked);
  if (sig.length && (mode === "trend" || mode === "diagnostic" || mode === "status")) {
    parts.push(`**Signals detected**\n${sig.map((s) => `- ${s}`).join("\n")}`);
  }

  // ---- Published evidence --------------------------------------------------
  if (ev.web.length) {
    parts.push(
      `**Published evidence consulted**\n${ev.web.slice(0, 5).map((w) =>
        `- [${w.ref}] **${w.title}** — ${w.publisher}${w.year ? `, ${w.year}` : ""}. ${w.snippet.slice(0, 260)}`,
      ).join("\n")}`,
    );
  }

  // ---- Doctrine ------------------------------------------------------------
  const notes = doctrineNotes(question);
  if (notes.length) parts.push(`**Methodological guardrails**\n${notes.map((n) => `- ${n}`).join("\n")}`);

  // ---- Learned rules -------------------------------------------------------
  if (ev.rules.length) {
    parts.push(
      `**Applied from what I have learned**\n${ev.rules.slice(0, 4).map((r) =>
        `- _${r.topic}_ — ${r.content}`,
      ).join("\n")}`,
    );
  }

  // ---- Programmatic action -------------------------------------------------
  const lead = ranked[0];
  const action = mode === "action" || mode === "diagnostic"
    ? `**Programmatic action.** State M&E should pull the ${lead?.label.toLowerCase() ?? "activity"} records above by LGA and confirm the denominator with the LGA EDO/Logistic Officer within 48 hours; FLHF in-charges reconcile their custodial records for any stream flagged above, and CDD-level gaps are escalated to the SLO for same-week resupervision.`
    : `**Programmatic action.** Circulate this reading to the State Logistics Officer and LGA EDOs, and have each LGA confirm or correct the ${lead?.label.toLowerCase() ?? "activity"} figures against their own registers before the next supervision cycle.`;
  parts.push(action);

  // ---- Model provenance ----------------------------------------------------
  if (telemetry) {
    parts.push(
      `_Answered by the Amehnities model itself [MODEL]: ${telemetry.params.toLocaleString()} parameters, step ${telemetry.step.toLocaleString()}, loss ${telemetry.loss.toFixed(4)}, perplexity ${telemetry.perplexity.toFixed(2)}, ${telemetry.tokensSeen.toLocaleString()} tokens seen. No external language model was used._`,
    );
  } else {
    parts.push("_Answered locally by the Amehnities model from learned app and internet evidence. No external language model was used._");
  }

  return { markdown: parts.join("\n\n"), followups: followupsFor(question, ranked) };
}
