import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, HeartHandshake, Pill, ShieldAlert, Stethoscope, CalendarClock, Share2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MHGAP_MODULES, ESSENTIAL_CARE, EMERGENCY_FLAGS, decide, type MhgapModuleKey } from "@/lib/programmeModule/mhgapEngine";
import { useProjectMhgapDrugs } from "./MhgapDrugsManager";
import type { BeneficiaryServiceRow } from "@/lib/programmeModule/types";

export interface MhgapValue {
  mhgap_module?: MhgapModuleKey;
  mhgap_criteria?: Record<string, boolean>;
  mhgap_level?: string;
  mhgap_medication_indicated?: boolean;
  mhgap_prescriptions?: { drug: string; dose: string }[];
  mhgap_psychosocial?: string[];
}

export const isMentalHealthComponent = (key?: string, label?: string) =>
  /mental|mhpss|psycho/i.test(`${key || ""} ${label || ""}`);

function latestPhq9(services: BeneficiaryServiceRow[]): number | null {
  const rows = services
    .filter((s) => /phq/i.test(`${s.service_name} ${(s.data as Record<string, unknown>)?.instrument ?? ""}`))
    .sort((a, b) => b.service_date.localeCompare(a.service_date));
  for (const r of rows) {
    const d = r.data as Record<string, unknown>;
    const v = Number(d.total_score ?? d.score ?? d.total ?? r.result);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

interface Props {
  projectId: string;
  priorServices: BeneficiaryServiceRow[];
  value: MhgapValue;
  onChange: (v: MhgapValue) => void;
}

const hsl = (h: string, a = 1) => `hsl(${h} / ${a})`;

export default function MhgapSupportEngine({ projectId, priorServices, value, onChange }: Props) {
  const { drugs } = useProjectMhgapDrugs(projectId);
  const [modKey, setModKey] = useState<MhgapModuleKey | undefined>(value.mhgap_module);
  const mod = MHGAP_MODULES.find((m) => m.key === modKey);
  const checked = value.mhgap_criteria || {};
  const phq9 = useMemo(() => latestPhq9(priorServices), [priorServices]);
  const decision = mod ? decide(mod, checked, mod.key === "DEP" ? phq9 : null) : null;
  const rx = value.mhgap_prescriptions || [];

  const eligible = useMemo(() => {
    if (!mod || !decision?.medicationIndicated) return [];
    const registered = new Set(drugs.map((d) => d.drug_name));
    return mod.regimens.filter((r) => registered.has(r.name));
  }, [mod, decision?.medicationIndicated, drugs]);

  useEffect(() => {
    if (!decision) return;
    if (value.mhgap_level !== decision.level || value.mhgap_medication_indicated !== decision.medicationIndicated) {
      onChange({
        ...value,
        mhgap_level: decision.level,
        mhgap_medication_indicated: decision.medicationIndicated,
        mhgap_prescriptions: decision.medicationIndicated ? rx : [],
      });
    }
  }, [decision?.level, decision?.medicationIndicated]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (k: MhgapModuleKey) => {
    setModKey(k);
    onChange({ mhgap_module: k, mhgap_criteria: {}, mhgap_prescriptions: [], mhgap_psychosocial: [] });
  };
  const toggleRx = (drug: string, start: string) => {
    const on = rx.some((p) => p.drug === drug);
    onChange({ ...value, mhgap_prescriptions: on ? rx.filter((p) => p.drug !== drug) : [...rx, { drug, dose: start }] });
  };
  const psy = value.mhgap_psychosocial || [];

  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 text-primary-foreground" style={{ background: "linear-gradient(120deg, hsl(262 70% 50%), hsl(199 85% 42%))" }}>
        <BookOpen className="h-5 w-5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">mhGAP clinical support</p>
          <p className="text-xs opacity-90">WHO mhGAP Intervention Guide 2.0 — assess, decide, manage, follow up</p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Choose the priority condition</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MHGAP_MODULES.map((m) => {
              const on = m.key === modKey;
              return (
                <button key={m.key} type="button" onClick={() => pick(m.key)}
                  className="rounded-lg border p-2 text-left transition-colors"
                  style={{ borderColor: on ? hsl(m.hue) : undefined, background: on ? hsl(m.hue, 0.12) : undefined }}>
                  <span className="block text-[11px] font-bold" style={{ color: hsl(m.hue) }}>{m.short}</span>
                  <span className="block text-xs font-medium leading-tight">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {mod && decision && (
          <>
            <div className="rounded-lg p-3" style={{ background: hsl(mod.hue, 0.08) }}>
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><Stethoscope className="h-4 w-4" style={{ color: hsl(mod.hue) }} />2 · Assess: {mod.label}</p>
              <p className="mb-3 text-xs text-muted-foreground">{mod.summary}</p>
              <div className="space-y-2">
                {mod.criteria.map((cr) => (
                  <label key={cr.id} className="flex cursor-pointer items-start gap-2 rounded-md bg-background/70 p-2 text-sm">
                    <Checkbox checked={!!checked[cr.id]}
                      onCheckedChange={(v) => onChange({ ...value, mhgap_criteria: { ...checked, [cr.id]: !!v } })} />
                    <span className="flex-1">{cr.text}</span>
                    {cr.weight === "red" && <span className="text-[10px] font-bold text-destructive">URGENT</span>}
                    {cr.weight === "caution" && <span className="text-[10px] font-semibold text-muted-foreground">CAUTION</span>}
                  </label>
                ))}
              </div>
            </div>

            <div className={`rounded-lg border p-3 ${decision.emergency ? "border-destructive bg-destructive/10" : decision.medicationIndicated ? "border-primary bg-primary/5" : "bg-muted/40"}`}>
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
                {decision.emergency ? <ShieldAlert className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
                3 · Decision
              </p>
              <p className="text-sm">
                {decision.emergency ? "Emergency — manage immediately and refer."
                  : !decision.meets ? "Criteria not met yet. Continue assessment; give essential care."
                  : decision.medicationIndicated ? "Medication is indicated alongside psychosocial care."
                  : "Psychosocial management — medication not indicated now."}
              </p>
              {[...decision.reasons].map((r) => <p key={r} className="mt-1 text-xs text-muted-foreground">• {r}</p>)}
              {decision.cautions.map((c) => (
                <p key={c} className="mt-1 flex gap-1 text-xs font-medium text-destructive"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{c}</p>
              ))}
            </div>

            {decision.medicationIndicated && mod.medicineClass && (
              <div className="rounded-lg border p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Pill className="h-4 w-4 text-primary" />4 · Registered medications</p>
                {eligible.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No {mod.medicineClass.toLowerCase()}s are registered for this project. An Admin can add them under mhGAP medicines.</p>
                ) : (
                  <div className="space-y-2">
                    {eligible.map((r) => {
                      const sel = rx.find((p) => p.drug === r.name);
                      return (
                        <div key={r.name} className="rounded-md border p-2" style={{ borderColor: sel ? hsl(mod.hue) : undefined, background: sel ? hsl(mod.hue, 0.06) : undefined }}>
                          <label className="flex cursor-pointer items-start gap-2">
                            <Checkbox checked={!!sel} onCheckedChange={() => toggleRx(r.name, r.start)} />
                            <span className="flex-1 text-sm">
                              <span className="font-semibold">{r.name}</span>
                              <span className="block text-xs text-muted-foreground">Start: {r.start} · {r.target}</span>
                              <span className="block text-xs text-destructive/80">{r.cautions}</span>
                            </span>
                          </label>
                          {sel && (
                            <Input className="mt-2 h-8 text-xs" value={sel.dose} placeholder="Dose & frequency"
                              onChange={(e) => onChange({ ...value, mhgap_prescriptions: rx.map((p) => p.drug === r.name ? { ...p, dose: e.target.value } : p) })} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-lg border p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><HeartHandshake className="h-4 w-4 text-primary" />Psychosocial interventions given</p>
              <div className="flex flex-wrap gap-2">
                {mod.psychosocial.map((p) => {
                  const on = psy.includes(p);
                  return (
                    <button key={p} type="button"
                      onClick={() => onChange({ ...value, mhgap_psychosocial: on ? psy.filter((x) => x !== p) : [...psy, p] })}
                      className="rounded-full border px-3 py-1 text-xs"
                      style={{ borderColor: on ? hsl(mod.hue) : undefined, background: on ? hsl(mod.hue, 0.14) : undefined }}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/40 p-3 text-xs">
                <p className="mb-1 flex items-center gap-1 font-semibold"><CalendarClock className="h-3.5 w-3.5" />Follow-up</p>{mod.followUp}
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-xs">
                <p className="mb-1 flex items-center gap-1 font-semibold"><Share2 className="h-3.5 w-3.5" />Refer / consult when</p>
                {mod.referWhen.map((r) => <span key={r} className="block">• {r}</span>)}
              </div>
            </div>
          </>
        )}

        <Accordion type="multiple" className="rounded-lg border">
          <AccordionItem value="ec" className="px-3">
            <AccordionTrigger className="py-2 text-xs font-semibold">Essential care & practice (all conditions)</AccordionTrigger>
            <AccordionContent className="space-y-1 text-xs">{ESSENTIAL_CARE.map((e) => <p key={e}>• {e}</p>)}</AccordionContent>
          </AccordionItem>
          <AccordionItem value="em" className="px-3 last:border-b-0">
            <AccordionTrigger className="py-2 text-xs font-semibold text-destructive">Emergency presentations</AccordionTrigger>
            <AccordionContent className="space-y-1 text-xs">{EMERGENCY_FLAGS.map((e) => <p key={e}>• {e}</p>)}</AccordionContent>
          </AccordionItem>
        </Accordion>
        <p className="text-[11px] text-muted-foreground">Decision support only — apply clinical judgement and national protocols.</p>
      </div>
    </div>
  );
}
