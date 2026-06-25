import { useEffect, useMemo, useState } from "react";
import { Question, FormGroup, QuestionOption } from "./types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Link2, Plus, Trash2, Filter, ListChecks, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ConditionRow {
  field: string; // checklist question name
  value: string; // option value
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

export default function FollowUpLinkEditor({
  open,
  onOpenChange,
  group,
  checklistQuestions,
  onSave,
}: FollowUpLinkEditorProps) {
  const [rows, setRows] = useState<ConditionRow[]>([]);
  const [joiner, setJoiner] = useState<"and" | "or">("and");
  const [links, setLinks] = useState<Record<string, string>>({});

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
    const lk: Record<string, string> = {};
    for (const q of group.questions) {
      if (q.linkedSourceField) lk[q.id] = q.linkedSourceField;
    }
    setLinks(lk);
  }, [open, group]);

  if (!group) return null;

  const qByName = (name: string) => choiceQuestions.find((q) => q.name === name);

  const linkedCount = useMemo(
    () => Object.values(links).filter((src) => src && src !== NONE).length,
    [links],
  );

  const addRow = () => setRows((r) => [...r, { field: "", value: "" }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<ConditionRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const handleSave = () => {
    if (linkedCount === 0) {
      toast({
        title: "Link at least one follow-up question",
        description:
          "You must link at least one follow-up question to a Community Checklist response before saving.",
        variant: "destructive",
      });
      return;
    }
    const communityFilter = buildFilter(rows, joiner);
    const updatedQuestions = group.questions.map((q) => {
      const src = links[q.id];
      return src && src !== NONE
        ? { ...q, linkedSourceField: src }
        : { ...q, linkedSourceField: undefined };
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
            Follow-up linking — {group.label}
          </DialogTitle>
          <DialogDescription>
            Decide which visited communities appear in this follow-up list, and link follow-up
            questions to responses from the main Community Checklist.
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

            {/* ── Question linking ── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Link follow-up questions to checklist responses</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                When follow-up is done on a community, the linked checklist response is carried into
                the follow-up question so it is accurately updated.
              </p>

              {group.questions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  This follow-up module has no questions yet. Add questions to it first.
                </p>
              ) : (
                <div className="space-y-2">
                  {group.questions.map((q) => (
                    <div
                      key={q.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{q.label}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{q.type}</p>
                      </div>
                      <Select
                        value={links[q.id] || NONE}
                        onValueChange={(v) =>
                          setLinks((prev) => ({ ...prev, [q.id]: v }))
                        }
                      >
                        <SelectTrigger className="h-9 w-[12rem]">
                          <SelectValue placeholder="No link" />
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
                  ))}
                </div>
              )}
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
