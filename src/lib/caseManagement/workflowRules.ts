// No-code workflow rules for Case Management (Phase 6)
// Program managers define simple "If <property> <operator> <value> then <action>" rules
// on a case type. Rules are evaluated automatically after a case is registered or updated.

export type RuleOperator = "eq" | "neq" | "contains" | "gt" | "lt" | "empty" | "not_empty";
export type RuleActionType = "set_risk" | "set_status" | "create_task" | "add_note";

export interface WorkflowRule {
  id: string;
  property: string;
  operator: RuleOperator;
  value: string;
  actionType: RuleActionType;
  actionValue: string;
}

export const OPERATOR_LABELS: Record<RuleOperator, string> = {
  eq: "equals",
  neq: "does not equal",
  contains: "contains",
  gt: "greater than",
  lt: "less than",
  empty: "is empty",
  not_empty: "is not empty",
};

export const ACTION_LABELS: Record<RuleActionType, string> = {
  set_risk: "Set risk level to",
  set_status: "Set status to",
  create_task: "Create follow-up task",
  add_note: "Add case note",
};

// Operators that do not need a comparison value
export const VALUELESS_OPERATORS: RuleOperator[] = ["empty", "not_empty"];

export const newRule = (): WorkflowRule => ({
  id: crypto.randomUUID(),
  property: "",
  operator: "eq",
  value: "",
  actionType: "set_risk",
  actionValue: "high",
});

const toComparable = (v: unknown): string => (v == null ? "" : String(v)).trim().toLowerCase();

export const evaluateCondition = (
  rule: WorkflowRule,
  properties: Record<string, unknown>
): boolean => {
  const actual = toComparable(properties[rule.property]);
  const expected = toComparable(rule.value);

  switch (rule.operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "contains":
      return actual.includes(expected);
    case "gt": {
      const a = parseFloat(actual);
      const b = parseFloat(expected);
      return !isNaN(a) && !isNaN(b) && a > b;
    }
    case "lt": {
      const a = parseFloat(actual);
      const b = parseFloat(expected);
      return !isNaN(a) && !isNaN(b) && a < b;
    }
    case "empty":
      return actual === "";
    case "not_empty":
      return actual !== "";
    default:
      return false;
  }
};

// Safely parse the workflow_rules jsonb column into an array of rules
export const parseWorkflowRules = (raw: unknown): WorkflowRule[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r) => r as Partial<WorkflowRule>)
    .filter((r) => r.property && r.actionType)
    .map((r) => ({
      id: r.id || crypto.randomUUID(),
      property: String(r.property),
      operator: (r.operator || "eq") as RuleOperator,
      value: r.value != null ? String(r.value) : "",
      actionType: (r.actionType || "set_risk") as RuleActionType,
      actionValue: r.actionValue != null ? String(r.actionValue) : "",
    }));
};

export const ruleSummary = (rule: WorkflowRule): string => {
  const cond = VALUELESS_OPERATORS.includes(rule.operator)
    ? `${rule.property || "property"} ${OPERATOR_LABELS[rule.operator]}`
    : `${rule.property || "property"} ${OPERATOR_LABELS[rule.operator]} "${rule.value}"`;
  const action = `${ACTION_LABELS[rule.actionType]}${rule.actionValue ? ` "${rule.actionValue}"` : ""}`;
  return `If ${cond} → ${action}`;
};
