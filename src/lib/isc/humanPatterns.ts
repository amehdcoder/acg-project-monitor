/**
 * Human Patterns & Social Network Intelligence — Medicine Accountability.
 *
 * Turns the Medicine Allocation & Accountability ledger (Levels 0–4) into a
 * *social* dataset: who handles medicines, who they hand over to, when they
 * work, which communities depend on a single person, and where the chain
 * breaks. Supervisory Checklist submissions are fuzzy-joined (Dice bigram
 * similarity on State/LGA/Ward/Facility/Community) so behavioural evidence
 * from the checklist explains logistics failures observed in the ledger.
 *
 * Everything is computed locally, offline, from already-cached submissions.
 */
import type { LogisticsDataset } from "./medicineAccountability";
import { buildIdentityIndex, type IdentityIndex } from "./actorIdentity";

/* ──────────────────────────────────────────────── fuzzy string utilities ── */

export const norm = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\b(lga|ward|health post|health centre|health center|hp|hc|phc|ho|dispensary|clinic|village|community|settlement)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const bigrams = (s: string): string[] => {
  const t = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
};

/** Sørensen–Dice coefficient on character bigrams (0…1). */
export function dice(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x), B = bigrams(y);
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) { counts.set(g, c - 1); hits++; }
  }
  return (2 * hits) / (A.length + B.length);
}

/** Fuzzy best match of `needle` within `haystack` keys. */
export function bestMatch<T>(needle: string, rows: T[], key: (r: T) => string, floor = 0.62):
  { row: T; score: number } | null {
  let best: { row: T; score: number } | null = null;
  for (const r of rows) {
    const s = dice(needle, key(r));
    if (s >= floor && (!best || s > best.score)) best = { row: r, score: s };
  }
  return best;
}

/* ───────────────────────────────────────────────────── actors & network ── */

export type ActorRole = "state" | "lga" | "facility" | "cdd" | "returns";

export interface Actor {
  id: string;
  name: string;
  roles: ActorRole[];
  transactions: number;
  quantity: number;
  communities: string[];
  facilities: string[];
  lgas: string[];
  partners: string[];
  firstDay: string;
  lastDay: string;
  activeDays: number;
  nightShare: number;      // share of activity outside 07:00–18:00
  weekendShare: number;
  signatureRate: number;   // share of handled transactions with signature / POD
  tenureDays: number;
  intensity: number;       // transactions per active day
}

export interface Tie {
  a: string;
  b: string;
  weight: number;          // shared handovers
  quantity: number;
  contexts: string[];      // batch / facility / community keys binding them
  signatureRate: number;
}

export interface NetworkStats {
  actors: Actor[];
  ties: Tie[];
  density: number;
  components: number;
  largestComponent: number;
  isolates: Actor[];
  brokers: { actor: Actor; brokerage: number; bridges: number }[];
  cliques: { members: string[]; weight: number; signatureRate: number }[];
}

interface Handling {
  person: string;
  role: ActorRole;
  qty: number;
  date: string;
  lga: string;
  facility: string;
  community: string;
  context: string;         // batch / waybill / facility key
  signed: boolean;
}

const dayOf = (d: string) => (d ? String(d).slice(0, 10) : "");
const hourOf = (d: string) => {
  const t = new Date(d);
  return isNaN(t.getTime()) ? -1 : t.getHours();
};
const clean = (s: unknown) => String(s ?? "").trim();

