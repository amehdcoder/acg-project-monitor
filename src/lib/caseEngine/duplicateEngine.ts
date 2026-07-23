// Phase 2 — Offline Fuzzy Deduplication Engine.
//
// Compares an incoming registration payload against locally-cached, non-closed
// cases in IndexedDB and returns candidate matches with a weighted score
// (0–100) plus human-readable reasons. Runs entirely offline; no network.
//
// Scoring rubric (max 100):
//   • national_id exact ............ 100  (short-circuit dominant signal)
//   • phone exact ...................  40
//   • first_name fuzzy .............. up to 20
//   • last_name  fuzzy .............. up to 20
//   • dob exact .....................  20

import {
  listCases,
  type CaseEntity,
  type CaseSearchKeys,
  type CaseType,
} from "./caseStore";

export interface DuplicateCandidate {
  case: CaseEntity;
  score: number;                // 0-100
  reasons: string[];            // human-readable
  matchedFields: string[];
}

export interface EvaluateOptions {
  case_type?: CaseType;
  threshold?: number;           // return only candidates >= this score
  limit?: number;               // cap number of returned candidates
}

/** Normalise a string for comparison (case + whitespace + diacritics). */
const norm = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

/** Levenshtein distance — iterative, O(n*m) with rolling rows. */
export const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
};

/** Convert a Levenshtein distance to a 0..1 similarity score. */
export const stringSimilarity = (a: string, b: string): number => {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  if (!maxLen) return 0;
  return 1 - levenshtein(na, nb) / maxLen;
};

/** Cheap phone canonicaliser — digits only. */
const phoneKey = (v: unknown): string =>
  String(v ?? "").replace(/\D+/g, "");

interface ScoreResult {
  score: number;
  reasons: string[];
  matchedFields: string[];
}

/** Score a single stored case against the incoming search keys. */
export const scoreCandidate = (
  incoming: CaseSearchKeys,
  candidate: CaseSearchKeys,
): ScoreResult => {
  const reasons: string[] = [];
  const matchedFields: string[] = [];
  let score = 0;

  // National ID — dominant signal.
  if (incoming.national_id && candidate.national_id) {
    if (norm(incoming.national_id) === norm(candidate.national_id)) {
      reasons.push("National ID matches exactly");
      matchedFields.push("national_id");
      return { score: 100, reasons, matchedFields };
    }
  }

  // Phone exact (digits only).
  if (incoming.phone && candidate.phone) {
    const a = phoneKey(incoming.phone);
    const b = phoneKey(candidate.phone);
    if (a && b && a === b) {
      score += 40;
      reasons.push("Phone number matches");
      matchedFields.push("phone");
    }
  }

  // Fuzzy first/last name — up to 20 each.
  if (incoming.first_name && candidate.first_name) {
    const sim = stringSimilarity(incoming.first_name, candidate.first_name);
    const pts = Math.round(sim * 20);
    if (pts >= 12) {
      score += pts;
      reasons.push(
        sim >= 0.99
          ? "First name matches"
          : `First name similar (${Math.round(sim * 100)}%)`,
      );
      matchedFields.push("first_name");
    }
  }
  if (incoming.last_name && candidate.last_name) {
    const sim = stringSimilarity(incoming.last_name, candidate.last_name);
    const pts = Math.round(sim * 20);
    if (pts >= 12) {
      score += pts;
      reasons.push(
        sim >= 0.99
          ? "Last name matches"
          : `Last name similar (${Math.round(sim * 100)}%)`,
      );
      matchedFields.push("last_name");
    }
  }

  // DOB exact.
  if (incoming.dob && candidate.dob) {
    if (norm(incoming.dob) === norm(candidate.dob)) {
      score += 20;
      reasons.push("Date of birth matches");
      matchedFields.push("dob");
    }
  }

  return { score: Math.min(100, score), reasons, matchedFields };
};

/** Main entry point — compare against local non-closed cases. */
export const evaluateDuplicateCandidates = async (
  incoming: CaseSearchKeys,
  opts: EvaluateOptions = {},
): Promise<DuplicateCandidate[]> => {
  const { case_type, threshold = 70, limit = 5 } = opts;
  const pool = await listCases({ case_type, includeClosed: false });

  const results: DuplicateCandidate[] = [];
  for (const c of pool) {
    const { score, reasons, matchedFields } = scoreCandidate(
      incoming,
      c.search_keys || {},
    );
    if (score >= threshold) {
      results.push({ case: c, score, reasons, matchedFields });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
};

export const DEFAULT_DUPLICATE_THRESHOLD = 70;
