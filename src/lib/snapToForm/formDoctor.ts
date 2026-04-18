// In-app rule-based "Form Doctor" — scores form quality and applies fixes.
// No AI calls. All checks are deterministic.

import type { ParsedForm, ParsedQuestion } from "./formParser";

export type DoctorIssueSeverity = "info" | "warn" | "error";

export interface DoctorIssue {
  id: string;
  severity: DoctorIssueSeverity;
  category: "completeness" | "validation" | "accessibility" | "duplicates" | "skip-logic";
  message: string;
  fixable: boolean;
  apply?: (form: ParsedForm) => ParsedForm;
}

export interface DoctorReport {
  score: number; // 0-100
  completenessScore: number;
  validationScore: number;
  accessibilityScore: number;
  duplicateScore: number;
  issues: DoctorIssue[];
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function uniqByName(form: ParsedForm): ParsedForm {
  const next = clone(form);
  const seen = new Map<string, { gIdx: number; qIdx: number }>();
  next.groups.forEach((g, gIdx) => {
    const filtered: ParsedQuestion[] = [];
    g.questions.forEach((q, qIdx) => {
      const key = q.label.trim().toLowerCase();
      if (seen.has(key)) return;
      seen.set(key, { gIdx, qIdx });
      filtered.push(q);
    });
    g.questions = filtered;
  });
  return next;
}

export function diagnose(form: ParsedForm): DoctorReport {
  const issues: DoctorIssue[] = [];
  const allQuestions = form.groups.flatMap((g) => g.questions);
  const total = Math.max(1, allQuestions.length);

  // 1) Completeness — every question has a label & name
  let missingMeta = 0;
  allQuestions.forEach((q) => {
    if (!q.label || q.label.length < 2) missingMeta++;
    if (!q.name) missingMeta++;
  });
  const completenessScore = Math.max(0, 100 - (missingMeta / total) * 100);

  // 2) Validation coverage — number/range/text-with-pattern fields should have rules
  let unvalidated = 0;
  allQuestions.forEach((q) => {
    if (q.type === "number" && !q.validation) unvalidated++;
    if (q.type === "range" && !q.validation) unvalidated++;
    if ((q.type === "select_one" || q.type === "select_multiple") && (!q.options || q.options.length < 2)) {
      unvalidated++;
      issues.push({
        id: `opt-${q.name}`,
        severity: "warn",
        category: "validation",
        message: `"${q.label}" is a choice question with fewer than 2 options.`,
        fixable: true,
        apply: (f) => {
          const next = clone(f);
          next.groups.forEach((g) =>
            g.questions.forEach((qq) => {
              if (qq.name === q.name && (!qq.options || qq.options.length < 2)) {
                qq.options = [
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ];
              }
            }),
          );
          return next;
        },
      });
    }
  });
  const validationScore = Math.max(0, 100 - (unvalidated / total) * 100);

  // 3) Accessibility — long labels need hints; required fields should be marked
  let a11yIssues = 0;
  allQuestions.forEach((q) => {
    if (q.label.length > 80 && !q.hint) {
      a11yIssues++;
      issues.push({
        id: `hint-${q.name}`,
        severity: "info",
        category: "accessibility",
        message: `"${q.label.slice(0, 40)}…" is long — consider adding a hint.`,
        fixable: false,
      });
    }
  });
  const accessibilityScore = Math.max(0, 100 - (a11yIssues / total) * 50);

  // 4) Duplicates — same label appearing more than once
  const labelCounts = new Map<string, number>();
  allQuestions.forEach((q) => {
    const k = q.label.trim().toLowerCase();
    labelCounts.set(k, (labelCounts.get(k) || 0) + 1);
  });
  let duplicates = 0;
  labelCounts.forEach((count, label) => {
    if (count > 1) {
      duplicates += count - 1;
      issues.push({
        id: `dup-${label}`,
        severity: "warn",
        category: "duplicates",
        message: `"${label}" appears ${count} times — likely a header or repeat.`,
        fixable: true,
        apply: (f) => uniqByName(f),
      });
    }
  });
  const duplicateScore = Math.max(0, 100 - (duplicates / total) * 100);

  // 5) Smart upgrades — suggest GPS/photo/signature if missing & form looks site-based
  const labelText = allQuestions.map((q) => q.label.toLowerCase()).join(" ");
  const hasGps = allQuestions.some((q) => q.type === "geopoint");
  const hasPhoto = allQuestions.some((q) => q.type === "image");
  const hasSig = allQuestions.some((q) => q.type === "signature");

  if (!hasGps && /\b(site|location|visit|household|community|village|facility)\b/.test(labelText)) {
    issues.push({
      id: "add-gps",
      severity: "info",
      category: "completeness",
      message: "Form references a site/location but has no GPS field. Add one?",
      fixable: true,
      apply: (f) => {
        const next = clone(f);
        next.groups[0].questions.unshift({
          name: "site_gps",
          label: "Site GPS coordinates",
          type: "geopoint",
          required: true,
          confidence: 1,
          aiUpgrade: "Added by Form Doctor for location accuracy.",
        });
        return next;
      },
    });
  }
  if (!hasPhoto && /\b(evidence|condition|damage|proof|photo|image)\b/.test(labelText)) {
    issues.push({
      id: "add-photo",
      severity: "info",
      category: "completeness",
      message: "Form mentions evidence but has no photo field. Add one?",
      fixable: true,
      apply: (f) => {
        const next = clone(f);
        next.groups[0].questions.push({
          name: "evidence_photo",
          label: "Evidence photo",
          type: "image",
          required: false,
          confidence: 1,
          aiUpgrade: "Added by Form Doctor for documentation.",
        });
        return next;
      },
    });
  }
  if (!hasSig && /\b(approved|approval|signed|signature|sign[- ]off|by:)\b/.test(labelText)) {
    issues.push({
      id: "add-sig",
      severity: "info",
      category: "completeness",
      message: "Form requires sign-off but has no signature field. Add one?",
      fixable: true,
      apply: (f) => {
        const next = clone(f);
        next.groups[next.groups.length - 1].questions.push({
          name: "signature",
          label: "Signature",
          type: "signature",
          required: true,
          confidence: 1,
          aiUpgrade: "Added by Form Doctor for accountability.",
        });
        return next;
      },
    });
  }

  const score = Math.round(
    completenessScore * 0.3 +
      validationScore * 0.3 +
      accessibilityScore * 0.2 +
      duplicateScore * 0.2,
  );

  return {
    score,
    completenessScore: Math.round(completenessScore),
    validationScore: Math.round(validationScore),
    accessibilityScore: Math.round(accessibilityScore),
    duplicateScore: Math.round(duplicateScore),
    issues,
  };
}

export function applyAllFixes(form: ParsedForm, report: DoctorReport): ParsedForm {
  let next = form;
  for (const issue of report.issues) {
    if (issue.fixable && issue.apply) {
      next = issue.apply(next);
    }
  }
  return next;
}
