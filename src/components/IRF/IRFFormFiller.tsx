import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, Save, Loader2, MapPin, CheckCircle2, ChevronRight, Moon, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { toast } from "sonner";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import * as Icons from "lucide-react";
import { IRF_SECTIONS, IRF_FORM_NAME, OTHER_OPTION, type IrfField } from "@/lib/irf/definition";
import irfBg from "@/assets/irf-bg.jpg";

/** Subtle, professional brand watermark that covers the entire IRF interface. */
export function IrfWatermark() {
  return (
    // Non-interactive decorative layer: hidden from screen readers (aria-hidden),
    // removed from the keyboard focus order/AX tree (inert), and click-through
    // (pointer-events-none) so it can never affect navigation or focus order.
    <div
      aria-hidden="true"
      role="presentation"
      // @ts-expect-error inert is valid HTML; React types lag behind
      inert=""
      className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
    >
      {/* Brand image shown in full (object-contain) so the faces of the SARMAAN CDD
          and the child are always clearly visible and never cropped on any screen. */}
      <img
        src={irfBg}
        alt=""
        aria-hidden="true"
        draggable={false}
        tabIndex={-1}
        decoding="async"
        className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full max-w-none -translate-x-1/2 -translate-y-1/2 select-none object-contain object-center opacity-90 dark:opacity-90 [image-rendering:auto] [backface-visibility:hidden] [transform:translate3d(-50%,-50%,0)]"
      />
      {/* Very light washes keep fields readable while the SARMAAN CDD and child faces stay bright and clear. */}
      <div className="absolute inset-0 bg-background/20 dark:bg-background/25" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/5 to-background/25 dark:from-background/15 dark:via-background/10 dark:to-background/30" />
    </div>
  );
}

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

const monthOptions = (() => {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value, label: d.toLocaleString("default", { month: "long", year: "numeric" }) });
  }
  return out;
})();

