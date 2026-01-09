import { useState } from "react";
import { Question, QuestionType } from "./types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ValidationCriteriaEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: Question;
  onSave: (question: Question) => void;
}

interface ValidationCondition {
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "regex" | "length_min" | "length_max";
  value: string;
}

type ConditionOperator = "and" | "or";

const getOperatorsForType = (type: QuestionType): { value: string; label: string }[] => {
  const numericOperators = [
    { value: "=", label: "Equals" },
    { value: "!=", label: "Not equals" },
    { value: ">", label: "Greater than" },
    { value: "<", label: "Less than" },
    { value: ">=", label: "Greater or equal" },
    { value: "<=", label: "Less or equal" },
  ];

  const textOperators = [
    { value: "regex", label: "Matches pattern" },
    { value: "length_min", label: "Min length" },
    { value: "length_max", label: "Max length" },
  ];

  const dateOperators = [
    { value: "=", label: "Equals" },
    { value: "!=", label: "Not equals" },
    { value: ">", label: "After" },
    { value: "<", label: "Before" },
    { value: ">=", label: "On or after" },
    { value: "<=", label: "On or before" },
  ];

  switch (type) {
    case "number":
    case "range":
      return numericOperators;
    case "text":
      return [...numericOperators.slice(0, 2), ...textOperators];
    case "date":
    case "datetime":
      return dateOperators;
    default:
      return numericOperators;
  }
};

const parseConstraint = (constraint?: string): { conditions: ValidationCondition[]; matchType: ConditionOperator } => {
  if (!constraint) return { conditions: [], matchType: "and" };

  const conditions: ValidationCondition[] = [];
  let matchType: ConditionOperator = "and";

  // Check if it's an OR or AND condition
  if (constraint.includes(" or ")) {
    matchType = "or";
    const parts = constraint.split(" or ");
    parts.forEach((part) => {
      const parsed = parseSingleCondition(part.trim());
      if (parsed) conditions.push(parsed);
    });
  } else if (constraint.includes(" and ")) {
    matchType = "and";
    const parts = constraint.split(" and ");
    parts.forEach((part) => {
      const parsed = parseSingleCondition(part.trim());
      if (parsed) conditions.push(parsed);
    });
  } else {
    const parsed = parseSingleCondition(constraint);
    if (parsed) conditions.push(parsed);
  }

  return { conditions, matchType };
};

