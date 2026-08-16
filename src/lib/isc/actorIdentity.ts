/**
 * Real-time fuzzy identity resolution for people named in the Medicine
 * Accountability ledger and the Supervisory Checklist.
 *
 * Field data spells the same human being many different ways
 * ("Akarami Abdurrahman Khalid" vs "AKRAM ABDULRAHMAN KHALID" vs
 * "khalid, abdulrahman a."). Every aggregate — transactions, quantities,
 * network ties, brokerage, workload equity — must resolve to ONE actor.
 *
 * Approach (all local, no network, recomputed on every render):
 *  1. Strip honorifics/suffixes and punctuation, split into name tokens.
 *  2. Reduce each token to a consonant-skeleton phonetic code (handles
 *     Abdul/Abdur, Mohammed/Muhammad, Akram/Akarami, ph/f, double letters).
 *  3. Score two names with an order-independent greedy token match, where a
 *     token pair matches on exact code, phonetic Dice, raw Dice, or an
 *     initial-vs-full-name abbreviation.
 *  4. Greedily cluster variants around the most frequent spelling and expose
 *     a single canonical display name (the best-formed, most complete
 *     variant, title-cased against the standard name registry rules).
 */

const HONORIFICS = new Set([
  "mr", "mrs", "miss", "ms", "dr", "prof", "engr", "arc", "barr", "hon", "sir",
  "alh", "alhaji", "alhaja", "hajiya", "hajia", "malam", "mallam", "mal",
  "pastor", "rev", "reverend", "imam", "chief", "elder", "madam", "mister",
  "esq", "jr", "snr", "sr", "phd", "mbbs", "rn", "cdd", "edo", "slo", "focal",
]);

const TITLE_CASE_EXCEPTIONS: Record<string, string> = {
  mac: "Mac", mc: "Mc", al: "al", bin: "bin", bint: "bint", van: "van", de: "de",
};

export const cleanPersonName = (raw: unknown): string =>
  String(raw ?? "")
    .replace(/[^\p{L}\p{N}'.\-\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Lower-cased, honorific-free name tokens. */
export function nameTokens(raw: unknown): string[] {
  return cleanPersonName(raw)
    .toLowerCase()
    .split(/[\s.]+/)
    .map((t) => t.replace(/[^a-z']/g, "").replace(/'/g, ""))
    .filter((t) => t.length > 0 && !HONORIFICS.has(t));
}

/** Consonant-skeleton phonetic code, tolerant of Nigerian/Arabic spellings. */
export function phoneticCode(token: string): string {
  let s = token.toLowerCase();
  s = s
    .replace(/ph/g, "f")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/sh/g, "x")
    .replace(/ch/g, "x")
    .replace(/th/g, "t")
    .replace(/dh/g, "d")
    .replace(/ck/g, "k")
    .replace(/qu?/g, "k")
    .replace(/[wy]/g, "")
    .replace(/h/g, "")
    .replace(/z/g, "s")
    .replace(/v/g, "f")
    .replace(/j/g, "g");
  const first = s.charAt(0);
  // keep the leading vowel (Abdul vs Bdul), drop the rest
  s = first + s.slice(1).replace(/[aeiou]/g, "");
  return s.replace(/(.)\1+/g, "$1");
}

const bigrams = (s: string) => {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
};

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a), B = bigrams(b);
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) { counts.set(g, c - 1); hits++; }
  }
  return (2 * hits) / (A.length + B.length);
}

/** 0…1 similarity of two individual name tokens. */
export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.85 : 0;
  const pa = phoneticCode(a), pb = phoneticCode(b);
  if (pa && pa === pb) return 0.97;
  const raw = dice(a, b);
  const pho = dice(pa, pb);
  const best = Math.max(raw, pho * 0.98);
  // prefixes of one another ("abdul" / "abdulrahman") only count weakly
  if (best < 0.6 && (a.startsWith(b) || b.startsWith(a))) return 0.62;
  return best;
}

/** Order-independent similarity of two full names (0…1). */
export function nameSimilarity(aTokens: string[], bTokens: string[]): number {
  if (!aTokens.length || !bTokens.length) return 0;
  const used = new Set<number>();
  let matched = 0, score = 0;
  for (const t of aTokens) {
    let bestI = -1, bestS = 0;
    bTokens.forEach((u, i) => {
      if (used.has(i)) return;
      const s = tokenSimilarity(t, u);
      if (s > bestS) { bestS = s; bestI = i; }
    });
    if (bestI >= 0 && bestS >= 0.72) { used.add(bestI); matched++; score += bestS; }
  }
  if (!matched) return 0;
  const shorter = Math.min(aTokens.length, bTokens.length);
  // require most of the shorter name to be accounted for
  const coverage = matched / shorter;
  if (coverage < 0.99 && shorter > 1) return (score / matched) * coverage * 0.8;
  return (score / matched) * (0.85 + 0.15 * (matched / Math.max(aTokens.length, bTokens.length)));
}

