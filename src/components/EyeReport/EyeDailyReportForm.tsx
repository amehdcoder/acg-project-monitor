import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Building2, CalendarDays, Check, CloudOff, Eye, Glasses, Loader2, ScanEye, Scissors,
  Sparkles, Stethoscope, AlertTriangle, ShieldCheck, Accessibility, X, ClipboardSignature,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import hero from "@/assets/eye-report/hero.jpg";
import {
  AGE_BANDS, LENS_TYPES, SURGERY_ITEMS, emptyCsom, emptySummary, normCsom, normSummary, pct, t, totals, validateReport, vaTotal,
  type EyeCsom, type EyeReportRow, type EyeSummary, type MF, type VaBand,
} from "@/lib/eyeReport/definition";
import { saveDeviceReport, saveReport } from "@/lib/eyeReport/store";

export interface EyeFacility { id: string; name: string; state?: string | null; lga?: string | null }
type Mode = { kind: "user"; userId: string } | { kind: "device"; deviceId: string; label: string };
interface Props {
  projectId: string; projectName?: string; facilities: EyeFacility[]; mode: Mode;
  existing?: EyeReportRow | null; otherReports?: EyeReportRow[]; onClose: () => void; onSaved?: () => void;
}

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const STEPS = [
  { key: "who", label: "Facility & date", icon: Building2, tone: "bg-eye-blue" },
  { key: "consult", label: "Consultations", icon: Stethoscope, tone: "bg-eye-blue" },
  { key: "surgery", label: "Surgeries", icon: Scissors, tone: "bg-eye-teal" },
  { key: "refraction", label: "Refraction & glasses", icon: Glasses, tone: "bg-eye-violet" },
  { key: "csom", label: "CSOM episode", icon: ScanEye, tone: "bg-eye-teal" },
  { key: "review", label: "Review & sign-off", icon: ClipboardSignature, tone: "bg-eye-orange" },
] as const;

function NumberCell({ value, onChange, label, invalid }: { value: number; onChange: (v: number) => void; label: string; invalid?: boolean }) {
  return (
    <Input
      inputMode="numeric" aria-label={label} value={value === 0 ? "" : String(value)} placeholder="0"
      onChange={(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 5); onChange(d ? Number(d) : 0); }}
      className={`h-12 text-center text-lg font-semibold tabular-nums ${invalid ? "border-destructive ring-1 ring-destructive" : ""}`}
    />
  );
}

function MFRow({ label, icon: Icon, value, onChange, invalid, tone = "text-eye-blue" }: { label: string; icon?: any; value: MF; onChange: (v: MF) => void; invalid?: boolean; tone?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto] items-center gap-2 rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-2">{Icon && <Icon className={`h-4 w-4 shrink-0 ${tone}`} />}<span className="text-sm font-semibold leading-tight">{label}</span></div>
      <NumberCell label={`${label} male`} value={value.m} invalid={invalid} onChange={(m) => onChange({ ...value, m })} />
      <NumberCell label={`${label} female`} value={value.f} invalid={invalid} onChange={(f) => onChange({ ...value, f })} />
      <span className="min-w-12 rounded-xl bg-eye-gold/20 px-2 py-3 text-center text-base font-bold tabular-nums text-eye-ink">{t(value)}</span>
    </div>
  );
}
const MFHead = () => (
  <div className="grid grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto] gap-2 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
    <span /><span className="text-center">Male</span><span className="text-center">Female</span><span className="min-w-12 text-center">Total</span>
  </div>
);

