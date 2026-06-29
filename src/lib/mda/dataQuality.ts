/**
 * MDA Supervisory Checklist — data-quality assessment
 * ────────────────────────────────────────────────────────────────────────
 * Flags missing or inconsistent checklist SECTIONS per project / LGA so the
 * statistical inferences shown on the dashboard can be trusted. Each "section"
 * maps to a resolved checklist question (status of MDA, adverse reactions,
 * commodity readiness, CDD presence …). A section is considered "covered" for a
 * community when that community has a non-empty answer for the section's
 * question.
 *
 * Everything is derived from the already-filtered submissions, so it recomputes
 * automatically when the project / LGA / date-range filters change.
 */
import type { CommunityAgg, ResolvedQ } from "./analyses";

export interface QualitySectionDef {
  id: string;
  label: string;
  q: ResolvedQ | null;
}

export type QualityLevel = "good" | "warn" | "bad";

export interface SectionCoverage {
  id: string;
  label: string;
  resolved: boolean;
  answered: number;
  total: number;
  pct: number;
  level: QualityLevel;
}

export interface LgaQuality {
  lga: string;
  communities: number;
  sections: SectionCoverage[];
  /** 0–100 completeness score across resolved sections. */
  score: number;
  level: QualityLevel;
  /** keys of communities with at least one missing resolved section */
  incompleteKeys: string[];
}

/** Project-wide raw counts behind each section's quality warning. */
export interface SectionSummary {
  id: string;
  label: string;
  resolved: boolean;
  /** the checklist question LABEL this section matched, if resolved */
  questionLabel: string | null;
  answered: number;
  missing: number;
  total: number;
  pct: number;
  level: QualityLevel;
  /** community keys missing an answer for this section */
  missingKeys: string[];
}

export interface QualityReport {
  projectName: string;
  totalCommunities: number;
  resolvedSections: number;
  expectedSections: number;
  overallScore: number;
  overallLevel: QualityLevel;
  lgas: LgaQuality[];
  /** project-wide per-section raw counts (drives the "what's missing" panel) */
  sections: SectionSummary[];
  /** sections that could not be resolved from the form at all */
  unresolved: string[];
}

const levelOf = (pct: number): QualityLevel => (pct >= 85 ? "good" : pct >= 60 ? "warn" : "bad");

const hasValue = (c: CommunityAgg, q: ResolvedQ | null): boolean => {
  if (!q) return false;
  const v = c.values[q.key];
  return v !== undefined && v !== null && String(v).trim() !== "";
};

export function buildQualityReport(
  allCommunities: CommunityAgg[],
  sectionDefs: QualitySectionDef[],
  projectName = "",
): QualityReport {
  // Exclude communities without a resolved LGA / Area Council. These produce an
  // "Unspecified" row that is not actionable, and such submissions should never
  // appear on the dashboard.
  const communities = allCommunities.filter((c) => String(c.lga || "").trim() !== "");

  const resolved = sectionDefs.filter((s) => s.q);
  const unresolved = sectionDefs.filter((s) => !s.q).map((s) => s.label);

  // group communities by LGA
  const byLga = new Map<string, CommunityAgg[]>();
  for (const c of communities) {
    const k = c.lga || "Unspecified";
    if (!byLga.has(k)) byLga.set(k, []);
    byLga.get(k)!.push(c);
  }


  const lgas: LgaQuality[] = [...byLga.entries()]
    .map(([lga, list]) => {
      const sections: SectionCoverage[] = sectionDefs.map((def) => {
        const total = list.length;
        const answered = def.q ? list.filter((c) => hasValue(c, def.q)).length : 0;
        const pct = def.q && total ? Math.round((answered / total) * 100) : 0;
        return {
          id: def.id,
          label: def.label,
          resolved: !!def.q,
          answered,
          total,
          pct,
          level: def.q ? levelOf(pct) : "bad",
        };
      });
      const resolvedSecs = sections.filter((s) => s.resolved);
      const score = resolvedSecs.length
        ? Math.round(resolvedSecs.reduce((a, s) => a + s.pct, 0) / resolvedSecs.length)
        : 0;
      const incompleteKeys = list
        .filter((c) => resolved.some((def) => !hasValue(c, def.q)))
        .map((c) => c.key);
      return {
        lga,
        communities: list.length,
        sections,
        score,
        level: levelOf(score),
        incompleteKeys,
      };
    })
    .sort((a, b) => a.score - b.score); // worst first

  const overallScore = lgas.length
    ? Math.round(
        lgas.reduce((a, l) => a + l.score * l.communities, 0) /
          Math.max(1, lgas.reduce((a, l) => a + l.communities, 0)),
      )
    : 0;

  // ── Project-wide per-section raw counts (drives the "what's missing" panel) ──
  const total = communities.length;
  const sections: SectionSummary[] = sectionDefs.map((def) => {
    const answeredList = def.q ? communities.filter((c) => hasValue(c, def.q)) : [];
    const answered = answeredList.length;
    const missingKeys = def.q
      ? communities.filter((c) => !hasValue(c, def.q)).map((c) => c.key)
      : communities.map((c) => c.key);
    const pct = def.q && total ? Math.round((answered / total) * 100) : 0;
    return {
      id: def.id,
      label: def.label,
      resolved: !!def.q,
      questionLabel: def.q ? def.q.label || null : null,
      answered,
      missing: total - answered,
      total,
      pct,
      level: def.q ? levelOf(pct) : "bad",
      missingKeys,
    };
  });

  return {
    projectName,
    totalCommunities: communities.length,
    resolvedSections: resolved.length,
    expectedSections: sectionDefs.length,
    overallScore,
    overallLevel: levelOf(overallScore),
    lgas,
    sections,
    unresolved,
  };
}
