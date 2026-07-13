// Self-contained, offline-first field validation rules.
//
// Pure functions only — NO network access. These consolidate the field-level
// checks used by the FormFiller so grouped, repeated, and ungrouped questions
// all enforce identical rules while the device is fully offline.
//
// Rules enforced here (in addition to required/skip-logic handled upstream):
//   • Numbers cannot be negative unless the question explicitly allows it via a
//     negative `validation.min`.
//   • Numeric min / max boundaries.
//   • Dates cannot be in the future unless `validation.allowFuture` is set.
//   • Regex format constraints.

import type { Question } from "@/components/FormBuilder/types";

export interface FieldValidationResult {
  /** Human-readable error, or null when the value is valid. */
  error: string | null;
}

const DATE_TYPES = new Set(["date", "datetime", "datetime-local"]);

/**
 * Resolve a date-bound token to a canonical YYYY-MM-DD string. Accepts the
 * keywords "today"/"now"/"yesterday"/"tomorrow" or an ISO date string.
 * Returns undefined when there is no bound.
 */
export function resolveDateBound(token?: string | null): string | undefined {
  if (!token) return undefined;
  const t = token.trim().toLowerCase();
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const now = new Date();
  if (t === "today" || t === "now") return fmt(now);
  if (t === "yesterday") return fmt(new Date(now.getTime() - 86400000));
  if (t === "tomorrow") return fmt(new Date(now.getTime() + 86400000));
  // Assume already an ISO/parseable date string — normalise to date part.
  const parsed = new Date(token);
  if (!Number.isNaN(parsed.getTime())) return fmt(parsed);
  return undefined;
}

/**
 * Validate a single answered value against a question's schema. Callers should
 * only invoke this for VISIBLE, input-type questions that already have a value
 * (empty/required handling stays in the FormFiller so its messaging/telemetry
 * is preserved).
 */
export function validateFieldValue(question: Question, rawValue: unknown): FieldValidationResult {
  const value = rawValue;
  const label = cleanLabel(question.label || "This field");
  const v = question.validation as
    | { min?: number | null; max?: number | null; regex?: string | null; allowFuture?: boolean }
    | undefined;

  // ---- Numeric rules ----
  if (question.type === "number") {
    const numValue = parseFloat(String(value));
    if (!Number.isNaN(numValue)) {
      // Block negatives by default. A question may explicitly permit them by
      // declaring a negative `min` (e.g. temperature, coordinates).
      const explicitMin =
        v && v.min !== undefined && v.min !== null ? Number(v.min) : undefined;
      const effectiveMin = explicitMin !== undefined ? explicitMin : 0;

      if (numValue < effectiveMin) {
        return {
          error:
            explicitMin !== undefined
              ? `Value must be at least ${effectiveMin}`
              : `${label} cannot be negative`,
        };
      }
      if (v && v.max !== undefined && v.max !== null && numValue > Number(v.max)) {
        return { error: `Value must be at most ${v.max}` };
      }
    }
  }

  // ---- Date rules: no future dates unless explicitly allowed ----
  if (DATE_TYPES.has(question.type) && !(v && v.allowFuture)) {
    const t = new Date(String(value)).getTime();
    if (Number.isFinite(t)) {
      // Compare against end-of-today so "today" is always valid regardless of TZ.
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      if (t > endOfToday.getTime()) {
        return { error: `${label} cannot be in the future` };
      }
    }
  }

  // ---- Regex format ----
  if (v && typeof v.regex === "string" && v.regex.trim()) {
    try {
      const re = new RegExp(v.regex);
      if (!re.test(String(value))) {
        return { error: question.constraintMessage || `${label} has an invalid format` };
      }
    } catch {
      // Malformed pattern in the form definition — never block the user for it.
    }
  }

  return { error: null };
}