const parseSingleCondition = (constraint: string): ValidationCondition | null => {
  // Match patterns like ". >= 18", ". != 'test'", "regex(., '^[a-z]+$')"
  const regexMatch = constraint.match(/regex\(\.,\s*['"](.+?)['"]\)/);
  if (regexMatch) {
    return { operator: "regex", value: regexMatch[1] };
  }

  const comparisonMatch = constraint.match(/\.\s*(=|!=|>=|<=|>|<)\s*['"]?(.+?)['"]?$/);
  if (comparisonMatch) {
    return {
      operator: comparisonMatch[1] as ValidationCondition["operator"],
      value: comparisonMatch[2],
    };
  }

  const lengthMatch = constraint.match(/string-length\(\.\)\s*(>=|<=|>|<)\s*(\d+)/);
  if (lengthMatch) {
    const op = lengthMatch[1] === ">=" || lengthMatch[1] === ">" ? "length_min" : "length_max";
    return { operator: op, value: lengthMatch[2] };
  }

  return null;
};

const buildConstraintString = (conditions: ValidationCondition[], matchType: ConditionOperator): string => {
  if (conditions.length === 0) return "";

  const conditionStrings = conditions
    .filter((c) => c.value)
    .map((c) => {
      if (c.operator === "regex") {
        return `regex(., '${c.value}')`;
      }
      if (c.operator === "length_min") {
        return `string-length(.) >= ${c.value}`;
      }
      if (c.operator === "length_max") {
        return `string-length(.) <= ${c.value}`;
      }
      // For dates and text with quotes, for numbers without
      const isNumeric = !isNaN(Number(c.value));
      const valueStr = isNumeric ? c.value : `'${c.value}'`;
      return `. ${c.operator} ${valueStr}`;
    });

  if (conditionStrings.length === 0) return "";
  if (conditionStrings.length === 1) return conditionStrings[0];

  return conditionStrings.join(matchType === "and" ? " and " : " or ");
};

const ValidationCriteriaEditor = ({
  open,
  onOpenChange,
  question,
  onSave,
}: ValidationCriteriaEditorProps) => {
  const parsed = parseConstraint(question.constraint);
  const [conditions, setConditions] = useState<ValidationCondition[]>(parsed.conditions);
  const [matchType, setMatchType] = useState<ConditionOperator>(parsed.matchType);
  const [errorMessage, setErrorMessage] = useState(question.constraintMessage || "");

  const operators = getOperatorsForType(question.type);

  const addCondition = () => {
    setConditions([...conditions, { operator: operators[0]?.value as ValidationCondition["operator"] || "=", value: "" }]);
  };

  const updateCondition = (index: number, field: keyof ValidationCondition, value: string) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const constraintString = buildConstraintString(conditions, matchType);
    
    onSave({
      ...question,
      constraint: constraintString || undefined,
      constraintMessage: errorMessage || undefined,
    });
    onOpenChange(false);
  };

  const getValuePlaceholder = (operator: string): string => {
    switch (operator) {
      case "regex":
        return "e.g., ^[a-zA-Z]+$";
      case "length_min":
      case "length_max":
        return "e.g., 10";
      default:
        if (question.type === "date" || question.type === "datetime") {
          return "YYYY-MM-DD";
        }
        return "Enter value";
    }
  };

  const isValidType = ["text", "number", "date", "datetime", "range"].includes(question.type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Validation Criteria</DialogTitle>
          <DialogDescription>
            Define conditions for valid responses to this question
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Question: <span className="font-medium text-foreground">{question.label}</span>
          </p>

          {!isValidType ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              Validation criteria builder is available for Text, Number, Decimal, Date, and Range questions.
              For other question types, use XLSForm code.
            </div>
          ) : conditions.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No validation criteria set. All responses will be accepted.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={addCondition}>
                <Plus className="mr-2 h-4 w-4" />
                Add Condition
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {conditions.length > 1 && (
                <div className="rounded-lg border border-border p-3">
                  <Label className="text-sm font-medium">Match conditions</Label>
                  <RadioGroup
                    value={matchType}
                    onValueChange={(value) => setMatchType(value as ConditionOperator)}
                    className="mt-2 flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="and" id="match-all" />
                      <Label htmlFor="match-all" className="font-normal">All conditions must be met</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="or" id="match-any" />
                      <Label htmlFor="match-any" className="font-normal">At least one condition</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {conditions.map((condition, index) => (
                <div key={index} className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Condition {index + 1}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCondition(index)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Operator</Label>
                      <Select
                        value={condition.operator}
                        onValueChange={(val) => updateCondition(index, "operator", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Value</Label>
                      <Input
                        value={condition.value}
                        onChange={(e) => updateCondition(index, "value", e.target.value)}
                        placeholder={getValuePlaceholder(condition.operator)}
                        type={condition.operator === "length_min" || condition.operator === "length_max" ? "number" : "text"}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="mr-2 h-4 w-4" />
                Add Another Condition
              </Button>
            </div>
          )}

          {isValidType && (
            <div className="space-y-2">
              <Label>Error Message (optional)</Label>
              <Textarea
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                placeholder="Message shown when validation fails (e.g., 'Age must be greater than 18')"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                If not specified, a default message "Value not allowed" will be shown.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="acg" onClick={handleSave} disabled={!isValidType}>
            Save Validation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ValidationCriteriaEditor;
