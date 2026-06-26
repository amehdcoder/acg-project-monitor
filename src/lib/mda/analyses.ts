/**
 * MDA Supervisory Checklist — advanced analyses preparation
 * ────────────────────────────────────────────────────────────────────────
 * Builds the data behind the dashboard's professional analyses (status of MDA
 * tables, adverse-reaction complaints, commodity readiness, visit trendlines
 * and field-worker accountability).
 *
 * Field keys in the checklist are form-specific (auto-generated per question),
 * so EVERYTHING here is resolved by matching question LABELS with tolerant
 * keyword patterns. This keeps every analysis correctly wired to the right
 * data source across all projects (Jigawa Schisto, ENDFUND/FCT, etc.) without
 * hard-coding a single field name.
 */
import { communityKey } from "./dashboardData";

export interface AOption { id?: string; label?: string; value?: string }
export interface AQuestion {
  id: string; name?: string; label?: string; type?: string;
  options?: AOption[]; questions?: AQuestion[];
}
export interface ASubmission {
  id: string; projectId?: string | null;
  state?: string | null; lga?: string | null; ward?: string | null;
  submitter?: string | null; submittedAt?: string | null; status?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
  data?: Record<string, any>;
}

const stripTags = (s?: any) => String(s ?? "").replace(/<[^>]*>/g, "").trim();
const norm = (v: any) => stripTags(v).toLowerCase();

/** Flatten the question tree, keeping the effective storage key (name || id). */
export interface ResolvedQ { key: string; label: string; type?: string; options: AOption[] }

export function flattenQuestions(items: AQuestion[]): ResolvedQ[] {
  const out: ResolvedQ[] = [];
  const walk = (arr?: AQuestion[]) => {
    for (const it of arr || []) {
      if (!it || typeof it !== "object") continue;
      if (it.type && (it.name || it.id)) {
        out.push({
          key: String(it.name || it.id),
          label: stripTags(it.label || it.name || ""),
          type: it.type,
          options: it.options || [],
        });
      }
      if (Array.isArray(it.questions)) walk(it.questions);
    }
  };
  walk(items);
  return out;
}

/** A question index with label-keyword resolution + value→label translation. */
export class MdaQuestionIndex {
  private qs: ResolvedQ[];
  constructor(questions: AQuestion[]) {
    this.qs = flattenQuestions(questions);
  }
  /** Find the first question whose label matches ALL words in any pattern group. */
  find(patterns: (string | RegExp)[]): ResolvedQ | null {
    for (const p of patterns) {
      for (const q of this.qs) {
        if (p instanceof RegExp) { if (p.test(q.label)) return q; }
        else if (q.label.toLowerCase().includes(p.toLowerCase())) return q;
      }
    }
    return null;
  }
  /** Translate a stored option value into its human label for a given question. */
  label(q: ResolvedQ | null, raw: any): string {
    if (raw === undefined || raw === null || raw === "") return "";
    const translate = (v: any) => {
      const opt = q?.options?.find((o) => String(o.value) === String(v) || norm(o.label) === norm(v));
      return stripTags(opt?.label ?? v);
    };
    if (Array.isArray(raw)) return raw.map(translate).filter(Boolean).join(", ");
    return translate(raw);
  }
}

// ── Geography helpers (tolerant of cascade vs typed answers) ──
export function geo(s: ASubmission, kind: "state" | "lga" | "ward" | "flhf" | "community"): string {
  const d = s.data || {};
  if (kind === "state") return stripTags(s.state || d.state || d.state_name);
  if (kind === "lga") return stripTags(s.lga || d.lga || d.LGA || d.local_government || d.local_government_area);
  if (kind === "ward") return stripTags(s.ward || d.ward || d.ward_name);
  if (kind === "flhf") return stripTags(d.flhf_name || d.flhf || d.health_facility || d.facility);
  return stripTags(d.community || d.community_name || d.settlement_name || d.settlement);
}

const POSITIVE = new Set(["yes", "true", "1", "available", "present", "completed", "complete", "done"]);
export const isYes = (v: any) => POSITIVE.has(norm(v));

// ── Per-community aggregate (merges checklist + follow-up answers) ──
export interface CommunityAgg {
  key: string;
  state: string; lga: string; ward: string; flhf: string; community: string;
  submitter: string;
  firstTs: number; lastTs: number;
  location: { latitude: number; longitude: number } | null;
  /** latest non-empty raw value per question key */
  values: Record<string, any>;
}

