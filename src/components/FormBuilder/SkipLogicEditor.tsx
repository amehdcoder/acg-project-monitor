import { useState } from "react";
import { Question } from "./types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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

interface SkipLogicEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: Question;
  allQuestions: Question[];
  onSave: (question: Question) => void;
}

type ConditionOperator = "and" | "or";

interface LogicCondition {
  questionId: string;
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=";
  value: string;
  /** Logical joiner connecting this condition to the previous one. Ignored for the first row. */
  join: ConditionOperator;
}

const parseSingleCondition = (conditionStr: string): LogicCondition | null => {
  const str = conditionStr.trim().replace(/^\(/, "").replace(/\)$/, "").trim();
  // not(selected(${name}, 'value'))  → inequality
  const notSel = str.match(/not\s*\(\s*selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)\s*\)/);
  if (notSel) {
    return { questionId: notSel[1], operator: "!=", value: notSel[2], join: "and" };
  }
  // selected(${name}, 'value')  → equality
  const sel = str.match(/selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)/);
  if (sel) {
    return { questionId: sel[1], operator: "=", value: sel[2], join: "and" };
  }
  const match = str.match(/\$\{(.+?)\}\s*(=|!=|>=|<=|>|<)\s*['"]?(.+?)['"]?$/);
  if (match) {
    return {
      questionId: match[1],
      operator: match[2] as LogicCondition["operator"],
      value: match[3],
      join: "and",
    };
  }
  return null;
};

// Parse a relevant string into conditions, preserving each per-row joiner.
const parseRelevantString = (relevant?: string): LogicCondition[] => {
  if (!relevant) return [];
  // Split on top-level " and " / " or " while capturing the joiner.
  const tokens = relevant.split(/\s+(and|or)\s+/i);
  const conditions: LogicCondition[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const parsed = parseSingleCondition(tokens[i]);
    if (!parsed) continue;
    const joiner = i > 0 ? (tokens[i - 1].toLowerCase() as ConditionOperator) : "and";
    parsed.join = joiner;
    conditions.push(parsed);
  }
  return conditions;
};

const buildRelevantString = (
  conditions: LogicCondition[],
  allQuestions: Question[],
): string => {
  const valid = conditions.filter((c) => c.questionId && c.value !== "");
  if (valid.length === 0) return "";

  const toExpr = (c: LogicCondition): string => {
    const ref = allQuestions.find((q) => q.id === c.questionId);
    // select_multiple equality must use selected() so a single chosen option matches.
    if (ref?.type === "select_multiple" && c.operator === "=") {
      return `selected(\${${c.questionId}}, '${c.value}')`;
    }
    if (ref?.type === "select_multiple" && c.operator === "!=") {
      return `not(selected(\${${c.questionId}}, '${c.value}'))`;
    }
    return `\${${c.questionId}} ${c.operator} '${c.value}'`;
  };

  let result = toExpr(valid[0]);
  for (let i = 1; i < valid.length; i++) {
    result += ` ${valid[i].join} ${toExpr(valid[i])}`;
  }
  return result;
};

const SkipLogicEditor = ({
  open,
  onOpenChange,
  question,
  allQuestions,
  onSave,
}: SkipLogicEditorProps) => {
  const [conditions, setConditions] = useState<LogicCondition[]>(
    parseRelevantString(question.relevant),
  );

  // Only questions that come before this one can be referenced.
  const availableQuestions = allQuestions.filter((q) => {
    const currentIndex = allQuestions.findIndex((aq) => aq.id === question.id);
    const qIndex = allQuestions.findIndex((aq) => aq.id === q.id);
    return qIndex < currentIndex;
  });

  const addCondition = () => {
    setConditions([
      ...conditions,
      { questionId: "", operator: "=", value: "", join: "and" },
    ]);
  };

  const updateCondition = (
    index: number,
    field: keyof LogicCondition,
    value: string,
  ) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value } as LogicCondition;
    setConditions(updated);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const relevantString = buildRelevantString(conditions, allQuestions);
    onSave({ ...question, relevant: relevantString || undefined });
    onOpenChange(false);
  };

  const getQuestionOptions = (questionId: string) => {
    const q = allQuestions.find((aq) => aq.id === questionId);
    return q?.options || [];
  };

  const preview = buildRelevantString(conditions, allQuestions);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Skip Logic</DialogTitle>
          <DialogDescription>
            Show this question only when the conditions below are met. Combine
            multiple conditions with AND / OR.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-4">
          <p className="text-sm text-muted-foreground">
            Question: <span className="font-medium text-foreground">{question.label}</span>
          </p>

          {conditions.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No conditions set. This question will always be shown.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={addCondition}>
                <Plus className="mr-2 h-4 w-4" />
                Add Condition
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {conditions.map((condition, index) => (
                <div key={index} className="space-y-3">
                  {index > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <Select
                        value={condition.join}
                        onValueChange={(val) => updateCondition(index, "join", val)}
                      >
                        <SelectTrigger className="h-8 w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="and">AND</SelectItem>
                          <SelectItem value="or">OR</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  <div className="space-y-3 rounded-lg border border-border p-4">
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

                    <div className="space-y-2">
                      <Label>When this question</Label>
                      <Select
                        value={condition.questionId}
                        onValueChange={(val) => updateCondition(index, "questionId", val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a question" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableQuestions.map((q) => (
                            <SelectItem key={q.id} value={q.id}>
                              {q.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                            <SelectItem value="=">Equals</SelectItem>
                            <SelectItem value="!=">Not equals</SelectItem>
                            <SelectItem value=">">Greater than</SelectItem>
                            <SelectItem value="<">Less than</SelectItem>
                            <SelectItem value=">=">Greater or equal</SelectItem>
                            <SelectItem value="<=">Less or equal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Value</Label>
                        {getQuestionOptions(condition.questionId).length > 0 ? (
                          <Select
                            value={condition.value}
                            onValueChange={(val) => updateCondition(index, "value", val)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select value" />
                            </SelectTrigger>
                            <SelectContent>
                              {getQuestionOptions(condition.questionId).map((opt) => (
                                <SelectItem key={opt.id} value={opt.value}>
                                  {opt.label}{" "}
                                  <span className="text-muted-foreground">({opt.value})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={condition.value}
                            onChange={(e) => updateCondition(index, "value", e.target.value)}
                            placeholder="Enter value"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="mr-2 h-4 w-4" />
                Add Another Condition
              </Button>

              {preview && (
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs font-medium text-muted-foreground">Generated formula</p>
                  <code className="mt-1 block break-all font-mono text-xs text-foreground">
                    {preview}
                  </code>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="acg" onClick={handleSave}>
            Save Skip Logic
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SkipLogicEditor;
