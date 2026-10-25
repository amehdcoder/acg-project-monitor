// Washington Group Short Set wizard for one eye-care patient.
//
// A beautiful, touch-friendly stepper: patient identity (label, sex, age band),
// then the six WG-SS domains one per screen with illustrated answer cards, and
// a live classification badge. Used inside the daily report and standalone.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Accessibility, ArrowLeft, ArrowRight, Brain, Check, Ear, Eye, HandMetal, MessageCircle,
  PersonStanding, Sparkles, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  WG_DOMAINS, WG_LEVELS, buildWgRecord, classifyWg, wgComplete,
  type WgAnswers, type WgLevel,
} from "@/lib/programmeModule/washingtonGroup";
import { AGE_BANDS } from "@/lib/eyeReport/definition";

const DOMAIN_ICON = {
  eye: Eye, ear: Ear, walk: PersonStanding, brain: Brain, selfcare: HandMetal, talk: MessageCircle,
} as const;

const LEVEL_STYLE: Record<WgLevel, string> = {
  none: "border-status-success/60 bg-status-success/10 text-status-success",
  some: "border-eye-gold/70 bg-eye-gold/15 text-eye-ink",
  a_lot: "border-eye-orange/70 bg-eye-orange/10 text-eye-orange",
  cannot: "border-eye-rose/70 bg-eye-rose/10 text-eye-rose",
};

export interface WgPatientDraft {
  patient_label: string;
  sex: "m" | "f" | "";
  age_band: string;
  answers: WgAnswers;
}

export const emptyWgPatient = (label = ""): WgPatientDraft => ({ patient_label: label, sex: "", age_band: "", answers: {} });

interface Props {
  initial?: WgPatientDraft;
  /** Suggested label, e.g. "Patient 4". */
  suggestedLabel?: string;
  onSave: (draft: WgPatientDraft, record: ReturnType<typeof buildWgRecord>) => void;
  onCancel: () => void;
}

const SEX_OPTIONS = [
  { value: "m", label: "Male" },
  { value: "f", label: "Female" },
] as const;