function readGps(s: ASubmission): { latitude: number; longitude: number } | null {
  if (s.location && Number.isFinite(s.location.latitude) && Number.isFinite(s.location.longitude)) {
    return { latitude: s.location.latitude!, longitude: s.location.longitude! };
  }
  for (const v of Object.values(s.data || {})) {
    if (v && typeof v === "object") {
      const p = v as any;
      const lat = Number(p.lat ?? p.latitude); const lng = Number(p.lng ?? p.lon ?? p.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { latitude: lat, longitude: lng };
    }
  }
  return null;
}

export function aggregateByCommunity(subs: ASubmission[]): CommunityAgg[] {
  const map = new Map<string, CommunityAgg>();
  // oldest → newest so latest non-empty wins
  const ordered = [...subs].sort(
    (a, b) => new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime(),
  );
  for (const s of ordered) {
    const k = communityKey(s as any);
    const ts = s.submittedAt ? new Date(s.submittedAt).getTime() : 0;
    let agg = map.get(k);
    if (!agg) {
      agg = {
        key: k, state: "", lga: "", ward: "", flhf: "", community: "",
        submitter: "", firstTs: ts || Infinity, lastTs: 0, location: null, values: {},
      };
      map.set(k, agg);
    }
    agg.state = geo(s, "state") || agg.state;
    agg.lga = geo(s, "lga") || agg.lga;
    agg.ward = geo(s, "ward") || agg.ward;
    agg.flhf = geo(s, "flhf") || agg.flhf;
    agg.community = geo(s, "community") || agg.community;
    agg.submitter = stripTags(s.submitter || s.data?.supervisor_name) || agg.submitter;
    if (ts) { agg.firstTs = Math.min(agg.firstTs, ts); agg.lastTs = Math.max(agg.lastTs, ts); }
    const loc = readGps(s); if (loc) agg.location = loc;
    for (const [key, val] of Object.entries(s.data || {})) {
      if (val !== undefined && val !== null && String(val).trim() !== "" && typeof val !== "object") {
        agg.values[key] = val;
      }
    }
  }
  for (const a of map.values()) if (!Number.isFinite(a.firstTs)) a.firstTs = 0;
  return [...map.values()];
}

// ── Visit trend per LGA (communities visited per day) ──
export interface TrendPoint { date: string; key: string; [lga: string]: any }
export function visitTrendByLga(subs: ASubmission[], maxDays = 30): { rows: TrendPoint[]; lgas: string[] } {
  // one visit = a distinct community first seen on a day
  const seen = new Set<string>();
  const ordered = [...subs].sort(
    (a, b) => new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime(),
  );
  const byDayLga = new Map<string, Map<string, number>>();
  const lgaTotals = new Map<string, number>();
  for (const s of ordered) {
    if (!s.submittedAt) continue;
    const ck = communityKey(s as any);
    if (seen.has(ck)) continue;
    seen.add(ck);
    const day = new Date(s.submittedAt).toISOString().slice(0, 10);
    const lga = geo(s, "lga") || "Unspecified";
    if (!byDayLga.has(day)) byDayLga.set(day, new Map());
    const m = byDayLga.get(day)!;
    m.set(lga, (m.get(lga) || 0) + 1);
    lgaTotals.set(lga, (lgaTotals.get(lga) || 0) + 1);
  }
  // top LGAs by volume (cap for readability)
  const lgas = [...lgaTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]);
  const days = [...byDayLga.keys()].sort().slice(-maxDays);
  const rows: TrendPoint[] = days.map((day) => {
    const m = byDayLga.get(day)!;
    const row: TrendPoint = {
      key: day,
      date: new Date(day + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };
    for (const lga of lgas) row[lga] = m.get(lga) || 0;
    row.Total = [...m.values()].reduce((a, b) => a + b, 0);
    return row;
  });
  return { rows, lgas };
}

// ── Field-worker accountability ──
export interface WorkerStat {
  name: string; communities: number; days: number; submissions: number;
  firstTs: number; lastTs: number;
}
export function workerAccountability(subs: ASubmission[]): WorkerStat[] {
  const map = new Map<string, { name: string; communities: Set<string>; days: Set<string>; subs: number; first: number; last: number }>();
  for (const s of subs) {
    const name = stripTags(s.submitter || s.data?.supervisor_name) || "Unknown";
    const rec = map.get(name) || { name, communities: new Set<string>(), days: new Set<string>(), subs: 0, first: Infinity, last: 0 };
    rec.subs++;
    rec.communities.add(communityKey(s as any));
    if (s.submittedAt) {
      const ts = new Date(s.submittedAt).getTime();
      rec.days.add(new Date(s.submittedAt).toISOString().slice(0, 10));
      rec.first = Math.min(rec.first, ts); rec.last = Math.max(rec.last, ts);
    }
    map.set(name, rec);
  }
  return [...map.values()]
    .map((r) => ({
      name: r.name, communities: r.communities.size, days: r.days.size, submissions: r.subs,
      firstTs: Number.isFinite(r.first) ? r.first : 0, lastTs: r.last,
    }))
    .sort((a, b) => b.communities - a.communities);
}
