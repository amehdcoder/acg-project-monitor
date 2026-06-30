import { useMemo, useState, useEffect, useRef } from "react";
import {
  ArrowLeft, Save, Loader2, MapPin, CheckCircle2, Building2, ImagePlus, X, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import IrfGpsMap, { type IrfGpsValue } from "./IrfGpsMap";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import * as Icons from "lucide-react";
import { IrfWatermark } from "./IRFFormFiller";
import {
  ACCEPTANCE_LEVELS, MINISTRY_DEPARTMENTS, OTHER_OPTION,
  type IrfCategoryForm, type IrfCategoryField,
} from "@/lib/irf/categoryForms";

interface Props {
  form: IrfCategoryForm;
  projectId?: string | null;
  onBack: () => void;
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

type PendingPhoto = {
  id: string;
  file: File;
  url: string;
  caption: string;
  consent: boolean;
};

export default function IRFCategoryFormFiller({ form, projectId, onBack, onClose }: Props) {
  const { user } = useAuth();
  const [gps, setGps] = useState<IrfGpsValue | null>(null);

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Reporting identity
  const [level, setLevel] = useState<"state" | "lga">("lga");
  const [reportingMonth, setReportingMonth] = useState(monthOptions[0].value);
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [ministry, setMinistry] = useState("");
  const [ministryOther, setMinistryOther] = useState("");
  const [focalPhone, setFocalPhone] = useState("");
  const [narrative, setNarrative] = useState("");

  const states = useMemo(() => getAllStates(), []);
  const lgas = useMemo(() => (state ? getLGAsForState(state) : []), [state]);
  const wards = useMemo(() => (state && lga ? getWardsForLGA(state, lga) : []), [state, lga]);

  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const setVal = (k: string, v: any) => {
    setValues((p) => ({ ...p, [k]: v }));
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      setErrors((prev) => {
        if (!prev.has(k)) return prev;
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    }
  };

  // Photos
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const next: PendingPhoto[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file, url: URL.createObjectURL(file), caption: "", consent: false });
    });
    if (next.length) setPhotos((p) => [...p, ...next]);
  };
  const removePhoto = (id: string) => setPhotos((p) => {
    const found = p.find((x) => x.id === id);
    if (found) URL.revokeObjectURL(found.url);
    return p.filter((x) => x.id !== id);
  });
  const setPhoto = (id: string, patch: Partial<PendingPhoto>) =>
    setPhotos((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  useEffect(() => () => { photos.forEach((p) => URL.revokeObjectURL(p.url)); }, []); // eslint-disable-line

  const requiresLga = level === "lga";
  const allFields = form.groups.flatMap((g) => g.fields);

  const isEmpty = (f: IrfCategoryField) => {
    if (f.type === "boolean") return false;
    const v = values[f.key];
    return v === undefined || v === null || String(v).trim() === "";
  };

  const validate = (): boolean => {
    const missing: string[] = [];
    if (!reportingMonth) missing.push("__month");
    if (!state) missing.push("__state");
    if (requiresLga && !lga) missing.push("__lga");
    if (!gps) missing.push("__gps");
    if (form.perMinistry && !ministry) missing.push("__ministry");
    if (form.perMinistry && ministry === OTHER_OPTION && !ministryOther.trim()) missing.push("__ministry_other");
    allFields.forEach((f) => {
      if (f.required && isEmpty(f)) missing.push(f.key);
      if (f.type === "select" && f.allowOther && values[f.key] === OTHER_OPTION && !String(values[`${f.key}__other`] ?? "").trim())
        missing.push(`${f.key}__other`);
    });
    // Per-photo consent is mandatory before submission.
    const unconsented = photos.filter((p) => !p.consent);
    if (unconsented.length) missing.push(...unconsented.map((p) => `photo_${p.id}`));

    if (missing.length) {
      setErrors(new Set(missing));
      if (unconsented.length) toast.error("Please confirm consent for every uploaded picture.");
      else toast.error("Please complete all required fields.");
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Upload photos to the private evidence bucket.
      const evidence: any[] = [];
      for (const p of photos) {
        const ext = p.file.name.split(".").pop() || "jpg";
        const path = `${user?.id}/${form.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("irf-evidence").upload(path, p.file, {
          contentType: p.file.type, upsert: false,
        });
        if (upErr) throw upErr;
        evidence.push({ path, caption: p.caption || null, consent: true, consented_at: new Date().toISOString() });
      }

      // Split direct-column fields from free-form answers.
      const directCols: Record<string, any> = {};
      const answers: Record<string, any> = {};
      allFields.forEach((f) => {
        let v = values[f.key];
        if (f.type === "select" && v === OTHER_OPTION) v = (values[`${f.key}__other`] || "").trim() || OTHER_OPTION;
        if (v === "" || v === undefined) v = null;
        if (f.column) directCols[f.column] = f.type === "number" && v != null ? Number(v) : v;
        else answers[f.key] = v;
      });

      const resolvedMinistry = form.perMinistry
        ? (ministry === OTHER_OPTION ? ministryOther.trim() : ministry)
        : null;

      const payload: Record<string, any> = {
        project_id: projectId || null,
        created_by: user?.id,
        form_category: form.id,
        reporting_level: level,
        ministry_department: resolvedMinistry,
        reporting_period: monthOptions.find((m) => m.value === reportingMonth)?.label ?? reportingMonth,
        reporting_month: `${reportingMonth}-01`,
        state,
        lga: requiresLga ? lga : null,
        ward: requiresLga ? (ward || null) : null,
        focal_person_phone: focalPhone || null,
        narrative: narrative || null,
        gps_lat: gps?.lat ?? null,
        gps_lng: gps?.lng ?? null,
        submission_status: "submitted",
        evidence,
        answers,
        ...directCols,
      };

      const { error } = await supabase.from("irf_reports" as any).insert(payload);
      if (error) throw error;
      setDone(true);
      toast.success("Visit recorded — dashboard updated.");
    } catch (e: any) {
      console.error("IRF category submit error", e);
      toast.error(e?.message || "Could not submit. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const FormIcon = (Icons as any)[form.icon] || Icons.ClipboardList;

  if (done) {
    return (
      <div className="dark relative isolate flex min-h-[100dvh] flex-col items-center justify-center gap-4 overflow-hidden bg-background p-8 text-center text-foreground">
        <IrfWatermark />
        <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-[#E2F5EC]">
          <CheckCircle2 className="h-10 w-10 text-[#22A55A]" />
        </div>
        <h2 className="relative z-10 text-2xl font-bold">{form.name} submitted</h2>
        <p className="relative z-10 max-w-md text-muted-foreground">
          The {form.short} visit for <strong>{requiresLga ? `${lga}, ` : ""}{state}</strong> has been recorded.
        </p>
        <div className="relative z-10 flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={() => { setDone(false); setValues({}); setPhotos([]); setMinistry(""); }}>Add another visit</Button>
          <Button variant="outline" onClick={onBack}>Choose another form</Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  const renderField = (f: IrfCategoryField) => {
    const v = values[f.key] ?? "";
    const fieldErr = errors.has(f.key);
    const errCls = fieldErr ? "border-destructive focus-visible:ring-destructive" : "";
    return (
      <div key={f.key} className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-sm font-medium">{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
          {f.example && <span className="text-[11px] text-muted-foreground">e.g. {f.example}</span>}
        </div>
        {f.what && <p className="-mt-1 text-xs text-muted-foreground">{f.what}</p>}
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
        {f.type === "acceptance" && (
          <div className="grid grid-cols-3 gap-2">
            {ACCEPTANCE_LEVELS.map((lvl) => {
              const active = v === lvl;
              const tone = lvl === "High" ? "#16a34a" : lvl === "Medium" ? "#d97706" : "#dc2626";
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setVal(f.key, lvl)}
                  className={`flex h-12 items-center justify-center rounded-md border text-sm font-semibold transition ${active ? "text-white" : "bg-background text-foreground hover:bg-muted"} ${fieldErr && !v ? "border-destructive" : "border-input"}`}
                  style={active ? { backgroundColor: tone, borderColor: tone } : undefined}
                >
                  {lvl}
                </button>
              );
            })}
          </div>
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
                <Input autoFocus value={values[otherKey] ?? ""} onChange={(e) => setVal(otherKey, e.target.value)}
                  placeholder="Please specify…" aria-invalid={otherErr}
                  className={`mt-2 h-12 text-base ${otherErr ? "border-destructive focus-visible:ring-destructive" : ""}`} />
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

  return (
    <div className="dark fixed inset-0 z-40 isolate flex h-[100dvh] min-h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <IrfWatermark />
      {/* Header */}
      <div className="relative z-20 flex shrink-0 items-center gap-3 border-b border-white/10 bg-gradient-to-r from-[#0c2340] to-[#1a4a6e] px-4 py-3 shadow-sm">
        <Button variant="ghost" size="icon" aria-label="Back to forms" onClick={onBack} className="text-white hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${form.color}33` }}>
            <FormIcon className="h-5 w-5" style={{ color: "#fff" }} />
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight text-white sm:text-lg">{form.name}</h1>
            <p className="truncate text-xs text-white/70">
              {gps ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> GPS locked</span> : "Acquiring GPS…"}
            </p>
          </div>
        </div>
      </div>

      {/* Scroll area */}
      <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
          {/* Reporting identity */}
          <Card className="space-y-4 p-4 sm:p-6" style={{ borderTopWidth: 3, borderTopColor: form.color }}>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2"><Icons.FileSpreadsheet className="h-5 w-5 text-primary" /></div>
              <div>
                <h2 className="text-lg font-bold">Reporting Identity</h2>
                <p className="text-xs text-muted-foreground">
                  {form.perMinistry ? "Choose the reporting category and location for this visit." : "Confirm the LGA-level location for this visit."}
                </p>
              </div>
            </div>

            {/* Reporting category — only the Advocacy Supervision form can report at State or LGA level */}
            {form.perMinistry ? (
              <div className="space-y-1.5">
                <Label>Reporting category *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["state", "lga"] as const).map((lv) => {
                    const active = level === lv;
                    return (
                      <button key={lv} type="button" onClick={() => setLevel(lv)}
                        className={`flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted"}`}>
                        <Building2 className="h-4 w-4" /> {lv === "state" ? "State level" : "LGA level"}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {level === "state" ? "State-level reporting does not require LGA or Ward." : "LGA-level reporting requires the LGA (Ward optional)."}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border px-4 py-3"
                style={{ borderColor: `${form.color}55`, backgroundColor: `${form.color}12` }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${form.color}22` }}>
                  <Building2 className="h-5 w-5" style={{ color: form.color }} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: form.color }}>LGA-level activity</p>
                  <p className="text-xs text-muted-foreground">This form is reported at the LGA level — select the State and LGA below (Ward optional).</p>
                </div>
              </div>
            )}


            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Reporting month *</Label>
                <Select value={reportingMonth} onValueChange={setReportingMonth}>
                  <SelectTrigger className={`h-12 ${errors.has("__month") ? "border-destructive" : ""}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>State *</Label>
                <Select value={state || undefined} onValueChange={(v) => { setState(v); setLga(""); setWard(""); }}>
                  <SelectTrigger className={`h-12 ${errors.has("__state") ? "border-destructive" : ""}`}><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>{states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {requiresLga && (
                <>
                  <div className="space-y-1.5">
                    <Label>LGA *</Label>
                    <Select value={lga || undefined} onValueChange={(v) => { setLga(v); setWard(""); }} disabled={!state}>
                      <SelectTrigger className={`h-12 ${errors.has("__lga") ? "border-destructive" : ""}`}><SelectValue placeholder="Select LGA" /></SelectTrigger>
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
                </>
              )}
              <div className="space-y-1.5">
                <Label>Contact phone (optional)</Label>
                <Input value={focalPhone} onChange={(e) => setFocalPhone(e.target.value)} className="h-12" placeholder="0801…" />
              </div>
            </div>

            {form.perMinistry && (
              <div className="space-y-1.5">
                <Label>Ministry / Department visited *</Label>
                <p className="-mt-1 text-xs text-muted-foreground">Each visit is one ministry or department. Add another visit for the next one.</p>
                <Select value={ministry || undefined} onValueChange={setMinistry}>
                  <SelectTrigger className={`h-12 ${errors.has("__ministry") ? "border-destructive" : ""}`}><SelectValue placeholder="Select ministry / department" /></SelectTrigger>
                  <SelectContent className="max-h-[50vh]">
                    {MINISTRY_DEPARTMENTS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    <SelectItem value={OTHER_OPTION}>{OTHER_OPTION}</SelectItem>
                  </SelectContent>
                </Select>
                {ministry === OTHER_OPTION && (
                  <Input autoFocus value={ministryOther} onChange={(e) => setMinistryOther(e.target.value)}
                    placeholder="Name the ministry / department…" aria-invalid={errors.has("__ministry_other")}
                    className={`mt-2 h-12 ${errors.has("__ministry_other") ? "border-destructive" : ""}`} />
                )}
              </div>
            )}
          </Card>

          {/* Activity groups */}
          {form.groups.map((g) => (
            <Card key={g.activity} className="mt-4 space-y-4 p-4 sm:p-6">
              <h3 className="text-sm font-semibold" style={{ color: form.color }}>{g.activity}</h3>
              <div className="grid gap-4 sm:grid-cols-2">{g.fields.map(renderField)}</div>
            </Card>
          ))}

          {/* GPS capture + live satellite location */}
          <Card className="mt-4 space-y-3 p-4 sm:p-6" style={{ borderTopWidth: 3, borderTopColor: form.color }}>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2"><MapPin className="h-5 w-5 text-primary" /></div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: form.color }}>Activity Location (GPS) <span className="text-destructive">*</span></h3>
                <p className="text-xs text-muted-foreground">Captured automatically — the satellite map shows exactly where you are standing.</p>
              </div>
            </div>
            <div className={errors.has("__gps") ? "rounded-xl ring-2 ring-destructive" : ""}>
              <IrfGpsMap value={gps} onChange={setGps} accent={form.color} />
            </div>
          </Card>



          {/* Evidence + per-photo consent */}
          <Card className="mt-4 space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: form.color }}>Activity Pictures</h3>
                <p className="text-xs text-muted-foreground">Upload pictures taken during the activity. Consent is required for each picture.</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="h-4 w-4" /> Add
              </Button>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
                onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            </div>

            {photos.length === 0 ? (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input py-8 text-muted-foreground hover:bg-muted/40">
                <ImagePlus className="h-7 w-7" />
                <span className="text-sm">Tap to add activity pictures</span>
              </button>
            ) : (
              <div className="space-y-3">
                {photos.map((p) => {
                  const err = errors.has(`photo_${p.id}`);
                  return (
                    <div key={p.id} className={`flex gap-3 rounded-lg border p-3 ${err ? "border-destructive" : "border-input"}`}>
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                        <img src={p.url} alt="Activity evidence preview" className="h-full w-full object-cover" />
                        <button type="button" onClick={() => removePhoto(p.id)} aria-label="Remove picture"
                          className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Input value={p.caption} onChange={(e) => setPhoto(p.id, { caption: e.target.value })}
                          placeholder="Caption (optional)" className="h-9 text-sm" />
                        <label className={`flex items-start gap-2 rounded-md p-2 text-xs ${p.consent ? "bg-emerald-500/10" : err ? "bg-destructive/10" : "bg-muted/50"}`}>
                          <Checkbox checked={p.consent} onCheckedChange={(c) => {
                            setPhoto(p.id, { consent: !!c });
                            if (c) setErrors((prev) => { const n = new Set(prev); n.delete(`photo_${p.id}`); return n; });
                          }} className="mt-0.5" />
                          <span className="leading-snug">
                            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                            I confirm consent was obtained from the people in this picture for it to be captured and submitted. *
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Narrative */}
          <Card className="mt-4 space-y-1.5 p-4 sm:p-6">
            <Label>Narrative / additional notes</Label>
            <Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={3}
              placeholder="Key reflections, means of verification, follow-up actions…" />
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-20 shrink-0 border-t bg-background/95 px-4 py-3 backdrop-blur pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 sm:px-2">
          <Button variant="outline" onClick={onBack} className="min-w-[88px]">Back</Button>
          <Button onClick={submit} disabled={saving} className="flex-1 gap-2 sm:flex-none">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Submit visit
          </Button>
        </div>
      </div>
    </div>
  );
}
