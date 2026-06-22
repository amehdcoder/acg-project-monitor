import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, MapPin, Loader2, Camera, Send,
  School as SchoolIcon, ClipboardCheck, ImageIcon, ChevronDown, Search, ChevronsUpDown,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useBloombergSchools } from "@/hooks/useBloombergData";
import { toast } from "sonner";
import {
  PRIMARY_CLASSES, JSS_CLASSES, SSS_CLASSES, ALL_CLASSES, emptyEnrolment, sectionTotals,
  grandTotals, OPERATIONAL_STATUS, NOT_FOUND_REASONS, type EnrolmentCounts,
  type BloombergSchool, type ClassDef, normalizeMissingLabel, MISSING_LOCATION_LABEL,
} from "@/lib/bloomberg/definition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { BLOOMBERG_FORM_ID, BLOOMBERG_SPECIAL_FORM_KEY } from "@/lib/specialFormBridge";
import { queueOrUploadMedia } from "@/lib/offlineMedia";
import { saveSavedEntry, newEntryId, type SavedFormEntry } from "@/lib/savedForms";
import { queueOrInsert } from "@/lib/offlineSubmissions";
import bloombergLogo from "@/assets/bloomberg-eye-logo.png";

const NAVY = "#0c2340";
const STEPS = ["School", "Verify", "Enrolment", "Evidence"];

// Native camera capture (input capture / Capacitor) can suspend & RELOAD the
// webview, wiping all in-memory React state and bouncing the validator back to
// step 0. We mirror the entire in-progress form into sessionStorage so a reload
// transparently restores everything (including the step and attached evidence).
const bloombergDraftKey = (uid?: string | null) =>
  `bloomberg_validation_draft_v2_${uid || "anon"}`;

interface Props {
  onClose: () => void;
  projectId?: string | null;
  savedEntry?: SavedFormEntry | null;
  onSavedLocally?: () => void;
}

const uniq = (rows: BloombergSchool[], val: keyof BloombergSchool, lbl: keyof BloombergSchool) => {
  const m = new Map<string, string>();
  rows.forEach((r) => {
    const v = (r[val] as string) || "";
    if (v) m.set(v, normalizeMissingLabel((r[lbl] as string) || v) || v);
  });
  return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
};

