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
  GripVertical,
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
      })),
    );
  }, [open, group]);

  if (!group) return null;

  const qByName = (name: string) => choiceQuestions.find((q) => q.name === name);

  const linkedCount = useMemo(
    () => questions.filter((q) => q.linkedSourceField && q.linkedSourceField !== NONE).length,
    [questions],
  );

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
      },
    ]);
  const removeQuestion = (id: string) =>
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  const updateQuestion = (id: string, patch: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));

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
    if (labelled.filter((q) => q.linkedSourceField && q.linkedSourceField !== NONE).length === 0) {
      toast({
        title: "Link at least one follow-up question",
        description:
          "You must link at least one follow-up question to a Community Checklist response before saving.",
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
      const src = dq.linkedSourceField && dq.linkedSourceField !== NONE ? dq.linkedSourceField : undefined;
      return {
        ...(base ?? { required: false }),
        id: dq.id,
        label: dq.label.trim(),
        name,
        type: dq.type,
        required: base?.required ?? false,
        linkedSourceField: src,
      } as Question;
    });

    onSave({ ...group, communityFilter: communityFilter || undefined, questions: updatedQuestions });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Follow-up builder — {group.label}
          </DialogTitle>
          <DialogDescription>
            Decide which visited communities appear in this follow-up list, build follow-up
            questions, and link each to a response from the main Community Checklist.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-8 py-4">
            {/* ── Community appearance condition ── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Which communities appear here</h3>
              </div>
              <p className="text-xs text-muted-foreground">
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

            <Separator />

            {/* ── Build & link follow-up questions ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Follow-up questions</h3>
                </div>
                <Badge
                  variant="secondary"
                  className={`font-normal ${
                    linkedCount > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : ""
                  }`}
                >
                  {linkedCount} linked
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Add the questions field workers answer during follow-up. Link a question to a
                Community Checklist response so that response is carried in and accurately updated.
              </p>

              <div className="space-y-3">
                {questions.map((q, idx) => {
                  const linked = !!q.linkedSourceField && q.linkedSourceField !== NONE;
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
                              onValueChange={(v) => updateQuestion(q.id, { type: v as QuestionType })}
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

                            <div className="flex flex-1 items-center gap-1.5">
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <Select
                                value={q.linkedSourceField || NONE}
                                onValueChange={(v) =>
                                  updateQuestion(q.id, {
                                    linkedSourceField: v === NONE ? undefined : v,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 flex-1 text-xs">
                                  <SelectValue placeholder="Link to checklist response" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE}>No link</SelectItem>
                                  {checklistQuestions.map((cq) => (
                                    <SelectItem key={cq.id} value={cq.name || cq.id}>
                                      {cq.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {linked && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            )}
                          </div>
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
                variant="outline"
                size="sm"
                onClick={addQuestion}
                className="w-full gap-1.5 border-dashed"
              >
                <Plus className="h-4 w-4" /> Add follow-up question
              </Button>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t px-6 py-4">
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
