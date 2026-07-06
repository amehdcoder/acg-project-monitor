// Shared skip-logic (XLSForm `relevant`) evaluator.
//
// This is the single source of truth for deciding whether a question should be
// shown given the current answers. It mirrors the logic embedded in the
// production FormFiller so the Form Builder's skip-logic simulator behaves
// identically to a real applicant filling the form.

export type Responses = Record<string, unknown>;
export type NameToIdMap = Record<string, string>;

/**
 * Build a map that resolves both XLSForm `name` references and raw ids to a
 * canonical question id, exactly like the FormFiller does.
 */
export function buildNameToIdMap(
  questions: Array<{ id: string; name?: string }>,
): NameToIdMap {
  const map: NameToIdMap = {};
  for (const q of questions) {
    if (q.name) map[q.name] = q.id;
    map[q.id] = q.id;
  }
  return map;
}

/**
 * Normalize any stored answer into a set of selected tokens. Handles:
 *  - arrays (multi-select in the FormFiller runtime),
 *  - XLSForm-standard space-separated strings ("a b c"),
 *  - comma-separated strings ("a, b, c"),
 *  - plain single values.
 * This is what makes skip logic work reliably for select_multiple questions.
 */
function valueTokens(val: unknown): string[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  const s = String(val).trim();
  if (!s) return [];
  // Space- or comma-separated multi-select payloads.
  if (/[\s,]/.test(s)) return s.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
  return [s];
}

/** True when `expectedValue` is among the selected tokens of `val`. */
function tokenSelected(val: unknown, expectedValue: string): boolean {
  return valueTokens(val).includes(expectedValue);
}