export default function IRFFormFiller({ projectId, onClose }: Props) {
  const { user } = useAuth();
  // The IRF opens in dark mode by default. A self-contained toggle controls only
  // this form's appearance (via a scoped `dark` class) so it never disturbs the
  // user's persistent app-wide theme preference.
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const { position, getCurrentPosition } = useGeolocation();
  useEffect(() => { try { getCurrentPosition(); } catch { /* ignore */ } }, []);


  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(0); // 0 = identity, 1..N = sections

  // Identity
  const [reportingMonth, setReportingMonth] = useState(monthOptions[0].value);
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [focalPhone, setFocalPhone] = useState("");
  const [narrative, setNarrative] = useState("");

  const states = useMemo(() => getAllStates(), []);
  const lgas = useMemo(() => (state ? getLGAsForState(state) : []), [state]);
  const wards = useMemo(() => (state && lga ? getWardsForLGA(state, lga) : []), [state, lga]);

  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const setVal = (k: string, v: any) => {
    setValues((p) => ({ ...p, [k]: v }));
    // Clear a mandatory-field error as soon as the user provides a value.
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      setErrors((prev) => {
        if (!prev.has(k)) return prev;
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    }
  };

  // Clear an "Other (specify)" error as soon as the user types something.
  const setOtherVal = (k: string, v: any) => {
    setVal(k, v);
    if (String(v ?? "").trim()) {
      setErrors((prev) => {
        if (!prev.has(k)) return prev;
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    }
  };

  const totalSteps = IRF_SECTIONS.length + 1;
  const canSubmit = !!state && !!lga && !!reportingMonth;

  /** Additional non-metric fields that must be answered. */
  const REQUIRED_SELECT_KEYS = new Set(["participation_level"]);
  /** A field is mandatory if explicitly flagged, an indicator metric, or a required select. */
  const isFieldRequired = (f: IrfField) =>
    !!f.required || f.metric === true || REQUIRED_SELECT_KEYS.has(f.key);
  /** Booleans always carry a value; everything else is empty when blank. */
  const isFieldEmpty = (f: IrfField) => {
    if (f.type === "boolean") return false;
    const v = values[f.key];
    return v === undefined || v === null || String(v).trim() === "";
  };

  /** Keys of mandatory fields not yet answered in a section. */
  const missingRequiredForSection = (sec: typeof IRF_SECTIONS[number]) =>
    sec.groups
      .flatMap((g) => g.fields)
      .filter((f) => isFieldRequired(f) && isFieldEmpty(f))
      .map((f) => f.key);

  /** Select fields with an "Other" choice selected but no specify text yet. */
  const missingOtherForSection = (sec: typeof IRF_SECTIONS[number]) =>
    sec.groups
      .flatMap((g) => g.fields)
      .filter(
        (f) =>
          f.type === "select" &&
          f.allowOther &&
          values[f.key] === OTHER_OPTION &&
          !String(values[`${f.key}__other`] ?? "").trim(),
      )
      .map((f) => `${f.key}__other`);

  /** Validate the current step; returns true if OK, else flags errors. */
  const validateStep = (stepIndex: number): boolean => {
    const sec = stepIndex > 0 ? IRF_SECTIONS[stepIndex - 1] : null;
    if (stepIndex === 0) {
      // Report identity is mandatory before leaving the first step.
      if (!state || !lga || !reportingMonth) {
        toast.error("Please complete the report identity (Month, State, LGA).");
        return false;
      }
      return true;
    }
    const missingReq = sec ? missingRequiredForSection(sec) : [];
    const missingOther = sec ? missingOtherForSection(sec) : [];
    const missing = [...missingReq, ...missingOther];
    if (missing.length) {
      setErrors((prev) => new Set([...prev, ...missing]));
      toast.error("Please answer all mandatory questions before proceeding.");
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(totalSteps - 1, s + 1));
  };

  const submit = async () => {
    if (!canSubmit) {
      toast.error("Please complete the report identity (Month, State, LGA).");
      setStep(0);
      return;
    }
    // Block submission if any mandatory field is unanswered or "Other" is unspecified.
    const allMissing = IRF_SECTIONS.flatMap((sec) => [
      ...missingRequiredForSection(sec),
      ...missingOtherForSection(sec),
    ]);
    if (allMissing.length) {
      setErrors((prev) => new Set([...prev, ...allMissing]));
      const firstSecIdx = IRF_SECTIONS.findIndex(
        (sec) => missingRequiredForSection(sec).length || missingOtherForSection(sec).length,
      );
      if (firstSecIdx >= 0) setStep(firstSecIdx + 1);
      toast.error("Please answer all mandatory questions before submitting.");
      return;
    }
    setSaving(true);
    try {
      // Resolve "Other (specify)" selections into their typed text, then drop temp keys.
      const resolved: Record<string, any> = {};
      Object.keys(values).forEach((k) => {
        if (k.endsWith("__other")) return; // temp specify holder, handled below
        if (values[k] === OTHER_OPTION) {
          resolved[k] = (values[`${k}__other`] || "").trim() || OTHER_OPTION;
        } else {
          resolved[k] = values[k];
        }
      });
      const payload: Record<string, any> = {
        project_id: projectId || null,
        created_by: user?.id,
        reporting_period: monthOptions.find((m) => m.value === reportingMonth)?.label ?? reportingMonth,
        reporting_month: `${reportingMonth}-01`,
        state, lga, ward: ward || null,
        focal_person_phone: focalPhone || null,
        narrative: narrative || null,
        gps_lat: position?.lat ?? null, gps_lng: position?.lng ?? null,
        submission_status: "submitted",
        ...resolved,
      };
      // Coerce empties for typed columns.
      Object.keys(resolved).forEach((k) => { if (resolved[k] === "") payload[k] = null; });
      const { error } = await supabase.from("irf_reports" as any).insert(payload);
      if (error) throw error;
      setDone(true);
      toast.success("Report submitted — dashboard updated instantly.");
    } catch (e: any) {
      console.error("IRF submit error", e);
      toast.error(e?.message || "Could not submit. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className={`${isDarkTheme ? "dark" : ""} relative isolate flex min-h-[60vh] flex-col items-center justify-center gap-4 overflow-hidden bg-background p-8 text-center text-foreground`}>
        <IrfWatermark />
        <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-[#E2F5EC]">
          <CheckCircle2 className="h-10 w-10 text-[#22A55A]" />
        </div>
        <h2 className="relative z-10 text-2xl font-bold text-foreground">Report submitted</h2>
        <p className="relative z-10 max-w-md text-muted-foreground">
          Your indicator report for <strong>{lga}, {state}</strong> has been recorded and the dashboard has been updated in real time.
        </p>
        <div className="relative z-10 flex gap-3">
          <Button variant="outline" onClick={() => { setDone(false); setValues({}); setStep(0); }}>Submit another</Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  const renderField = (f: IrfField) => {
    const v = values[f.key] ?? "";
    const required = isFieldRequired(f);
    const fieldErr = errors.has(f.key);
    const errCls = fieldErr ? "border-destructive focus-visible:ring-destructive" : "";
    const common = (
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium text-foreground">
          {f.label}{required && <span className="text-destructive"> *</span>}
        </Label>
        {f.example && <span className="text-[11px] text-muted-foreground">e.g. {f.example}</span>}
      </div>
    );
    return (
      <div key={f.key} className="space-y-1.5">
        {common}
        {f.what && <p className="text-xs text-muted-foreground -mt-1">{f.what}</p>}
        {f.type === "number" && (
          <Input type="number" inputMode="numeric" min={0} value={v}
            onChange={(e) => setVal(f.key, e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="0" aria-invalid={fieldErr} className={`h-12 text-base ${errCls}`} />
        )}
        {f.type === "text" && (
          <Input value={v} onChange={(e) => setVal(f.key, e.target.value)} aria-invalid={fieldErr} className={`h-12 text-base ${errCls}`} />
        )}
        {f.type === "longtext" && (
          <Textarea value={v} onChange={(e) => setVal(f.key, e.target.value)} rows={2} aria-invalid={fieldErr} className={`text-base ${errCls}`} />
        )}
        {f.type === "date" && (
          <Input type="date" value={v} onChange={(e) => setVal(f.key, e.target.value)} aria-invalid={fieldErr} className={`h-12 text-base ${errCls}`} />
        )}
        {f.type === "select" && (() => {
          const otherKey = `${f.key}__other`;
          const otherErr = errors.has(otherKey);
          return (
            <>
              <Select value={v || undefined} onValueChange={(val) => setVal(f.key, val)}>
                <SelectTrigger aria-invalid={fieldErr} className={`h-12 text-base ${errCls}`}><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent className="max-h-[50vh]">
                  {f.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  {f.allowOther && <SelectItem value={OTHER_OPTION}>{OTHER_OPTION}</SelectItem>}
                </SelectContent>
              </Select>
              {f.allowOther && v === OTHER_OPTION && (
                <div className="mt-2 space-y-1">
                  <Label className="text-xs font-medium text-foreground">Please specify *</Label>
                  <Input
                    autoFocus
                    value={values[otherKey] ?? ""}
                    onChange={(e) => setOtherVal(otherKey, e.target.value)}
                    placeholder="Type the specific value…"
                    aria-invalid={otherErr}
                    className={`h-12 text-base ${otherErr ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                  {otherErr && <p className="text-xs text-destructive">This field is required when “Other” is selected.</p>}
                </div>
              )}
            </>
          );
        })()}
        {f.type === "boolean" && (
          <div className="flex h-12 items-center justify-between rounded-md border border-input px-3">
            <span className="text-sm text-muted-foreground">{v ? "Yes" : "No"}</span>
            <Switch checked={!!v} onCheckedChange={(c) => setVal(f.key, c)} />
          </div>
        )}
      </div>
    );
  };

  const section = step > 0 ? IRF_SECTIONS[step - 1] : null;
  const SectionIcon = section ? ((Icons as any)[section.icon] || Icons.ClipboardList) : Icons.ClipboardList;

  return (
    <div className={`${isDarkTheme ? "dark" : ""} fixed inset-0 z-40 isolate flex h-[100dvh] min-h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground`}>
      <IrfWatermark />
      {/* Header */}
      <div className="relative z-20 flex shrink-0 items-center gap-3 border-b border-white/10 bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-4 py-3 shadow-sm">
        <Button variant="ghost" size="icon" aria-label="Back to forms" onClick={onClose} className="text-white hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-white sm:text-lg">{IRF_FORM_NAME}</h1>
          <p className="truncate text-xs text-white/70">
            {position
              ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> GPS locked · ready to report</span>
              : "Acquiring GPS…"}
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white sm:inline">
          Step {step + 1}/{totalSteps}
        </span>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label={isDarkTheme ? "Switch IRF form to light mode" : "Switch IRF form to dark mode"}
          aria-pressed={isDarkTheme}
          onClick={() => setIsDarkTheme((d) => !d)}
          className="text-white hover:bg-white/10"
        >
          {isDarkTheme ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </div>

      {/* Scrollable content area — owns its own scroll so the footer nav is always visible on every device (incl. Android) */}
      <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl">
      {/* Progress */}
      <div className="relative z-10 space-y-2 px-4 pt-3 sm:px-6">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">
            {step === 0 ? "Report Identity" : IRF_SECTIONS[step - 1].short}
          </span>
          <span className="text-muted-foreground">Step {step + 1} of {totalSteps}</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < step ? "bg-primary" : i === step ? "bg-primary/70" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>


      <div className="relative z-10 px-4 py-4 sm:px-6">
        {step === 0 ? (
          <Card className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2"><Icons.FileSpreadsheet className="h-5 w-5 text-primary" /></div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Report Identity</h2>
                <p className="text-xs text-muted-foreground">Who is reporting, where, and for which period.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Reporting month *</Label>
                <Select value={reportingMonth} onValueChange={setReportingMonth}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>{monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contact phone (optional)</Label>
                <Input value={focalPhone} onChange={(e) => setFocalPhone(e.target.value)} className="h-12" placeholder="0801…" />
              </div>
              <div className="space-y-1.5">
                <Label>State *</Label>
                <Select value={state || undefined} onValueChange={(v) => { setState(v); setLga(""); setWard(""); }}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>{states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>LGA *</Label>
                <Select value={lga || undefined} onValueChange={(v) => { setLga(v); setWard(""); }} disabled={!state}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select LGA" /></SelectTrigger>
                  <SelectContent>{lgas.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ward</Label>
                <Select value={ward || undefined} onValueChange={setWard} disabled={!lga}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select ward" /></SelectTrigger>
                  <SelectContent>{wards.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        ) : section ? (
          <Card className="space-y-5 p-4 sm:p-6" style={{ borderTopWidth: 3, borderTopColor: section.color }}>
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-2" style={{ backgroundColor: `${section.color}1a` }}>
                <SectionIcon className="h-5 w-5" style={{ color: section.color }} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
                <p className="text-xs text-muted-foreground">Section {step} of {IRF_SECTIONS.length}</p>
              </div>
            </div>
            {section.groups.map((g) => (
              <div key={g.activity} className="space-y-3 rounded-lg bg-muted/40 p-3 sm:p-4">
                <h3 className="text-sm font-semibold" style={{ color: section.color }}>{g.activity}</h3>
                <div className="grid gap-4 sm:grid-cols-2">{g.fields.map(renderField)}</div>
              </div>
            ))}
            {step === IRF_SECTIONS.length && (
              <div className="space-y-1.5">
                <Label>Narrative / additional notes</Label>
                <Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={3}
                  placeholder="Means of verification (MOV): photos, consents, attendance, key reflections…" />
              </div>
            )}
          </Card>
        ) : null}
      </div>
        </div>
      </div>


      {/* Footer nav — pinned in normal flex flow so it is always visible (Android-safe).
          Reserve room for the app's fixed mobile bottom nav bar (lg:hidden, ~4.5rem tall)
          so the Next/Submit buttons are never hidden behind it on Android. */}
      <div className="relative z-20 shrink-0 border-t bg-background/95 px-4 py-3 backdrop-blur pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-3">

        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 sm:px-2">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="min-w-[88px]">Back</Button>
          {step < totalSteps - 1 ? (
            <Button onClick={goNext} className="min-w-[88px] flex-1 gap-1 sm:flex-none">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={saving} className="flex-1 gap-2 sm:flex-none">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Submit report
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

