// Conditional case-opening triggers.
// When configured on a form's case-management settings, a case is only
// opened/registered when the captured response(s) match the trigger condition(s).

export type CaseTriggerOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "gte"
  | "lte"
  | "contains"
  | "answered";

export interface CaseTrigger {
  id: string;
  questionId: string;
  operator: CaseTriggerOperator;
  /** Comparison value. Ignored for the "answered" operator. */
  value: string;
}

export type CaseTriggerLogic = "any" | "all";

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const normalize = (v: unknown): string => String(v ?? "").trim().toLowerCase();

/** Evaluate a single trigger against the form responses (keyed by questionId). */
export const evaluateTrigger = (
  trigger: CaseTrigger,
  responses: Record<string, unknown>,
): boolean => {
  if (!trigger.questionId) return false;
  const raw = responses[trigger.questionId];

  // "answered" — case opens whenever the question has any non-empty value.
  if (trigger.operator === "answered") {
    if (Array.isArray(raw)) return raw.length > 0;
    return raw !== null && raw !== undefined && String(raw).trim() !== "";
  }

  const target = trigger.value ?? "";

  // Handle multi-select arrays (select_multiple).
  if (Array.isArray(raw)) {
    const set = raw.map((x) => normalize(x));
    switch (trigger.operator) {
      case "equals":
        return set.includes(normalize(target));
      case "not_equals":
        return !set.includes(normalize(target));
      case "contains":
        return set.some((x) => x.includes(normalize(target)));
      default:
        return false;
    }
  }

  switch (trigger.operator) {
    case "equals":
      return normalize(raw) === normalize(target);
    case "not_equals":
      return normalize(raw) !== normalize(target);
    case "contains":
      return normalize(raw).includes(normalize(target));
    case "greater_than": {
      const a = toNum(raw);
      const b = toNum(target);
      return a !== null && b !== null && a > b;
    }
    case "less_than": {
      const a = toNum(raw);
      const b = toNum(target);
      return a !== null && b !== null && a < b;
    }
    case "gte": {
      const a = toNum(raw);
      const b = toNum(target);
      return a !== null && b !== null && a >= b;
    }
    case "lte": {
      const a = toNum(raw);
      const b = toNum(target);
      return a !== null && b !== null && a <= b;
    }
    default:
      return false;
  }
};

/**
 * Decide whether a case should be opened given the configured triggers.
 * No triggers configured → always open (backward compatible).
 */
export const shouldOpenCase = (
  triggers: CaseTrigger[] | undefined,
  logic: CaseTriggerLogic | undefined,
  responses: Record<string, unknown>,
): boolean => {
  const active = (triggers || []).filter((t) => t.questionId);
  if (active.length === 0) return true;
  if (logic === "all") {
    return active.every((t) => evaluateTrigger(t, responses));
  }
  return active.some((t) => evaluateTrigger(t, responses));
};

export const OPERATORS_BY_TYPE = (type: string): CaseTriggerOperator[] => {
  if (type === "select_one" || type === "select_multiple" || type === "rank") {
    return ["equals", "not_equals", "answered"];
  }
  if (
    type === "number" ||
    type === "range" ||
    type === "integer" ||
    type === "decimal" ||
    type === "calculate"
  ) {
    return ["equals", "not_equals", "greater_than", "less_than", "gte", "lte", "answered"];
  }
  return ["equals", "not_equals", "contains", "answered"];
};

export const OPERATOR_LABELS: Record<CaseTriggerOperator, string> = {
  equals: "is equal to",
  not_equals: "is not equal to",
  greater_than: "is greater than",
  less_than: "is less than",
  gte: "is at least",
  lte: "is at most",
  contains: "contains",
  answered: "is answered",
};