export default function BloombergFormFiller({ onClose, projectId = null, savedEntry = null, onSavedLocally }: Props) {
  const { user } = useAuth();
  const { schools, loading, fromCache } = useBloombergSchools();
  const geo = useGeolocation();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  // Captures the moment the validator opens / starts filling this form. Used as
  // the submission's start time (created_at) so accountability analytics show an
  // accurate "Start time → End time" span rather than a zero-duration record.
  const formStartedAtRef = useRef<string>(new Date().toISOString());
  // Guards the auto-save effect so it does not overwrite the persisted draft
  // before the one-time restore has run.
  const restoredRef = useRef(false);

  // Step 1 — school selection
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [location, setLocation] = useState("");
  const [schoolKey, setSchoolKey] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  // User-typed names for any School Information field whose chosen cascade option
  // is "Not Specified in the LGA School Enrolment Dataset".
  const [specified, setSpecified] = useState<Record<string, string>>({});
  const setSpec = (k: string, v: string) => setSpecified((s) => ({ ...s, [k]: v }));

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

  // True when the currently chosen option for a cascade field is the
  // "Not Specified in the LGA School Enrolment Dataset" placeholder.
  const isUnspecified = (val: string, opts: { value: string; label: string }[]) =>
    !!val && (opts.find((o) => o.value === val)?.label === MISSING_LOCATION_LABEL);
  const needState = isUnspecified(state, stateOpts);
  const needLga = isUnspecified(lga, lgaOpts);
  const needWard = isUnspecified(ward, wardOpts);
  const needLocation = isUnspecified(location, locOpts);
  const needSchool = !!selectedSchool && normalizeMissingLabel(selectedSchool.school_name) === MISSING_LOCATION_LABEL;
  // Which "specify" inputs are required & still empty.
  const specifyMissing = useMemo(() => {
    const out: string[] = [];
    if (needState && !specified.state?.trim()) out.push("State");
    if (needLga && !specified.lga?.trim()) out.push("LGA");
    if (needWard && !specified.ward?.trim()) out.push("Ward");
    if (needLocation && !specified.location?.trim()) out.push("Community / Location");
    if (needSchool && !specified.school?.trim()) out.push("School Name");
    return out;
  }, [needState, needLga, needWard, needLocation, needSchool, specified]);

  useEffect(() => {
    if (!savedEntry) return;
    const r = savedEntry.responses || {};
    setState(r.state || "");
    setLga(r.lga || "");
    setWard(r.ward || "");
    setLocation(r.location || "");
    setSchoolKey(r.schoolKey || "");
    setSpecified(r.specified_locations || r.specified || {});
    setGps(r.gps || savedEntry.gps || null);
    setSchoolExists(r.verification?.school_exists || "");
    setNotFoundReason(r.verification?.not_found_reason || "");
    setOperationalStatus(r.verification?.operational_status || "operational");
    setHeadTeacher(r.verification?.head_teacher || "");
    setHeadPhone(r.verification?.head_phone || "");
    setDateOfVisit(r.verification?.date_of_visit || new Date().toISOString().slice(0, 10));
    setRegisterAvailable(r.verification?.register_available ?? true);
    setEnrol({ ...emptyEnrolment(), ...(r.enrolment || {}) });
    setEvidence(r.evidence || {});
    setRemarks(r.remarks || "");
    setConfirmed(!!r.confirmed);
  }, [savedEntry?.id]);

  // ---- Crash/reload-safe draft persistence ----------------------------------
  // Restore an in-progress draft once on mount (only when NOT editing a saved
  // entry — that path has its own hydration above).
  useEffect(() => {
    if (savedEntry) { restoredRef.current = true; return; }
    try {
      const raw = sessionStorage.getItem(bloombergDraftKey(user?.id));
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === "object") {
          if (typeof d.step === "number") setStep(d.step);
          if (d.state != null) setState(d.state);
          if (d.lga != null) setLga(d.lga);
          if (d.ward != null) setWard(d.ward);
          if (d.location != null) setLocation(d.location);
          if (d.schoolKey != null) setSchoolKey(d.schoolKey);
          if (d.gps !== undefined) setGps(d.gps);
          if (d.specified) setSpecified(d.specified);
          if (d.schoolExists != null) setSchoolExists(d.schoolExists);
          if (d.notFoundReason != null) setNotFoundReason(d.notFoundReason);
          if (d.operationalStatus != null) setOperationalStatus(d.operationalStatus);
          if (d.headTeacher != null) setHeadTeacher(d.headTeacher);
          if (d.headPhone != null) setHeadPhone(d.headPhone);
          if (d.dateOfVisit != null) setDateOfVisit(d.dateOfVisit);
          if (typeof d.registerAvailable === "boolean") setRegisterAvailable(d.registerAvailable);
          if (d.enrol) setEnrol({ ...emptyEnrolment(), ...d.enrol });
          if (d.evidence) setEvidence(d.evidence);
          if (d.remarks != null) setRemarks(d.remarks);
          if (typeof d.confirmed === "boolean") setConfirmed(d.confirmed);
          if (d.startedAt) formStartedAtRef.current = d.startedAt;
        }
      }
    } catch { /* ignore corrupt draft */ }
    restoredRef.current = true;
  }, [savedEntry?.id, user?.id]);

  // Mirror the full in-progress state to sessionStorage on every change so a
  // camera-triggered webview reload restores the form exactly where it was.
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      sessionStorage.setItem(
        bloombergDraftKey(user?.id),
        JSON.stringify({
          step, state, lga, ward, location, schoolKey, gps, specified,
          schoolExists, notFoundReason, operationalStatus, headTeacher, headPhone,
          dateOfVisit, registerAvailable, enrol, evidence, remarks, confirmed,
          startedAt: formStartedAtRef.current,
        }),
      );
    } catch { /* storage full / unavailable — non-fatal */ }
  }, [
    step, state, lga, ward, location, schoolKey, gps, specified, schoolExists,
    notFoundReason, operationalStatus, headTeacher, headPhone, dateOfVisit,
    registerAvailable, enrol, evidence, remarks, confirmed, user?.id,
  ]);

  const clearDraft = () => {
    try { sessionStorage.removeItem(bloombergDraftKey(user?.id)); } catch { /* noop */ }
  };

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
      const { queued } = await queueOrUploadMedia("bloomberg-evidence", path, file, { upsert: true });
      setEvidence((e) => ({ ...e, [slot]: path }));
      toast.success(queued ? "Photo saved offline — will upload automatically" : "Photo attached");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const enrolComplete = useMemo(
    () => ALL_CLASSES.every((c) => enrol[c.key]?.male != null && enrol[c.key]?.female != null),
    [enrol],
  );
  const REQUIRED_EVIDENCE = ["signboard", "classroom", "register"];
  const evidenceComplete = REQUIRED_EVIDENCE.every((s) => !!evidence[s]);

  const canNext = () => {
    if (step === 0) return !!(state && lga && ward && location && schoolKey && gps) && specifyMissing.length === 0;
    if (step === 1) {
      if (schoolExists === "") return false;
      if (schoolExists === "no") return !!notFoundReason;
      return !!(operationalStatus && headTeacher.trim() && headPhone.trim() && dateOfVisit);
    }
    if (step === 2) return enrolComplete;
    return true;
  };

  // Single, unified submission path. The validation is sent straight to the
  // server (bloomberg_validations) and reflects immediately on the dashboard,
  // or is queued offline and replayed automatically when connectivity returns.
  // No more separate Draft / Finalize states — "Submit Validation" is the only
  // and final action, so no submission can get stuck between states.
  const submit = async () => {
    if (!user?.id) return;
    if (!(state && lga && ward && location && schoolKey && gps)) {
      toast.error("Complete all school information."); setStep(0); return;
    }
    if (specifyMissing.length > 0) {
      toast.error(`Please specify: ${specifyMissing.join(", ")}.`); setStep(0); return;
    }
    if (schoolExists === "" || (schoolExists === "no" && !notFoundReason) ||
        (schoolExists === "yes" && !(operationalStatus && headTeacher.trim() && headPhone.trim() && dateOfVisit))) {
      toast.error("Complete all verification fields."); setStep(1); return;
    }
    if (!enrolComplete) {
      toast.error("Enter male and female counts for every class."); setStep(2); return;
    }
    if (!evidenceComplete) {
      toast.error("Attach all required photo evidence."); return;
    }
    if (!remarks.trim()) {
      toast.error("Validator remarks are required."); return;
    }
    if (!confirmed) {
      toast.error("Please confirm the figures were taken from the register.");
      return;
    }
    setSaving(true);
    try {
      const gt = grandTotals(enrol);
      const enrolPayload: Record<string, any> = {};
      ALL_CLASSES.forEach((c) => (enrolPayload[c.key] = enrol[c.key]));
      const verification = {
        school_exists: schoolExists, not_found_reason: notFoundReason,
        operational_status: operationalStatus, head_teacher: headTeacher,
        head_phone: headPhone, date_of_visit: dateOfVisit, register_available: registerAvailable,
      };
      const submissionId = savedEntry?.submissionId || crypto.randomUUID();
      const schoolMeta = {
        school_name: selectedSchool?.school_name ?? (savedEntry?.responses as any)?.school_name ?? null,
        school_code: selectedSchool?.school_code ?? (savedEntry?.responses as any)?.school_code ?? null,
        school_type: selectedSchool?.school_type ?? (savedEntry?.responses as any)?.school_type ?? null,
        school_level: selectedSchool?.school_level ?? (savedEntry?.responses as any)?.school_level ?? null,
        ownership: selectedSchool?.ownership ?? (savedEntry?.responses as any)?.ownership ?? null,
      };
      // Only persist specify values for fields whose option was the "Not Specified" placeholder.
      const specifiedLocations: Record<string, string> = {};
      if ((needState || specified.state) && specified.state?.trim()) specifiedLocations.state = specified.state.trim();
      if ((needLga || specified.lga) && specified.lga?.trim()) specifiedLocations.lga = specified.lga.trim();
      if ((needWard || specified.ward) && specified.ward?.trim()) specifiedLocations.ward = specified.ward.trim();
      if ((needLocation || specified.location) && specified.location?.trim()) specifiedLocations.location = specified.location.trim();
      if ((needSchool || specified.school) && specified.school?.trim()) specifiedLocations.school = specified.school.trim();
      const submissionData = {
        validator_id: user.id,
        school_key: schoolKey || null,
        state, lga, ward, location,
        ...schoolMeta,
        gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null, gps_accuracy: gps?.accuracy ?? null,
        verification,
        enrolment: enrolPayload,
        specified_locations: specifiedLocations,
        total_male: gt.male, total_female: gt.female, grand_total: gt.total,
        evidence, remarks,
      };
      const responses = {
        state, lga, ward, location, schoolKey, gps,
        ...schoolMeta,
        verification, enrolment: enrolPayload, specified_locations: specifiedLocations, evidence, remarks, confirmed,
        total_male: gt.male, total_female: gt.female, grand_total: gt.total,
      };
      const now = new Date().toISOString();
      // Stable mirror id so the offline queue can flip THIS entry from
      // "queued" to "sent" the moment its row lands on the server.
      const mirrorId = savedEntry?.id || newEntryId();

      // 1) Send straight to the server (or queue offline). Upsert on the stable
      // submissionId means re-submitting an edited entry overwrites the prior
      // row rather than creating a duplicate.
      const dbRow = {
        ...submissionData,
        id: submissionId,
        status: "sent",
        // Start time = when this validator opened the form (or the original
        // start when editing an existing entry); end time = submission time.
        created_at: savedEntry?.createdAt || formStartedAtRef.current,
        submitted_at: now,
      };
      const { queued } = await queueOrInsert("bloomberg_validations", dbRow, true, {
        mirrorEntryId: mirrorId,
      });

      // 2) Mirror into the saved-forms store as "sent" so the Forms page shows a
      // consistent record (under Sent), with no orphaned draft/finalized copy.
      await saveSavedEntry({
        id: mirrorId,
        userId: user.id,
        formId: BLOOMBERG_FORM_ID,
        formName: "Bloomberg School Enrolment Validation",
        formDescription: selectedSchool?.school_name
          ? `${selectedSchool.school_name} — ${state}, ${lga}`
          : `${state}, ${lga}`,
        projectId: projectId || savedEntry?.projectId || "",
        questions: [],
        groups: [],
        geofence: null,
        settings: { specialBridge: true, specialForm: BLOOMBERG_SPECIAL_FORM_KEY },
        responses,
        gps: gps ? { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy } : null,
        submissionData,
        submissionLocation: gps ? { lat: gps.lat, lng: gps.lng } : null,
        withinGeofence: null,
        submissionType: BLOOMBERG_FORM_ID,
        status: "sent",
        createdAt: savedEntry?.createdAt || now,
        updatedAt: now,
        finalizedAt: now,
        sentAt: queued ? null : now,
        submissionId,
        offline: queued,
      });
      toast.success(
        queued
          ? "Saved offline — it will submit automatically when you're back online."
          : "Validation submitted — it's now on the dashboard.",
      );
      clearDraft();
      onSavedLocally?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Could not submit");
    } finally {
      setSaving(false);
    }
  };


  const pt = sectionTotals(enrol, PRIMARY_CLASSES);
  const jt = sectionTotals(enrol, JSS_CLASSES);
  const st = sectionTotals(enrol, SSS_CLASSES);
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
        {fromCache && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-medium text-amber-100">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Offline mode — schools &amp; cascade loaded from saved data
          </p>
        )}
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
                  <Field label="State" required><Sel value={state} onChange={(v) => { setState(v); setLga(""); setWard(""); setLocation(""); setSchoolKey(""); }} options={stateOpts} placeholder="Select state" /></Field>
                  {(needState || !!specified.state) && <SpecifyInput label="State" value={specified.state || ""} onChange={(v) => setSpec("state", v)} />}
                  <Field label="LGA" required><Sel value={lga} onChange={(v) => { setLga(v); setWard(""); setLocation(""); setSchoolKey(""); }} options={lgaOpts} placeholder="Select LGA" disabled={!state} /></Field>
                  {(needLga || !!specified.lga) && <SpecifyInput label="LGA" value={specified.lga || ""} onChange={(v) => setSpec("lga", v)} />}
                  <Field label="Ward" required><Sel value={ward} onChange={(v) => { setWard(v); setLocation(""); setSchoolKey(""); }} options={wardOpts} placeholder="Select ward" disabled={!lga} /></Field>
                  {(needWard || !!specified.ward) && <SpecifyInput label="Ward" value={specified.ward || ""} onChange={(v) => setSpec("ward", v)} />}
                  <Field label="Community / Location" required><Sel value={location} onChange={(v) => { setLocation(v); setSchoolKey(""); }} options={locOpts} placeholder="Select community or location" disabled={!ward} /></Field>
                  {(needLocation || !!specified.location) && <SpecifyInput label="Community / Location" value={specified.location || ""} onChange={(v) => setSpec("location", v)} />}
                  <Field label="School Name" required>
                    <SchoolSearchCombobox
                      schools={schoolOpts}
                      value={schoolKey}
                      onChange={(v) => setSchoolKey(v)}
                    />
                  </Field>
                  {(needSchool || !!specified.school) && <SpecifyInput label="School Name" value={specified.school || ""} onChange={(v) => setSpec("school", v)} />}
                  {selectedSchool && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#f4f6fb] p-3 text-sm">
                      <span className="text-muted-foreground">Code</span><span className="font-semibold">{selectedSchool.school_code || "—"}</span>
                      <span className="text-muted-foreground">Type</span><span className="font-semibold">{selectedSchool.school_type || "—"}</span>
                      <span className="text-muted-foreground">Level</span><span className="font-semibold">{selectedSchool.school_level || "—"}</span>
                      <span className="text-muted-foreground">Ownership</span><span className="font-semibold">{selectedSchool.ownership || "—"}</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 rounded-xl border border-dashed border-[#cdd7e6] p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0c2340]"><MapPin className="h-4 w-4 text-[#1f6feb]" /> GPS Location</div>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={gps ? gps.lat.toFixed(5) : ""} placeholder="Latitude" className="h-[3.25rem] text-lg" />
                    <Input readOnly value={gps ? gps.lng.toFixed(5) : ""} placeholder="Longitude" className="h-[3.25rem] text-lg" />
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
                  <Field label="Reason school was not found" required><Sel value={notFoundReason} onChange={setNotFoundReason} options={NOT_FOUND_REASONS} placeholder="Select reason" /></Field>
                )}
                {schoolExists === "yes" && (
                  <div className="space-y-3">
                    <Field label="Operational Status" required><Sel value={operationalStatus} onChange={setOperationalStatus} options={OPERATIONAL_STATUS} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Head Teacher / Contact Person" required><Input value={headTeacher} onChange={(e) => setHeadTeacher(e.target.value)} placeholder="Enter full name" className="h-[3.25rem] text-lg" /></Field>
                      <Field label="Phone Number" required><Input value={headPhone} onChange={(e) => setHeadPhone(e.target.value)} placeholder="Enter phone number" className="h-[3.25rem] text-lg" /></Field>
                    </div>
                    <div className="grid grid-cols-2 items-end gap-3">
                      <Field label="Date of Visit" required><Input type="date" value={dateOfVisit} onChange={(e) => setDateOfVisit(e.target.value)} className="h-[3.25rem] text-lg" /></Field>
                      <div className="flex items-center justify-between rounded-lg border border-border p-3">
                        <span className="text-base font-semibold">Register Available</span>
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
                <EnrolTable title="Senior Secondary (SS1 – SS3)" classes={SSS_CLASSES} enrol={enrol} onChange={setCount} totals={st} />
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
                <Field label="Validator Remarks" required className="mt-4">
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
            <Button className="flex-1 bg-[#16a34a] hover:bg-[#15803d]" disabled={saving} onClick={() => submit()}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Submit Validation</Button>
          )}
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children, className = "", required = false }: { label: string; children: React.ReactNode; className?: string; required?: boolean }) => (
  <div className={className}>
    <label className="mb-1.5 block text-base font-semibold text-[#0c2340]">
      {label}{required && <span className="ml-0.5 text-[#dc2626]">*</span>}
    </label>
    {children}
  </div>
);

