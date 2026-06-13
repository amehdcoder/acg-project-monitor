import { useState, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, MapPin, Loader2, Camera, Save, Send,
  School as SchoolIcon, ClipboardCheck, ImageIcon, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useBloombergSchools } from "@/hooks/useBloombergData";
import { toast } from "sonner";
import {
  PRIMARY_CLASSES, JSS_CLASSES, ALL_CLASSES, emptyEnrolment, sectionTotals,
  grandTotals, OPERATIONAL_STATUS, NOT_FOUND_REASONS, type EnrolmentCounts,
  type BloombergSchool,
} from "@/lib/bloomberg/definition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import bloombergLogo from "@/assets/bloomberg-eye-logo.png";

const NAVY = "#0c2340";
const STEPS = ["School", "Verify", "Enrolment", "Evidence"];

interface Props {
  onClose: () => void;
}

const uniq = (rows: BloombergSchool[], val: keyof BloombergSchool, lbl: keyof BloombergSchool) => {
  const m = new Map<string, string>();
  rows.forEach((r) => {
    const v = (r[val] as string) || "";
    if (v) m.set(v, ((r[lbl] as string) || v));
  });
  return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
};

export default function BloombergFormFiller({ onClose }: Props) {
  const { user } = useAuth();
  const { schools, loading } = useBloombergSchools();
  const geo = useGeolocation();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — school selection
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [location, setLocation] = useState("");
  const [schoolKey, setSchoolKey] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);

  // Step 2 — verification
  const [schoolExists, setSchoolExists] = useState<"yes" | "no" | "">("");
  const [notFoundReason, setNotFoundReason] = useState("");
  const [operationalStatus, setOperationalStatus] = useState("operational");
  const [headTeacher, setHeadTeacher] = useState("");
  const [headPhone, setHeadPhone] = useState("");
  const [dateOfVisit, setDateOfVisit] = useState(new Date().toISOString().slice(0, 10));
  const [registerAvailable, setRegisterAvailable] = useState(true);

  // Step 3 — enrolment
  const [enrol, setEnrol] = useState<EnrolmentCounts>(emptyEnrolment());

  // Step 4 — evidence
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // cascade options
  const stateOpts = useMemo(() => uniq(schools, "state", "state_label"), [schools]);
  const lgaOpts = useMemo(() => uniq(schools.filter((s) => s.state === state), "lga", "lga_label"), [schools, state]);
  const wardOpts = useMemo(() => uniq(schools.filter((s) => s.state === state && s.lga === lga), "ward", "ward_label"), [schools, state, lga]);
  const locOpts = useMemo(() => uniq(schools.filter((s) => s.state === state && s.lga === lga && s.ward === ward), "location", "location_label"), [schools, state, lga, ward]);
  const schoolOpts = useMemo(
    () => schools.filter((s) => (!state || s.state === state) && (!lga || s.lga === lga) && (!ward || s.ward === ward) && (!location || s.location === location)),
    [schools, state, lga, ward, location],
  );
  const selectedSchool = useMemo(() => schools.find((s) => s.school_key === schoolKey) || null, [schools, schoolKey]);

  const captureGps = () => {
    geo.getCurrentPosition();
  };

  useEffect(() => {
    if (geo.position) {
      setGps({ lat: geo.position.lat, lng: geo.position.lng, accuracy: geo.position.accuracy });
    }
  }, [geo.position]);

  useEffect(() => {
    if (geo.error) toast.error(geo.error);
  }, [geo.error]);

  const setCount = (key: string, sex: "male" | "female", v: string) => {
    const n = v === "" ? null : Math.max(0, parseInt(v, 10) || 0);
    setEnrol((e) => ({ ...e, [key]: { ...e[key], [sex]: n } }));
  };

  const handlePhoto = async (slot: string, file: File | null) => {
    if (!file || !user?.id) return;
    setUploading(slot);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}_${slot}.${ext}`;
      const { error } = await supabase.storage.from("bloomberg-evidence").upload(path, file, { upsert: true });
      if (error) throw error;
      setEvidence((e) => ({ ...e, [slot]: path }));
      toast.success("Photo attached");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const canNext = () => {
    if (step === 0) return !!schoolKey;
    if (step === 1) return schoolExists !== "";
    return true;
  };

  const submit = async (asDraft: boolean) => {
    if (!user?.id) return;
    if (!asDraft && !confirmed) {
      toast.error("Please confirm the figures were taken from the register.");
      return;
    }
    setSaving(true);
    try {
      const gt = grandTotals(enrol);
      const enrolPayload: Record<string, any> = {};
      ALL_CLASSES.forEach((c) => (enrolPayload[c.key] = enrol[c.key]));
      const { error } = await supabase.from("bloomberg_validations").insert({
        validator_id: user.id,
        school_key: schoolKey || null,
        state, lga, ward, location,
        school_name: selectedSchool?.school_name ?? null,
        school_code: selectedSchool?.school_code ?? null,
        school_type: selectedSchool?.school_type ?? null,
        school_level: selectedSchool?.school_level ?? null,
        ownership: selectedSchool?.ownership ?? null,
        gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null, gps_accuracy: gps?.accuracy ?? null,
        verification: {
          school_exists: schoolExists, not_found_reason: notFoundReason,
          operational_status: operationalStatus, head_teacher: headTeacher,
          head_phone: headPhone, date_of_visit: dateOfVisit, register_available: registerAvailable,
        },
        enrolment: enrolPayload,
        total_male: gt.male, total_female: gt.female, grand_total: gt.total,
        evidence, remarks,
        status: asDraft ? "draft" : "sent",
      });
      if (error) throw error;
      toast.success(asDraft ? "Draft saved" : "Validation submitted");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const pt = sectionTotals(enrol, PRIMARY_CLASSES);
  const jt = sectionTotals(enrol, JSS_CLASSES);
  const gt = grandTotals(enrol);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f6fb]">
      {/* Navy header */}
      <div className="shrink-0 px-4 pb-5 pt-4 text-white" style={{ background: `linear-gradient(160deg, ${NAVY}, #163a63)` }}>
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src={bloombergLogo} alt="Bloomberg School Eye Health" className="h-7 w-7 rounded" />
            <span className="text-sm font-semibold leading-tight">Bloomberg School<br />Eye Health Project</span>
          </div>
          <div className="w-9" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">New Validation</h1>
        <p className="text-sm text-white/70">School Enrolment Validation</p>
        {/* Stepper */}
        <div className="mt-5 flex items-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${i < step ? "bg-[#2dd4a8] text-[#0c2340]" : i === step ? "bg-[#2563eb] text-white" : "bg-white/15 text-white/60"}`}>
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`mt-1 text-[11px] ${i === step ? "text-white" : "text-white/60"}`}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`mx-1 h-0.5 flex-1 ${i < step ? "bg-[#2dd4a8]" : "bg-white/15"}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading schools…</div>
        ) : (
          <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-2xl space-y-4">
            {/* STEP 1 */}
            {step === 0 && (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-[#1f6feb]"><SchoolIcon className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">School Information</h3></div>
                <p className="mb-4 rounded-lg bg-[#eef4ff] p-3 text-xs text-[#1f6feb]">Select the assigned school. LEA baseline enrolment figures are hidden from validators.</p>
                <div className="space-y-3">
                  <Field label="State"><Sel value={state} onChange={(v) => { setState(v); setLga(""); setWard(""); setLocation(""); setSchoolKey(""); }} options={stateOpts} placeholder="Select state" /></Field>
                  <Field label="LGA"><Sel value={lga} onChange={(v) => { setLga(v); setWard(""); setLocation(""); setSchoolKey(""); }} options={lgaOpts} placeholder="Select LGA" disabled={!state} /></Field>
                  <Field label="Ward"><Sel value={ward} onChange={(v) => { setWard(v); setLocation(""); setSchoolKey(""); }} options={wardOpts} placeholder="Select ward" disabled={!lga} /></Field>
                  <Field label="Community / Location"><Sel value={location} onChange={(v) => { setLocation(v); setSchoolKey(""); }} options={locOpts} placeholder="Select community or location" disabled={!ward} /></Field>
                  <Field label="School Name">
                    <Select value={schoolKey} onValueChange={setSchoolKey}>
                      <SelectTrigger className="h-11"><SelectValue placeholder={`Select school (${schoolOpts.length})`} /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {schoolOpts.map((s) => <SelectItem key={s.school_key} value={s.school_key}>{s.school_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {selectedSchool && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#f4f6fb] p-3 text-xs">
                      <span className="text-muted-foreground">Code</span><span className="font-medium">{selectedSchool.school_code || "—"}</span>
                      <span className="text-muted-foreground">Type</span><span className="font-medium">{selectedSchool.school_type || "—"}</span>
                      <span className="text-muted-foreground">Level</span><span className="font-medium">{selectedSchool.school_level || "—"}</span>
                      <span className="text-muted-foreground">Ownership</span><span className="font-medium">{selectedSchool.ownership || "—"}</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 rounded-xl border border-dashed border-[#cdd7e6] p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0c2340]"><MapPin className="h-4 w-4 text-[#1f6feb]" /> GPS Location</div>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={gps ? gps.lat.toFixed(5) : ""} placeholder="Latitude" className="h-10" />
                    <Input readOnly value={gps ? gps.lng.toFixed(5) : ""} placeholder="Longitude" className="h-10" />
                    <Button type="button" onClick={captureGps} disabled={geo.isLoading} className="h-10 shrink-0 bg-[#2563eb] hover:bg-[#1d4ed8]">
                      {geo.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}<span className="ml-1 hidden sm:inline">Capture GPS</span>
                    </Button>
                  </div>
                  {gps?.accuracy != null && <p className="mt-1 text-[11px] text-muted-foreground">Accuracy ±{Math.round(gps.accuracy)} m</p>}
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 1 && (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-[#1f6feb]"><ClipboardCheck className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">School Verification</h3></div>
                <p className="mb-2 text-sm font-medium text-[#0c2340]">Does the school exist at this location?</p>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <button onClick={() => setSchoolExists("yes")} className={`rounded-lg border-2 py-2.5 text-sm font-semibold ${schoolExists === "yes" ? "border-[#16a34a] bg-[#dcfce7] text-[#15803d]" : "border-border text-foreground"}`}>✓ Yes</button>
                  <button onClick={() => setSchoolExists("no")} className={`rounded-lg border-2 py-2.5 text-sm font-semibold ${schoolExists === "no" ? "border-[#dc2626] bg-[#fee2e2] text-[#b91c1c]" : "border-border text-foreground"}`}>No</button>
                </div>
                {schoolExists === "no" && (
                  <Field label="Reason school was not found"><Sel value={notFoundReason} onChange={setNotFoundReason} options={NOT_FOUND_REASONS} placeholder="Select reason" /></Field>
                )}
                {schoolExists === "yes" && (
                  <div className="space-y-3">
                    <Field label="Operational Status"><Sel value={operationalStatus} onChange={setOperationalStatus} options={OPERATIONAL_STATUS} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Head Teacher / Contact Person"><Input value={headTeacher} onChange={(e) => setHeadTeacher(e.target.value)} placeholder="Enter full name" className="h-11" /></Field>
                      <Field label="Phone Number"><Input value={headPhone} onChange={(e) => setHeadPhone(e.target.value)} placeholder="Enter phone number" className="h-11" /></Field>
                    </div>
                    <div className="grid grid-cols-2 items-end gap-3">
                      <Field label="Date of Visit"><Input type="date" value={dateOfVisit} onChange={(e) => setDateOfVisit(e.target.value)} className="h-11" /></Field>
                      <div className="flex items-center justify-between rounded-lg border border-border p-3">
                        <span className="text-sm font-medium">Register Available</span>
                        <Switch checked={registerAvailable} onCheckedChange={setRegisterAvailable} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3 */}
            {step === 2 && (
              <div className="space-y-4">
                <p className="rounded-lg bg-[#eef4ff] p-3 text-xs text-[#1f6feb]">Enter the actual number of pupils/students by class and sex. Do not estimate — use the school register or verified head count.</p>
                <EnrolTable title="Primary Section (P1 – P6)" classes={PRIMARY_CLASSES} enrol={enrol} onChange={setCount} totals={pt} />
                <EnrolTable title="Junior Secondary (JSS1 – JSS3)" classes={JSS_CLASSES} enrol={enrol} onChange={setCount} totals={jt} />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Total Male" value={gt.male} color="#2563eb" />
                  <Stat label="Total Female" value={gt.female} color="#db2777" />
                  <Stat label="Grand Total" value={gt.total} color="#16a34a" />
                </div>
              </div>
            )}

            {/* STEP 4 */}
            {step === 3 && (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-[#1f6feb]"><ImageIcon className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">Required Photo Evidence</h3></div>
                <div className="space-y-3">
                  {[
                    { slot: "signboard", label: "School Signboard / Building", required: true },
                    { slot: "classroom", label: "Classroom / Students", required: true },
                    { slot: "register", label: "Attendance Register", required: true },
                    { slot: "additional", label: "Additional Evidence", required: false },
                  ].map((p) => (
                    <div key={p.slot} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#f4f6fb]">
                        {evidence[p.slot] ? <Check className="h-6 w-6 text-[#16a34a]" /> : <Camera className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.label}</p>
                        <span className={`text-[11px] ${p.required ? "text-[#dc2626]" : "text-muted-foreground"}`}>{p.required ? "Required" : "Optional"}</span>
                      </div>
                      <input ref={(el) => (fileRefs.current[p.slot] = el)} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handlePhoto(p.slot, e.target.files?.[0] || null)} />
                      <Button type="button" variant="outline" size="sm" onClick={() => fileRefs.current[p.slot]?.click()} disabled={uploading === p.slot}>
                        {uploading === p.slot ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}<span className="ml-1">{evidence[p.slot] ? "Retake" : "Take Photo"}</span>
                      </Button>
                    </div>
                  ))}
                </div>
                <Field label="Validator Remarks (Optional)" className="mt-4">
                  <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any additional information about the school, enrolment, or challenges encountered" rows={3} />
                </Field>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span>I confirm that the figures above were taken from the register or confirmed by the school.</span>
                </label>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Footer nav */}
      <div className="shrink-0 border-t border-border bg-white p-3">
        <div className="mx-auto flex max-w-2xl gap-2">
          {step > 0 && <Button variant="outline" className="flex-1" onClick={() => setStep((s) => s - 1)}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>}
          {step < STEPS.length - 1 ? (
            <Button className="flex-1 bg-[#2563eb] hover:bg-[#1d4ed8]" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>Continue <ArrowRight className="ml-1 h-4 w-4" /></Button>
          ) : (
            <>
              <Button variant="outline" className="flex-1" disabled={saving} onClick={() => submit(true)}><Save className="mr-1 h-4 w-4" /> Save Draft</Button>
              <Button className="flex-1 bg-[#2563eb] hover:bg-[#1d4ed8]" disabled={saving} onClick={() => submit(false)}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Submit Validation</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={className}>
    <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
    {children}
  </div>
);

const Sel = ({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean }) => (
  <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger className="h-11"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent className="max-h-72">
      {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
    </SelectContent>
  </Select>
);

const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="rounded-xl bg-white p-3 shadow-sm">
    <div className="text-lg font-bold" style={{ color }}>{value.toLocaleString()}</div>
    <div className="text-[11px] text-muted-foreground">{label}</div>
  </div>
);

const EnrolTable = ({ title, classes, enrol, onChange, totals }: { title: string; classes: typeof PRIMARY_CLASSES; enrol: EnrolmentCounts; onChange: (k: string, s: "male" | "female", v: string) => void; totals: { male: number; female: number; total: number } }) => (
  <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
    <div className="bg-[#eef4ff] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#1f6feb]">{title}</div>
    <table className="w-full text-sm">
      <thead><tr className="border-b text-xs text-muted-foreground"><th className="px-3 py-2 text-left">Class</th><th className="px-3 py-2 text-center">Male</th><th className="px-3 py-2 text-center">Female</th><th className="px-3 py-2 text-center">Total</th></tr></thead>
      <tbody>
        {classes.map((c) => (
          <tr key={c.key} className="border-b last:border-0">
            <td className="px-3 py-1.5 font-medium">{c.label}</td>
            <td className="px-2 py-1.5"><Input type="number" min={0} inputMode="numeric" value={enrol[c.key].male ?? ""} onChange={(e) => onChange(c.key, "male", e.target.value)} className="h-9 text-center" /></td>
            <td className="px-2 py-1.5"><Input type="number" min={0} inputMode="numeric" value={enrol[c.key].female ?? ""} onChange={(e) => onChange(c.key, "female", e.target.value)} className="h-9 text-center" /></td>
            <td className="px-3 py-1.5 text-center font-semibold">{(enrol[c.key].male ?? 0) + (enrol[c.key].female ?? 0)}</td>
          </tr>
        ))}
        <tr className="bg-[#f4f6fb] font-semibold"><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-center text-[#2563eb]">{totals.male}</td><td className="px-3 py-2 text-center text-[#db2777]">{totals.female}</td><td className="px-3 py-2 text-center text-[#16a34a]">{totals.total}</td></tr>
      </tbody>
    </table>
  </div>
);
