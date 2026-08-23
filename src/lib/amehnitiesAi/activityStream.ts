/**
 * Amehnities AI — activity corpus + tokenizer.
 *
 * Turns real Amehnities app data and activity (submissions, audit trail, usage
 * pings, field activity, attendance, forum) into a token stream the in-browser
 * Transformer trains on. Every event becomes a short "sentence" of tokens
 * describing WHAT happened, WHEN, and HOW LONG after the previous event — the
 * structure the model learns to predict.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ActivitySource {
  table: string;
  label: string;
  timeColumn: string;
  select: string;
  /** Extra categorical column turned into its own token. */
  kindColumn?: string;
}

export const ACTIVITY_SOURCES: ActivitySource[] = [
  { table: "form_submissions", label: "Submissions", timeColumn: "created_at", select: "created_at" },
  { table: "audit_logs", label: "Audit trail", timeColumn: "created_at", select: "created_at,action", kindColumn: "action" },
  { table: "app_usage_tracking", label: "App usage", timeColumn: "created_at", select: "created_at" },
  { table: "field_activity", label: "Field activity", timeColumn: "created_at", select: "created_at,activity_type", kindColumn: "activity_type" },
  { table: "attendance_records", label: "Attendance", timeColumn: "created_at", select: "created_at" },
  { table: "forum_posts", label: "Forum", timeColumn: "created_at", select: "created_at" },
];

export interface ActivityEvent {
  source: string;
  kind?: string;
  at: number;
}

export interface Corpus {
  tokens: number[];
  events: ActivityEvent[];
  vocab: string[];
  sourceCounts: Record<string, number>;
}

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Incremental, stable string→id tokenizer (shared by the initial corpus and the live feed). */
export class Tokenizer {
  private map = new Map<string, number>();
  vocab: string[] = [];
  constructor(readonly limit = 1024) {}
  id(term: string): number {
    const hit = this.map.get(term);
    if (hit !== undefined) return hit;
    if (this.vocab.length >= this.limit) return 0;
    const id = this.vocab.length;
    this.map.set(term, id);
    this.vocab.push(term);
    return id;
  }
  get size() { return Math.max(this.vocab.length, 1); }
}

function gapBucket(ms: number): string {
  if (ms < 5_000) return "gap:burst";
  if (ms < 60_000) return "gap:min";
  if (ms < 15 * 60_000) return "gap:quarter";
  if (ms < 60 * 60_000) return "gap:hour";
  if (ms < 6 * 3_600_000) return "gap:shift";
  if (ms < 24 * 3_600_000) return "gap:day";
  return "gap:long";
}

const slug = (s: unknown) => String(s ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 28) || "unknown";

/** Encode one event into its token sentence. */
export function encodeEvent(tk: Tokenizer, ev: ActivityEvent, prevAt: number | null): number[] {
  const d = new Date(ev.at);
  const out = [
    tk.id(`src:${ev.source}`),
    tk.id(`hour:${d.getHours()}`),
    tk.id(`dow:${DOW[d.getDay()]}`),
  ];
  if (ev.kind) out.push(tk.id(`kind:${slug(ev.kind)}`));
  out.push(tk.id(gapBucket(prevAt == null ? Infinity : Math.max(0, ev.at - prevAt))));
  return out;
}

export function encodeEvents(tk: Tokenizer, events: ActivityEvent[]): number[] {
  const tokens: number[] = [];
  let prev: number | null = null;
  for (const ev of events) {
    tokens.push(...encodeEvent(tk, ev, prev));
    prev = ev.at;
  }
  return tokens;
}

/**
 * Pull a bounded slice of recent activity per source. Bounded on purpose:
 * this must never turn into a heavy scan, even on very large projects.
 */
export async function loadActivityCorpus(tk: Tokenizer, perSource = 400): Promise<Corpus> {
  const results = await Promise.all(
    ACTIVITY_SOURCES.map(async (s) => {
      try {
        const { data, error } = await (supabase as any)
          .from(s.table)
          .select(s.select)
          .order(s.timeColumn, { ascending: false })
          .limit(perSource);
        if (error || !Array.isArray(data)) return [] as ActivityEvent[];
        return data
          .map((row: any) => ({
            source: s.label,
            kind: s.kindColumn ? row[s.kindColumn] : undefined,
            at: new Date(row[s.timeColumn]).getTime(),
          }))
          .filter((e: ActivityEvent) => Number.isFinite(e.at));
      } catch {
        return [] as ActivityEvent[];
      }
    }),
  );

  const events = results.flat().sort((a, b) => a.at - b.at);
  const sourceCounts: Record<string, number> = {};
  for (const e of events) sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1;

  return { tokens: encodeEvents(tk, events), events, vocab: tk.vocab, sourceCounts };
}

/**
 * Synthetic warm-up corpus. Used only when the account can see very little
 * activity yet, so the network always has structure to learn instead of
 * sitting idle with an empty stream.
 */
export function syntheticCorpus(tk: Tokenizer, n = 600): ActivityEvent[] {
  const labels = ACTIVITY_SOURCES.map((s) => s.label);
  const out: ActivityEvent[] = [];
  let t = Date.now() - n * 90_000;
  for (let i = 0; i < n; i++) {
    const hour = new Date(t).getHours();
    // field work clusters in daylight hours — a genuine pattern to learn
    const daylight = hour >= 8 && hour <= 17;
    const idx = daylight ? i % 3 : 3 + (i % 3);
    out.push({ source: labels[idx % labels.length], at: t });
    t += (daylight ? 40_000 : 400_000) * (0.5 + Math.random());
  }
  return out;
}