function collectHandlings(ds: LogisticsDataset): Handling[] {
  const out: Handling[] = [];
  const push = (h: Partial<Handling> & { person: string; role: ActorRole }) => {
    if (!h.person || /^(n\/?a|none|unknown|nil|-)$/i.test(h.person)) return;
    out.push({
      qty: 0, date: "", lga: "", facility: "", community: "", context: "", signed: false,
      ...h,
    } as Handling);
  };

  for (const d of ds.dispatches) {
    const ctx = clean(d.batch) || clean(d.waybill) || `${d.state}|${d.destinationLga}`;
    push({ person: clean(d.sloName), role: "state", qty: d.qtyDispatched, date: d.date, lga: d.destinationLga || d.lga, context: ctx, signed: d.hasSignature });
    push({ person: clean(d.receivingOfficer), role: "lga", qty: d.qtyDispatched, date: d.date, lga: d.destinationLga || d.lga, context: ctx, signed: d.hasSignature });
  }
  for (const r of ds.receipts) {
    const ctx = clean(r.batch) || `${r.state}|${r.lga}`;
    push({ person: clean(r.sloName), role: "state", qty: r.qtyReceived, date: r.date, lga: r.lga, context: ctx, signed: r.hasSignature });
    push({ person: clean(r.edoName), role: "lga", qty: r.qtyReceived, date: r.date, lga: r.lga, context: ctx, signed: r.hasSignature });
  }
  for (const i of ds.issues) {
    const ctx = clean(i.batch) || `${i.lga}|${i.facility}`;
    push({ person: clean(i.submittedBy), role: "lga", qty: i.qtyIssued, date: i.date, lga: i.lga, facility: i.facility, context: ctx, signed: i.hasSignature });
    push({ person: clean(i.inCharge), role: "facility", qty: i.qtyIssued, date: i.date, lga: i.lga, facility: i.facility, context: ctx, signed: i.hasSignature });
  }
  for (const c of ds.cddIssues) {
    const ctx = `${c.lga}|${c.facility}`;
    push({ person: clean(c.submittedBy), role: "facility", qty: c.qtyIssued, date: c.date, lga: c.lga, facility: c.facility, community: c.community, context: ctx, signed: c.hasPhoto });
    push({ person: clean(c.cddName), role: "cdd", qty: c.qtyIssued, date: c.date, lga: c.lga, facility: c.facility, community: c.community, context: ctx, signed: c.hasPhoto });
  }
  for (const r of ds.returns) {
    const ctx = clean(r.batch) || `${r.returnedFrom}|${r.returnedTo}`;
    push({ person: clean(r.returnedBy), role: "returns", qty: r.qtyReturned, date: r.date, lga: r.lga, facility: r.facility, community: r.community, context: ctx, signed: r.hasSignature });
    push({ person: clean(r.receivedBy), role: "returns", qty: r.qtyReturned, date: r.date, lga: r.lga, facility: r.facility, community: r.community, context: ctx, signed: r.hasSignature });
  }
  return out;
}

