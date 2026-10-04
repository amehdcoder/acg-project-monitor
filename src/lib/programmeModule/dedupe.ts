import type { BeneficiaryRow } from "./types";

/** Lower-case, strip titles/punctuation and sort name parts so "Musa Aliyu" == "ALIYU, musa". */
export const normalizeName = (name?: string | null): string =>
  String(name || "")
    .toLowerCase()
    .replace(/\b(mr|mrs|miss|ms|mal|malam|alh|alhaji|hajiya|dr)\.?\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

/** Edit distance, used to tolerate one or two spelling slips in names. */
export const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
};

/** Name similarity 0..1. */
export const nameSimilarity = (a?: string | null, b?: string | null): number => {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
};

/** Age in whole years, from date of birth when present, else the recorded age. */
export const ageOf = (b: Pick<BeneficiaryRow, "profile">, now = new Date()): number | null => {
  const p = b.profile || {};
  const dob = p.date_of_birth;
  if (dob) {
    const d = new Date(String(dob));
    if (!Number.isNaN(d.getTime())) {
      let age = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
      return age;
    }
  }
  const n = Number(p.age);
  return Number.isFinite(n) && String(p.age ?? "").trim() !== "" ? Math.floor(n) : null;
};

const lgaOf = (b: Pick<BeneficiaryRow, "lga" | "profile">) =>
  String(b.lga || b.profile?.lga || "").trim().toLowerCase();

export interface DuplicateMatch {
  a: BeneficiaryRow;
  b: BeneficiaryRow;
  /** 0..100 */
  score: number;
  reasons: string[];
}

/**
 * Matching rule: same LGA, names at least 85% alike, and ages within 2 years
 * (or the same date of birth). Records with no LGA or no age are not matched.
 */
export const isDuplicatePair = (a: BeneficiaryRow, b: BeneficiaryRow): DuplicateMatch | null => {
  const la = lgaOf(a), lb = lgaOf(b);
  if (!la || la !== lb) return null;
  const sim = nameSimilarity(a.full_name, b.full_name);
  if (sim < 0.85) return null;
  const sameDob = a.profile?.date_of_birth && a.profile?.date_of_birth === b.profile?.date_of_birth;
  const ageA = ageOf(a), ageB = ageOf(b);
  if (!sameDob) {
    if (ageA === null || ageB === null) return null;
    if (Math.abs(ageA - ageB) > 2) return null;
  }
  const ageGap = sameDob ? 0 : Math.abs((ageA as number) - (ageB as number));
  const reasons = [
    sim === 1 ? "Same name" : `Names ${Math.round(sim * 100)}% alike`,
    sameDob ? "Same date of birth" : ageGap === 0 ? "Same age" : `Ages ${ageGap} yr apart`,
    "Same LGA",
  ];
  const score = Math.round(sim * 70 + (sameDob ? 30 : 30 - ageGap * 10));
  return { a, b, score, reasons };
};

/** All likely duplicate pairs, strongest first. Blocks by LGA to stay fast. */
export const findDuplicates = (rows: BeneficiaryRow[]): DuplicateMatch[] => {
  const byLga = new Map<string, BeneficiaryRow[]>();
  for (const r of rows) {
    if (r.__pending) continue;
    const k = lgaOf(r);
    if (!k) continue;
    (byLga.get(k) || byLga.set(k, []).get(k)!).push(r);
  }
  const out: DuplicateMatch[] = [];
  for (const group of byLga.values()) {
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const m = isDuplicatePair(group[i], group[j]);
        if (m) out.push(m);
      }
  }
  return out.sort((x, y) => y.score - x.score);
};

export const CORE_FIELDS: { key: string; label: string }[] = [
  { key: "full_name", label: "Name" },
  { key: "sex", label: "Sex" },
  { key: "age", label: "Age / date of birth" },
  { key: "phone", label: "Phone" },
  { key: "state", label: "State" },
  { key: "lga", label: "LGA" },
  { key: "ward", label: "Ward" },
  { key: "village", label: "Community" },
  { key: "facility", label: "Facility" },
  { key: "photo", label: "Photo" },
  { key: "gps", label: "GPS location" },
  { key: "primary_condition", label: "Primary condition" },
  { key: "consent_obtained", label: "Consent" },
];

const filled = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";

/** Which core fields are missing for a record. */
export const missingFields = (b: BeneficiaryRow): string[] => {
  const p = b.profile || {};
  const has: Record<string, boolean> = {
    full_name: filled(b.full_name),
    sex: filled(p.sex) || filled(p.gender),
    age: ageOf(b) !== null,
    phone: filled(p.phone),
    state: filled(b.state) || filled(p.state),
    lga: filled(b.lga) || filled(p.lga),
    ward: filled(b.ward) || filled(p.ward),
    village: filled(b.village) || filled(p.village),
    facility: filled(b.facility_id),
    photo: filled(b.photo_url),
    gps: (b.latitude !== null && b.latitude !== undefined) || filled(p.gps),
    primary_condition: filled(p.primary_condition) || filled(p.mmdp_condition),
    consent_obtained: filled(p.consent_obtained),
  };
  return CORE_FIELDS.filter((f) => !has[f.key]).map((f) => f.label);
};

/** Completeness 0..100 across the core fields. */
export const completenessScore = (b: BeneficiaryRow): number =>
  Math.round(((CORE_FIELDS.length - missingFields(b).length) / CORE_FIELDS.length) * 100);

/** Pull the Case ID out of a scanned QR (link or raw text). */
export const caseIdFromScan = (text: string): string => {
  const t = text.trim();
  try {
    const u = new URL(t);
    const c = u.searchParams.get("case");
    if (c) return c.trim();
  } catch { /* not a link */ }
  return t;
};