/** Step 0 = identity, steps 1..6 = WG-SS domains. */
const WgPatientWizard = ({ initial, suggestedLabel, onSave, onCancel }: Props) => {
  const [draft, setDraft] = useState<WgPatientDraft>(initial ?? emptyWgPatient(suggestedLabel ?? ""));
  const [step, setStep] = useState(0);

  const domain = step > 0 ? WG_DOMAINS[step - 1] : null;
  const DomainIcon = domain ? DOMAIN_ICON[domain.icon] : User;
  const done = wgComplete(draft.answers);
  const identityDone = draft.patient_label.trim().length > 0 && draft.sex !== "" && draft.age_band !== "";
  const result = useMemo(() => classifyWg(draft.answers), [draft.answers]);
  const isLast = step === WG_DOMAINS.length;
  const progress = ((step + (step === 0 ? (identityDone ? 1 : 0) : draft.answers[domain!.key] ? 1 : 0)) / (WG_DOMAINS.length + 1)) * 100;

  const pick = (level: WgLevel) => {
    const next = { ...draft.answers, [domain!.key]: level };
    setDraft({ ...draft, answers: next });
    if (!isLast) setTimeout(() => setStep((s) => s + 1), 180);
  };

  const canNext = step === 0 ? identityDone : !!draft.answers[domain!.key];

  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-xl">
      <div className="bg-gradient-to-br from-eye-deep via-eye-blue to-eye-teal px-5 pb-5 pt-4 text-primary-foreground">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-eye-gold">
          <Accessibility className="h-4 w-4" /> Disability screening · WG-SS
        </p>
        <h3 className="mt-1 text-lg font-extrabold leading-tight">
          {draft.patient_label.trim() || "New patient"}
        </h3>
        <p className="mt-0.5 text-xs opacity-85">
          Six short Washington Group questions identify functional difficulties so eye care is planned inclusively.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-foreground/25">
            <motion.div className="h-full rounded-full bg-eye-gold" animate={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-semibold tabular-nums">{step + 1} / {WG_DOMAINS.length + 1}</span>
        </div>
      </div>

      <div className="max-h-[52dvh] space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
        <AnimatePresence mode="wait">
          {step === 0 ? (
            <motion.div key="identity" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="flex items-center gap-2 text-sm font-bold"><User className="h-4 w-4 text-eye-blue" /> Patient name or initials</span>
                <Input
                  value={draft.patient_label} autoFocus
                  onChange={(e) => setDraft({ ...draft, patient_label: e.target.value.slice(0, 80) })}
                  placeholder="e.g. Amina B. or Patient 3" className="h-12 text-base"
                />
              </label>
              <div className="space-y-1.5">
                <span className="text-sm font-bold">Sex</span>
                <div className="grid grid-cols-2 gap-2">
                  {SEX_OPTIONS.map((o) => (
                    <button key={o.value} type="button" onClick={() => setDraft({ ...draft, sex: o.value })}
                      className={cn("h-12 rounded-xl border-2 text-sm font-semibold transition",
                        draft.sex === o.value ? "border-eye-blue bg-eye-blue/10 text-eye-deep" : "border-border bg-background hover:border-eye-blue/40")}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-bold">Age band</span>
                <div className="grid grid-cols-3 gap-2">
                  {AGE_BANDS.map((b) => (
                    <button key={b.key} type="button" onClick={() => setDraft({ ...draft, age_band: b.key })}
                      className={cn("h-12 rounded-xl border-2 text-sm font-semibold transition",
                        draft.age_band === b.key ? "border-eye-teal bg-eye-teal/10 text-eye-deep" : "border-border bg-background hover:border-eye-teal/40")}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key={domain!.key} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-eye-blue/10 text-eye-blue">
                  <DomainIcon className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{domain!.label}</p>
                  <p className="mt-0.5 text-base font-medium leading-snug">{domain!.question}</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {WG_LEVELS.map((l) => {
                  const active = draft.answers[domain!.key] === l.value;
                  return (
                    <button key={l.value} type="button" onClick={() => pick(l.value)}
                      className={cn("rounded-2xl border-2 px-4 py-3.5 text-left transition-all min-h-[56px]",
                        active ? `${LEVEL_STYLE[l.value]} shadow-sm` : "border-border bg-background hover:border-eye-blue/40 hover:bg-muted/50")}>
                      <p className="text-sm font-bold">{l.label}</p>
                      <p className="text-xs text-muted-foreground">{l.description}</p>
                    </button>
                  );
                })}
              </div>
              {done && isLast && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={cn("flex items-start gap-2.5 rounded-2xl border p-3 text-sm",
                    result.hasDisability ? "border-eye-blue/40 bg-eye-blue/5" : "border-status-success/40 bg-status-success/5")}>
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-eye-blue" />
                  <p>
                    {result.hasDisability
                      ? <>Classification: <span className="font-bold">person with a disability</span> — {result.disabilityDomains.join(", ")} domain{result.disabilityDomains.length > 1 ? "s" : ""} affected.</>
                      : <>Classification: <span className="font-bold">no disability identified</span> across the six domains.</>}
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
        <Button variant="ghost" size="sm" className="h-11" onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}>
          <ArrowLeft className="mr-1 h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
        </Button>
        {isLast ? (
          <Button size="sm" className="h-11 bg-eye-teal hover:bg-eye-teal/90" disabled={!done || !identityDone}
            onClick={() => onSave(draft, buildWgRecord(draft.answers))}>
            <Check className="mr-1 h-4 w-4" /> Save screening
          </Button>
        ) : (
          <Button size="sm" className="h-11 bg-eye-blue hover:bg-eye-blue/90" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default WgPatientWizard;