const Sel = ({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean }) => (
  <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger className="h-[3.25rem] text-lg"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent className="max-h-72">
      {options.map((o) => <SelectItem key={o.value} value={o.value} className="text-lg">{o.label}</SelectItem>)}
    </SelectContent>
  </Select>
);

// Inline "please specify" prompt shown when a cascade option resolves to the
// "Not Specified in the LGA School Enrolment Dataset" placeholder.
const toTitleCase = (str: string) =>
  str
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");

const SpecifyInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div className="-mt-1 rounded-xl border border-[#f0b429] bg-[#fffbeb] p-3">
    <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[#92600a]">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#f0b429] text-[10px] font-bold text-white">!</span>
      Specify the {label} <span className="text-[#dc2626]">*</span>
    </label>
    <p className="mb-2 text-[11px] text-[#92600a]/80">
      This {label.toLowerCase()} was not in the LGA enrolment dataset. Enter the correct name so it is captured in the collected data.
    </p>
    <Input
      value={value}
      onChange={(e) => onChange(toTitleCase(e.target.value))}
      placeholder={`Type the ${label.toLowerCase()} name`}
      className="h-[3.25rem] border-[#f0b429] bg-white text-lg focus-visible:ring-[#f0b429]"
    />
  </div>
);

const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="rounded-xl bg-white p-3 shadow-sm">
    <div className="text-lg font-bold" style={{ color }}>{value.toLocaleString()}</div>
    <div className="text-[11px] text-muted-foreground">{label}</div>
  </div>
);

