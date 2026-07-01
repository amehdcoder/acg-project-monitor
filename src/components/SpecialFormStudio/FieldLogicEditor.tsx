import { useMemo } from "react";
import { Plus, Trash2, GitBranch, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormGroup, Question } from "@/components/FormBuilder/types";
import {
  buildRelevant,
  newCondition,
  OPERATOR_LABELS,
  NO_VALUE_OPERATORS,
  parseRelevant,
  priorQuestions,
  type LogicMode,
  type LogicOperator,
} from "@/lib/specialStudio/logic";

interface Props {
  field: Question;
  sections: FormGroup[];
  onPatch: (patch: Partial<Question>) => void;
}

const ALL_OPERATORS: LogicOperator[] = [
  "equals",
  "not_equals",
  "selected",
  "not_selected",
  "gt",
  "gte",
  "lt",
  "lte",
  "answered",
  "empty",
];

export default function FieldLogicEditor({ field, sections, onPatch }: Props) {
  const candidates = useMemo(() => priorQuestions(sections, field.id), [sections, field.id]);
  const rule = useMemo(() => parseRelevant(field.relevant), [field.relevant]);
  const conditionalOn = !!field.relevant;

  const commit = (mode: LogicMode, conditions: typeof rule.conditions) => {
    const expr = buildRelevant({ mode, conditions });
    onPatch({ relevant: expr || undefined });
  };

  const toggleConditional = (on: boolean) => {
    if (!on) return onPatch({ relevant: undefined });
    const first = candidates[0];
    commit("all", [newCondition(first?.name || "")]);
  };

  const refQuestion = (name: string) => candidates.find((q) => q.name === name);

  const patchValidation = (patch: Partial<NonNullable<Question["validation"]>>) => {
    const next = { ...(field.validation || {}), ...patch };
    Object.keys(next).forEach((k) => {
      const v = (next as Record<string, unknown>)[k];
      if (v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v))) delete (next as Record<string, unknown>)[k];
    });
    onPatch({ validation: Object.keys(next).length ? next : undefined });
  };

  return (
    <div className="space-y-5">
      {/* ---------------- Conditional visibility ---------------- */}
      <div className="rounded-xl border border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4 text-indigo-500" /> Conditional visibility
          </div>
          <Switch checked={conditionalOn} onCheckedChange={toggleConditional} />
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Show this field only when other answers match your rules.
        </p>

        {conditionalOn && (
          <div className="space-y-2">
            {candidates.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">
                Add questions before this one to reference them.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Show when</span>
                  <Select value={rule.mode} onValueChange={(v) => commit(v as LogicMode, rule.conditions)}>
                    <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL match</SelectItem>
                      <SelectItem value="any">ANY match</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">of:</span>
                </div>

                {rule.conditions.map((c, i) => {
                  const rq = refQuestion(c.ref);
                  const showValue = !NO_VALUE_OPERATORS.includes(c.operator);
                  const update = (patch: Partial<typeof c>) => {
                    const conditions = rule.conditions.map((x) => (x.id === c.id ? { ...x, ...patch } : x));
                    commit(rule.mode, conditions);
                  };
                  return (
                    <div key={c.id} className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2">
                      <div className="flex items-center gap-1">
                        <Select value={c.ref} onValueChange={(v) => update({ ref: v })}>
                          <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder="Question" /></SelectTrigger>
                          <SelectContent>
                            {candidates.map((q) => (
                              <SelectItem key={q.id} value={q.name!}>{q.label || q.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => commit(rule.mode, rule.conditions.filter((x) => x.id !== c.id))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Select value={c.operator} onValueChange={(v) => update({ operator: v as LogicOperator })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ALL_OPERATORS.map((op) => (
                            <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {showValue && (
                        rq?.options?.length ? (
                          <Select value={c.value || ""} onValueChange={(v) => update({ value: v })}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Option" /></SelectTrigger>
                            <SelectContent>
                              {rq.options.map((o) => (
                                <SelectItem key={o.id} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={c.value || ""}
                            onChange={(e) => update({ value: e.target.value })}
                            placeholder="Value"
                            className="h-7 text-xs"
                          />
                        )
                      )}
                      {i < rule.conditions.length - 1 && (
                        <div className="text-center text-[10px] font-semibold uppercase text-muted-foreground">
                          {rule.mode === "all" ? "and" : "or"}
                        </div>
                      )}
                    </div>
                  );
                })}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1"
                  onClick={() => commit(rule.mode, [...rule.conditions, newCondition(candidates[0]?.name || "")])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add condition
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Validation ---------------- */}
      <div className="rounded-xl border border-border p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-emerald-500" /> Validation rules
        </div>

        {(field.type === "number" || field.type === "range") && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Min value</Label>
              <Input type="number" value={field.validation?.min ?? ""} onChange={(e) => patchValidation({ min: e.target.value === "" ? undefined : Number(e.target.value) })} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[11px]">Max value</Label>
              <Input type="number" value={field.validation?.max ?? ""} onChange={(e) => patchValidation({ max: e.target.value === "" ? undefined : Number(e.target.value) })} className="h-7 text-xs" />
            </div>
          </div>
        )}

        {field.type === "text" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Min length</Label>
                <Input type="number" value={field.validation?.minLength ?? ""} onChange={(e) => patchValidation({ minLength: e.target.value === "" ? undefined : Number(e.target.value) })} className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[11px]">Max length</Label>
                <Input type="number" value={field.validation?.maxLength ?? ""} onChange={(e) => patchValidation({ maxLength: e.target.value === "" ? undefined : Number(e.target.value) })} className="h-7 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Pattern (regex)</Label>
              <Input value={field.validation?.regex ?? ""} onChange={(e) => patchValidation({ regex: e.target.value || undefined })} placeholder="e.g. ^[0-9]{11}$" className="h-7 text-xs" />
            </div>
          </div>
        )}

        {field.type === "select_multiple" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Min selections</Label>
              <Input type="number" value={field.validation?.minSelections ?? ""} onChange={(e) => patchValidation({ minSelections: e.target.value === "" ? undefined : Number(e.target.value) })} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[11px]">Max selections</Label>
              <Input type="number" value={field.validation?.maxSelections ?? ""} onChange={(e) => patchValidation({ maxSelections: e.target.value === "" ? undefined : Number(e.target.value) })} className="h-7 text-xs" />
            </div>
          </div>
        )}

        {(field.type === "date" || field.type === "datetime") && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Earliest (ISO / today)</Label>
              <Input value={field.validation?.minDate ?? ""} onChange={(e) => patchValidation({ minDate: e.target.value || undefined })} placeholder="today" className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[11px]">Latest (ISO / today)</Label>
              <Input value={field.validation?.maxDate ?? ""} onChange={(e) => patchValidation({ maxDate: e.target.value || undefined })} placeholder="today" className="h-7 text-xs" />
            </div>
          </div>
        )}

        {field.type === "geopoint" && (
          <div>
            <Label className="text-[11px]">Min GPS accuracy (m)</Label>
            <Input type="number" value={field.validation?.minAccuracyMeters ?? ""} onChange={(e) => patchValidation({ minAccuracyMeters: e.target.value === "" ? undefined : Number(e.target.value) })} className="h-7 text-xs" />
          </div>
        )}

        <div className="mt-2">
          <Label className="text-[11px]">Error message</Label>
          <Input value={field.validation?.message ?? ""} onChange={(e) => patchValidation({ message: e.target.value || undefined })} placeholder="Shown when validation fails" className="h-7 text-xs" />
        </div>
      </div>
    </div>
  );
}
