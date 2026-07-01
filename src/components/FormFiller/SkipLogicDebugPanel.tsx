/**
 * SkipLogicDebugPanel — an in-form diagnostic overlay (admins/owners only).
 *
 * Shows, for every question that has skip logic, whether it is currently shown
 * or hidden and WHY: each atomic condition of its `relevant` expression is
 * evaluated against the live answers, with the value it actually saw. This makes
 * it trivial to confirm a rule like "show 'Specify other side effect' only when
 * 'What side effects?' includes Others" is behaving correctly.
 *
 * Purely presentational + read-only: it never mutates responses.
 */
import { useMemo, useState } from "react";
import { Bug, Check, ChevronDown, Eye, EyeOff, X } from "lucide-react";
import {
  buildNameToIdMap,
  explainRelevant,
  type Responses,
} from "@/lib/skipLogic";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DebugQuestion {
  id: string;
  name?: string;
  label?: string;
  relevant?: string;
}

interface SkipLogicDebugPanelProps {
  questions: DebugQuestion[];
  responses: Responses;
  /** Controls open state from the host (a floating trigger button). */
  open: boolean;
  onClose: () => void;
}

export default function SkipLogicDebugPanel({
  questions,
  responses,
  open,
  onClose,
}: SkipLogicDebugPanelProps) {
  const [hideAlwaysShown, setHideAlwaysShown] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const nameToIdMap = useMemo(() => buildNameToIdMap(questions), [questions]);

  const rows = useMemo(() => {
    return questions
      .map((q) => ({
        q,
        explanation: explainRelevant(q.relevant, responses, nameToIdMap),
      }))
      .filter(({ explanation }) =>
        hideAlwaysShown ? explanation.relevant !== "" : true,
      );
  }, [questions, responses, nameToIdMap, hideAlwaysShown]);

  const stats = useMemo(() => {
    const withLogic = rows.filter((r) => r.explanation.relevant !== "");
    const hidden = withLogic.filter((r) => !r.explanation.visible).length;
    return { withLogic: withLogic.length, hidden };
  }, [rows]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-[190] flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200"
      role="dialog"
      aria-label="Skip logic debug panel"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-bold text-foreground">Skip Logic Debug</h2>
            <p className="text-xs text-muted-foreground">
              {stats.withLogic} conditional · {stats.hidden} hidden now
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close debug panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button
          variant={hideAlwaysShown ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setHideAlwaysShown((v) => !v)}
        >
          {hideAlwaysShown ? "Only conditional" : "Showing all"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {rows.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            No questions match this filter.
          </p>
        )}
        <ul className="space-y-2">
          {rows.map(({ q, explanation }) => {
            const isOpen = expanded[q.id] ?? false;
            const conditional = explanation.relevant !== "";
            return (
              <li
                key={q.id}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  explanation.visible
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-amber-500/40 bg-amber-500/5",
                )}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left"
                  onClick={() =>
                    conditional && setExpanded((p) => ({ ...p, [q.id]: !isOpen }))
                  }
                >
                  {explanation.visible ? (
                    <Eye className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <EyeOff className="h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {q.label || q.name || q.id}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                      explanation.visible
                        ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-600/15 text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {explanation.visible ? "SHOWN" : "HIDDEN"}
                  </span>
                  {conditional && (
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  )}
                </button>

                {conditional && isOpen && (
                  <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
                    <code className="block whitespace-pre-wrap break-words rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      {explanation.relevant}
                    </code>
                    {explanation.combinator !== "none" && (
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Combined with {explanation.combinator}
                      </p>
                    )}
                    <ul className="space-y-1">
                      {explanation.conditions.map((c, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 rounded bg-background/60 px-2 py-1 text-xs"
                        >
                          {c.passed ? (
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          ) : (
                            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                          )}
                          <span className="flex-1">
                            <code className="break-words text-foreground">{c.expression}</code>
                            {c.actualValue !== undefined && (
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                answer: {c.actualValue}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