export function buildNetwork(
  ds: LogisticsDataset,
  extra: Handling[] = [],
  identity?: IdentityIndex,
): NetworkStats {
  const raw = [...collectHandlings(ds), ...extra];
  // Fuzzy identity resolution: every spelling variant of the same person is
  // folded into one canonical actor before ANY aggregate is computed, and
  // excluded people (e.g. the signed-in user) are dropped entirely.
  const idx = identity ?? buildIdentityIndex(raw.map((h) => h.person));
  const handlings: Handling[] = [];
  for (const h of raw) {
    const person = idx.resolve(h.person);
    if (!person) continue;
    handlings.push({ ...h, person: person.name });
  }



  /* actors */
  const map = new Map<string, {
    a: Actor; days: Set<string>; ctx: Set<string>; hoursNight: number; weekend: number;
    signed: number; comms: Set<string>; facs: Set<string>; lgas: Set<string>; partners: Set<string>;
  }>();

  for (const h of handlings) {
    const id = norm(h.person) || h.person.toLowerCase();
    let e = map.get(id);
    if (!e) {
      e = {
        a: {
          id, name: h.person, roles: [], transactions: 0, quantity: 0, communities: [], facilities: [],
          lgas: [], partners: [], firstDay: "", lastDay: "", activeDays: 0, nightShare: 0, weekendShare: 0,
          signatureRate: 0, tenureDays: 0, intensity: 0,
        },
        days: new Set(), ctx: new Set(), hoursNight: 0, weekend: 0, signed: 0,
        comms: new Set(), facs: new Set(), lgas: new Set(), partners: new Set(),
      };
      map.set(id, e);
    }
    const a = e.a;
    if (!a.roles.includes(h.role)) a.roles.push(h.role);
    a.transactions++;
    a.quantity += Number(h.qty) || 0;
    if (h.date) {
      const d = dayOf(h.date);
      e.days.add(d);
      if (!a.firstDay || d < a.firstDay) a.firstDay = d;
      if (!a.lastDay || d > a.lastDay) a.lastDay = d;
      const hr = hourOf(h.date);
      if (hr >= 0 && (hr < 7 || hr >= 18)) e.hoursNight++;
      const wd = new Date(h.date).getDay();
      if (wd === 0 || wd === 6) e.weekend++;
    }
    if (h.signed) e.signed++;
    if (h.community) e.comms.add(h.community);
    if (h.facility) e.facs.add(h.facility);
    if (h.lga) e.lgas.add(h.lga);
    e.ctx.add(`${h.context}@@${dayOf(h.date)}`);
  }

  /* ties — two actors sharing a batch/facility context on the same day */
  const byCtx = new Map<string, Handling[]>();
  for (const h of handlings) {
    const k = `${h.context}@@${dayOf(h.date)}`;
    (byCtx.get(k) ?? byCtx.set(k, []).get(k)!).push(h);
  }
  const tieMap = new Map<string, Tie & { signed: number; n: number }>();
  for (const [ctx, rows] of byCtx) {
    const people = Array.from(new Set(rows.map((r) => norm(r.person)).filter(Boolean)));
    if (people.length < 2 || people.length > 25) continue;
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const [a, b] = [people[i], people[j]].sort();
        const key = `${a}||${b}`;
        let t = tieMap.get(key);
        if (!t) { t = { a, b, weight: 0, quantity: 0, contexts: [], signatureRate: 0, signed: 0, n: 0 }; tieMap.set(key, t); }
        t.weight++;
        t.quantity += rows.reduce((s, r) => s + (Number(r.qty) || 0), 0) / Math.max(1, people.length);
        if (t.contexts.length < 6) t.contexts.push(ctx.split("@@")[0]);
        t.n += rows.length;
        t.signed += rows.filter((r) => r.signed).length;
        map.get(a)?.partners.add(b);
        map.get(b)?.partners.add(a);
      }
    }
  }

  const actors: Actor[] = [];
  for (const e of map.values()) {
    const a = e.a;
    a.activeDays = e.days.size;
    a.communities = Array.from(e.comms).sort();
    a.facilities = Array.from(e.facs).sort();
    a.lgas = Array.from(e.lgas).sort();
    a.partners = Array.from(e.partners).sort();
    a.nightShare = a.transactions ? e.hoursNight / a.transactions : 0;
    a.weekendShare = a.transactions ? e.weekend / a.transactions : 0;
    a.signatureRate = a.transactions ? e.signed / a.transactions : 0;
    a.tenureDays = a.firstDay && a.lastDay
      ? Math.max(1, Math.round((new Date(a.lastDay).getTime() - new Date(a.firstDay).getTime()) / 86_400_000) + 1) : 1;
    a.intensity = a.activeDays ? a.transactions / a.activeDays : a.transactions;
    actors.push(a);
  }
  actors.sort((x, y) => y.transactions - x.transactions);

  const ties: Tie[] = Array.from(tieMap.values())
    .map((t) => ({ a: t.a, b: t.b, weight: t.weight, quantity: Math.round(t.quantity), contexts: t.contexts, signatureRate: t.n ? t.signed / t.n : 0 }))
    .sort((x, y) => y.weight - x.weight);

  /* components (union-find) */
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; }
    return x;
  };
  const union = (x: string, y: string) => { const rx = find(x), ry = find(y); if (rx !== ry) parent.set(rx, ry); };
  for (const a of actors) find(a.id);
  for (const t of ties) union(t.a, t.b);
  const compSize = new Map<string, number>();
  for (const a of actors) { const r = find(a.id); compSize.set(r, (compSize.get(r) ?? 0) + 1); }

  const n = actors.length;
  const density = n > 1 ? (2 * ties.length) / (n * (n - 1)) : 0;

  /* brokerage — a proxy for betweenness: partners that are not connected to
     each other (structural holes the actor bridges, Burt-style). */
  const adj = new Map<string, Set<string>>();
  for (const t of ties) {
    (adj.get(t.a) ?? adj.set(t.a, new Set()).get(t.a)!).add(t.b);
    (adj.get(t.b) ?? adj.set(t.b, new Set()).get(t.b)!).add(t.a);
  }
  const brokers = actors.map((a) => {
    const ps = Array.from(adj.get(a.id) ?? []);
    let bridges = 0, pairs = 0;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      pairs++;
      if (!adj.get(ps[i])?.has(ps[j])) bridges++;
    }
    return { actor: a, brokerage: pairs ? bridges / pairs : 0, bridges };
  }).filter((b) => b.bridges > 0)
    .sort((x, y) => y.bridges - x.bridges || y.brokerage - x.brokerage)
    .slice(0, 12);

  /* cliques — fully connected triads working repeatedly together */
  const cliques: NetworkStats["cliques"] = [];
  const top = actors.slice(0, 60).map((a) => a.id);
  const tieOf = (a: string, b: string) => tieMap.get([a, b].sort().join("||"));
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const ab = tieOf(top[i], top[j]); if (!ab) continue;
      for (let k = j + 1; k < top.length; k++) {
        const ac = tieOf(top[i], top[k]); const bc = tieOf(top[j], top[k]);
        if (!ac || !bc) continue;
        const weight = ab.weight + ac.weight + bc.weight;
        const sN = ab.n + ac.n + bc.n;
        const sS = ab.signed + ac.signed + bc.signed;
        cliques.push({
          members: [top[i], top[j], top[k]].map((id) => map.get(id)?.a.name ?? id),
          weight, signatureRate: sN ? sS / sN : 0,
        });
      }
    }
  }
  cliques.sort((a, b) => b.weight - a.weight);

  return {
    actors,
    ties,
    density,
    components: new Set(actors.map((a) => find(a.id))).size,
    largestComponent: Math.max(0, ...compSize.values()),
    isolates: actors.filter((a) => (adj.get(a.id)?.size ?? 0) === 0),
    brokers,
    cliques: cliques.slice(0, 8),
  };
}

/* ───────────────────────────────────── checklist evidence (fuzzy joined) ── */

export interface EvidenceRule {
  id: string;
  label: string;
  cause: string;
  keys: RegExp;
  /** Returns true when the value signals a *problem*. */
  bad: (v: unknown) => boolean;
}