const EnrolTable = ({ title, classes, enrol, onChange, totals }: { title: string; classes: ClassDef[]; enrol: EnrolmentCounts; onChange: (k: string, s: "male" | "female", v: string) => void; totals: { male: number; female: number; total: number } }) => (
  <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
    <div className="bg-[#eef4ff] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-[#1f6feb]">{title}</div>
    <table className="w-full text-base">
      <thead><tr className="border-b text-sm font-semibold text-[#0c2340]"><th className="px-3 py-2.5 text-left">Class</th><th className="px-3 py-2.5 text-center">Male</th><th className="px-3 py-2.5 text-center">Female</th><th className="px-3 py-2.5 text-center">Total</th></tr></thead>
      <tbody>
        {classes.map((c) => (
          <tr key={c.key} className="border-b last:border-0">
            <td className="px-3 py-1.5 text-base font-semibold">{c.label}</td>
            <td className="px-2 py-1.5"><Input type="number" min={0} inputMode="numeric" value={enrol[c.key].male ?? ""} onChange={(e) => onChange(c.key, "male", e.target.value)} className="h-12 text-center text-lg" /></td>
            <td className="px-2 py-1.5"><Input type="number" min={0} inputMode="numeric" value={enrol[c.key].female ?? ""} onChange={(e) => onChange(c.key, "female", e.target.value)} className="h-12 text-center text-lg" /></td>
            <td className="px-3 py-1.5 text-center text-base font-bold">{(enrol[c.key].male ?? 0) + (enrol[c.key].female ?? 0)}</td>
          </tr>
        ))}
        <tr className="bg-[#f4f6fb] text-base font-bold"><td className="px-3 py-2.5">Total</td><td className="px-3 py-2.5 text-center text-[#2563eb]">{totals.male}</td><td className="px-3 py-2.5 text-center text-[#db2777]">{totals.female}</td><td className="px-3 py-2.5 text-center text-[#16a34a]">{totals.total}</td></tr>
      </tbody>
    </table>
  </div>
);

