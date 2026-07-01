// Special Form Studio — conditional visibility ("logic blocks") helpers.
//
// These helpers translate friendly drag-and-drop logic blocks into the exact
// XLSForm `relevant` expression syntax the runtime FormFiller already parses
// (see FormFiller.tsx `parseRelevant`). By reusing that same grammar, any
// visibility rule built in the Studio is honoured end-to-end (online + offline)
// with no extra runtime code.

import type { FormGroup, Question } from "@/components/FormBuilder/types";

export type LogicOperator =
  | "equals"
  | "not_equals"
  | "selected"
  | "not_selected"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "answered"
  | "empty";

export interface LogicCondition {
  id: string;
  /** XLSForm `name` of the question this condition depends on. */
  ref: string;
  operator: LogicOperator;
  value?: string;
}

export type LogicMode = "all" | "any";

export interface LogicRule {
  mode: LogicMode;
  conditions: LogicCondition[];
}

const rid = () => Math.random().toString(36).slice(2, 10);

export const OPERATOR_LABELS: Record<LogicOperator, string> = {
  equals: "is equal to",
  not_equals: "is not equal to",
  selected: "has selected",
  not_selected: "has not selected",
  gt: "is greater than",
  gte: "is greater than or equal to",
  lt: "is less than",
  lte: "is less than or equal to",
  answered: "is answered",
  empty: "is empty",
};

export const NO_VALUE_OPERATORS: LogicOperator[] = ["answered", "empty"];

/** Flatten sections → ordered question list. */
export function flattenQuestions(sections: FormGroup[]): Question[] {
  const out: Question[] = [];
  for (const s of sections) for (const q of s.questions) out.push(q);
  return out;
}

/** Questions that appear BEFORE `targetId` (valid dependency candidates). */
export function priorQuestions(sections: FormGroup[], targetId: string): Question[] {
  const flat = flattenQuestions(sections);
  const idx = flat.findIndex((q) => q.id === targetId);
  const candidates = idx < 0 ? flat : flat.slice(0, idx);
  // Only questions with a stable name and an actual answer value are useful.
  return candidates.filter((q) => q.name && q.type !== "note");
}

function esc(v: string): string {
  return String(v).replace(/'/g, "\\'");
}

/** One condition → XLSForm expression fragment. */
function conditionToExpr(c: LogicCondition): string | null {
  if (!c.ref) return null;
  const ref = `\${${c.ref}}`;
  switch (c.operator) {
    case "equals":
      return `${ref} = '${esc(c.value || "")}'`;
    case "not_equals":
      return `${ref} != '${esc(c.value || "")}'`;
    case "selected":
      return `selected(${ref}, '${esc(c.value || "")}')`;
    case "not_selected":
      return `not(selected(${ref}, '${esc(c.value || "")}'))`;
    case "gt":
      return `${ref} > ${Number(c.value) || 0}`;
    case "gte":
      return `${ref} >= ${Number(c.value) || 0}`;
    case "lt":
      return `${ref} < ${Number(c.value) || 0}`;
    case "lte":
      return `${ref} <= ${Number(c.value) || 0}`;
    case "answered":
      return `${ref} != ''`;
    case "empty":
      return `${ref} = ''`;
    default:
      return null;
  }
}

/** Build a full `relevant` expression string from a logic rule. */
export function buildRelevant(rule: LogicRule): string {
  const parts = rule.conditions.map(conditionToExpr).filter(Boolean) as string[];
  if (!parts.length) return "";
  const joiner = rule.mode === "all" ? " and " : " or ";
  return parts.join(joiner);
}

/** Parse an existing `relevant` string back into editable logic blocks. */
export function parseRelevant(relevant?: string | null): LogicRule {
  const empty: LogicRule = { mode: "all", conditions: [] };
  if (!relevant || !relevant.trim()) return empty;
  const expr = relevant.trim();
  const isOr = /\s+or\s+/i.test(expr) && !/\s+and\s+/i.test(expr);
  const mode: LogicMode = isOr ? "any" : "all";
  const fragments = expr.split(isOr ? /\s+or\s+/i : /\s+and\s+/i);
  const conditions: LogicCondition[] = [];
  for (const raw of fragments) {
    const c = parseFragment(raw.trim());
    if (c) conditions.push(c);
  }
  return conditions.length ? { mode, conditions } : empty;
}

function parseFragment(frag: string): LogicCondition | null {
  let m: RegExpMatchArray | null;
  m = frag.match(/not\s*\(\s*selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)\s*\)/);
  if (m) return { id: rid(), ref: m[1], operator: "not_selected", value: m[2] };
  m = frag.match(/selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)/);
  if (m) return { id: rid(), ref: m[1], operator: "selected", value: m[2] };
  m = frag.match(/\$\{(.+?)\}\s*!=\s*['"]?\s*['"]?$/);
  if (m && /!=\s*['"]?\s*['"]?$/.test(frag) && !/!=\s*['"].+['"]/.test(frag))
    return { id: rid(), ref: m[1], operator: "answered" };
  m = frag.match(/\$\{(.+?)\}\s*=\s*['"]?\s*['"]?$/);
  if (m && /=\s*['"]?\s*['"]?$/.test(frag) && !/=\s*['"].+['"]/.test(frag))
    return { id: rid(), ref: m[1], operator: "empty" };
  m = frag.match(/\$\{(.+?)\}\s*(=|!=)\s*['"](.+?)['"]/);
  if (m) return { id: rid(), ref: m[1], operator: m[2] === "=" ? "equals" : "not_equals", value: m[3] };
  m = frag.match(/\$\{(.+?)\}\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)/);
  if (m) {
    const op = ({ ">": "gt", ">=": "gte", "<": "lt", "<=": "lte" } as const)[m[2] as ">" | ">=" | "<" | "<="];
    return { id: rid(), ref: m[1], operator: op, value: m[3] };
  }
  return null;
}

export function newCondition(ref = ""): LogicCondition {
  return { id: rid(), ref, operator: "equals", value: "" };
}