const isNo = (v: unknown) => {
  const s = String(v ?? "").trim().toLowerCase();
  return ["no", "n", "false", "0", "not available", "none", "not done", "absent", "never"].includes(s);
};
const isYes = (v: unknown) => {
  const s = String(v ?? "").trim().toLowerCase();
  return ["yes", "y", "true", "1", "available", "done", "present"].includes(s);
};

export const EVIDENCE_RULES: EvidenceRule[] = [
  { id: "training", label: "CDDs not trained / retrained", cause: "Capacity", keys: /train|retrain|orientation|capacity/i, bad: isNo },
  { id: "mobilisation", label: "No community mobilisation / town announcement", cause: "Demand", keys: /mobilis|mobiliz|town.?crier|announce|advocacy|sensiti/i, bad: isNo },
  { id: "refusal", label: "Household refusals / rumours reported", cause: "Demand", keys: /refus|rumou?r|reject|non.?compl|resist/i, bad: isYes },
  { id: "stipend", label: "CDD stipend / payment not received", cause: "Incentives", keys: /stipend|payment|paid|allowance|incentive/i, bad: isNo },
  { id: "supervision", label: "No supervisory visit during distribution", cause: "Supervision", keys: /supervis|monitor.*visit|oversight/i, bad: isNo },
  { id: "security", label: "Insecurity / inaccessibility reported", cause: "Access", keys: /insecur|security|conflict|bandit|flood|inaccessib|terrain|road/i, bad: isYes },
  { id: "commodity", label: "Medicines not available at facility on time", cause: "Supply", keys: /stock.?out|availab|received.*(drug|medicine)|commodit/i, bad: isNo },
  { id: "register", label: "Distribution register / tally sheet missing", cause: "Documentation", keys: /register|tally|record|summary sheet/i, bad: isNo },
  { id: "leaders", label: "Community / traditional leaders not engaged", cause: "Social capital", keys: /leader|chief|ward head|religio|committee|wdc/i, bad: isNo },
  { id: "start", label: "Distribution did not start on schedule", cause: "Timeliness", keys: /start|commence|launch|day ?1|kick.?off/i, bad: isNo },
];

export interface ChecklistSite {
  state: string;
  lga: string;
  ward: string;
  facility: string;
  community: string;
  matchKey: string;
  flags: { id: string; label: string; cause: string; field: string }[];
  /** People named on the submission (supervisor, monitor, CDD, in-charge…). */
  people: { name: string; role: ActorRole }[];
  /** Submission / visit timestamp, used for work-rhythm analysis. */
  date: string;
  /** True when the submission carries a signature or photo proof. */
  signed: boolean;
}

const pick = (row: Record<string, unknown>, re: RegExp): string => {
  for (const [k, v] of Object.entries(row)) {
    if (re.test(k) && v != null && String(v).trim() && typeof v !== "object") return String(v).trim();
  }
  return "";
};

const GEO_KEY = /state|lga|local_gov|ward|facility|flhf|health_?fac|hf_name|community|settlement|village/i;
const PERSON_RULES: { keys: RegExp; role: ActorRole }[] = [
  { keys: /cdd|distributor|drug_?distributor/i, role: "cdd" },
  { keys: /in_?charge|officer_?in_?charge|oic|facility_?(staff|focal)/i, role: "facility" },
  { keys: /edo|logistic|store_?keeper|slo/i, role: "lga" },
  { keys: /supervisor|monitor|assessor|enumerator|interviewer|submitted_?by|username|data_?collector|name_?of_?(the_)?(officer|supervisor|monitor)/i, role: "state" },
];
const BAD_NAME = /^(n\/?a|none|unknown|nil|-|yes|no|true|false|\d+(\.\d+)?)$/i;

/** Names of people mentioned on a flattened checklist row, with their role. */
const pickPeople = (row: Record<string, unknown>): { name: string; role: ActorRole }[] => {
  const seen = new Map<string, ActorRole>();
  for (const [k, v] of Object.entries(row)) {
    if (v == null || typeof v === "object") continue;
    const val = String(v).trim();
    if (!val || val.length < 3 || val.length > 60 || BAD_NAME.test(val)) continue;
    if (GEO_KEY.test(k)) continue;
    if (/signature|photo|image|picture|attachment|gps|geopoint|uuid|_id$|url|file/i.test(k)) continue;
    if (!/name|_by|username|cdd|supervisor|monitor|officer|enumerator|in_?charge/i.test(k)) continue;
    if (!/[a-z]/i.test(val) || /^https?:/i.test(val)) continue;
    if (/\.(png|jpe?g|webp|gif|pdf|mp3|mp4|3gp|amr)$/i.test(val)) continue;

    const rule = PERSON_RULES.find((r) => r.keys.test(k));
    if (!rule) continue;
    const id = norm(val);
    if (!id || seen.has(id)) continue;
    seen.set(id, rule.role);
  }
  return Array.from(seen, ([id, role]) => ({ name: id.replace(/\b\w/g, (c) => c.toUpperCase()), role }));
};