const SchoolSearchCombobox = ({
  schools,
  value,
  onChange,
  disabled,
}: {
  schools: BloombergSchool[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => schools.find((s) => s.school_key === value), [schools, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-[3.25rem] w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-lg ring-offset-background transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate">
            {selected
              ? selected.school_name
              : `Search & select school (${schools.length.toLocaleString()})`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        sideOffset={4}
      >
        <Command>
          <CommandInput
            placeholder={`Type to search among ${schools.length.toLocaleString()} schools…`}
            className="h-[3.25rem] border-none text-lg focus:ring-0"
          />
          <CommandList className="max-h-[320px]">
            <CommandEmpty className="flex flex-col items-center py-6 text-center text-sm text-muted-foreground">
              <Search className="mb-2 h-5 w-5 opacity-40" />
              <p>No schools match your search.</p>
              <p className="mt-1 text-xs">Try a different spelling or reduce filters.</p>
            </CommandEmpty>
            <CommandGroup>
              {schools.map((s) => (
                <CommandItem
                  key={s.school_key}
                  value={`${s.school_name} ${s.school_code ?? ""} ${s.school_type ?? ""} ${s.ownership ?? ""}`}
                  onSelect={() => {
                    onChange(s.school_key === value ? "" : s.school_key);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer flex-col items-start py-2.5"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-lg",
                        value === s.school_key && "font-semibold text-[#1f6feb]"
                      )}
                    >
                      {s.school_name}
                    </span>
                    {value === s.school_key && (
                      <Check className="ml-1 h-4 w-4 shrink-0 text-[#1f6feb]" />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {s.school_code && (
                      <span className="rounded-md bg-[#f4f6fb] px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {s.school_code}
                      </span>
                    )}
                    {s.school_type && (
                      <span className="rounded-md bg-[#f4f6fb] px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {s.school_type}
                      </span>
                    )}
                    {s.ownership && (
                      <span className="rounded-md bg-[#f4f6fb] px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {s.ownership}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
