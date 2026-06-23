import { useMemo, useState } from "react";
import { Question, FormGroup } from "./types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import {
  buildNameToIdMap,
  evaluateRelevant,
  type Responses,
} from "@/lib/skipLogic";

interface SkipLogicSimulatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: Question[];
  groups?: FormGroup[];
}

const INPUT_TYPES = new Set([
  "text",
  "integer",
  "decimal",
  "number",
  "select_one",
  "select_multiple",
  "date",
  "time",
]);

/**
 * Skip-logic simulator: lets a form designer answer questions as an applicant
 * would and see, in real time, exactly which questions show or hide at each
 * step — using the same evaluator the production FormFiller uses.
 */
const SkipLogicSimulator = ({
  open,
  onOpenChange,
  questions,
  groups = [],
}: SkipLogicSimulatorProps) => {
  // Flatten in display order: standalone questions first, then each group.
  const ordered = useMemo(() => {
    const out: { q: Question; group?: string }[] = [];
    questions.forEach((q) => out.push({ q }));
    groups.forEach((g) =>
      (g.questions || []).forEach((q) => out.push({ q, group: g.label })),
    );
    return out;
  }, [questions, groups]);

  const allQuestions = useMemo(() => ordered.map((o) => o.q), [ordered]);
  const nameToIdMap = useMemo(() => buildNameToIdMap(allQuestions), [allQuestions]);

  const [responses, setResponses] = useState<Responses>({});

  const idToLabel = useMemo(() => {
    const m: Record<string, string> = {};
    allQuestions.forEach((q) => {
      m[q.id] = q.label;
      if (q.name) m[q.name] = q.label;
    });
    return m;
  }, [allQuestions]);

  const setAnswer = (id: string, value: unknown) =>
    setResponses((prev) => ({ ...prev, [id]: value }));

  const toggleMulti = (id: string, value: string) =>
    setResponses((prev) => {
      const arr = Array.isArray(prev[id]) ? [...(prev[id] as string[])] : [];
      const idx = arr.indexOf(value);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(value);
      return { ...prev, [id]: arr };
    });

  const isVisible = (q: Question) =>
    evaluateRelevant(q.relevant, responses, nameToIdMap);

  // Human-readable relevant expression for the "hidden because" hint.
  const humanizeRelevant = (relevant?: string) => {
    if (!relevant) return "";
    return relevant
      .replace(/selected\s*\(\s*\$\{(.+?)\}\s*,\s*['"](.+?)['"]\s*\)/g, (_, ref, val) => `${idToLabel[ref] || ref} is "${val}"`)
      .replace(/\$\{(.+?)\}/g, (_, ref) => idToLabel[ref] || ref);
  };

  const visibleCount = ordered.filter((o) => isVisible(o.q)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Skip Logic Simulator
            <Badge variant="secondary">
              {visibleCount}/{ordered.length} visible
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Answer as an applicant would and watch which questions appear or
            disappear in real time.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {ordered.length === 0 && (
            <p className="text-sm text-muted-foreground">No questions to simulate yet.</p>
          )}
          {ordered.map(({ q, group }, idx) => {
            const visible = isVisible(q);
            const inputable = INPUT_TYPES.has(q.type);
            return (
              <div
                key={q.id}
                className={`rounded-lg border p-3 transition-opacity ${
                  visible ? "border-border" : "border-dashed border-border opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                      {group && (
                        <Badge variant="outline" className="text-[10px]">
                          {group}
                        </Badge>
                      )}
                      <span className="font-medium text-sm text-foreground">
                        {q.label || "(untitled)"}
                      </span>
                    </div>
                    {!visible && q.relevant && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Hidden — shows when: {humanizeRelevant(q.relevant)}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={visible ? "default" : "secondary"}
                    className="shrink-0 gap-1"
                  >
                    {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {visible ? "Visible" : "Hidden"}
                  </Badge>
                </div>

                {visible && inputable && (
                  <div className="mt-3">
                    {q.type === "select_one" && (q.options?.length ?? 0) > 0 ? (
                      <Select
                        value={(responses[q.id] as string) || ""}
                        onValueChange={(v) => setAnswer(q.id, v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select an answer" />
                        </SelectTrigger>
                        <SelectContent>
                          {q.options!.map((opt) => (
                            <SelectItem key={opt.id} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : q.type === "select_multiple" && (q.options?.length ?? 0) > 0 ? (
                      <div className="space-y-2">
                        {q.options!.map((opt) => {
                          const arr = Array.isArray(responses[q.id])
                            ? (responses[q.id] as string[])
                            : [];
                          return (
                            <label
                              key={opt.id}
                              className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                              <Checkbox
                                checked={arr.includes(opt.value)}
                                onCheckedChange={() => toggleMulti(q.id, opt.value)}
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                    ) : q.type === "integer" || q.type === "decimal" || q.type === "number" ? (
                      <Input
                        type="number"
                        value={(responses[q.id] as string) ?? ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        placeholder="Enter a number"
                        className="h-9"
                      />
                    ) : (
                      <Input
                        type={q.type === "date" ? "date" : q.type === "time" ? "time" : "text"}
                        value={(responses[q.id] as string) ?? ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        placeholder="Enter an answer"
                        className="h-9"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-between gap-3 border-t pt-3">
          <Button variant="outline" size="sm" onClick={() => setResponses({})}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset answers
          </Button>
          <Button variant="acg" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SkipLogicSimulator;