function VaTable({ title, colA, colB, a, b, onA, onB, ceiling }: { title: string; colA: string; colB: string; a: VaBand; b: VaBand; onA: (v: VaBand) => void; onB: (v: VaBand) => void; ceiling: number }) {
  const rows = [["good", "Good (6/6 – 6/12)", "bg-status-success/10"], ["borderline", "Borderline (6/18 – 6/60)", "bg-eye-gold/15"], ["poor", "Poor (< 6/60)", "bg-eye-rose/10"]] as const;
  const ta = vaTotal(a), tb = vaTotal(b);
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between bg-eye-teal px-4 py-2.5 text-primary-foreground"><span className="text-sm font-bold">{title}</span><span className="text-xs opacity-80">of {ceiling} surgeries</span></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead><tr className="bg-eye-sky text-[11px] uppercase tracking-wider text-eye-deep"><th className="p-2 text-left">Outcome</th><th className="p-2" colSpan={2}>{colA}</th><th className="p-2" colSpan={2}>{colB}</th></tr></thead>
          <tbody>
            {rows.map(([k, label, bg]) => (
              <tr key={k} className={bg}>
                <td className="p-2 font-semibold">{label}</td>
                <td className="w-20 p-1.5"><NumberCell label={`${title} ${colA} ${k}`} value={a[k]} onChange={(v) => onA({ ...a, [k]: v })} /></td>
                <td className="w-16 p-1 text-center text-xs font-bold text-eye-teal">{pct(a[k], ta)}%</td>
                <td className="w-20 p-1.5"><NumberCell label={`${title} ${colB} ${k}`} value={b[k]} onChange={(v) => onB({ ...b, [k]: v })} /></td>
                <td className="w-16 p-1 text-center text-xs font-bold text-eye-teal">{pct(b[k], tb)}%</td>
              </tr>
            ))}
            <tr className="bg-eye-deep font-bold text-primary-foreground"><td className="p-2">Total</td><td className="p-2 text-center">{ta}</td><td className="p-2 text-center">{ta ? "100%" : "–"}</td><td className="p-2 text-center">{tb}</td><td className="p-2 text-center">{tb ? "100%" : "–"}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EyeDailyReportForm({ projectId, projectName, facilities, mode, existing, otherReports = [], onClose, onSaved }: Props) {
  const draftKey = `eye-report-draft:${projectId}:${mode.kind === "user" ? mode.userId : mode.deviceId}`;
  const initial = useMemo(() => {
    if (existing) return { facilityId: existing.facility_id ?? "", facility: existing.facility_name, state: existing.state ?? "", lga: existing.lga ?? "", date: existing.report_date, summary: normSummary(existing.summary), csom: normCsom(existing.csom), notes: existing.notes ?? "", prepared: existing.prepared_by ?? "", confirmed: existing.confirmed_by ?? "" };
    try { const d = JSON.parse(localStorage.getItem(draftKey) || "null"); if (d) return { ...d, summary: normSummary(d.summary), csom: normCsom(d.csom) }; } catch { /* ignore */ }
    const only = facilities.length === 1 ? facilities[0] : null;
    return { facilityId: only?.id ?? "", facility: only?.name ?? "", state: only?.state ?? "", lga: only?.lga ?? "", date: today(), summary: emptySummary(), csom: null as EyeCsom | null, notes: "", prepared: mode.kind === "device" ? mode.label : "", confirmed: "" };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [f, setF] = useState(initial);
  const [step, setStep] = useState(0);
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const a = () => setOnline(true), b = () => setOnline(false); addEventListener("online", a); addEventListener("offline", b); return () => { removeEventListener("online", a); removeEventListener("offline", b); }; }, []);
  useEffect(() => { if (!existing) localStorage.setItem(draftKey, JSON.stringify(f)); }, [f, existing, draftKey]);

  const S = f.summary; const T = totals(S);
  const cataract = t(S.surgery.cataract);
  // The CSOM episode is unlocked by cataract surgeries and keeps its total in step.
  useEffect(() => {
    setF((p: any) => {
      if (cataract === 0 && !p.csom) return p;
      const c = p.csom ?? emptyCsom();
      return c.surgeries === cataract ? (p.csom ? p : { ...p, csom: c }) : { ...p, csom: { ...c, surgeries: cataract } };
    });
  }, [cataract]);

  const setS = (fn: (s: EyeSummary) => void) => setF((p: any) => { const s = structuredClone(p.summary); fn(s); return { ...p, summary: s }; });
  const setC = (fn: (c: EyeCsom) => void) => setF((p: any) => { const c = structuredClone(p.csom ?? emptyCsom()); fn(c); return { ...p, csom: c }; });

  const csomForValidation = cataract > 0 ? f.csom : null;
  const issues = validateReport({ facility: f.facility, date: f.date, summary: S, csom: csomForValidation, today: today() });
  const dup = otherReports.find((r) => r.id !== existing?.id && r.report_date === f.date && r.facility_name.toLowerCase() === f.facility.trim().toLowerCase());
  if (dup) issues.unshift({ field: "date", message: `A report for ${f.facility} on ${f.date} already exists. Edit that report instead.`, level: "error" });
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const has = (prefix: string) => errors.some((e) => e.field.startsWith(prefix));
  const steps = STEPS.filter((s) => s.key !== "csom" || cataract > 0);
  const cur = steps[Math.min(step, steps.length - 1)];
  const stepErrors = (key: string) => errors.filter((e) => (key === "who" ? ["facility", "date"].includes(e.field) : key === "consult" ? e.field.startsWith("pwd") || e.field.startsWith("consult") : key === "surgery" ? e.field.startsWith("surgery") : key === "refraction" ? e.field.startsWith("lenses") || e.field.startsWith("glasses") : key === "csom" ? e.field.startsWith("csom.") : false));

  const submit = async () => {
    if (errors.length) { toast.error(errors[0].message); return; }
    if (warnings.length && !ack) { toast.warning("Please confirm the highlighted checks before saving."); return; }
    setSaving(true);
    try {
      const payload = { id: existing?.id, project_id: projectId, facility_id: f.facilityId || null, facility_name: f.facility.trim(), state: f.state || null, lga: f.lga || null, report_date: f.date, summary: S, csom: cataract > 0 ? f.csom : null, notes: f.notes.trim() || null, prepared_by: f.prepared.trim() || null, confirmed_by: f.confirmed.trim() || null };
      if (mode.kind === "device") { await saveDeviceReport(payload as any, { deviceId: mode.deviceId, projectId, label: mode.label }); toast.success(navigator.onLine ? "Report saved and sending" : "Saved on this device — it will send when you are back online"); }
      else { const r = await saveReport(payload as any, mode.userId, !!existing); toast.success(r.queued ? "Saved offline — it will sync automatically" : "Daily report submitted"); }
      localStorage.removeItem(draftKey);
      onSaved?.(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the report"); }
    finally { setSaving(false); }
  };

  const kpis = [
    { label: "Consulted", value: t(T.consulted), icon: Stethoscope, cls: "bg-eye-blue" },
    { label: "Surgeries", value: t(T.surgeries), icon: Scissors, cls: "bg-eye-teal" },
    { label: "Lenses", value: t(T.lenses), icon: Eye, cls: "bg-eye-violet" },
    { label: "Glasses", value: t(T.glasses), icon: Glasses, cls: "bg-eye-orange" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-eye-sky/60">
      <header className="relative shrink-0 overflow-hidden bg-eye-deep text-primary-foreground">
        <img src={hero} alt="" width={1600} height={640} className="absolute inset-0 h-full w-full object-cover object-right opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-r from-eye-deep via-eye-deep/90 to-eye-deep/30" />
        <div className="relative mx-auto flex max-w-5xl items-start justify-between gap-3 px-4 py-4 sm:py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-eye-gold">State Ministry of Health · Primary Eye Care</p>
            <h1 className="mt-1 text-xl font-extrabold leading-tight sm:text-2xl">Eye Health Daily Facility Report</h1>
            <p className="mt-0.5 truncate text-xs opacity-80">{projectName}{!online && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-eye-gold px-2 py-0.5 font-semibold text-eye-ink"><CloudOff className="h-3 w-3" /> Offline — saving on device</span>}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close" className="shrink-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><X className="h-5 w-5" /></Button>
        </div>
        <nav className="relative mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-4 pb-3" aria-label="Report steps">
          {steps.map((s, i) => {
            const done = i < step && stepErrors(s.key).length === 0; const active = i === step;
            return (
              <button key={s.key} type="button" onClick={() => setStep(i)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-eye-gold bg-eye-gold text-eye-ink" : "border-primary-foreground/20 bg-primary-foreground/10"} ${s.key === "csom" && !active ? "animate-pulse border-eye-gold/70" : ""}`}>
                {done ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}{i + 1}. {s.label}
                {stepErrors(s.key).length > 0 && i < step && <span className="h-2 w-2 rounded-full bg-eye-rose" />}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="shrink-0 border-b bg-card">
        <div className="mx-auto grid max-w-5xl grid-cols-4 gap-2 px-4 py-2">
          {kpis.map((k) => (
            <div key={k.label} className="flex items-center gap-2 rounded-xl border bg-background px-2 py-1.5">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${k.cls} text-primary-foreground`}><k.icon className="h-3.5 w-3.5" /></span>
              <div className="min-w-0"><p className="text-base font-extrabold leading-none tabular-nums">{k.value}</p><p className="truncate text-[10px] text-muted-foreground">{k.label}</p></div>
            </div>
          ))}
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <AnimatePresence mode="wait">
            <motion.section key={cur.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }} className="space-y-3">
              {cur.key === "who" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5 rounded-2xl border bg-card p-4 shadow-sm md:col-span-2">
                    <span className="flex items-center gap-2 text-sm font-bold"><Building2 className="h-4 w-4 text-eye-blue" /> Reporting facility</span>
                    {facilities.length > 0 ? (
                      <select value={f.facilityId} onChange={(e) => { const x = facilities.find((y) => y.id === e.target.value); setF({ ...f, facilityId: x?.id ?? "", facility: x?.name ?? "", state: x?.state ?? "", lga: x?.lga ?? "" }); }} className={`h-12 w-full rounded-md border bg-background px-3 text-base ${has("facility") ? "border-destructive" : ""}`}>
                        <option value="">Select facility…</option>
                        {facilities.map((x) => <option key={x.id} value={x.id}>{x.name}{x.lga ? ` — ${x.lga}` : ""}</option>)}
                      </select>
                    ) : (
                      <Input value={f.facility} onChange={(e) => setF({ ...f, facility: e.target.value.slice(0, 200) })} placeholder="Facility name" className="h-12 text-base" />
                    )}
                  </label>
                  <label className="space-y-1.5 rounded-2xl border bg-card p-4 shadow-sm">
                    <span className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4 text-eye-blue" /> Report date</span>
                    <Input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={`h-12 text-base ${has("date") ? "border-destructive" : ""}`} />
                  </label>
                  <label className="space-y-1.5 rounded-2xl border bg-card p-4 shadow-sm">
                    <span className="text-sm font-bold">LGA</span>
                    <Input value={f.lga} onChange={(e) => setF({ ...f, lga: e.target.value.slice(0, 80) })} placeholder="LGA" className="h-12 text-base" disabled={!!f.facilityId && !!facilities.find((x) => x.id === f.facilityId)?.lga} />
                  </label>
                </div>
              )}

              {cur.key === "consult" && (
                <>
                  <h2 className="text-lg font-extrabold text-eye-deep">Persons consulted today</h2>
                  <MFHead />
                  {AGE_BANDS.map((b) => <MFRow key={b.key} label={b.label} icon={Stethoscope} value={S.consult[b.key]} onChange={(v) => setS((s) => { s.consult[b.key] = v; })} />)}
                  <div className="grid grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto] items-center gap-2 rounded-2xl bg-eye-blue p-3 text-primary-foreground">
                    <span className="text-sm font-bold">Total persons consulted</span><span className="text-center text-lg font-bold">{T.consulted.m}</span><span className="text-center text-lg font-bold">{T.consulted.f}</span><span className="min-w-12 rounded-xl bg-eye-gold px-2 py-2 text-center text-lg font-extrabold text-eye-ink">{t(T.consulted)}</span>
                  </div>
                  <MFRow label="Persons with disability" icon={Accessibility} tone="text-eye-violet" value={S.pwd} invalid={has("pwd")} onChange={(v) => setS((s) => { s.pwd = v; })} />
                </>
              )}

              {cur.key === "surgery" && (
                <>
                  <h2 className="text-lg font-extrabold text-eye-deep">Surgeries</h2>
                  <MFHead />
                  {SURGERY_ITEMS.map((i) => <MFRow key={i.key} label={i.label} icon={Scissors} tone="text-eye-teal" value={S.surgery[i.key]} onChange={(v) => setS((s) => { s.surgery[i.key] = v; })} />)}
                  <AnimatePresence>
                    {cataract > 0 && (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="relative overflow-hidden rounded-2xl border-2 border-eye-gold bg-gradient-to-br from-eye-teal to-eye-deep p-4 text-primary-foreground shadow-lg">
                        <Sparkles className="absolute right-3 top-3 h-6 w-6 animate-pulse text-eye-gold" />
                        <p className="text-xs font-bold uppercase tracking-widest text-eye-gold">CSOM episode unlocked</p>
                        <p className="mt-1 text-sm">{cataract} cataract surgery{cataract === 1 ? "" : "ies"} recorded. The Cataract Surgery Outcome Monitoring episode is now part of this report.</p>
                        <Button size="sm" className="mt-3 bg-eye-gold text-eye-ink hover:bg-eye-gold/90" onClick={() => setStep(steps.findIndex((s) => s.key === "csom"))}>Open CSOM episode <ArrowRight className="ml-1 h-4 w-4" /></Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}

              {cur.key === "refraction" && (
                <div className="grid gap-5 lg:grid-cols-2">
                  {(["lenses", "glasses"] as const).map((grp) => (
                    <div key={grp} className="space-y-2">
                      <h2 className={`flex items-center gap-2 text-lg font-extrabold ${grp === "lenses" ? "text-eye-violet" : "text-eye-orange"}`}>{grp === "lenses" ? <Eye className="h-5 w-5" /> : <Glasses className="h-5 w-5" />}{grp === "lenses" ? "Refraction — lenses" : "Glasses dispensed"}</h2>
                      <MFHead />
                      {LENS_TYPES.map((l) => <MFRow key={l.key} label={l.label} tone={grp === "lenses" ? "text-eye-violet" : "text-eye-orange"} icon={grp === "lenses" ? Eye : Glasses} value={S[grp][l.key]} invalid={grp === "glasses" && warnings.some((w) => w.field.startsWith("glasses"))} onChange={(v) => setS((s) => { s[grp][l.key] = v; })} />)}
                      <div className={`flex justify-between rounded-2xl px-4 py-3 font-bold text-primary-foreground ${grp === "lenses" ? "bg-eye-violet" : "bg-eye-orange"}`}><span>Total</span><span className="tabular-nums">M {T[grp].m} · F {T[grp].f} · T {t(T[grp])}</span></div>
                    </div>
                  ))}
                </div>
              )}

              {cur.key === "csom" && f.csom && (
                <motion.div initial={{ rotateX: -8 }} animate={{ rotateX: 0 }} className="space-y-4">
                  <div className="rounded-3xl bg-gradient-to-br from-eye-teal via-eye-teal to-eye-deep p-5 text-primary-foreground shadow-lg">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-eye-gold"><ScanEye className="h-4 w-4" /> Cataract Surgery Outcome Monitoring</p>
                    <p className="mt-1 text-2xl font-extrabold">{f.csom.surgeries} surgeries this episode</p>
                    <p className="text-xs opacity-80">Linked to cataract operated in the daily summary.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([["biometry", "Surgeries done after biometry"], ["iol", "Surgeries with IOL"]] as const).map(([k, label]) => (
                      <div key={k} className={`rounded-2xl border bg-card p-4 shadow-sm ${has(`csom.${k}`) ? "border-destructive" : ""}`}>
                        <p className="text-sm font-bold">{label}</p>
                        <div className="mt-2 flex items-center gap-3"><div className="w-24"><NumberCell label={label} value={f.csom![k]} onChange={(v) => setC((c) => { c[k] = v; })} /></div>
                          <div className="flex-1"><div className="h-3 overflow-hidden rounded-full bg-muted"><motion.div className="h-full bg-eye-teal" animate={{ width: `${Math.min(100, pct(f.csom![k], f.csom!.surgeries))}%` }} /></div><p className="mt-1 text-right text-lg font-extrabold text-eye-teal">{pct(f.csom![k], f.csom!.surgeries)}%</p></div></div>
                      </div>
                    ))}
                  </div>
                  <VaTable title="Section 2 · At discharge" colA="Presenting" colB="With pinhole" ceiling={f.csom.surgeries} a={f.csom.discharge.presenting} b={f.csom.discharge.pinhole} onA={(v) => setC((c) => { c.discharge.presenting = v; })} onB={(v) => setC((c) => { c.discharge.pinhole = v; })} />
                  <VaTable title="Section 3 · Follow up (≥ 4 weeks)" colA="Presenting" colB="Pinhole / BCVA" ceiling={f.csom.surgeries} a={f.csom.followup.presenting} b={f.csom.followup.bcva} onA={(v) => setC((c) => { c.followup.presenting = v; })} onB={(v) => setC((c) => { c.followup.bcva = v; })} />
                </motion.div>
              )}

              {cur.key === "review" && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 rounded-2xl border bg-card p-4 shadow-sm"><span className="text-sm font-bold">Prepared by</span><Input value={f.prepared} onChange={(e) => setF({ ...f, prepared: e.target.value.slice(0, 120) })} placeholder="Data clerk name" className="h-12" /></label>
                    <label className="space-y-1.5 rounded-2xl border bg-card p-4 shadow-sm"><span className="text-sm font-bold">Confirmed by</span><Input value={f.confirmed} onChange={(e) => setF({ ...f, confirmed: e.target.value.slice(0, 120) })} placeholder="Facility in-charge" className="h-12" /></label>
                  </div>
                  <label className="block space-y-1.5 rounded-2xl border bg-card p-4 shadow-sm"><span className="text-sm font-bold">Notes (optional)</span><Textarea value={f.notes} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} /></label>
                  <div className="rounded-2xl border bg-card p-4 shadow-sm">
                    <p className="mb-3 flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-status-success" /> Data quality checks</p>
                    {issues.length === 0 && <p className="text-sm text-status-success">All checks passed — this report is ready.</p>}
                    <ul className="space-y-2">{issues.map((i, k) => (
                      <li key={k} className={`flex gap-2 rounded-xl p-2.5 text-sm ${i.level === "error" ? "bg-destructive/10 text-destructive" : "bg-eye-gold/15 text-eye-ink"}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{i.message}</li>
                    ))}</ul>
                    {warnings.length > 0 && errors.length === 0 && (
                      <label className="mt-3 flex items-center gap-2 text-sm font-medium"><Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} /> I have checked these figures and they are correct.</label>
                    )}
                  </div>
                </div>
              )}

              {cur.key !== "review" && stepErrors(cur.key).map((e, i) => (
                <p key={i} className="flex gap-2 rounded-xl bg-destructive/10 p-2.5 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{e.message}</p>
              ))}
            </motion.section>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
            <Button variant="outline" className="h-12" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}><ArrowLeft className="mr-1 h-4 w-4" />{step === 0 ? "Cancel" : "Back"}</Button>
            {cur.key !== "review" ? (
              <Button className="h-12 bg-eye-blue hover:bg-eye-blue/90" onClick={() => setStep(Math.min(step + 1, steps.length - 1))}>Next<ArrowRight className="ml-1 h-4 w-4" /></Button>
            ) : (
              <Button className="h-12 bg-eye-teal hover:bg-eye-teal/90" onClick={submit} disabled={saving || errors.length > 0 || (warnings.length > 0 && !ack)}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}{existing ? "Save changes" : "Submit daily report"}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