/** Extract geography + behavioural flags from flattened checklist rows. */
export function extractChecklistSites(flatRows: Record<string, unknown>[]): ChecklistSite[] {
  const sites: ChecklistSite[] = [];
  for (const row of flatRows ?? []) {
    const state = pick(row, /(^|_)state$|state_name/i);
    const lga = pick(row, /lga|local_gov/i);
    const ward = pick(row, /ward/i);
    const facility = pick(row, /facility|flhf|health_?fac|hf_name/i);
    const community = pick(row, /community|settlement|village/i);
    if (!lga && !ward && !facility && !community) continue;

    const flags: ChecklistSite["flags"] = [];
    for (const rule of EVIDENCE_RULES) {
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === "object" || v == null || String(v).trim() === "") continue;
        if (!rule.keys.test(k)) continue;
        if (rule.bad(v)) { flags.push({ id: rule.id, label: rule.label, cause: rule.cause, field: k }); break; }
      }
    }
    sites.push({
      state, lga, ward, facility, community,
      matchKey: norm([lga, ward, facility, community].filter(Boolean).join(" ")),
      flags,
      people: pickPeople(row),
      date: pick(row, /^_?submission_?time$|^end$|^start$|^today$|date/i),
      signed: Object.entries(row).some(([k, v]) =>
        /signature|photo|image|proof/i.test(k) && v != null && String(v).trim() !== ""),
    });
  }
  return sites;
}

/**
 * Checklist submissions read as handovers: everyone named on the same
 * visit (same facility/community, same day) is treated as co-working, so the
 * social network can be computed even before the logistics ledger is synced.
 */
export function collectChecklistHandlings(sites: ChecklistSite[]): Handling[] {
  const out: Handling[] = [];
  for (const s of sites) {
    const context = `checklist|${norm(`${s.lga} ${s.facility} ${s.community || s.ward}`)}`;
    for (const p of s.people) {
      out.push({
        person: p.name, role: p.role, qty: 0, date: s.date, lga: s.lga,
        facility: s.facility, community: s.community, context, signed: s.signed,
      });
    }
  }
  return out;
}


/* ──────────────────────────────────────────── community failure diagnosis ── */

export type FailureKind = "not_distributed" | "poor_coverage" | "late_start" | "healthy";

export interface CommunityDiagnosis {
  key: string;
  lga: string;
  facility: string;
  community: string;
  cdds: string[];
  received: number;         // qty issued to CDDs for this community
  facilityIssued: number;   // qty issued from LGA to the parent facility
  returned: number;
  coverage: number;         // distributed / supplied at facility level (0..1)
  firstIssue: string;
  lagDays: number;          // days from first facility supply to first CDD issue
  kind: FailureKind;
  severity: number;         // 0..100
  causes: { label: string; cause: string; source: "ledger" | "checklist"; confidence: number }[];
  matchScore: number;       // fuzzy join confidence to the checklist
}

export interface DiagnosisOptions {
  lateStartDays?: number;   // lag beyond which commencement is "late"
  coverageFloor?: number;   // coverage below which it is "poor"
  identity?: IdentityIndex; // fuzzy actor-name resolver (spelling variants)
}

