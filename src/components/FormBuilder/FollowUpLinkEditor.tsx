import { useEffect, useMemo, useState } from "react";
import { Question, FormGroup, QuestionOption, QuestionType } from "./types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Link2,
  Plus,
  Trash2,
  Filter,
  ListChecks,
  AlertCircle,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ConditionRow {
  field: string; // checklist question name
  value: string; // option value
}

/** Editable follow-up question managed inside this dialog. */
interface DraftQuestion {
  id: string;
  label: string;
  name: string;
  type: QuestionType;
  linkedSourceField?: string;
  linkedSourceValue?: string;
  options?: QuestionOption[];
}

interface FollowUpLinkEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: FormGroup | null;
  /** Questions from the main Community Checklist (non follow-up groups). */
  checklistQuestions: Question[];
  onSave: (updatedGroup: FormGroup) => void;
}

const NONE = "__none__";

/** Question types offered to admins when building follow-up questions. */
const FOLLOWUP_TYPES: { type: QuestionType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "select_one", label: "Select one" },
  { type: "select_multiple", label: "Select multiple" },
  { type: "date", label: "Date" },
  { type: "datetime", label: "Date & time" },
  { type: "note", label: "Note" },
  { type: "image", label: "Photo" },
  { type: "geopoint", label: "GPS point" },
  { type: "acknowledge", label: "Acknowledge" },
];

function slugify(label: string, fallback: string): string {
  const s = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || fallback;
}

// Parse a stored `communityFilter` expression back into rows + joiner.
function parseFilter(expr?: string): { rows: ConditionRow[]; joiner: "and" | "or" } {
  if (!expr || !expr.trim()) return { rows: [], joiner: "and" };
  const joiner: "and" | "or" = /\s+or\s+/i.test(expr) ? "or" : "and";
  const parts = expr.split(/\s+(?:and|or)\s+/i);
  const rows: ConditionRow[] = [];
  for (const p of parts) {
    const m = p.match(/selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)/);
    if (m) rows.push({ field: m[1], value: m[2] });
  }
  return { rows, joiner };
}

function buildFilter(rows: ConditionRow[], joiner: "and" | "or"): string {
  const valid = rows.filter((r) => r.field && r.value);
  if (valid.length === 0) return "";
  return valid.map((r) => `selected(\${${r.field}}, '${r.value}')`).join(` ${joiner} `);
}

const isChoiceType = (type: QuestionType) =>
  type === "select_one" || type === "select_multiple" || type === "rank";

const defaultOptions = (): QuestionOption[] => [
  { id: `opt-${Date.now()}-1`, label: "Option 1", value: "option_1" },
  { id: `opt-${Date.now()}-2`, label: "Option 2", value: "option_2" },
];

const optionValueFromLabel = (label: string, fallback = "option") =>
  slugify(label, fallback).replace(/_{2,}/g, "_");

