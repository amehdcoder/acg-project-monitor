import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Accessibility, ArrowLeft, ArrowRight, Brain, Ear, Eye, MessageCircle, PersonStanding, Sparkles, HandMetal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WG_DOMAINS, WG_LEVELS, WgAnswers, WgLevel, classifyWg, wgComplete,
} from "@/lib/programmeModule/washingtonGroup";

const DOMAIN_ICON = {
  eye: Eye, ear: Ear, walk: PersonStanding, brain: Brain, selfcare: HandMetal, talk: MessageCircle,
} as const;

const LEVEL_STYLE: Record<WgLevel, string> = {
  none: "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  some: "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  a_lot: "border-orange-500/60 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  cannot: "border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

interface Props {
  open: boolean;
  beneficiaryName: string;
  initial?: WgAnswers;
  onSave: (answers: WgAnswers) => void | Promise<void>;
  onSkip: () => void;
}

/**
 * Washington Group Short Set questionnaire — shown right after a beneficiary
 * record is saved. One domain per step, large touch-friendly answer cards.
 */
const WashingtonGroupDialog = ({ open, beneficiaryName, initial, onSave, onSkip }: Props) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<WgAnswers>(initial || {});
  const [saving, setSaving] = useState(false);

  const domain = WG_DOMAINS[step];
  const done = wgComplete(answers);
  const isLast = step === WG_DOMAINS.length - 1;
  const result = useMemo(() => classifyWg(answers), [answers]);
  const Icon = DOMAIN_ICON[domain.icon];

  const pick = (level: WgLevel) => {
    const next = { ...answers, [domain.key]: level };
    setAnswers(next);
    if (!isLast) setTimeout(() => setStep((s) => s + 1), 180);
  };

  const finish = async () => {
    setSaving(true);
    try { await onSave(answers); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onSkip(); }}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto p-0">
        <div className="bg-gradient-to-br from-primary via-primary/90 to-teal-600 px-6 pb-6 pt-5 text-primary-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary-foreground">
              <Accessibility className="h-5 w-5" /> Disability screening (WG-SS)
            </DialogTitle>
          </DialogHeader>
          <p className="mt-1 text-sm text-primary-foreground/85">
            Six short Washington Group questions for <span className="font-semibold">{beneficiaryName}</span>.
            They identify functional difficulties so services can be planned inclusively.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Progress value={((step + (answers[domain.key] ? 1 : 0)) / WG_DOMAINS.length) * 100}
              className="h-1.5 flex-1 bg-primary-foreground/25" />
            <span className="text-xs font-medium tabular-nums">{step + 1} / {WG_DOMAINS.length}</span>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {domain.label}
              </p>
              <p className="mt-0.5 text-base font-medium leading-snug text-foreground">
                {domain.question}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {WG_LEVELS.map((l) => {
              const active = answers[domain.key] === l.value;
              return (
                <button key={l.value} type="button" onClick={() => pick(l.value)}
                  className={cn(
                    "rounded-xl border-2 px-4 py-3 text-left transition-all",
                    active ? LEVEL_STYLE[l.value] + " shadow-sm" : "border-border bg-card hover:border-primary/40 hover:bg-muted/50",
                  )}>
                  <p className="text-sm font-semibold">{l.label}</p>
                  <p className="text-xs text-muted-foreground">{l.description}</p>
                </button>
              );
            })}
          </div>

          {done && isLast && (
            <div className={cn(
              "flex items-start gap-2.5 rounded-xl border p-3 text-sm",
              result.hasDisability ? "border-primary/40 bg-primary/5" : "border-emerald-500/40 bg-emerald-500/5",
            )}>
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-foreground">
                {result.hasDisability
                  ? <>Classification: <span className="font-semibold">person with a disability</span> — {result.disabilityDomains.join(", ")} domain{result.disabilityDomains.length > 1 ? "s" : ""} affected.</>
                  : <>Classification: <span className="font-semibold">no disability identified</span> across the six domains.</>}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onSkip}>Skip for now</Button>
              {isLast ? (
                <Button size="sm" onClick={finish} disabled={!done || saving}>
                  {saving ? "Saving…" : "Save screening"}
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!answers[domain.key]}>
                  Next <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WashingtonGroupDialog;