export function diagnoseCommunities(
  ds: LogisticsDataset,
  sites: ChecklistSite[],
  opts: DiagnosisOptions = {},
): CommunityDiagnosis[] {
  const lateStartDays = opts.lateStartDays ?? 3;
  const coverageFloor = opts.coverageFloor ?? 0.7;

  /* facility supply timeline from Level 2 */
  const facSupply = new Map<string, { qty: number; first: string }>();
  for (const i of ds.issues) {
    const k = norm(`${i.lga} ${i.facility}`);
    const e = facSupply.get(k) ?? { qty: 0, first: "" };
    e.qty += Number(i.qtyIssued) || 0;
    const d = dayOf(i.date);
    if (d && (!e.first || d < e.first)) e.first = d;
    facSupply.set(k, e);
  }

  /* community delivery from Level 3 */
  type Agg = { lga: string; facility: string; community: string; qty: number; first: string; cdds: Set<string> };
  const comm = new Map<string, Agg>();
  for (const c of ds.cddIssues) {
    const k = norm(`${c.lga} ${c.facility} ${c.community}`);
    const e = comm.get(k) ?? { lga: c.lga, facility: c.facility, community: c.community, qty: 0, first: "", cdds: new Set<string>() };
    e.qty += Number(c.qtyIssued) || 0;
    const d = dayOf(c.date);
    if (d && (!e.first || d < e.first)) e.first = d;
    if (clean(c.cddName)) e.cdds.add(clean(c.cddName));
    comm.set(k, e);
  }

  /* communities named in the checklist but never reached in the ledger */
  for (const s of sites) {
    if (!s.community) continue;
    const k = norm(`${s.lga} ${s.facility} ${s.community}`);
    if (!comm.has(k)) {
      comm.set(k, { lga: s.lga, facility: s.facility, community: s.community, qty: 0, first: "", cdds: new Set<string>() });
    }
  }

  const returnsByComm = new Map<string, number>();
  for (const r of ds.returns) {
    if (!r.community) continue;
    const k = norm(`${r.lga} ${r.facility} ${r.community}`);
    returnsByComm.set(k, (returnsByComm.get(k) ?? 0) + (Number(r.qtyReturned) || 0));
  }

  const out: CommunityDiagnosis[] = [];
  for (const [key, e] of comm) {
    const facKey = norm(`${e.lga} ${e.facility}`);
    const fac = facSupply.get(facKey);
    const facilityIssued = fac?.qty ?? 0;
    const returned = returnsByComm.get(key) ?? 0;
    const coverage = facilityIssued > 0 ? Math.min(1, e.qty / facilityIssued) : (e.qty > 0 ? 1 : 0);
    const lagDays = fac?.first && e.first
      ? Math.round((new Date(e.first).getTime() - new Date(fac.first).getTime()) / 86_400_000)
      : (fac?.first && !e.first ? 999 : 0);

    let kind: FailureKind = "healthy";
    if (e.qty <= 0) kind = "not_distributed";
    else if (lagDays > lateStartDays) kind = "late_start";
    else if (coverage < coverageFloor) kind = "poor_coverage";

    const causes: CommunityDiagnosis["causes"] = [];
    if (kind !== "healthy") {
      if (facilityIssued <= 0) causes.push({ label: "Parent health facility never received stock from the LGA store", cause: "Supply", source: "ledger", confidence: 0.95 });
      if (e.cdds.size === 0 && e.qty <= 0) causes.push({ label: "No CDD recorded against this community", cause: "Capacity", source: "ledger", confidence: 0.85 });
      if (e.cdds.size === 1) causes.push({ label: `Single-CDD dependency (${Array.from(e.cdds)[0]})`, cause: "Social capital", source: "ledger", confidence: 0.6 });
      if (returned > 0 && e.qty > 0 && returned / Math.max(1, e.qty) > 0.2)
        causes.push({ label: `${Math.round((returned / e.qty) * 100)}% of medicines returned unused`, cause: "Demand", source: "ledger", confidence: 0.8 });
      if (lagDays > lateStartDays && lagDays < 900)
        causes.push({ label: `Commencement lagged facility supply by ${lagDays} days`, cause: "Timeliness", source: "ledger", confidence: 0.75 });
    }

    /* fuzzy join to the supervisory checklist */
    const needle = norm(`${e.lga} ${e.facility} ${e.community}`);
    const m = bestMatch(needle, sites, (s) => s.matchKey, 0.55)
      ?? bestMatch(norm(`${e.lga} ${e.community}`), sites, (s) => s.matchKey, 0.5);
    if (m) {
      for (const f of m.row.flags) {
        causes.push({ label: f.label, cause: f.cause, source: "checklist", confidence: Math.round(m.score * 100) / 100 });
      }
    }

    const severity = Math.min(100, Math.round(
      (kind === "not_distributed" ? 70 : kind === "late_start" ? 45 : kind === "poor_coverage" ? 40 : 5) +
      causes.length * 5 + (1 - coverage) * 20,
    ));

    out.push({
      key, lga: e.lga, facility: e.facility, community: e.community,
      cdds: Array.from(e.cdds).sort(),
      received: e.qty, facilityIssued, returned, coverage,
      firstIssue: e.first, lagDays, kind, severity,
      causes: causes.sort((a, b) => b.confidence - a.confidence),
      matchScore: m?.score ?? 0,
    });
  }

  return out.sort((a, b) => b.severity - a.severity || b.facilityIssued - a.facilityIssued);
}

/* ─────────────────────────────────────────────── rhythms & intelligence Q&A ── */

export interface Rhythms {
  hours: { name: string; value: number }[];
  weekdays: { name: string; value: number }[];
  nightRate: number;
  weekendRate: number;
}

export function computeRhythms(ds: LogisticsDataset, extraDates: string[] = []): Rhythms {
  const hours = Array.from({ length: 24 }, (_, h) => ({ name: `${String(h).padStart(2, "0")}h`, value: 0 }));
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekdays = WD.map((name) => ({ name, value: 0 }));
  let total = 0, night = 0, weekend = 0;
  const all = [...ds.dispatches, ...ds.receipts, ...ds.issues, ...ds.cddIssues, ...ds.returns,
    ...extraDates.map((date) => ({ date }))];

  for (const t of all) {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) continue;
    total++;
    hours[d.getHours()].value++;
    weekdays[d.getDay()].value++;
    if (d.getHours() < 7 || d.getHours() >= 18) night++;
    if (d.getDay() === 0 || d.getDay() === 6) weekend++;
  }
  return { hours, weekdays, nightRate: total ? night / total : 0, weekendRate: total ? weekend / total : 0 };
}