function evalSingleCondition(
  expr: string,
  responses: Responses,
  nameToIdMap: NameToIdMap,
): boolean {
  const trimmed = expr.trim().replace(/^\(/, "").replace(/\)$/, "").trim();
  if (!trimmed) return true;

  // not(selected(${name}, 'value')) — checked BEFORE selected() so the inner
  // selected(...) fragment isn't matched first.
  const notSelectedMatch = trimmed.match(
    /not\s*\(\s*selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)\s*\)/,
  );
  if (notSelectedMatch) {
    const [, refName, expectedValue] = notSelectedMatch;
    const qId = nameToIdMap[refName];
    if (qId) return !tokenSelected(responses[qId], expectedValue);
    return true;
  }

  // selected(${name}, 'value') — works for both single and multi-select
  const selectedMatch = trimmed.match(
    /selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)/,
  );
  if (selectedMatch) {
    const [, refName, expectedValue] = selectedMatch;
    const qId = nameToIdMap[refName];
    if (qId) return tokenSelected(responses[qId], expectedValue);
    return false;
  }

  // ${name} = 'value' or ${name} != 'value'
  // For multi-select answers this is treated as membership (contains value),
  // matching how field staff expect equality checks on checkboxes to behave.
  const eqMatch = trimmed.match(/\$\{(.+?)\}\s*(=|!=)\s*['"](.+?)['"]/);
  if (eqMatch) {
    const [, refName, operator, expectedValue] = eqMatch;
    const qId = nameToIdMap[refName];
    if (qId) {
      const tokens = valueTokens(responses[qId]);
      // Single-value answers compare exactly; multi-value answers use membership.
      const matches = tokens.length > 1
        ? tokens.includes(expectedValue)
        : (tokens[0] ?? "") === expectedValue;
      return operator === "=" ? matches : !matches;
    }
    return operator === "!=";
  }

  // ${name} >|>=|<|<= number
  const numMatch = trimmed.match(/\$\{(.+?)\}\s*(>=?|<=?)\s*(-?\d+(?:\.\d+)?)/);
  if (numMatch) {
    const [, refName, operator, numStr] = numMatch;
    const qId = nameToIdMap[refName];
    if (qId) {
      const raw = responses[qId];
      if (raw === undefined || raw === null || raw === "") return false;
      const val = parseFloat(String(raw));
      const num = parseFloat(numStr);
      if (Number.isNaN(val)) return false;
      if (operator === ">") return val > num;
      if (operator === ">=") return val >= num;
      if (operator === "<") return val < num;
      if (operator === "<=") return val <= num;
    }
    return false;
  }

  // ${name} (truthy check)
  const truthyMatch = trimmed.match(/^\$\{(.+?)\}$/);
  if (truthyMatch) {
    const qId = nameToIdMap[truthyMatch[1]];
    if (qId) {
      const val = responses[qId];
      if (val === false) return false;
      return valueTokens(val).length > 0;
    }
    return false;
  }

  return true;
}

/**
 * Evaluate an XLSForm `relevant` expression against the current answers.
 * Supports compound `and` / `or` expressions (including mixed, evaluated as a
 * disjunction of conjunctions). A question with no `relevant` is always shown.
 */
export function evaluateRelevant(
  relevant: string | undefined,
  responses: Responses,
  nameToIdMap: NameToIdMap,
): boolean {
  if (!relevant) return true;
  const expr = relevant.trim();
  if (!expr) return true;

  const hasOr = /\s+or\s+/i.test(expr);
  const hasAnd = /\s+and\s+/i.test(expr);

  if (hasOr && !hasAnd) {
    return expr
      .split(/\s+or\s+/i)
      .some((part) => evalSingleCondition(part, responses, nameToIdMap));
  }
  if (hasAnd && !hasOr) {
    return expr
      .split(/\s+and\s+/i)
      .every((part) => evalSingleCondition(part, responses, nameToIdMap));
  }
  if (hasOr && hasAnd) {
    return expr.split(/\s+or\s+/i).some((orPart) =>
      orPart
        .split(/\s+and\s+/i)
        .every((andPart) => evalSingleCondition(andPart, responses, nameToIdMap)),
    );
  }
  return evalSingleCondition(expr, responses, nameToIdMap);
}

// ---------------------------------------------------------------------------
// Debugging: explain WHY a question is shown or hidden.
//
// Decomposes a `relevant` expression into its atomic conditions and evaluates
// each one against the current answers, returning a human-readable trace. Used
// by the in-form Skip-Logic Debug Panel so admins can instantly see which
// condition failed (and what value it saw) instead of guessing.
// ---------------------------------------------------------------------------
export interface ConditionTrace {
  /** The atomic sub-expression, e.g. `selected(${q1}, 'others')`. */
  expression: string;
  /** Whether this atomic condition currently evaluates true. */
  passed: boolean;
  /** Resolved answer value the condition compared against (for display). */
  actualValue?: string;
}

export interface RelevantExplanation {
  /** Whether the question is currently visible. */
  visible: boolean;
  /** The raw `relevant` expression (empty when the question is always shown). */
  relevant: string;
  /** How the atomic conditions are combined. */
  combinator: "none" | "and" | "or" | "mixed";
  /** Per-condition evaluation trace. */
  conditions: ConditionTrace[];
}

function displayValue(
  refName: string,
  responses: Responses,
  nameToIdMap: NameToIdMap,
): string {
  const qId = nameToIdMap[refName];
  if (!qId) return "(unknown question)";
  const val = responses[qId];
  if (val === undefined || val === null || val === "") return "(no answer)";
  if (Array.isArray(val)) return val.length ? val.map(String).join(", ") : "(none selected)";
  return String(val);
}

export function explainRelevant(
  relevant: string | undefined,
  responses: Responses,
  nameToIdMap: NameToIdMap,
): RelevantExplanation {
  const expr = (relevant ?? "").trim();
  if (!expr) {
    return { visible: true, relevant: "", combinator: "none", conditions: [] };
  }

  const hasOr = /\s+or\s+/i.test(expr);
  const hasAnd = /\s+and\s+/i.test(expr);
  const combinator: RelevantExplanation["combinator"] =
    hasOr && hasAnd ? "mixed" : hasOr ? "or" : hasAnd ? "and" : "none";

  // Flatten to atomic parts for a per-condition trace.
  const parts = expr
    .split(/\s+or\s+/i)
    .flatMap((orPart) => orPart.split(/\s+and\s+/i))
    .map((p) => p.trim())
    .filter(Boolean);

  const refMatch = /\$\{(.+?)\}/;
  const conditions: ConditionTrace[] = parts.map((part) => {
    const passed = evalSingleCondition(part, responses, nameToIdMap);
    const ref = part.match(refMatch)?.[1];
    return {
      expression: part,
      passed,
      actualValue: ref ? displayValue(ref, responses, nameToIdMap) : undefined,
    };
  });

  return {
    visible: evaluateRelevant(expr, responses, nameToIdMap),
    relevant: expr,
    combinator,
    conditions,
  };
}

