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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface SkipLogicEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: Question;
  allQuestions: Question[];
  onSave: (question: Question) => void;
}

interface LogicCondition {
  questionId: string;
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=";
  value: string;
}

type ConditionOperator = "and" | "or";

const parseRelevantString = (relevant?: string): { conditions: LogicCondition[]; matchType: ConditionOperator } => {
  if (!relevant) return { conditions: [], matchType: "and" };

  const conditions: LogicCondition[] = [];
  let matchType: ConditionOperator = "and";

  // Check if it's an OR or AND condition
  if (relevant.includes(" or ")) {
    matchType = "or";
    const parts = relevant.split(" or ");
    parts.forEach((part) => {
      const parsed = parseSingleCondition(part.trim());
      if (parsed) conditions.push(parsed);
    });
  } else if (relevant.includes(" and ")) {
    matchType = "and";
    const parts = relevant.split(" and ");
    parts.forEach((part) => {
      const parsed = parseSingleCondition(part.trim());
      if (parsed) conditions.push(parsed);
    });
  } else {
    const parsed = parseSingleCondition(relevant);
    if (parsed) conditions.push(parsed);
  }

  return { conditions, matchType };
};

const parseSingleCondition = (conditionStr: string): LogicCondition | null => {
  const match = conditionStr.match(/\$\{(.+?)\}\s*(=|!=|>|<|>=|<=)\s*['"]?(.+?)['"]?$/);
  if (match) {
    return {
      questionId: match[1],
      operator: match[2] as LogicCondition["operator"],
      value: match[3],
    };
  }
  return null;
};

const buildRelevantString = (conditions: LogicCondition[], matchType: ConditionOperator): string => {
  if (conditions.length === 0) return "";

  const conditionStrings = conditions
    .filter((c) => c.questionId && c.value)
    .map((c) => `\${${c.questionId}} ${c.operator} '${c.value}'`);

  if (conditionStrings.length === 0) return "";
  if (conditionStrings.length === 1) return conditionStrings[0];

  return conditionStrings.join(matchType === "and" ? " and " : " or ");
};

const SkipLogicEditor = ({
  open,
  onOpenChange,
  question,
  allQuestions,
  onSave,
}: SkipLogicEditorProps) => {
  const parsed = parseRelevantString(question.relevant);
  const [conditions, setConditions] = useState<LogicCondition[]>(parsed.conditions);
  const [matchType, setMatchType] = useState<ConditionOperator>(parsed.matchType);

  // Get questions that come before this one
  const availableQuestions = allQuestions.filter((q) => {
    const currentIndex = allQuestions.findIndex((aq) => aq.id === question.id);
    const qIndex = allQuestions.findIndex((aq) => aq.id === q.id);
    return qIndex < currentIndex;
  });

  const addCondition = () => {
    setConditions([...conditions, { questionId: "", operator: "=", value: "" }]);
  };

  const updateCondition = (index: number, field: keyof LogicCondition, value: string) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const relevantString = buildRelevantString(conditions, matchType);
    onSave({ ...question, relevant: relevantString || undefined });
    onOpenChange(false);
  };

  const getQuestionOptions = (questionId: string) => {
    const q = allQuestions.find((aq) => aq.id === questionId);
    return q?.options || [];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Skip Logic</DialogTitle>
          <DialogDescription>
            Show this question only when certain conditions are met
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
              {conditions.length > 1 && (
                <div className="rounded-lg border border-border p-3">
                  <Label className="text-sm font-medium">Match conditions</Label>
                  <RadioGroup
                    value={matchType}
                    onValueChange={(value) => setMatchType(value as ConditionOperator)}
                    className="mt-2 flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="and" id="skip-match-all" />
                      <Label htmlFor="skip-match-all" className="font-normal">All conditions must be met</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="or" id="skip-match-any" />
                      <Label htmlFor="skip-match-any" className="font-normal">At least one condition</Label>
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
                                {opt.label}
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
              ))}

              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="mr-2 h-4 w-4" />
                Add Another Condition
              </Button>
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