export interface IntelligenceAnswer {
  id: string;
  question: string;
  answer: string;
  detail: string[];
  tone: "info" | "warn" | "danger" | "success";
  metric?: string;
}

const pctS = (n: number) => `${(n * 100).toFixed(1)}%`;

export function answerIntelligenceQuestions(
  net: NetworkStats,
  diag: CommunityDiagnosis[],
  rhythms: Rhythms,
  sites: ChecklistSite[],
): IntelligenceAnswer[] {
  const out: IntelligenceAnswer[] = [];
  const failing = diag.filter((d) => d.kind !== "healthy");

  /* 1. Single points of failure */
  const spof = diag.filter((d) => d.cdds.length === 1 && d.received > 0);
  out.push({
    id: "spof",
    question: "Which communities depend on one single person for their medicines?",
    answer: `${spof.length.toLocaleString()} communities are served by exactly one CDD.`,
    metric: `${spof.length} single-CDD communities`,
    tone: spof.length > 0 ? "warn" : "success",
    detail: spof.slice(0, 6).map((d) => `${d.community} (${d.lga}) — ${d.cdds[0]}, ${Math.round(d.received).toLocaleString()} units`),
  });

  /* 2. Brokers */
  const topBroker = net.brokers[0];
  out.push({
    id: "brokers",
    question: "Who are the brokers holding the distribution network together?",
    answer: topBroker
      ? `${topBroker.actor.name} bridges ${topBroker.bridges} otherwise disconnected pairs (${pctS(topBroker.brokerage)} structural-hole score).`
      : "No brokerage positions detected — the network is either very small or fully connected.",
    metric: topBroker ? `${net.brokers.length} brokers` : "0 brokers",
    tone: "info",
    detail: net.brokers.slice(0, 6).map((b) => `${b.actor.name} — ${b.bridges} bridges · ${b.actor.partners.length} partners · ${b.actor.lgas.join(", ") || "—"}`),
  });

  /* 3. Closed cliques with weak documentation → collusion risk */
  const risky = net.cliques.filter((c) => c.signatureRate < 0.5);
  out.push({
    id: "cliques",
    question: "Are there closed groups moving stock with weak documentation (collusion risk)?",
    answer: risky.length
      ? `${risky.length} tightly-knit trios repeatedly handle the same batches with signature/POD below 50%.`
      : "No closed trio combines high co-handling with weak documentation.",
    metric: `${net.cliques.length} trios`,
    tone: risky.length ? "danger" : "success",
    detail: risky.slice(0, 5).map((c) => `${c.members.join(" ↔ ")} — ${c.weight} shared handovers · POD ${pctS(c.signatureRate)}`),
  });

  /* 4. Chronotypes */
  const peak = rhythms.hours.reduce((a, b) => (b.value > a.value ? b : a), rhythms.hours[0]);
  const nightActors = net.actors.filter((a) => a.transactions >= 3 && a.nightShare > 0.4);
  out.push({
    id: "chronotype",
    question: "When do people actually work, and who works off-hours?",
    answer: `Peak handover hour is ${peak.name}; ${pctS(rhythms.nightRate)} of all transactions happen outside 07:00–18:00 and ${pctS(rhythms.weekendRate)} at weekends.`,
    metric: `Peak ${peak.name}`,
    tone: rhythms.nightRate > 0.2 ? "warn" : "info",
    detail: nightActors.slice(0, 6).map((a) => `${a.name} — ${pctS(a.nightShare)} off-hours across ${a.transactions} transactions`),
  });

  /* 5. Does social connectedness predict coverage? */
  const pairs = diag.filter((d) => d.received > 0).map((d) => {
    const deg = d.cdds.reduce((s, c) => s + (net.actors.find((a) => a.id === norm(c))?.partners.length ?? 0), 0) / Math.max(1, d.cdds.length);
    return { x: deg, y: d.coverage };
  });
  const r = pearson(pairs.map((p) => p.x), pairs.map((p) => p.y));
  out.push({
    id: "connectedness",
    question: "Do better-connected CDDs deliver better coverage?",
    answer: pairs.length < 5
      ? "Not enough matched communities yet to test this relationship."
      : `Correlation between a CDD's network degree and community coverage is r = ${r.toFixed(2)} (${Math.abs(r) < 0.2 ? "negligible" : Math.abs(r) < 0.5 ? "moderate" : "strong"}${r < 0 ? ", negative" : ""}).`,
    metric: pairs.length >= 5 ? `r = ${r.toFixed(2)}` : "n/a",
    tone: r > 0.3 ? "success" : "info",
    detail: [`${pairs.length} communities with a resolvable CDD network position.`],
  });

  /* 6. Root causes of non-distribution */
  const causeCount = new Map<string, number>();
  for (const d of failing) for (const c of d.causes) causeCount.set(c.label, (causeCount.get(c.label) ?? 0) + 1);
  const ranked = Array.from(causeCount.entries()).sort((a, b) => b[1] - a[1]);
  out.push({
    id: "root-causes",
    question: "Why is medicine not being distributed, covered poorly, or started late?",
    answer: ranked.length
      ? `Top driver: “${ranked[0][0]}” explains ${ranked[0][1]} of ${failing.length} failing communities.`
      : "No failing communities detected in the current scope.",
    metric: `${failing.length} failing communities`,
    tone: failing.length ? "danger" : "success",
    detail: ranked.slice(0, 8).map(([label, n]) => `${label} — ${n} communities (${pctS(n / Math.max(1, failing.length))})`),
  });

  /* 7. Late commencement geography */
  const late = failing.filter((d) => d.kind === "late_start");
  const byLga = new Map<string, number[]>();
  for (const d of late) (byLga.get(d.lga) ?? byLga.set(d.lga, []).get(d.lga)!).push(d.lagDays);
  const lgaLate = Array.from(byLga.entries())
    .map(([lga, arr]) => ({ lga, n: arr.length, avg: arr.reduce((a, b) => a + b, 0) / arr.length }))
    .sort((a, b) => b.avg - a.avg);
  out.push({
    id: "late",
    question: "Where does distribution start late, and by how much?",
    answer: lgaLate.length
      ? `${lgaLate[0].lga} starts latest — an average of ${lgaLate[0].avg.toFixed(1)} days after its facilities were stocked.`
      : "No late commencement detected against the current threshold.",
    metric: `${late.length} late communities`,
    tone: late.length ? "warn" : "success",
    detail: lgaLate.slice(0, 6).map((l) => `${l.lga} — ${l.n} communities · avg lag ${l.avg.toFixed(1)} days`),
  });

  /* 8. Checklist coverage of the failing set */
  const matched = failing.filter((d) => d.matchScore > 0);
  out.push({
    id: "fuzzy-join",
    question: "How much of the failure story is corroborated by the supervisory checklist?",
    answer: `${matched.length} of ${failing.length} failing communities fuzzy-matched a checklist visit (avg confidence ${pctS(matched.reduce((s, d) => s + d.matchScore, 0) / Math.max(1, matched.length))}).`,
    metric: `${sites.length} checklist sites`,
    tone: matched.length >= failing.length * 0.5 ? "success" : "warn",
    detail: [
      `${sites.length.toLocaleString()} checklist submissions carried usable geography.`,
      `${sites.reduce((s, x) => s + x.flags.length, 0).toLocaleString()} behavioural red flags extracted from checklist answers.`,
      "Unmatched communities are visible in the diagnosis table with a 0% match score — prioritise them for supervision.",
    ],
  });

  /* 9. Workload inequity */
  const sorted = net.actors.map((a) => a.transactions).sort((a, b) => b - a);
  const totalTx = sorted.reduce((a, b) => a + b, 0);
  const top10 = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.1))).reduce((a, b) => a + b, 0);
  out.push({
    id: "workload",
    question: "Is the workload fairly spread, or carried by a handful of people?",
    answer: totalTx
      ? `The busiest 10% of actors handle ${pctS(top10 / totalTx)} of all recorded transactions.`
      : "No transactions recorded yet.",
    metric: `${net.actors.length} actors`,
    tone: totalTx && top10 / totalTx > 0.5 ? "warn" : "info",
    detail: net.actors.slice(0, 6).map((a) => `${a.name} — ${a.transactions} transactions · ${a.communities.length} communities · POD ${pctS(a.signatureRate)}`),
  });

  return out;
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/* ─────────────────────────────────────────────────────────── entry point ── */

export interface HumanPatternsResult {
  network: NetworkStats;
  sites: ChecklistSite[];
  diagnoses: CommunityDiagnosis[];
  rhythms: Rhythms;
  answers: IntelligenceAnswer[];
}

export function computeHumanPatterns(
  ds: LogisticsDataset,
  checklistRows: Record<string, unknown>[] | null | undefined,
  opts: DiagnosisOptions = {},
): HumanPatternsResult {
  const sites = extractChecklistSites(checklistRows ?? []);
  // The supervisory checklist is a second social source: when the logistics
  // ledger is thin (or not yet synced) the network, rhythms and diagnoses are
  // still computed from checklist visits, so the panel is never blank.
  const checklistHandlings = collectChecklistHandlings(sites);
  const network = buildNetwork(ds, checklistHandlings);
  const diagnoses = diagnoseCommunities(ds, sites, opts);
  const rhythms = computeRhythms(ds, sites.map((s) => s.date).filter(Boolean));
  const answers = answerIntelligenceQuestions(network, diagnoses, rhythms, sites);
  return { network, sites, diagnoses, rhythms, answers };
}

