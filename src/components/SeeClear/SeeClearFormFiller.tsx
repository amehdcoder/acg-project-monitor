import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, MapPin, Loader2, Camera, Save, Send, Plus, Trash2,
  User as UserIcon, Building2, ClipboardCheck, ChevronDown, Phone, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { toast } from "sonner";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import {
  FACILITY_LEVELS, OWNERSHIP_TYPES, FUNCTIONAL_STATUS,
  GENERAL_QUESTIONS, HR_QUESTIONS, INFRA_QUESTIONS, EQUIPMENT_ITEMS,
  EQUIP_STATUS_META, CHALLENGE_OPTIONS, RECOMMENDATION_OPTIONS, EVIDENCE_SLOTS,
  computeScores, scoreYesNo, scoreEquipment, readinessBand,
  type YesNoAnswers, type EquipAnswers, type EquipStatus, type YesNoQ,
} from "@/lib/seeclear/definition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { mirrorSpecialForm, SEECLEAR_FORM_ID } from "@/lib/specialFormBridge";
import { queueOrUploadMedia } from "@/lib/offlineMedia";
import handsLogo from "@/assets/logo-amehnities.png";
import coatOfArms from "@/assets/nigeria-coat-of-arms.png.asset.json";

const NAVY = "#0c2340";
const STEPS = ["Facility Profile", "Checklist", "Review & Submit"];

interface Props {
  onClose: () => void;
}

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-[#0c2340]">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
  </div>
);

const YesNo = ({ value, onChange }: { value: "yes" | "no" | ""; onChange: (v: "yes" | "no") => void }) => (
  <div className="flex overflow-hidden rounded-lg border border-border">
    <button type="button" onClick={() => onChange("yes")} className={`px-4 py-1.5 text-sm font-semibold ${value === "yes" ? "bg-[#16a34a] text-white" : "bg-white text-foreground"}`}>Yes</button>
    <button type="button" onClick={() => onChange("no")} className={`px-4 py-1.5 text-sm font-semibold ${value === "no" ? "bg-[#dc2626] text-white" : "bg-white text-foreground"}`}>No</button>
  </div>
);

