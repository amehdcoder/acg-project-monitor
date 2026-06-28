import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, Save, Loader2, MapPin, CheckCircle2, ChevronRight } from "lucide-react";
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
import { IRF_SECTIONS, IRF_FORM_NAME, type IrfField } from "@/lib/irf/definition";
import irfBg from "@/assets/irf-bg.jpg";

/** Subtle, professional brand watermark used behind IRF screens. */
export function IrfWatermark() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img
        src={irfBg}
        alt=""
        loading="lazy"
        width={1280}
        height={1280}
        className="absolute bottom-0 right-0 h-[60vh] w-auto max-w-none object-contain opacity-[0.07] sm:opacity-[0.09]"
      />
      <div className="absolute inset-0 bg-background/40" />
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
  const setVal = (k: string, v: any) => setValues((p) => ({ ...p, [k]: v }));

  const totalSteps = IRF_SECTIONS.length + 1;
  const canSubmit = !!state && !!lga && !!reportingMonth;

  const submit = async () => {
    if (!canSubmit) {
      toast.error("Please complete the report identity (Month, State, LGA).");
      setStep(0);
      return;
    }
    setSaving(true);
    try {
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
        ...values,
      };
      // Coerce empties for typed columns.
      Object.keys(values).forEach((k) => { if (values[k] === "") payload[k] = null; });
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
      <div className="relative flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <IrfWatermark />
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#E2F5EC]">
          <CheckCircle2 className="h-10 w-10 text-[#22A55A]" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Report submitted</h2>
        <p className="max-w-md text-muted-foreground">
          Your indicator report for <strong>{lga}, {state}</strong> has been recorded and the dashboard has been updated in real time.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setDone(false); setValues({}); setStep(0); }}>Submit another</Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  const renderField = (f: IrfField) => {
    const v = values[f.key] ?? "";
    const common = (
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium text-foreground">{f.label}</Label>
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
            placeholder="0" className="h-12 text-base" />
        )}
        {f.type === "text" && (
          <Input value={v} onChange={(e) => setVal(f.key, e.target.value)} className="h-12 text-base" />
        )}
        {f.type === "longtext" && (
          <Textarea value={v} onChange={(e) => setVal(f.key, e.target.value)} rows={2} className="text-base" />
        )}
        {f.type === "date" && (
          <Input type="date" value={v} onChange={(e) => setVal(f.key, e.target.value)} className="h-12 text-base" />
        )}
        {f.type === "select" && (
          <Select value={v || undefined} onValueChange={(val) => setVal(f.key, val)}>
            <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {f.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
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
    <div className="relative mx-auto w-full max-w-3xl pb-28">
      <IrfWatermark />
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={onClose}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-foreground sm:text-lg">{IRF_FORM_NAME}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {position ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> GPS locked</span> : "Acquiring GPS…"}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5 px-4 pt-3">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      <div className="px-4 py-4">
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

      {/* Footer nav */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Button>
          {step < totalSteps - 1 ? (
            <Button onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))} className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Submit report
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