const titleCase = (name: string) =>
  name
    .toLowerCase()
    .split(/(\s|-)/)
    .map((part) => {
      if (part === " " || part === "-") return part;
      const low = part.replace(/[^a-z']/g, "");
      if (TITLE_CASE_EXCEPTIONS[low]) return TITLE_CASE_EXCEPTIONS[low];
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");

/** Prefer the most complete, best-formed spelling as the canonical label. */
function pickCanonicalLabel(variants: { raw: string; count: number }[]): string {
  const scored = variants.map((v) => {
    const tokens = nameTokens(v.raw);
    const allCaps = v.raw === v.raw.toUpperCase();
    const mixedCase = /[a-z]/.test(v.raw) && /[A-Z]/.test(v.raw);
    const hasInitials = tokens.some((t) => t.length === 1);
    const score =
      v.count * 3 +
      tokens.length * 2 +
      (mixedCase ? 2 : 0) -
      (allCaps ? 1 : 0) -
      (hasInitials ? 2 : 0) +
      tokens.join("").length * 0.05;
    return { raw: v.raw, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return titleCase(cleanPersonName(scored[0]?.raw ?? ""));
}

export interface ResolvedIdentity {
  /** Stable cluster id (canonical name, normalised). */
  id: string;
  /** Canonical display name for every variant in the cluster. */
  name: string;
  /** Raw spellings folded into this person. */
  variants: string[];
}

export interface IdentityIndex {
  /** Raw (trimmed) spelling → resolved identity. */
  resolve: (raw: unknown) => ResolvedIdentity | null;
  clusters: ResolvedIdentity[];
}

const MATCH_FLOOR = 0.8;

/**
 * Build an identity index from every raw spelling encountered.
 * `exclude` names (e.g. the signed-in user) are dropped entirely.
 */
export function buildIdentityIndex(rawNames: Iterable<unknown>, exclude: string[] = []): IdentityIndex {
  const freq = new Map<string, number>();
  for (const r of rawNames) {
    const c = cleanPersonName(r);
    if (!c) continue;
    freq.set(c, (freq.get(c) ?? 0) + 1);
  }

  const excludeTokens = exclude.map((e) => nameTokens(e)).filter((t) => t.length > 0);
  const isExcluded = (tokens: string[]) =>
    excludeTokens.some((ex) => nameSimilarity(tokens, ex) >= MATCH_FLOOR);

  const entries = Array.from(freq.entries())
    .map(([raw, count]) => ({ raw, count, tokens: nameTokens(raw) }))
    .filter((e) => e.tokens.length > 0 && !isExcluded(e.tokens))
    .sort((a, b) => b.count - a.count || b.tokens.length - a.tokens.length);

  interface Cluster { tokensList: string[][]; members: { raw: string; count: number }[] }
  const clusters: Cluster[] = [];

  for (const e of entries) {
    let best: { c: Cluster; s: number } | null = null;
    for (const c of clusters) {
      let s = 0;
      for (const t of c.tokensList) s = Math.max(s, nameSimilarity(e.tokens, t));
      if (s >= MATCH_FLOOR && (!best || s > best.s)) best = { c, s };
    }
    if (best) {
      best.c.members.push({ raw: e.raw, count: e.count });
      best.c.tokensList.push(e.tokens);
    } else {
      clusters.push({ tokensList: [e.tokens], members: [{ raw: e.raw, count: e.count }] });
    }
  }

  const byRaw = new Map<string, ResolvedIdentity>();
  const resolved: ResolvedIdentity[] = clusters.map((c) => {
    const name = pickCanonicalLabel(c.members);
    const id = nameTokens(name).sort().join(" ") || name.toLowerCase();
    const identity: ResolvedIdentity = { id, name, variants: c.members.map((m) => m.raw) };
    for (const m of c.members) byRaw.set(m.raw.toLowerCase(), identity);
    return identity;
  });

  return {
    clusters: resolved,
    resolve: (raw: unknown) => {
      const c = cleanPersonName(raw);
      if (!c) return null;
      const hit = byRaw.get(c.toLowerCase());
      if (hit) return hit;
      // unseen spelling (streaming/new submission) — fuzzy match live
      const tokens = nameTokens(c);
      if (!tokens.length || isExcluded(tokens)) return null;
      let best: { r: ResolvedIdentity; s: number } | null = null;
      for (const r of resolved) {
        const s = nameSimilarity(tokens, nameTokens(r.name));
        if (s >= MATCH_FLOOR && (!best || s > best.s)) best = { r, s };
      }
      return best?.r ?? { id: tokens.slice().sort().join(" "), name: titleCase(c), variants: [c] };
    },
  };
}

export default buildIdentityIndex;