const Chips = ({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) => (
  <div className="flex flex-wrap gap-2">
    {options.map((o) => {
      const on = selected.includes(o);
      return (
        <button key={o} type="button" onClick={() => onToggle(o)} className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-[#2563eb] bg-[#eaf1fd] text-[#2563eb]" : "border-border text-muted-foreground"}`}>
          {o} {on ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      );
    })}
  </div>
);

// Collapsible Yes/No section. Defined at module scope so it keeps a stable
// component identity across renders (declaring it inside the parent caused the
// whole section to unmount/remount — and flicker — on every answer toggle).
const Section = ({
  id, title, qs, answers, setAnswers, icon: Icon, openSection, setOpenSection,
}: {
  id: string;
  title: string;
  qs: YesNoQ[];
  answers: YesNoAnswers;
  setAnswers: (a: YesNoAnswers) => void;
  icon: any;
  openSection: string;
  setOpenSection: (id: string) => void;
}) => {
  const sc = scoreYesNo(qs, answers);
  const open = openSection === id;
  return (
    <div className="rounded-xl border border-border bg-white">
      <button type="button" onClick={() => setOpenSection(open ? "" : id)} className="flex w-full items-center justify-between gap-2 p-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#2563eb]"><Icon className="h-4 w-4" /> {title}</span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-xs font-semibold text-[#15803d]">{sc.score} / {sc.max}</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {qs.map((q) => (
            <div key={q.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">{q.label}</span>
              <YesNo value={answers[q.key] || ""} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function SeeClearFormFiller({ onClose }: Props) {
  const { user } = useAuth();
  const geo = useGeolocation();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — profile
  const [dateOfVisit, setDateOfVisit] = useState(new Date().toISOString().slice(0, 10));
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [community, setCommunity] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [level, setLevel] = useState("primary");
  const [ownership, setOwnership] = useState("government");
  const [funcStatus, setFuncStatus] = useState("fully");
  const [focalName, setFocalName] = useState("");
  const [focalDesignation, setFocalDesignation] = useState("");
  const [focalPhone, setFocalPhone] = useState("");
  const [team, setTeam] = useState<{ name: string; role: string }[]>([]);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);

  // Step 2 — checklist
  const [general, setGeneral] = useState<YesNoAnswers>({});
  const [staffOnDuty, setStaffOnDuty] = useState("");
  const [hr, setHr] = useState<YesNoAnswers>({});
  const [infra, setInfra] = useState<YesNoAnswers>({});
  const [equip, setEquip] = useState<EquipAnswers>({});
  const [openSection, setOpenSection] = useState<string>("general");

  // Step 3 — review
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const [officerSig, setOfficerSig] = useState("");
  const [inchargeSig, setInchargeSig] = useState("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const states = useMemo(() => getAllStates(), []);
  const lgas = useMemo(() => (state ? getLGAsForState(state) : []), [state]);
  const wards = useMemo(() => (state && lga ? getWardsForLGA(state, lga) : []), [state, lga]);

  useEffect(() => { if (geo.position) setGps({ lat: geo.position.lat, lng: geo.position.lng, accuracy: geo.position.accuracy }); }, [geo.position]);
  useEffect(() => { if (geo.error) toast.error(geo.error); }, [geo.error]);

  const scores = useMemo(() => computeScores(general, hr, infra, equip), [general, hr, infra, equip]);
  const generalScore = scoreYesNo(GENERAL_QUESTIONS, general);
  const hrScore = scoreYesNo(HR_QUESTIONS, hr);
  const infraScore = scoreYesNo(INFRA_QUESTIONS, infra);
  const equipScore = scoreEquipment(equip);
  const band = readinessBand(scores.overallPct);

  const profileValid = !!(state && lga && ward && community && facilityName && level && ownership && funcStatus && focalName && focalDesignation && focalPhone && gps);

  const checklistValid = useMemo(() => {
    const allYesNo = (qs: YesNoQ[], a: YesNoAnswers) => qs.every((q) => a[q.key] === "yes" || a[q.key] === "no");
    const equipDone = EQUIPMENT_ITEMS.every((it) => !!equip[it.key]);
    return (
      allYesNo(GENERAL_QUESTIONS, general) &&
      staffOnDuty.trim() !== "" &&
      allYesNo(HR_QUESTIONS, hr) &&
      allYesNo(INFRA_QUESTIONS, infra) &&
      equipDone
    );
  }, [general, staffOnDuty, hr, infra, equip]);

  const requiredEvidenceComplete = EVIDENCE_SLOTS.filter((s) => s.required).every((s) => !!evidence[s.slot]);
  const reviewValid = requiredEvidenceComplete && challenges.length > 0 && recommendations.length > 0 && remarks.trim() !== "" && !!officerSig && !!inchargeSig;

  const handlePhoto = async (slot: string, file: File | null) => {
    if (!file || !user?.id) return;
    setUploading(slot);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}_${slot}.${ext}`;
      const { queued } = await queueOrUploadMedia("seeclear-evidence", path, file, { upsert: true });
      setEvidence((e) => ({ ...e, [slot]: path }));
      toast.success(queued ? "Photo saved offline — will upload automatically" : "Photo attached");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const submit = async (asDraft: boolean) => {
    if (!user?.id) return;
    if (!asDraft && !profileValid) { toast.error("Complete all required facility information."); setStep(0); return; }
    if (!asDraft && !checklistValid) { toast.error("Answer every checklist item, staff on duty and all equipment statuses."); setStep(1); return; }
    if (!asDraft && !reviewValid) { toast.error("Attach required photos, select challenges & recommendations, add remarks and both sign-offs."); setStep(2); return; }
    setSaving(true);
    try {
      const { queued } = await queueOrInsert("seeclear_monitoring", {
        monitor_id: user.id,
        date_of_visit: dateOfVisit,
        state, lga, ward, community,
        facility_name: facilityName,
        facility_level: level,
        ownership,
        functional_status: funcStatus,
        is_functional: general.functional === "yes" || funcStatus === "fully",
        staff_on_duty: staffOnDuty === "" ? null : parseInt(staffOnDuty, 10),
        focal_name: focalName, focal_designation: focalDesignation, focal_phone: focalPhone,
        team_members: team,
        gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null, gps_accuracy: gps?.accuracy ?? null,
        general,
        hr_score: hrScore.score, hr_max: hrScore.max,
        infra_score: infraScore.score, infra_max: infraScore.max,
        equipment: equip,
        equip_score: equipScore.score, equip_max: equipScore.max,
        essential_supplies: general.supplies === "yes",
        complete_records: general.records === "yes",
        referral_compliance: scores.overallPct >= 60,
        readiness_score: scores.overallPct,
        overall_score: scores.overallPct,
        evidence, challenges, recommendations, remarks,
        officer_signature: officerSig, incharge_signature: inchargeSig,
        critical_gap: challenges[0] || null,
        status: asDraft ? "draft" : "sent",
      });
      await mirrorSpecialForm({
        userId: user.id,
        formId: SEECLEAR_FORM_ID,
        formName: "See Clear Eye Health Facility Monitoring Checklist",
        formDescription: facilityName ? `${facilityName} — ${state}, ${lga}` : `${state}, ${lga}`,
        status: asDraft ? "draft" : "sent",
        responses: { general, equipment: equip, readiness_score: scores.overallPct },
        gps: gps ? { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy } : null,
      });
      toast.success(
        queued
          ? (asDraft ? "Draft saved offline — will sync automatically" : "Submitted offline — will sync automatically")
          : (asDraft ? "Draft saved" : "Checklist submitted"),
      );
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };



  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f6fb]">
      {/* Navy header */}
      <div className="shrink-0 px-4 pb-5 pt-4 text-white" style={{ background: `linear-gradient(160deg, ${NAVY}, #163a63)` }}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex items-center gap-2">
            <img src={coatOfArms.url} alt="" className="h-8 w-8" loading="lazy" />
            <div className="text-center leading-tight">
              <p className="text-[11px] font-semibold">Plateau Comprehensive and Inclusive Eye Health Project</p>
              <p className="text-[10px] text-white/70">Monitoring, Evaluation and Learning Checklist</p>
            </div>
            <img src={handsLogo} alt="HANDS" className="h-8 w-8 rounded" loading="lazy" />
          </div>
          <div className="w-9" />
        </div>
        {/* Stepper */}
        <div className="mt-4 flex items-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${i < step ? "bg-[#2dd4a8] text-[#0c2340]" : i === step ? "bg-[#2563eb] text-white" : "bg-white/15 text-white/60"}`}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</div>
                <span className={`mt-1 text-[11px] ${i === step ? "text-white" : "text-white/60"}`}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`mx-1 h-0.5 flex-1 ${i < step ? "bg-[#2dd4a8]" : "bg-white/15"}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-2xl space-y-4">
          {/* STEP 1 — PROFILE */}
          {step === 0 && (
            <>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-[#2563eb]"><ClipboardCheck className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">Visit Details</h3></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Date of Visit" required><Input type="date" value={dateOfVisit} onChange={(e) => setDateOfVisit(e.target.value)} className="h-11" /></Field>
                  <Field label="State" required>
                    <Select value={state} onValueChange={(v) => { setState(v); setLga(""); setWard(""); }}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent className="max-h-72">{states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="LGA" required>
                    <Select value={lga} onValueChange={(v) => { setLga(v); setWard(""); }} disabled={!state}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Select LGA" /></SelectTrigger>
                      <SelectContent className="max-h-72">{lgas.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Ward" required>
                    <Select value={ward} onValueChange={setWard} disabled={!lga}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Select ward" /></SelectTrigger>
                      <SelectContent className="max-h-72">{wards.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Community / Location" required><Input value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="Enter community" className="h-11" /></Field>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-[#2563eb]"><Building2 className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">Facility Information</h3></div>
                <div className="space-y-3">
                  <Field label="Facility Name" required><Input value={facilityName} onChange={(e) => setFacilityName(e.target.value)} placeholder="Enter facility name" className="h-11" /></Field>
                  <Field label="Facility Level" required>
                    <div className="grid grid-cols-3 gap-2">{FACILITY_LEVELS.map((l) => <button key={l.value} type="button" onClick={() => setLevel(l.value)} className={`rounded-lg border-2 py-2 text-sm font-semibold ${level === l.value ? "border-[#2563eb] bg-[#0c2340] text-white" : "border-border text-foreground"}`}>{l.label}</button>)}</div>
                  </Field>
                  <Field label="Ownership" required>
                    <div className="grid grid-cols-2 gap-2">{OWNERSHIP_TYPES.map((o) => <button key={o.value} type="button" onClick={() => setOwnership(o.value)} className={`rounded-lg border-2 py-2 text-sm font-semibold ${ownership === o.value ? "border-[#2563eb] bg-[#0c2340] text-white" : "border-border text-foreground"}`}>{o.label}</button>)}</div>
                  </Field>
                  <Field label="Facility Functional Status" required>
                    <div className="grid grid-cols-3 gap-2">{FUNCTIONAL_STATUS.map((f) => <button key={f.value} type="button" onClick={() => setFuncStatus(f.value)} className={`rounded-lg border-2 py-2 text-xs font-semibold ${funcStatus === f.value ? "border-[#2563eb] bg-[#0c2340] text-white" : "border-border text-foreground"}`}>{f.label}</button>)}</div>
                  </Field>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-[#2563eb]"><UserIcon className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">Focal Person / PIEC</h3></div>
                <div className="space-y-3">
                  <Field label="Name" required><Input value={focalName} onChange={(e) => setFocalName(e.target.value)} placeholder="Full name" className="h-11" /></Field>
                  <Field label="Designation" required><Input value={focalDesignation} onChange={(e) => setFocalDesignation(e.target.value)} placeholder="e.g. Community Health Officer" className="h-11" /></Field>
                  <Field label="Phone Number" required>
                    <div className="relative"><Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={focalPhone} onChange={(e) => setFocalPhone(e.target.value)} placeholder="+234..." className="h-11 pl-9" /></div>
                  </Field>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[#2563eb]"><UserIcon className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">Monitoring Team Members</h3></span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setTeam([...team, { name: "", role: "" }])}><Plus className="mr-1 h-4 w-4" /> Add Member</Button>
                </div>
                <div className="space-y-2">
                  {team.map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={m.name} onChange={(e) => setTeam(team.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" className="h-10" />
                      <Input value={m.role} onChange={(e) => setTeam(team.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role" className="h-10" />
                      <Button type="button" size="icon" variant="ghost" className="shrink-0 text-red-500" onClick={() => setTeam(team.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  {team.length === 0 && <p className="text-xs text-muted-foreground">No team members added yet.</p>}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-[#f4f6fb] p-3">
                  <div className="text-xs">
                    <p className="font-semibold text-[#0c2340]">GPS Status</p>
                    <p className={gps ? "text-[#16a34a]" : "text-muted-foreground"}>{gps ? `Captured ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : "Not captured"}</p>
                  </div>
                  <Button type="button" size="sm" onClick={() => geo.getCurrentPosition()} disabled={geo.isLoading} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{geo.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}<span className="ml-1">Capture GPS</span></Button>
                </div>
              </div>
            </>
          )}

          {/* STEP 2 — CHECKLIST */}
          {step === 1 && (
            <>
              <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
                <p className="text-sm font-medium text-[#0c2340]">{facilityName || "Facility"} • {new Date(dateOfVisit).toLocaleDateString()}</p>
                <span className="rounded-full px-3 py-1 text-sm font-bold text-white" style={{ background: band.color }}>Overall {scores.overallPct}%</span>
              </div>

              {/* General assessment */}
              <div className="rounded-xl border border-border bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-border p-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[#2563eb]"><ClipboardCheck className="h-4 w-4" /> General Facility Assessment</span>
                  <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-xs font-semibold text-[#15803d]">{generalScore.score} / {generalScore.max}</span>
                </div>
                <div className="space-y-2 p-3">
                  {GENERAL_QUESTIONS.map((q) => (
                    <div key={q.key} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-foreground">{q.label}</span>
                      <YesNo value={general[q.key] || ""} onChange={(v) => setGeneral({ ...general, [q.key]: v })} />
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-sm text-foreground">Number of staff on duty <span className="text-red-500">*</span></span>
                    <Input type="number" min={0} value={staffOnDuty} onChange={(e) => setStaffOnDuty(e.target.value)} className="h-9 w-24" />
                  </div>
                </div>
              </div>

              <Section id="hr" title="Human Resources" qs={HR_QUESTIONS} answers={hr} setAnswers={setHr} icon={UserIcon} openSection={openSection} setOpenSection={setOpenSection} />
              <Section id="infra" title="Infrastructure & Utilities" qs={INFRA_QUESTIONS} answers={infra} setAnswers={setInfra} icon={Building2} openSection={openSection} setOpenSection={setOpenSection} />

              {/* Equipment */}
              <div className="rounded-xl border border-border bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-border p-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[#2563eb]"><Building2 className="h-4 w-4" /> Equipment & Medical Supplies</span>
                  <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-xs font-semibold text-[#15803d]">{equipScore.score} / {equipScore.max}</span>
                </div>
                <div className="p-3">
                  <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    {(Object.keys(EQUIP_STATUS_META) as EquipStatus[]).map((k) => (
                      <span key={k} className="flex items-center gap-1"><span style={{ color: EQUIP_STATUS_META[k].color }}>{EQUIP_STATUS_META[k].symbol}</span>{EQUIP_STATUS_META[k].label}</span>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {EQUIPMENT_ITEMS.map((it) => (
                      <div key={it.key} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground">{it.label}{it.group === "advanced" && <span className="ml-1 text-[10px] text-muted-foreground">(Sec/Tert)</span>}</span>
                        <div className="flex gap-1">
                          {(Object.keys(EQUIP_STATUS_META) as EquipStatus[]).map((k) => {
                            const on = equip[it.key] === k;
                            return <button key={k} type="button" title={EQUIP_STATUS_META[k].label} onClick={() => setEquip({ ...equip, [it.key]: k })} className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-bold ${on ? "text-white" : "bg-white"}`} style={on ? { background: EQUIP_STATUS_META[k].color, borderColor: EQUIP_STATUS_META[k].color } : { color: EQUIP_STATUS_META[k].color, borderColor: "#e2e8f0" }}>{EQUIP_STATUS_META[k].symbol}</button>;
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* STEP 3 — REVIEW */}
          {step === 2 && (
            <>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-[#2563eb]"><Camera className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">Photo Evidence</h3></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {EVIDENCE_SLOTS.map((p) => (
                    <div key={p.slot}>
                      <input ref={(el) => (fileRefs.current[p.slot] = el)} type="file" accept="image/*" hidden onChange={(e) => handlePhoto(p.slot, e.target.files?.[0] || null)} />
                      <button type="button" onClick={() => fileRefs.current[p.slot]?.click()} className="flex aspect-square w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#cdd7e6] bg-[#f4f6fb] text-muted-foreground">
                        {uploading === p.slot ? <Loader2 className="h-5 w-5 animate-spin" /> : evidence[p.slot] ? <Check className="h-6 w-6 text-[#16a34a]" /> : <Plus className="h-5 w-5" />}
                      </button>
                      <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{p.label}{p.required && <span className="text-red-500"> *</span>}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-bold text-[#0c2340]">Challenges Identified <span className="text-red-500">*</span></h3>
                <Chips options={CHALLENGE_OPTIONS} selected={challenges} onToggle={(v) => setChallenges(challenges.includes(v) ? challenges.filter((c) => c !== v) : [...challenges, v])} />
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-bold text-[#0c2340]">Recommendations <span className="text-red-500">*</span></h3>
                <Chips options={RECOMMENDATION_OPTIONS} selected={recommendations} onToggle={(v) => setRecommendations(recommendations.includes(v) ? recommendations.filter((c) => c !== v) : [...recommendations, v])} />
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-bold text-[#0c2340]">Remarks <span className="text-red-500">*</span></h3>
                <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} placeholder="Enter additional comments" rows={3} />
                <p className="mt-1 text-right text-[10px] text-muted-foreground">{remarks.length} / 500</p>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-bold text-[#0c2340]">Sign-off</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Monitoring Officer Signature (name)" required><Input value={officerSig} onChange={(e) => setOfficerSig(e.target.value)} placeholder="Full name" className="h-11" /></Field>
                  <Field label="Facility In-Charge Signature (name)" required><Input value={inchargeSig} onChange={(e) => setInchargeSig(e.target.value)} placeholder="Full name" className="h-11" /></Field>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg p-3 text-white" style={{ background: band.color }}>
                  <span className="text-sm font-semibold">Overall Readiness Score</span>
                  <span className="text-lg font-bold">{scores.overallPct}% • {band.label}</span>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Footer nav */}
      <div className="shrink-0 border-t border-border bg-white p-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          {step > 0 ? <Button variant="outline" onClick={() => setStep(step - 1)}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button> : <span />}
          {step < 2 ? (
            <Button onClick={() => {
              if (step === 0 && !profileValid) { toast.error("Complete all required fields, including GPS capture."); return; }
              if (step === 1 && !checklistValid) { toast.error("Answer every checklist item, staff on duty and all equipment statuses."); return; }
              setStep(step + 1);
            }} className="bg-[#0c2340] hover:bg-[#163a63]">Next <ArrowRight className="ml-1 h-4 w-4" /></Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => submit(true)} disabled={saving}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save Draft</Button>
              <Button onClick={() => submit(false)} disabled={saving} className="bg-[#0c2340] hover:bg-[#163a63]">{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Submit Checklist</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
