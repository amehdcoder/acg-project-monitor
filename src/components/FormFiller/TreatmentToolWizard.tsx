/**
 * TreatmentToolWizard
 * ────────────────────────────────────────────────────────────────────────
 * Pixel-faithful, app-native multi-step experiences for the two NTD
 * Treatment Data Reporting Tools, replacing the generic form renderer:
 *
 *   1. Community/Village/School Summary Form (Level 1)
 *   2. Community Treatment Register (NTD — Village/School Based Register)
 *
 * Both wizards:
 *   • Drive their State → LGA → Ward → FLHF → Community → Settlement fields
 *     from the microplan via <MdaLocationCascade> (incl. the "received
 *     medicine but not in the microplan" provision and admin state scope).
 *   • Read/write the shared FormFiller `responses` object keyed by question
 *     id (via nameToId), so submission, drafts and analytics keep working.
 *   • Compute live coverage / treatment summaries for an insightful review.
 */
import { useMemo, useState } from "react";
import { MdaLocationCascade } from "@/components/MdaChecklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import fgnEmblem from "@/assets/fgn-emblem.png";
import {
  ArrowLeft, ArrowRight, Check, Minus, Plus, Loader2, Save, Send,
  Users, User, MapPinned, Stethoscope, Box, ClipboardList, ClipboardCheck,
  HeartPulse, PenLine, Search, ChevronRight, CloudOff, CheckCircle2,
  Eye, Ear, Activity, Droplets, AlertTriangle, UserPlus, Syringe,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────
// Shared types
// ──────────────────────────────────────────────────────────────────────────
export type TreatmentTool = "community_summary" | "community_treatment_register";

interface WizardProps {
  tool: TreatmentTool;
  formName: string;
  projectId: string;
  responses: Record<string, any>;
  /** name → question id map (mdaNameToId from FormFiller) */
  nameToId: Record<string, string>;
  /** merge updates into FormFiller responses (keys are question ids / raw keys) */
  onSet: (updates: Record<string, any>) => void;
  stateScope?: string[];
  isSubmitting: boolean;
  isOnline: boolean;
  onSubmit: () => void;
  onSaveDraft: () => void;
  onClose: () => void;
  submitLabel?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Shared primitives
// ──────────────────────────────────────────────────────────────────────────
const StepHeader = ({
  formName, subtitle, steps, active, onExit,
}: {
  formName: string; subtitle: string; steps: string[]; active: number; onExit: () => void;
}) => (
  <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
    <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
      <Button variant="ghost" size="icon" className="shrink-0" onClick={onExit} aria-label="Exit">
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate text-sm font-bold leading-tight text-foreground sm:text-base">{formName}</h1>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <img src={fgnEmblem} alt="" className="h-8 w-8 shrink-0 object-contain" />
    </div>
    {/* Stepper */}
    <div className="mx-auto max-w-2xl px-4 pb-4">
      <div className="flex items-center">
        {steps.map((label, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    done && "bg-status-success text-white",
                    current && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                    !done && !current && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "max-w-[68px] text-center text-[10px] leading-tight",
                    current ? "font-semibold text-primary" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn("mx-1 h-0.5 flex-1 rounded-full", i < active ? "bg-status-success" : "bg-muted")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

const SectionTitle = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) => (
  <div className="mb-4 flex items-start gap-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <Icon className="h-5 w-5" />
    </span>
    <div className="min-w-0">
      <h2 className="text-lg font-bold leading-tight text-foreground">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  </div>
);

const Stepper = ({
  value, onChange, min = 0, compact,
}: { value: number; onChange: (v: number) => void; min?: number; compact?: boolean }) => (
  <div className="flex items-center gap-2">
    <Button
      type="button" variant="outline" size="icon"
      className={cn("rounded-full", compact ? "h-8 w-8" : "h-9 w-9")}
      onClick={() => onChange(Math.max(min, (Number(value) || 0) - 1))}
    >
      <Minus className="h-4 w-4" />
    </Button>
    <Input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Math.max(min, parseInt(e.target.value || "0", 10) || 0))}
      className={cn("text-center font-bold tabular-nums", compact ? "h-8 w-14 px-1" : "h-9 w-16")}
    />
    <Button
      type="button" variant="outline" size="icon"
      className={cn("rounded-full text-primary", compact ? "h-8 w-8" : "h-9 w-9")}
      onClick={() => onChange((Number(value) || 0) + 1)}
    >
      <Plus className="h-4 w-4" />
    </Button>
  </div>
);

const CountCard = ({
  icon: Icon, label, value, onChange, tint = "text-primary",
}: { icon: any; label: string; value: number; onChange: (v: number) => void; tint?: string }) => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-2">
      <Icon className={cn("h-5 w-5", tint)} />
      <span className="text-xs font-medium leading-tight text-foreground">{label}</span>
    </div>
    <div className="text-center text-3xl font-extrabold tabular-nums text-foreground">{value || 0}</div>
    <div className="mt-3 flex items-center justify-between">
      <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => onChange(Math.max(0, (value || 0) - 1))}>
        <Minus className="h-4 w-4" />
      </Button>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-lg text-primary" onClick={() => onChange((value || 0) + 1)}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

const FooterNav = ({
  onBack, onNext, nextLabel = "Next", backLabel = "Back", showBack = true,
  isFinal, isSubmitting, onSubmit, submitLabel = "Submit Form", onSaveDraft,
}: {
  onBack?: () => void; onNext?: () => void; nextLabel?: string; backLabel?: string; showBack?: boolean;
  isFinal?: boolean; isSubmitting?: boolean; onSubmit?: () => void; submitLabel?: string; onSaveDraft?: () => void;
}) => (
  <div
    className="sticky bottom-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur"
    style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
  >
    <div className="mx-auto flex max-w-2xl items-center gap-3">
      {showBack && (
        <Button variant="outline" className="flex-1 gap-2" onClick={onBack} disabled={isSubmitting}>
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Button>
      )}
      {isFinal ? (
        <>
          {onSaveDraft && (
            <Button variant="outline" className="flex-1 gap-2" onClick={onSaveDraft} disabled={isSubmitting}>
              <Save className="h-4 w-4" /> Save Draft
            </Button>
          )}
          <Button variant="acg" className="flex-1 gap-2" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitLabel}
          </Button>
        </>
      ) : (
        <Button variant="acg" className="flex-1 gap-2" onClick={onNext} disabled={isSubmitting}>
          {nextLabel} <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  </div>
);

const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <Label className="mb-1.5 block text-xs font-semibold text-foreground">
    {children} {required && <span className="text-destructive">*</span>}
  </Label>
);

// Medicine display palette (faithful to the mockups)
const MED_TINT: Record<string, string> = {
  ivm: "bg-emerald-600", alb: "bg-sky-600", pzq: "bg-orange-500",
  meb: "bg-violet-600", azt_tabs: "bg-teal-600", azt_pos: "bg-cyan-600", teo: "bg-rose-600",
};

// ──────────────────────────────────────────────────────────────────────────
// Root dispatcher
// ──────────────────────────────────────────────────────────────────────────
const TreatmentToolWizard = (props: WizardProps) => {
  const idFor = (name: string) => props.nameToId[name] || name;
  const get = (name: string) => props.responses[idFor(name)];
  const getNum = (name: string) => Number(props.responses[idFor(name)]) || 0;
  const set = (name: string, value: any) => props.onSet({ [idFor(name)]: value });
  const setNum = (name: string) => (v: number) => set(name, v);

  const cascade = (
    <MdaLocationCascade
      projectId={props.projectId}
      responses={props.responses}
      nameToId={props.nameToId}
      stateScope={props.stateScope}
      onSet={(updates) => props.onSet(updates)}
    />
  );

  if (props.tool === "community_summary") {
    return <CommunitySummaryWizard {...props} get={get} getNum={getNum} set={set} setNum={setNum} cascade={cascade} />;
  }
  return <TreatmentRegisterWizard {...props} get={get} getNum={getNum} set={set} setNum={setNum} cascade={cascade} />;
};

type InnerProps = WizardProps & {
  get: (name: string) => any;
  getNum: (name: string) => number;
  set: (name: string, value: any) => void;
  setNum: (name: string) => (v: number) => void;
  cascade: React.ReactNode;
};

// ══════════════════════════════════════════════════════════════════════════
// 1. Community / Village / School Summary Form (Level 1)
// ══════════════════════════════════════════════════════════════════════════
const SUMMARY_DISEASES = [
  { value: "onchocerciasis", label: "Onchocerciasis" },
  { value: "lymphatic_filariasis", label: "Lymphatic Filariasis" },
  { value: "schistosomiasis", label: "Schistosomiasis" },
  { value: "soil_transmitted_helminths", label: "Soil-Transmitted Helminths" },
  { value: "trachoma", label: "Trachoma" },
];

const PZ_MEDS = [
  { key: "ivm", label: "Ivermectin" },
  { key: "alb", label: "Albendazole" },
  { key: "pzq", label: "Praziquantel" },
  { key: "meb", label: "Mebendazole" },
];
const TRACHOMA_MEDS = [
  { key: "azt_tabs", label: "Azithromycin Tablets" },
  { key: "azt_pos", label: "Azithromycin POS" },
  { key: "teo", label: "Tetracycline Eye Ointment" },
];
const PZ_AGES = [
  { value: "0_4", label: "0–4 yrs" },
  { value: "5_14", label: "5–14 yrs" },
  { value: "15_plus", label: "15+ yrs" },
];
const TR_AGES = [
  { value: "0_5m", label: "0–5 mo" },
  { value: "6m_6y", label: "6mo–6y" },
  { value: "7_15y", label: "7–15y" },
];

const CommunitySummaryWizard = (p: InnerProps) => {
  const [step, setStep] = useState(0);
  const [pzAge, setPzAge] = useState("0_4");
  const [trAge, setTrAge] = useState("0_5m");
  const steps = ["Identification", "Population", "Treatments", "Medicines & CI"];

  // Age-banded treatment matrix is stored under raw keys; schema totals are
  // kept in sync so analytics on the flat fields still work.
  const ages = (group: "pz" | "tr") => (group === "pz" ? PZ_AGES : TR_AGES);
  const matrixKey = (med: string, sex: "m" | "f", age: string) => `${med}_${sex}_${age}`;
  const getCell = (med: string, sex: "m" | "f", age: string) => Number(p.responses[matrixKey(med, sex, age)]) || 0;
  const setCell = (med: string, sex: "m" | "f", age: string, group: "pz" | "tr") => (v: number) => {
    const updates: Record<string, any> = { [matrixKey(med, sex, age)]: v };
    // Recompute schema totals (sum across all age bands for this sex).
    const total = ages(group).reduce((s, a) => s + (a.value === age ? v : getCell(med, sex, a.value)), 0);
    if (med === "azt_tabs") updates[p.nameToId.azt_tabs_treated || "azt_tabs_treated"] =
      ages(group).reduce((s, a) => (a.value === age
        ? s + v + getCell(med, "f", a.value)
        : s + getCell(med, "m", a.value) + getCell(med, "f", a.value)), 0);
    else if (med === "azt_pos") updates[p.nameToId.azt_pos_treated || "azt_pos_treated"] =
      ages(group).reduce((s, a) => (a.value === age
        ? s + v + getCell(med, "f", a.value)
        : s + getCell(med, "m", a.value) + getCell(med, "f", a.value)), 0);
    else if (med === "teo") updates[p.nameToId.teo_treated || "teo_treated"] =
      ages(group).reduce((s, a) => (a.value === age
        ? s + v + getCell(med, "f", a.value)
        : s + getCell(med, "m", a.value) + getCell(med, "f", a.value)), 0);
    else updates[p.nameToId[`${med}_${sex === "m" ? "males" : "females"}_treated`] || `${med}_${sex === "m" ? "males" : "females"}_treated`] = total;
    p.onSet(updates);
  };

  const selectedDiseases: string[] = Array.isArray(p.get("targeted_diseases")) ? p.get("targeted_diseases") : [];
  const toggleDisease = (v: string) => {
    const next = selectedDiseases.includes(v) ? selectedDiseases.filter((d) => d !== v) : [...selectedDiseases, v];
    p.set("targeted_diseases", next);
  };

  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0, behavior: "auto" }); };

  const TreatmentMatrix = ({
    meds, group, age, setAge, title,
  }: { meds: { key: string; label: string }[]; group: "pz" | "tr"; age: string; setAge: (v: string) => void; title: string }) => (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-foreground">{title}</h3>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Select age group</p>
      <div className="mb-4 flex gap-2">
        {ages(group).map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => setAge(a.value)}
            className={cn(
              "flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors",
              age === a.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {meds.map((m) => {
          const males = getCell(m.key, "m", age);
          const females = getCell(m.key, "f", age);
          return (
            <div key={m.key} className="rounded-xl border border-border/70 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", MED_TINT[m.key])} />
                <span className="text-sm font-semibold text-foreground">{m.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">Total: <b className="text-foreground">{males + females}</b></span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">Males treated</p>
                  <Stepper compact value={males} onChange={setCell(m.key, "m", age, group)} />
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">Females treated</p>
                  <Stepper compact value={females} onChange={setCell(m.key, "f", age, group)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const MedInventoryRow = ({ medKey, label }: { medKey: string; label: string }) => {
    const rec = p.getNum(`${medKey}_received`);
    const used = p.getNum(`${medKey}_used`);
    const loss = p.getNum(`${medKey}_loss`);
    return (
      <div className="rounded-xl border border-border/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <Badge variant="secondary" className="tabular-nums">Bal: {rec - used - loss}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: "Received", k: `${medKey}_received` },
            { l: "Used", k: `${medKey}_used` },
            { l: "Loss", k: `${medKey}_loss` },
          ].map((c) => (
            <div key={c.k}>
              <p className="mb-1 text-[10px] text-muted-foreground">{c.l}</p>
              <Stepper compact value={p.getNum(c.k)} onChange={p.setNum(c.k)} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader formName={p.formName} subtitle="Level 1 · NTD Summary" steps={steps} active={step} onExit={p.onClose} />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        {step === 0 && (
          <div className="space-y-4">
            <SectionTitle icon={MapPinned} title="Identification" subtitle="Provide location and reporting details" />
            {p.cascade}
            <div>
              <FieldLabel required>Targeted Disease(s) Treated</FieldLabel>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SUMMARY_DISEASES.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDisease(d.value)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      selectedDiseases.includes(d.value) ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <Checkbox checked={selectedDiseases.includes(d.value)} className="pointer-events-none" />
                    <span className="text-foreground">{d.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel required>Annual Treatment Round</FieldLabel>
                <Input value={p.get("annual_treatment_round") || ""} onChange={(e) => p.set("annual_treatment_round", e.target.value)} placeholder="e.g., 1, 2, 2024" />
              </div>
              <div>
                <FieldLabel required>Reporting Date</FieldLabel>
                <Input type="date" value={p.get("reporting_date") || ""} onChange={(e) => p.set("reporting_date", e.target.value)} />
              </div>
              <div>
                <FieldLabel required>Start Date of Treatment</FieldLabel>
                <Input type="date" value={p.get("start_date_treatment") || ""} onChange={(e) => p.set("start_date_treatment", e.target.value)} />
              </div>
              <div>
                <FieldLabel required>End Date of Treatment</FieldLabel>
                <Input type="date" value={p.get("end_date_treatment") || ""} onChange={(e) => p.set("end_date_treatment", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <SectionTitle icon={Users} title="Registered Population" subtitle="Enter population and household figures" />
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">General Population</p>
            <div className="grid grid-cols-2 gap-3">
              <CountCard icon={User} label="Number of Males" value={p.getNum("pop_males")} onChange={p.setNum("pop_males")} tint="text-sky-600" />
              <CountCard icon={User} label="Number of Females" value={p.getNum("pop_females")} onChange={p.setNum("pop_females")} tint="text-rose-500" />
              <CountCard icon={Users} label="Total Households / Arms of Class" value={p.getNum("total_households")} onChange={p.setNum("total_households")} tint="text-emerald-600" />
              <CountCard icon={Users} label="Total Children 0–4 years" value={p.getNum("children_0_4")} onChange={p.setNum("children_0_4")} tint="text-orange-500" />
              <CountCard icon={Users} label="Total Children 5–14 years" value={p.getNum("children_5_14")} onChange={p.setNum("children_5_14")} tint="text-violet-600" />
              <CountCard icon={Users} label="Total Persons 15 years and above" value={p.getNum("persons_15_plus")} onChange={p.setNum("persons_15_plus")} tint="text-teal-600" />
            </div>
            <p className="pt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Trachoma Age Bands</p>
            <div className="space-y-2">
              {[
                { k: "trachoma_0_5m", l: "0–5 months" },
                { k: "trachoma_6m_6y", l: "6 months – 6 years" },
                { k: "trachoma_7_15y", l: "7–15 years" },
              ].map((b) => (
                <div key={b.k} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                  <span className="text-sm font-medium text-foreground">{b.l}</span>
                  <Stepper value={p.getNum(b.k)} onChange={p.setNum(b.k)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <SectionTitle icon={Stethoscope} title="Treatments" subtitle="Record treatments by age and sex" />
            <TreatmentMatrix meds={PZ_MEDS} group="pz" age={pzAge} setAge={setPzAge} title="Treatment (Oncho, LF, Schisto, STH)" />
            <TreatmentMatrix meds={TRACHOMA_MEDS} group="tr" age={trAge} setAge={setTrAge} title="Treatment (Trachoma)" />
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-bold text-foreground">Adverse Events</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Total number of adverse events</span>
                  <Stepper compact value={p.getNum("adverse_events_total")} onChange={p.setNum("adverse_events_total")} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">No. of cases referred to health facility</span>
                  <Stepper compact value={p.getNum("adverse_events_referred")} onChange={p.setNum("adverse_events_referred")} />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-violet-600" />
                <h3 className="text-sm font-bold text-foreground">Disability Status Treatment</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { k: "disab_visually_impaired", l: "Visually Impaired", icon: Eye },
                  { k: "disab_hearing_impaired", l: "Hearing Impaired", icon: Ear },
                  { k: "disab_lymphoedema", l: "Lymphoedema", icon: Activity },
                  { k: "disab_hydrocele", l: "Hydrocele", icon: Droplets },
                  { k: "disab_others", l: "Others", icon: Plus },
                ].map((d) => (
                  <div key={d.k} className="flex flex-col items-center gap-2 rounded-xl border border-border/70 p-3">
                    <d.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-center text-[11px] leading-tight text-foreground">{d.l}</span>
                    <Stepper compact value={p.getNum(d.k)} onChange={p.setNum(d.k)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <SectionTitle icon={Box} title="Medicines / Drug Management" subtitle="Record inventory for each medicine" />
            <div className="space-y-2">
              {[
                { k: "ivm", l: "Ivermectin" }, { k: "alb", l: "Albendazole" },
                { k: "pzq_tab", l: "Praziquantel (TAB)" }, { k: "meb", l: "Mebendazole" },
                { k: "azt_tab", l: "Azithromycin (TAB)" }, { k: "teo", l: "Tetracycline Eye Ointment" },
              ].map((m) => <MedInventoryRow key={m.k} medKey={m.k} label={m.l} />)}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">CI (CDDs or Teachers) Information</h3>
              </div>
              <div className="space-y-3">
                {[
                  { k: "ci_males", l: "Number of Male CIs" },
                  { k: "ci_females", l: "Number of Female CIs" },
                  { k: "ci_total", l: "Total Number of CIs" },
                  { k: "ci_trained", l: "Number of Trained CIs" },
                ].map((c) => (
                  <div key={c.k} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{c.l}</span>
                    <Stepper compact value={p.getNum(c.k)} onChange={p.setNum(c.k)} />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Signatures</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Community Distributor / Teacher — Name</FieldLabel>
                  <Input value={p.get("sign_cdd_teacher") || ""} onChange={(e) => p.set("sign_cdd_teacher", e.target.value)} placeholder="Full name & date" />
                </div>
                <div>
                  <FieldLabel>Community Supervisor / Head Teacher — Name</FieldLabel>
                  <Input value={p.get("sign_supervisor") || ""} onChange={(e) => p.set("sign_supervisor", e.target.value)} placeholder="Full name & date" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <FooterNav
        showBack={step > 0}
        onBack={() => go(step - 1)}
        onNext={() => go(step + 1)}
        isFinal={step === steps.length - 1}
        isSubmitting={p.isSubmitting}
        onSubmit={p.onSubmit}
        onSaveDraft={p.onSaveDraft}
        submitLabel={p.submitLabel || "Submit Form"}
      />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// 2. Community Treatment Register (NTD — Village/School Based Register)
// ══════════════════════════════════════════════════════════════════════════
interface RosterPerson {
  id: string;
  name: string;
  sex: "Male" | "Female" | "";
  ageBand: "0_4" | "5_14" | "15_plus" | "";
  disability: "Normal" | "Disabled";
  meds: Record<string, number>;
  treated: boolean;
  remark: string;
}

const REG_MEDS = [
  { key: "ivm", label: "IVM" }, { key: "alb", label: "ALB" }, { key: "pzq", label: "PZQ" },
  { key: "meb", label: "MEB" }, { key: "azt_tabs", label: "AZT Tabs" },
  { key: "azt_pos", label: "AZT Pos" }, { key: "teo", label: "TEO" },
];
const AGE_LABEL: Record<string, string> = { "0_4": "0–4", "5_14": "5–14", "15_plus": "15+" };

const blankPerson = (): RosterPerson => ({
  id: Math.random().toString(36).slice(2, 9),
  name: "", sex: "", ageBand: "", disability: "Normal",
  meds: {}, treated: false, remark: "",
});

const TreatmentRegisterWizard = (p: InnerProps) => {
  const [step, setStep] = useState(0);
  const steps = ["Setup", "Roster", "Treatment", "Review"];

  const roster: RosterPerson[] = Array.isArray(p.responses.treatment_roster) ? p.responses.treatment_roster : [];
  const setRoster = (next: RosterPerson[]) => {
    const males = next.filter((r) => r.sex === "Male").length;
    const females = next.filter((r) => r.sex === "Female").length;
    p.onSet({
      treatment_roster: next,
      [p.nameToId.persons_registered || "persons_registered"]: next.length,
      [p.nameToId.persons_treated || "persons_treated"]: next.filter((r) => r.treated).length,
      _roster_males: males, _roster_females: females,
    });
  };

  const [activePerson, setActivePerson] = useState(0);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [draftPerson, setDraftPerson] = useState<RosterPerson>(blankPerson());

  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0, behavior: "auto" }); };

  const updatePerson = (idx: number, patch: Partial<RosterPerson>) => {
    setRoster(roster.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return roster.map((r, i) => ({ r, i })).filter(({ r }) => !s || r.name.toLowerCase().includes(s));
  }, [roster, search]);

  // ── Review computations ────────────────────────────────────────────────
  const summary = useMemo(() => {
    const bands = ["0_4", "5_14", "15_plus"];
    const byBand: Record<string, { m: number; f: number }> = {};
    bands.forEach((b) => (byBand[b] = { m: 0, f: 0 }));
    let male = 0, female = 0;
    const medCov: Record<string, number> = {};
    REG_MEDS.forEach((m) => (medCov[m.key] = 0));
    roster.forEach((r) => {
      if (r.sex === "Male") male++; else if (r.sex === "Female") female++;
      if (r.ageBand && byBand[r.ageBand]) {
        if (r.sex === "Male") byBand[r.ageBand].m++;
        else if (r.sex === "Female") byBand[r.ageBand].f++;
      }
      REG_MEDS.forEach((m) => { if ((r.meds[m.key] || 0) > 0) medCov[m.key]++; });
    });
    const treated = roster.filter((r) => r.treated).length;
    const aztTeo = roster.filter((r) => REG_MEDS.slice(4).some((m) => (r.meds[m.key] || 0) > 0)).length;
    return { byBand, male, female, total: roster.length, treated, medCov, aztTeo };
  }, [roster]);

  const pct = (n: number) => (summary.total ? Math.round((n / summary.total) * 100) : 0);



  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader formName="NTD Treatment Register" subtitle="Village/School Based Register" steps={steps} active={step} onExit={p.onClose} />
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        {step === 0 && (
          <div className="space-y-4">
            <SectionTitle icon={ClipboardList} title="Register Setup" subtitle="Enter location and register details" />
            {p.cascade}
            <p className="pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Team &amp; Contacts</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><FieldLabel required>Name of CDD</FieldLabel><Input value={p.get("cdd_name") || ""} onChange={(e) => p.set("cdd_name", e.target.value)} placeholder="Enter name" /></div>
              <div><FieldLabel>CDD Phone No.</FieldLabel><Input value={p.get("cdd_phone") || ""} onChange={(e) => p.set("cdd_phone", e.target.value)} placeholder="0803 123 4567" /></div>
              <div><FieldLabel>Name of Village Head</FieldLabel><Input value={p.get("village_head_name") || ""} onChange={(e) => p.set("village_head_name", e.target.value)} placeholder="Enter name" /></div>
              <div><FieldLabel>Village Head Phone No.</FieldLabel><Input value={p.get("village_head_phone") || ""} onChange={(e) => p.set("village_head_phone", e.target.value)} placeholder="0803 123 4567" /></div>
              <div><FieldLabel>Name of Teacher</FieldLabel><Input value={p.get("teacher_name") || ""} onChange={(e) => p.set("teacher_name", e.target.value)} placeholder="Enter name" /></div>
              <div><FieldLabel>Head Teacher</FieldLabel><Input value={p.get("head_teacher_name") || ""} onChange={(e) => p.set("head_teacher_name", e.target.value)} placeholder="Enter name" /></div>
            </div>
            <p className="pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Register Details</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><FieldLabel required>Date of Treatment</FieldLabel><Input type="date" value={p.get("date_treatment") || ""} onChange={(e) => p.set("date_treatment", e.target.value)} /></div>
              <div><FieldLabel required>Household No.</FieldLabel><Input value={p.get("household_no") || ""} onChange={(e) => p.set("household_no", e.target.value)} placeholder="HH-001" /></div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <SectionTitle icon={Users} title="Household / Person Roster" subtitle="Add all persons in this household" />
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-border bg-card p-3 text-center shadow-sm">
                <Users className="mx-auto mb-1 h-4 w-4 text-primary" />
                <p className="text-[11px] text-muted-foreground">Total Persons</p>
                <p className="text-2xl font-extrabold text-foreground">{summary.total}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3 text-center shadow-sm">
                <User className="mx-auto mb-1 h-4 w-4 text-sky-600" />
                <p className="text-[11px] text-muted-foreground">Male</p>
                <p className="text-2xl font-extrabold text-foreground">{summary.male}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3 text-center shadow-sm">
                <User className="mx-auto mb-1 h-4 w-4 text-rose-500" />
                <p className="text-[11px] text-muted-foreground">Female</p>
                <p className="text-2xl font-extrabold text-foreground">{summary.female}</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or S/N" className="pl-9" />
            </div>
            <div className="space-y-2">
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No persons yet. Tap “Add Person” to begin.</p>
              )}
              {filtered.map(({ r, i }) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setActivePerson(i); go(2); }}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/40"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                      {r.name || "Unnamed"}
                      <span className={cn("h-2 w-2 rounded-full", r.sex === "Male" ? "bg-sky-500" : r.sex === "Female" ? "bg-rose-500" : "bg-muted-foreground")} />
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {r.sex || "—"} · {r.ageBand ? `${AGE_LABEL[r.ageBand]} yrs` : "—"}
                    </p>
                  </div>
                  <Badge variant={r.disability === "Disabled" ? "secondary" : "outline"} className="text-[10px]">
                    {r.disability}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>

            {adding ? (
              <div className="rounded-2xl border border-primary/40 bg-card p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold text-foreground">New Person</h3>
                <div className="space-y-3">
                  <div><FieldLabel required>Full Name</FieldLabel><Input value={draftPerson.name} onChange={(e) => setDraftPerson({ ...draftPerson, name: e.target.value })} placeholder="Enter full name" /></div>
                  <div>
                    <FieldLabel required>Sex</FieldLabel>
                    <div className="flex gap-2">
                      {(["Male", "Female"] as const).map((s) => (
                        <button key={s} type="button" onClick={() => setDraftPerson({ ...draftPerson, sex: s })}
                          className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium", draftPerson.sex === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground")}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel required>Age Band</FieldLabel>
                    <div className="flex gap-2">
                      {(["0_4", "5_14", "15_plus"] as const).map((a) => (
                        <button key={a} type="button" onClick={() => setDraftPerson({ ...draftPerson, ageBand: a })}
                          className={cn("flex-1 rounded-lg border px-2 py-2 text-xs font-medium", draftPerson.ageBand === a ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground")}>
                          {AGE_LABEL[a]} yrs
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Disability Status</FieldLabel>
                    <div className="flex gap-2">
                      {(["Normal", "Disabled"] as const).map((d) => (
                        <button key={d} type="button" onClick={() => setDraftPerson({ ...draftPerson, disability: d })}
                          className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-medium", draftPerson.disability === d ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground")}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1" onClick={() => { setAdding(false); setDraftPerson(blankPerson()); }}>Cancel</Button>
                    <Button variant="acg" className="flex-1"
                      disabled={!draftPerson.name || !draftPerson.sex || !draftPerson.ageBand}
                      onClick={() => { setRoster([...roster, draftPerson]); setAdding(false); setDraftPerson(blankPerson()); }}>
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full gap-2 border-dashed" onClick={() => setAdding(true)}>
                <UserPlus className="h-4 w-4" /> Add Person
              </Button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <SectionTitle icon={Syringe} title="Medicines & Treatment" subtitle="Record medicines given per person" />
            {roster.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Add at least one person on the Roster step first.</p>
            ) : (() => {
              const idx = Math.min(activePerson, roster.length - 1);
              const person = roster[idx];
              return (
                <>
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User className="h-5 w-5" />
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{idx + 1}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{person.name || "Unnamed"}</p>
                      <p className="text-[11px] text-muted-foreground">{person.sex || "—"} · {person.ageBand ? `${AGE_LABEL[person.ageBand]} yrs` : "—"} · {person.disability}</p>
                    </div>
                  </div>

                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Medicines Given <span className="font-normal normal-case text-muted-foreground/70">(0 if not given)</span></p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {REG_MEDS.map((m) => (
                      <div key={m.key} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                        <span className={cn("mb-2 inline-block rounded-md px-2 py-0.5 text-[11px] font-bold text-white", MED_TINT[m.key])}>{m.label}</span>
                        <Stepper compact value={person.meds[m.key] || 0} onChange={(v) => updatePerson(idx, { meds: { ...person.meds, [m.key]: v } })} />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                    <span className="text-sm font-semibold text-foreground">Treated?</span>
                    <div className="flex gap-2">
                      {([true, false] as const).map((t) => (
                        <button key={String(t)} type="button" onClick={() => updatePerson(idx, { treated: t })}
                          className={cn("rounded-lg border px-4 py-1.5 text-sm font-medium", person.treated === t ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground")}>
                          {t ? "Yes" : "No"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Remark (optional)</FieldLabel>
                    <Textarea value={person.remark} onChange={(e) => updatePerson(idx, { remark: e.target.value })} rows={2} placeholder="Enter any remark" />
                  </div>

                  <div className="flex items-center gap-3">
                    <Button variant="outline" className="flex-1 gap-2" disabled={idx === 0} onClick={() => setActivePerson(idx - 1)}>
                      <ArrowLeft className="h-4 w-4" /> Previous
                    </Button>
                    {idx < roster.length - 1 ? (
                      <Button variant="acg" className="flex-1 gap-2" onClick={() => setActivePerson(idx + 1)}>
                        Next Person <ArrowRight className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="acg" className="flex-1 gap-2" onClick={() => go(3)}>
                        Review <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <SectionTitle icon={ClipboardCheck} title="Review & Submission" subtitle="Confirm and submit treatment register" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                <Users className="mx-auto mb-1 h-5 w-5 text-primary" />
                <p className="text-[11px] text-muted-foreground">Registered Population</p>
                <p className="text-2xl font-extrabold text-foreground">{summary.total}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-status-success" />
                <p className="text-[11px] text-muted-foreground">Persons Treated</p>
                <p className="text-2xl font-extrabold text-foreground">{summary.treated}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-status-success/30 bg-status-success/5 p-4 text-center">
              <p className="text-[11px] font-semibold text-muted-foreground">Total Treated with AZT / TEO</p>
              <p className="text-2xl font-extrabold text-status-success">{summary.aztTeo}</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-1 text-sm font-bold text-foreground">Treatment Summary</h3>
              <p className="mb-3 text-[11px] text-muted-foreground">By age / sex</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                    <th className="py-1.5 font-medium">Age Band</th>
                    <th className="py-1.5 text-center font-medium">Male</th>
                    <th className="py-1.5 text-center font-medium">Female</th>
                    <th className="py-1.5 text-center font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.byBand).map(([band, v]) => (
                    <tr key={band} className="border-b border-border/50">
                      <td className="py-1.5 text-foreground">{AGE_LABEL[band]} yrs</td>
                      <td className="py-1.5 text-center tabular-nums">{v.m || "–"}</td>
                      <td className="py-1.5 text-center tabular-nums">{v.f || "–"}</td>
                      <td className="py-1.5 text-center font-semibold tabular-nums">{v.m + v.f || 0}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="py-1.5 text-foreground">Total</td>
                    <td className="py-1.5 text-center tabular-nums">{summary.male}</td>
                    <td className="py-1.5 text-center tabular-nums">{summary.female}</td>
                    <td className="py-1.5 text-center tabular-nums">{summary.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-foreground">Medicine Coverage</h3>
              <div className="grid grid-cols-3 gap-2">
                {REG_MEDS.map((m) => (
                  <div key={m.key} className="rounded-xl border border-border/70 p-2 text-center">
                    <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white", MED_TINT[m.key])}>{m.label}</span>
                    <p className="mt-1 text-xs font-semibold text-foreground tabular-nums">{summary.medCov[m.key]} / {summary.total}</p>
                    <p className="text-[11px] text-muted-foreground">{pct(summary.medCov[m.key])}%</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-foreground">Roster Preview ({summary.total})</h3>
              <div className="space-y-1.5">
                {roster.slice(0, 4).map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-muted-foreground">{i + 1}</span>
                    <span className="flex-1 truncate text-foreground">{r.name || "Unnamed"}</span>
                    <span className="text-muted-foreground">{r.sex?.[0] || "—"}</span>
                    <span className="text-muted-foreground">{r.ageBand ? AGE_LABEL[r.ageBand] : "—"}</span>
                    {r.treated ? <Check className="h-3.5 w-3.5 text-status-success" /> : <span className="text-muted-foreground">–</span>}
                  </div>
                ))}
                {summary.total > 4 && <p className="text-[11px] text-muted-foreground">… and {summary.total - 4} more</p>}
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {p.isOnline ? <CheckCircle2 className="h-4 w-4 text-status-success" /> : <CloudOff className="h-4 w-4" />}
              <span>{p.isOnline ? "Online · data will sync immediately" : "Offline · data saved on this device, will sync when connection is available"}</span>
            </div>

            <div>
              <FieldLabel>General remarks</FieldLabel>
              <Textarea value={p.get("register_remarks") || ""} onChange={(e) => p.set("register_remarks", e.target.value)} rows={3} placeholder="Enter any remark" />
            </div>
            <div>
              <FieldLabel>Recorder Signature — Name</FieldLabel>
              <Input value={p.get("register_signature") || ""} onChange={(e) => p.set("register_signature", e.target.value)} placeholder="Full name & date" />
            </div>
          </div>
        )}
      </div>

      <FooterNav
        showBack={step > 0}
        onBack={() => go(step - 1)}
        onNext={() => go(step + 1)}
        isFinal={step === steps.length - 1}
        isSubmitting={p.isSubmitting}
        onSubmit={p.onSubmit}
        onSaveDraft={p.onSaveDraft}
        submitLabel={p.submitLabel || "Submit Register"}
      />
    </div>
  );
};

export default TreatmentToolWizard;
