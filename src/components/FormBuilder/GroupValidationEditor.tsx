import { useState } from "react";
import { FormGroup } from "./types";
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

interface GroupValidationEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: FormGroup;
  onSave: (group: FormGroup) => void;
}

interface ValidationCondition {
  field: "count" | "sum" | "min" | "max";
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=";
  value: string;
}

type ConditionOperator = "and" | "or";

const VALIDATION_FIELDS = [
  { value: "count", label: "Number of entries" },
  { value: "min", label: "Minimum entries" },
  { value: "max", label: "Maximum entries" },
];

const parseConstraint = (constraint?: string): { conditions: ValidationCondition[]; matchType: ConditionOperator } => {
  if (!constraint) return { conditions: [], matchType: "and" };

  const conditions: ValidationCondition[] = [];
  let matchType: ConditionOperator = "and";

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
  const countMatch = constraint.match(/count\(\.\)\s*(=|!=|>=|<=|>|<)\s*(\d+)/);
  if (countMatch) {
    return {
      field: "count",
      operator: countMatch[1] as ValidationCondition["operator"],
      value: countMatch[2],
    };
  }

  return null;
};

const buildConstraintString = (conditions: ValidationCondition[], matchType: ConditionOperator): string => {
  if (conditions.length === 0) return "";

  const conditionStrings = conditions
    .filter((c) => c.value)
    .map((c) => {
      if (c.field === "count") {
        return `count(.) ${c.operator} ${c.value}`;
      }
      if (c.field === "min") {
        return `count(.) >= ${c.value}`;
      }
      if (c.field === "max") {
        return `count(.) <= ${c.value}`;
      }
      return "";
    })
    .filter(Boolean);

  if (conditionStrings.length === 0) return "";
  if (conditionStrings.length === 1) return conditionStrings[0];

  return conditionStrings.join(matchType === "and" ? " and " : " or ");
};

const GroupValidationEditor = ({
  open,
  onOpenChange,
  group,
  onSave,
}: GroupValidationEditorProps) => {
  const parsed = parseConstraint(group.constraint);
  const [conditions, setConditions] = useState<ValidationCondition[]>(parsed.conditions);
  const [matchType, setMatchType] = useState<ConditionOperator>(parsed.matchType);
  const [errorMessage, setErrorMessage] = useState(group.constraintMessage || "");

  const addCondition = () => {
    setConditions([...conditions, { field: "count", operator: ">=", value: "" }]);
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
      ...group,
      constraint: constraintString || undefined,
      constraintMessage: errorMessage || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Group Validation Criteria</DialogTitle>
          <DialogDescription>
            Define validation rules for this group (e.g., minimum/maximum entries for repeat groups)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Group: <span className="font-medium text-foreground">{group.label}</span>
            {group.repeat && (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                Repeat Group
              </span>
            )}
          </p>

          {conditions.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No validation criteria set. All entries will be accepted.
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
                      <RadioGroupItem value="and" id="group-val-match-all" />
                      <Label htmlFor="group-val-match-all" className="font-normal">All conditions must be met</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="or" id="group-val-match-any" />
                      <Label htmlFor="group-val-match-any" className="font-normal">At least one condition</Label>
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

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Field</Label>
                      <Select
                        value={condition.field}
                        onValueChange={(val) => updateCondition(index, "field", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VALIDATION_FIELDS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Operator</Label>
                      <Select
                        value={condition.operator}
                        onValueChange={(val) => updateCondition(index, "operator", val)}
                        disabled={condition.field === "min" || condition.field === "max"}
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
                      <Input
                        type="number"
                        min={0}
                        value={condition.value}
                        onChange={(e) => updateCondition(index, "value", e.target.value)}
                        placeholder="e.g., 3"
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

          <div className="space-y-2">
            <Label>Error Message (optional)</Label>
            <Textarea
              value={errorMessage}
              onChange={(e) => setErrorMessage(e.target.value)}
              placeholder="Message shown when validation fails (e.g., 'At least 2 household members required')"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              If not specified, a default message will be shown.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="acg" onClick={handleSave}>
            Save Validation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GroupValidationEditor;