export function FollowUpLinkEditor({
  open,
  onOpenChange,
  group,
  checklistQuestions,
  onSave,
}: FollowUpLinkEditorProps) {
  const [rows, setRows] = useState<ConditionRow[]>([]);
  const [joiner, setJoiner] = useState<"and" | "or">("and");
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);

  // Choice-type checklist questions (usable for conditions).
  const choiceQuestions = useMemo(
    () => checklistQuestions.filter((q) => q.type === "select_one" || q.type === "select_multiple"),
    [checklistQuestions],
  );
  const linkableSourceQuestions = choiceQuestions;

  useEffect(() => {
    if (!open || !group) return;
    const parsed = parseFilter(group.communityFilter);
    setRows(parsed.rows);
    setJoiner(parsed.joiner);
    setQuestions(
      group.questions.map((q) => ({
        id: q.id,
        label: q.label,
        name: q.name || q.id,
        type: q.type,
        linkedSourceField: q.linkedSourceField,
        linkedSourceValue: q.linkedSourceValue,
        options: q.options,
      })),
    );
  }, [open, group]);

  const qByName = (name: string) => choiceQuestions.find((q) => (q.name || q.id) === name);
  const sourceQuestionByName = (name?: string) =>
    checklistQuestions.find((q) => (q.name || q.id) === name);
  const isFullyLinked = (q: DraftQuestion) => {
    if (!q.linkedSourceField || q.linkedSourceField === NONE) return false;
    const source = sourceQuestionByName(q.linkedSourceField);
    return !!source && (source.options?.length ?? 0) > 0 && !!q.linkedSourceValue;
  };

  const linkedCount = useMemo(
    () => questions.filter(isFullyLinked).length,
    [questions, checklistQuestions],
  );

  if (!group) return null;

  const addRow = () => setRows((r) => [...r, { field: "", value: "" }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<ConditionRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const addQuestion = () =>
    setQuestions((qs) => [
      ...qs,
      {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `fq_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        label: "",
        name: "",
        type: "text",
        linkedSourceField: undefined,
        linkedSourceValue: undefined,
        options: undefined,
      },
    ]);
  const removeQuestion = (id: string) =>
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  const updateQuestion = (id: string, patch: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const updateQuestionType = (id: string, type: QuestionType) =>
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.id !== id) return q;
        const next: DraftQuestion = { ...q, type };
        if (isChoiceType(type) && (!next.options || next.options.length === 0)) {
          next.options = defaultOptions();
        }
        if (!isChoiceType(type)) next.options = undefined;
        return next;
      }),
    );
  const addQuestionOption = (id: string) =>
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.id !== id) return q;
        const count = (q.options?.length ?? 0) + 1;
        return {
          ...q,
          options: [
            ...(q.options || []),
            { id: `opt-${Date.now()}-${count}`, label: `Option ${count}`, value: `option_${count}` },
          ],
        };
      }),
    );
  const updateQuestionOption = (questionId: string, optionId: string, patch: Partial<QuestionOption>) =>
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.id !== questionId) return q;
        return {
          ...q,
          options: q.options?.map((o) => (o.id === optionId ? { ...o, ...patch } : o)),
        };
      }),
    );
  const removeQuestionOption = (questionId: string, optionId: string) =>
    setQuestions((qs) =>
      qs.map((q) =>
        q.id === questionId ? { ...q, options: q.options?.filter((o) => o.id !== optionId) } : q,
      ),
    );

  const handleSave = () => {
    const labelled = questions.filter((q) => q.label.trim());
    if (labelled.length === 0) {
      toast({
        title: "Add a follow-up question",
        description: "Create at least one follow-up question before saving.",
        variant: "destructive",
      });
      return;
    }
    if (labelled.filter(isFullyLinked).length === 0) {
      toast({
        title: "Link at least one follow-up question",
        description:
          "You must link at least one follow-up question to a Community Checklist response option before saving.",
        variant: "destructive",
      });
      return;
    }

    const communityFilter = buildFilter(rows, joiner);

    // Preserve any extra metadata on existing questions while applying edits.
    const existingById = new Map(group.questions.map((q) => [q.id, q]));
    const usedNames = new Set<string>();
    const updatedQuestions: Question[] = labelled.map((dq) => {
      const base = existingById.get(dq.id);
      let name = (dq.name || slugify(dq.label, dq.id)).trim();
      while (usedNames.has(name)) name = `${name}_1`;
      usedNames.add(name);
      const source = sourceQuestionByName(dq.linkedSourceField);
      const needsOption = (source?.options?.length ?? 0) > 0;
      const src = isFullyLinked(dq) ? dq.linkedSourceField : undefined;
      const srcValue = src && needsOption ? dq.linkedSourceValue : undefined;
      return {
        ...(base ?? { required: false }),
        id: dq.id,
        label: dq.label.trim(),
        name,
        type: dq.type,
        required: base?.required ?? false,
        linkedSourceField: src,
        linkedSourceValue: srcValue,
        options: isChoiceType(dq.type) ? (dq.options || defaultOptions()) : undefined,
      } as Question;
    });

    onSave({ ...group, communityFilter: communityFilter || undefined, questions: updatedQuestions });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1.5 bg-gradient-to-br from-[#4338ca] via-[#7c3aed] to-[#db2777] px-5 py-4 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 ring-1 ring-white/25">
              <Link2 className="h-4 w-4" />
            </span>
            <span className="truncate">Follow-up builder — {group.label}</span>
          </DialogTitle>
          <DialogDescription className="text-white/85">
            Build the questions field workers answer during follow-up, link each to a Community
            Checklist response, and choose which visited communities appear here.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-5 py-5">
            {/* ── Build & link follow-up questions (primary action) ── */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ListChecks className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-bold">Follow-up questions</h3>
                </div>
                <Badge
                  variant="secondary"
                  className={`font-medium ${
                    linkedCount > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : ""
                  }`}
                >
                  {linkedCount} linked
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Add the questions field workers answer during follow-up. Link a question to a
                Community Checklist response so that response is carried in and accurately updated.
              </p>

              <div className="space-y-3">
                {questions.map((q, idx) => {
                  const sourceQuestion = sourceQuestionByName(q.linkedSourceField);
                  const sourceOptions = sourceQuestion?.options || [];
                  const sourceNeedsOption = sourceOptions.length > 0;
                  const linked = isFullyLinked(q);
                  return (
                    <div
                      key={q.id}
                      className={`rounded-xl border p-3 transition-colors ${
                        linked
                          ? "border-emerald-300/70 bg-gradient-to-br from-emerald-50 to-teal-50 dark:border-emerald-800/60 dark:from-emerald-950/40 dark:to-teal-950/30"
                          : "border-border bg-gradient-to-br from-muted/40 to-background"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <Input
                            value={q.label}
                            onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                            placeholder="Question text (e.g. Was MDA completed?)"
                            className="h-9 font-medium"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Select
                              value={q.type}
                              onValueChange={(v) => updateQuestionType(q.id, v as QuestionType)}
                            >
                              <SelectTrigger className="h-8 w-[9.5rem] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FOLLOWUP_TYPES.map((t) => (
                                  <SelectItem key={t.type} value={t.type}>
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <Select
                                value={q.linkedSourceField || NONE}
                                onValueChange={(v) =>
                                  updateQuestion(q.id, {
                                    linkedSourceField: v === NONE ? undefined : v,
                                    linkedSourceValue: undefined,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 flex-1 text-xs">
                                  <SelectValue placeholder="Link to checklist response" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE}>No link</SelectItem>
                                  {linkableSourceQuestions.map((cq) => (
                                    <SelectItem key={cq.id} value={cq.name || cq.id}>
                                      {cq.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {sourceNeedsOption && (
                              <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
                                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">option</span>
                                <Select
                                  value={q.linkedSourceValue || undefined}
                                  onValueChange={(v) => updateQuestion(q.id, { linkedSourceValue: v })}
                                >
                                  <SelectTrigger className="h-8 flex-1 text-xs">
                                    <SelectValue placeholder="Source option response" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {sourceOptions.map((o) => (
                                      <SelectItem key={o.id} value={o.value}>
                                        {o.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {linked && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            )}
                          </div>
                          {isChoiceType(q.type) && (
                            <div className="rounded-lg border border-border/70 bg-background/80 p-2">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-muted-foreground">Follow-up answer options</span>
                                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => addQuestionOption(q.id)}>
                                  <Plus className="h-3.5 w-3.5" /> Add option
                                </Button>
                              </div>
                              <div className="space-y-2">
                                {(q.options || []).map((option) => (
                                  <div key={option.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                                    <Input
                                      value={option.label}
                                      onChange={(e) =>
                                        updateQuestionOption(q.id, option.id, {
                                          label: e.target.value,
                                          value: option.value || optionValueFromLabel(e.target.value),
                                        })
                                      }
                                      placeholder="Option label"
                                      className="h-8 text-xs"
                                    />
                                    <Input
                                      value={option.value}
                                      onChange={(e) =>
                                        updateQuestionOption(q.id, option.id, {
                                          value: optionValueFromLabel(e.target.value),
                                        })
                                      }
                                      placeholder="xml_value"
                                      className="h-8 font-mono text-xs"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                      onClick={() => removeQuestionOption(q.id, option.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeQuestion(q.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {questions.length === 0 && (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center">
                    <Sparkles className="h-6 w-6 text-primary/60" />
                    <p className="text-sm font-medium">No follow-up questions yet</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      Add a question and link it to a Community Checklist response to start building
                      this follow-up module.
                    </p>
                  </div>
                )}
              </div>

              <Button
                onClick={addQuestion}
                className="w-full gap-1.5 bg-gradient-to-r from-[#4338ca] to-[#7c3aed] text-white hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Add follow-up question
              </Button>
            </section>

            <Separator />

            {/* ── Community appearance condition ── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Filter className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold">Which communities appear here</h3>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                A community appears in this follow-up list only when its Community Checklist
                response matches{" "}
                {rows.length > 1 ? (
                  <span className="font-medium text-foreground">
                    {joiner === "and" ? "ALL" : "ANY"}
                  </span>
                ) : (
                  "the"
                )}{" "}
                condition(s) below. Leave empty to show every visited community.
              </p>

              {rows.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Match</span>
                  <div className="inline-flex rounded-lg border bg-muted p-0.5">
                    {(["and", "or"] as const).map((j) => (
                      <button
                        key={j}
                        onClick={() => setJoiner(j)}
                        className={`rounded-md px-3 py-1 font-medium transition-colors ${
                          joiner === j
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {j === "and" ? "ALL (AND)" : "ANY (OR)"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {rows.map((row, i) => {
                  const q = qByName(row.field);
                  const options: QuestionOption[] = q?.options ?? [];
                  return (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2"
                    >
                      <Select
                        value={row.field || undefined}
                        onValueChange={(v) => updateRow(i, { field: v, value: "" })}
                      >
                        <SelectTrigger className="h-9 min-w-[10rem] flex-1">
                          <SelectValue placeholder="Checklist question" />
                        </SelectTrigger>
                        <SelectContent>
                          {choiceQuestions.map((cq) => (
                            <SelectItem key={cq.id} value={cq.name || cq.id}>
                              {cq.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs font-medium text-muted-foreground">is</span>
                      <Select
                        value={row.value || undefined}
                        onValueChange={(v) => updateRow(i, { value: v })}
                        disabled={!q}
                      >
                        <SelectTrigger className="h-9 min-w-[9rem] flex-1">
                          <SelectValue placeholder={q ? "Select option" : "Pick question first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((o) => (
                            <SelectItem key={o.id} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={addRow}
                className="gap-1.5 border-dashed"
                disabled={choiceQuestions.length === 0}
              >
                <Plus className="h-4 w-4" /> Add condition
              </Button>
              {choiceQuestions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add select-one / select-multiple questions to the Community Checklist to build
                  conditions.
                </p>
              )}
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 items-center border-t px-5 py-3">
          {linkedCount === 0 ? (
            <span className="mr-auto flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              Link at least one follow-up question to save
            </span>
          ) : (
            group.communityFilter && (
              <Badge variant="secondary" className="mr-auto font-normal">
                Filter active
              </Badge>
            )
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={linkedCount === 0}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FollowUpLinkEditor;
