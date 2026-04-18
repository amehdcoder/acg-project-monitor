/**
 * ExpertFieldValidator
 *
 * Inline Mixture-of-Experts validator that sits beneath each Form Filler field.
 *
 * Behaviour:
 *  - On blur (passed in via `triggerKey` increment), runs deterministic
 *    pre-checks instantly, and — if the field type benefits — delegates to the
 *    routed expert (math / language / validation) via the shared in-browser
 *    ~200M model loaded by MoEExpertProvider.
 *  - Manual "Check with AI" button is always available.
 *  - First click loads the model with a small inline progress indicator;
 *    subsequent fields reuse the cached engine.
 *
 * Visual contract:
 *  - Uses semantic tokens only (no hardcoded colors).
 *  - Compact: a single row of muted helper text or an alert badge.
 */

import { useEffect, useRef, useState } from "react";
import { Sparkles, ShieldCheck, AlertTriangle, Loader2, Calculator, Languages, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMoEContext } from "./MoEExpertProvider";
import type { ExpertId, ExpertVerdict, FieldContext } from "@/hooks/useMoEExperts";

interface Props {
  context: FieldContext;
  /** Increment to trigger a check (typically from onBlur). */
  triggerKey?: number;
  /** Optional callback when the user accepts a suggestion. */
  onAcceptSuggestion?: (value: string) => void;
}

const EXPERT_LABEL: Record<ExpertId, string> = {
  math: "Math expert",
  language: "Language expert",
  validation: "Validation expert",
};

const EXPERT_ICON: Record<ExpertId, React.ComponentType<{ className?: string }>> = {
  math: Calculator,
  language: Languages,
  validation: ShieldAlert,
};

export function ExpertFieldValidator({ context, triggerKey, onAcceptSuggestion }: Props) {
  const moe = useMoEContext();
  const [verdict, setVerdict] = useState<ExpertVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const lastTriggerRef = useRef<number | undefined>(undefined);

  const runCheck = async (forceLoad: boolean) => {
    if (!moe) return;
    if (busy) return;
    setBusy(true);
    try {
      if (forceLoad) {
        const ok = await moe.ensureLoaded();
        if (!ok && moe.isSupported) {
          // user-initiated load failed — surface nothing further; status panel covers it
        }
      }
      const v = await moe.checkField(context);
      // checkField may return null if model isn't loaded yet AND no fast pre-check fired
      setVerdict(v);
    } catch (e) {
      console.warn("Expert check failed:", e);
    } finally {
      setBusy(false);
    }
  };

  // Auto-run on blur (parent bumps triggerKey).
  useEffect(() => {
    if (triggerKey === undefined) return;
    if (lastTriggerRef.current === triggerKey) return;
    lastTriggerRef.current = triggerKey;
    // Don't auto-load the 200MB+ weights on blur — only run if user has loaded
    // experts at least once this session OR the deterministic pre-check fires.
    runCheck(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  if (!moe) return null;
  if (!moe.isSupported) return null; // silently disabled on devices without WebGPU

  const ExpertIcon = verdict ? EXPERT_ICON[verdict.expert] : Sparkles;
  const isLoadingModel = moe.status === "loading";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {/* Verdict pill */}
      {verdict && !verdict.ok && verdict.issue && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <ExpertIcon className="h-3 w-3" />
              <span className="font-medium">{EXPERT_LABEL[verdict.expert]}</span>
            </div>
            <p className="mt-0.5 leading-snug">{verdict.issue}</p>
            {verdict.suggestion && onAcceptSuggestion && (
              <button
                type="button"
                onClick={() => onAcceptSuggestion!(verdict.suggestion!)}
                className="mt-1 underline underline-offset-2 hover:text-destructive/80"
              >
                Use “{verdict.suggestion}”
              </button>
            )}
          </div>
        </div>
      )}

      {verdict && verdict.ok && (
        <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
          <ShieldCheck className="h-3 w-3" />
          {EXPERT_LABEL[verdict.expert]} OK
        </Badge>
      )}

      {/* Action / status row */}
      <div className="ml-auto flex items-center gap-2 text-muted-foreground">
        {isLoadingModel && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading experts… {Math.round(moe.progress.progress * 100)}%
          </span>
        )}
        {!isLoadingModel && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1.5"
            onClick={() => runCheck(true)}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {moe.isReady ? "Check with AI" : "Enable AI checks"}
          </Button>
        )}
      </div>
    </div>
  );
}
