import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, MapPin, Loader2, Send, Save,
  User as UserIcon, GraduationCap, Stethoscope, ClipboardList, MessageSquare, Eye,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { toast } from "sonner";
import { getLGAsForState } from "@/lib/nigeriaAdminData";
import {
  BMZ_GREEN, BMZ_TEAL, BMZ_DARK, BMZ_FORM_NAME,
  CADRE_OPTIONS, SEX_OPTIONS, REFRESHER_OPTIONS, PRIMARY_ACTIVITIES,
  AVAIL_OPTIONS, CHALLENGE_ITEMS, computeCompliance, readinessBand,
  type AvailStatus, type BmzChallenge,
} from "@/lib/bmz/definition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { mirrorSpecialForm, BMZ_FORM_ID } from "@/lib/specialFormBridge";
import { newEntryId } from "@/lib/savedForms";
import { queueOrInsert } from "@/lib/offlineSubmissions";
import handsLogo from "@/assets/logo-amehnities.png";

const STEPS = ["Identification", "Service Delivery", "Challenges & Output", "Sign-off & Review"];

interface Props {
  onClose: () => void;
}

const Field = ({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1 block text-xs font-semibold text-[#0b3d2e]">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
  </div>
);

const Segmented = ({
  options, value, onChange, cols = 3,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  cols?: number;
}) => (
  <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-colors ${
          value === o.value ? "border-[#0f6b52] bg-[#0b3d2e] text-white" : "border-border bg-white text-foreground"
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export default function BmzFormFiller({ onClose }: Props) {
  const { user } = useAuth();
  const geo = useGeolocation();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // A — Identification
  const [cadre, setCadre] = useState("");
  const [sex, setSex] = useState("");
  const [communityWard, setCommunityWard] = useState("");
  const [lga, setLga] = useState("");
  const [dateOfVisit, setDateOfVisit] = useState(new Date().toISOString().slice(0, 10));
  const [stateSupervisor, setStateSupervisor] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);

  // B — Training & C — Service delivery
  const [trainedEyeCare, setTrainedEyeCare] = useState<boolean | null>(null);
  const [lastTrainingDate, setLastTrainingDate] = useState("");
  const [refresherStatus, setRefresherStatus] = useState("");
  const [activities, setActivities] = useState<string[]>([]);
  const [activityOther, setActivityOther] = useState("");
  const [linkedFacility, setLinkedFacility] = useState("");
  const [screeningKits, setScreeningKits] = useState<AvailStatus | "">("");
  const [eyePoster, setEyePoster] = useState<AvailStatus | "">("");
  const [registerUpdated, setRegisterUpdated] = useState<boolean | null>(null);
  const [registerReason, setRegisterReason] = useState("");
  const [referralsEvidence, setReferralsEvidence] = useState<boolean | null>(null);
  const [numReferrals, setNumReferrals] = useState("");
  const [noReferrals, setNoReferrals] = useState(false);
  const [totalScreened, setTotalScreened] = useState("");

  // D — Output & E — Challenges
  const [gatherings, setGatherings] = useState("");
  const [challenges, setChallenges] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<string[]>(["", "", ""]);

  // F — Supervisor comment & sign-off
  const [comments, setComments] = useState("");
  const [actionPoints, setActionPoints] = useState("");
  const [respondentName, setRespondentName] = useState("");
  const [respondentSig, setRespondentSig] = useState(new Date().toISOString().slice(0, 10));
  const [supervisorName, setSupervisorName] = useState("");
  const [supervisorSig, setSupervisorSig] = useState(new Date().toISOString().slice(0, 10));

  const lgas = useMemo(() => getLGAsForState("Jigawa"), []);

  useEffect(() => { if (geo.position) setGps({ lat: geo.position.lat, lng: geo.position.lng, accuracy: geo.position.accuracy }); }, [geo.position]);
  useEffect(() => { if (geo.error) toast.error(geo.error); }, [geo.error]);

  const toggleActivity = (k: string) =>
    setActivities((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));
  const toggleChallenge = (k: string) =>
    setChallenges((c) => {
      const next = { ...c };
      if (k in next) delete next[k];
      else next[k] = "";
      return next;
    });

  const compliance = useMemo(
    () => computeCompliance({
      trainedEyeCare, refresherStatus,
      activitiesCount: activities.length,
      screeningKits, eyePoster, registerUpdated, referralsEvidence,
    }),
    [trainedEyeCare, refresherStatus, activities, screeningKits, eyePoster, registerUpdated, referralsEvidence],
  );
  const band = readinessBand(compliance);

  const idValid = !!(cadre && sex && communityWard.trim() && lga && dateOfVisit && stateSupervisor.trim());
  const serviceValid =
    trainedEyeCare !== null &&
    (!trainedEyeCare || !!lastTrainingDate) &&
    !!refresherStatus &&
    activities.length > 0 &&
    (!activities.includes("other") || activityOther.trim() !== "") &&
    linkedFacility.trim() !== "" &&
    screeningKits !== "" &&
    eyePoster !== "" &&
    registerUpdated !== null &&
    (registerUpdated || registerReason.trim() !== "") &&
    referralsEvidence !== null &&
    (noReferrals || numReferrals.trim() !== "");
  const challengeValid = Object.keys(challenges).length > 0 &&
    Object.entries(challenges).every(([, v]) => v.trim() !== "") &&
    gatherings.trim() !== "";
  const signoffValid = respondentName.trim() !== "" && respondentSig && supervisorName.trim() !== "" && supervisorSig;

  const goNext = () => {
    if (step === 0 && !idValid) return toast.error("Complete all identification fields.");
    if (step === 1 && !serviceValid) return toast.error("Complete all service delivery questions.");
    if (step === 2 && !challengeValid) return toast.error("Select & explain at least one challenge and enter the dissemination count.");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submittingRef = useRef(false);
  const submit = async (asDraft: boolean) => {
    if (submittingRef.current) return; // Synchronous double-submit lock
    if (!user?.id) return;
    if (!asDraft && !idValid) { setStep(0); return toast.error("Complete identification."); }
    if (!asDraft && !serviceValid) { setStep(1); return toast.error("Complete service delivery."); }
    if (!asDraft && !challengeValid) { setStep(2); return toast.error("Complete challenges & output."); }
    if (!asDraft && !signoffValid) { setStep(3); return toast.error("Complete respondent & supervisor sign-off."); }
    submittingRef.current = true;
    setSaving(true);
    try {
      const submissionId = crypto.randomUUID();
      const mirrorId = newEntryId();
      const challengeArr: BmzChallenge[] = Object.entries(challenges).map(([type, explain]) => ({ type, explain }));
      const { queued } = await queueOrInsert("bmz_monitoring", {
        id: submissionId,
        monitor_id: user.id,
        date_of_visit: dateOfVisit,
        state: "Jigawa",
        lga,
        community_ward: communityWard,
        state_supervisor: stateSupervisor,
        cadre, sex,
        trained_eye_care: trainedEyeCare,
        last_training_date: trainedEyeCare && lastTrainingDate ? lastTrainingDate : null,
        refresher_status: refresherStatus,
        primary_activities: activities,
        primary_activity_other: activities.includes("other") ? activityOther : null,
        linked_facility: linkedFacility,
        screening_kits: screeningKits || null,
        eye_poster: eyePoster || null,
        register_updated: registerUpdated,
        register_reason: registerUpdated ? null : registerReason,
        referrals_evidence: referralsEvidence,
        num_referrals: noReferrals ? 0 : (numReferrals === "" ? null : parseInt(numReferrals, 10)),
        no_referrals: noReferrals,
        total_screened: totalScreened === "" ? null : parseInt(totalScreened, 10),
        gatherings_count: gatherings === "" ? null : parseInt(gatherings, 10),
        challenges: challengeArr,
        suggestions: suggestions.filter((s) => s.trim() !== ""),
        supervisor_comments: comments,
        action_points: actionPoints,
        respondent_name: respondentName,
        respondent_sig_date: respondentSig || null,
        supervisor_name: supervisorName,
        supervisor_sig_date: supervisorSig || null,
        gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null, gps_accuracy: gps?.accuracy ?? null,
        compliance_score: compliance,
        readiness_band: band.label,
        status: asDraft ? "draft" : "sent",
      }, true, { mirrorEntryId: mirrorId });

      await mirrorSpecialForm({
        id: mirrorId,
        userId: user.id,
        formId: BMZ_FORM_ID,
        formName: BMZ_FORM_NAME,
        formDescription: `${communityWard || lga}, Jigawa — ${band.label} (${compliance}%)`,
        status: asDraft ? "draft" : "sent",
        responses: { cadre, activities, compliance_score: compliance },
        gps: gps ? { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy } : null,
        submissionId,
        offline: queued,
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
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f1f6f4]">
      {/* Header */}
      <div className="shrink-0 px-4 pb-5 pt-4 text-white" style={{ background: `linear-gradient(150deg, ${BMZ_DARK}, ${BMZ_GREEN})` }}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex items-center gap-2 text-center">
            <Eye className="h-7 w-7" style={{ color: BMZ_TEAL }} />
            <div className="leading-tight">
              <p className="text-[11px] font-bold uppercase tracking-wide">Jigawa State Inclusive Eye Health BMZ Project</p>
              <p className="text-[10px]" style={{ color: BMZ_TEAL }}>Monitoring Checklist — Ambassadors, TBAs & CHEWs</p>
            </div>
          </div>
          <img src={handsLogo} alt="HANDS" className="h-8 w-8 rounded" loading="lazy" />
        </div>
        {/* Stepper */}
        <div className="mt-4 flex items-center">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${i < step ? "bg-[#2dd4a8] text-[#0b3d2e]" : i === step ? "bg-white text-[#0b3d2e]" : "bg-white/15 text-white/60"}`}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</div>
                <span className={`mt-1 hidden text-[10px] sm:block ${i === step ? "text-white" : "text-white/60"}`}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`mx-1 h-0.5 flex-1 ${i < step ? "bg-[#2dd4a8]" : "bg-white/15"}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="mx-auto max-w-2xl space-y-4 pb-6">

          {/* STEP 0 — IDENTIFICATION */}
          {step === 0 && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2" style={{ color: BMZ_GREEN }}><UserIcon className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">A · Identification</h3></div>
              <div className="space-y-4">
                <Field label="Cadre" required><Segmented options={CADRE_OPTIONS} value={cadre} onChange={setCadre} cols={3} /></Field>
                <Field label="Sex" required><Segmented options={SEX_OPTIONS} value={sex} onChange={setSex} cols={2} /></Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Community / Ward" required><Input value={communityWard} onChange={(e) => setCommunityWard(e.target.value)} placeholder="Enter community/ward" className="h-11" /></Field>
                  <Field label="LGA" required>
                    <Select value={lga} onValueChange={setLga}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Select LGA" /></SelectTrigger>
                      <SelectContent className="max-h-72">{lgas.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Date of visit" required><Input type="date" value={dateOfVisit} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDateOfVisit(e.target.value)} className="h-11" /></Field>
                  <Field label="State Supervisor" required><Input value={stateSupervisor} onChange={(e) => setStateSupervisor(e.target.value)} placeholder="Enter supervisor name" className="h-11" /></Field>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-[#f1f6f4] p-3">
                  <div className="text-xs">
                    <p className="font-semibold text-[#0b3d2e]">GPS Location</p>
                    <p className={gps ? "text-[#16a34a]" : "text-muted-foreground"}>{gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : "Optional — not captured"}</p>
                  </div>
                  <Button type="button" size="sm" onClick={() => geo.getCurrentPosition()} disabled={geo.isLoading} style={{ background: BMZ_GREEN }}>{geo.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}<span className="ml-1">Capture GPS</span></Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 1 — TRAINING & SERVICE DELIVERY */}
          {step === 1 && (
            <>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2" style={{ color: BMZ_GREEN }}><GraduationCap className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">B · Training & Capacity</h3></div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="5. Trained on primary eye care?" required>
                      <Segmented options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} value={trainedEyeCare === null ? "" : trainedEyeCare ? "yes" : "no"} onChange={(v) => setTrainedEyeCare(v === "yes")} cols={2} />
                    </Field>
                    {trainedEyeCare && (
                      <Field label="Date of last training" required><Input type="date" value={lastTrainingDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setLastTrainingDate(e.target.value)} className="h-11" /></Field>
                    )}
                  </div>
                  <Field label="6. Refresher / on-job training received this quarter?" required>
                    <Segmented options={REFRESHER_OPTIONS} value={refresherStatus} onChange={setRefresherStatus} cols={3} />
                  </Field>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2" style={{ color: BMZ_GREEN }}><Stethoscope className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">C · Service Delivery</h3></div>
                <div className="space-y-4">
                  <Field label="7. Primary activity this quarter (tick all that apply)" required>
                    <div className="space-y-2">
                      {PRIMARY_ACTIVITIES.map((a) => (
                        <label key={a.key} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={activities.includes(a.key)} onChange={() => toggleActivity(a.key)} className="h-4 w-4 accent-[#0f6b52]" />
                          <span>{a.label}</span>
                        </label>
                      ))}
                      {activities.includes("other") && (
                        <Input value={activityOther} onChange={(e) => setActivityOther(e.target.value)} placeholder="Please specify" className="h-10" />
                      )}
                    </div>
                  </Field>
                  <Field label="8. Linked health facility" required><Input value={linkedFacility} onChange={(e) => setLinkedFacility(e.target.value)} placeholder="Enter linked health facility" className="h-11" /></Field>
                  <Field label="9. Screening kits available & in use?" required>
                    <Segmented options={AVAIL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} value={screeningKits} onChange={(v) => setScreeningKits(v as AvailStatus)} cols={3} />
                  </Field>
                  <Field label="Eye poster available in the facility?" required>
                    <Segmented options={AVAIL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} value={eyePoster} onChange={(v) => setEyePoster(v as AvailStatus)} cols={3} />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="10. Register / referral form up to date?" required>
                      <Segmented options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} value={registerUpdated === null ? "" : registerUpdated ? "yes" : "no"} onChange={(v) => setRegisterUpdated(v === "yes")} cols={2} />
                    </Field>
                    {registerUpdated === false && (
                      <Field label="If No, reason" required><Input value={registerReason} onChange={(e) => setRegisterReason(e.target.value)} placeholder="Please specify reason" className="h-11" /></Field>
                    )}
                  </div>
                  <Field label="11. Evidence of referrals sent to facility?" required>
                    <Segmented options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} value={referralsEvidence === null ? "" : referralsEvidence ? "yes" : "no"} onChange={(v) => setReferralsEvidence(v === "yes")} cols={2} />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Number of referrals">
                      <Input type="number" min={0} value={numReferrals} disabled={noReferrals} onChange={(e) => setNumReferrals(e.target.value)} placeholder="Enter number" className="h-11" />
                    </Field>
                    <Field label="Total number screened">
                      <Input type="number" min={0} value={totalScreened} onChange={(e) => setTotalScreened(e.target.value)} placeholder="Enter total number" className="h-11" />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={noReferrals} onChange={(e) => { setNoReferrals(e.target.checked); if (e.target.checked) setNumReferrals(""); }} className="h-4 w-4 accent-[#0f6b52]" />
                    <span>No referrals made</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* STEP 2 — OUTPUT & CHALLENGES */}
          {step === 2 && (
            <>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2" style={{ color: BMZ_GREEN }}><ClipboardList className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">D · Output</h3></div>
                <Field label="12. Number of community gatherings where eye health was disseminated this quarter" required>
                  <Input type="number" min={0} value={gatherings} onChange={(e) => setGatherings(e.target.value)} placeholder="Enter number" className="h-11" />
                </Field>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2" style={{ color: BMZ_GREEN }}><ClipboardList className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">E · Challenges & Support</h3></div>
                <Field label="13. Challenges faced (tick all + explain)" required>
                  <div className="space-y-2">
                    {CHALLENGE_ITEMS.map((c) => {
                      const on = c.key in challenges;
                      return (
                        <div key={c.key} className="space-y-1">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={on} onChange={() => toggleChallenge(c.key)} className="h-4 w-4 accent-[#0f6b52]" />
                            <span>{c.label}</span>
                          </label>
                          {on && (
                            <Input value={challenges[c.key]} onChange={(e) => setChallenges((prev) => ({ ...prev, [c.key]: e.target.value }))} placeholder="Please explain" className="h-10" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Field>
                <div className="mt-4">
                  <Field label="14. Suggestions to improve support">
                    <div className="space-y-2">
                      {suggestions.map((s, i) => (
                        <Input key={i} value={s} onChange={(e) => setSuggestions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Suggestion ${String.fromCharCode(97 + i)}`} className="h-10" />
                      ))}
                    </div>
                  </Field>
                </div>
              </div>
            </>
          )}

          {/* STEP 3 — SIGN-OFF & REVIEW */}
          {step === 3 && (
            <>
              <div className="rounded-2xl p-4 text-white shadow-sm" style={{ background: `linear-gradient(150deg, ${BMZ_DARK}, ${BMZ_GREEN})` }}>
                <p className="text-xs uppercase tracking-wide text-white/70">Monitoring compliance index</p>
                <div className="mt-1 flex items-end justify-between">
                  <p className="text-4xl font-black">{compliance}%</p>
                  <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: band.color }}>{band.label}</span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full" style={{ width: `${compliance}%`, background: band.color }} />
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2" style={{ color: BMZ_GREEN }}><MessageSquare className="h-5 w-5" /><h3 className="text-sm font-bold uppercase tracking-wide">F · Supervisor Comment</h3></div>
                <div className="space-y-4">
                  <Field label="15. Comments / Feedback"><Textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Enter comments or feedback" rows={3} /></Field>
                  <Field label="16. Action points for next monitoring"><Textarea value={actionPoints} onChange={(e) => setActionPoints(e.target.value)} placeholder="Enter action points" rows={3} /></Field>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: BMZ_GREEN }}>Sign-off</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Name of respondent" required><Input value={respondentName} onChange={(e) => setRespondentName(e.target.value)} placeholder="Enter name" className="h-11" /></Field>
                  <Field label="Respondent signature date" required><Input type="date" value={respondentSig} onChange={(e) => setRespondentSig(e.target.value)} className="h-11" /></Field>
                  <Field label="Name of supervisor" required><Input value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="Enter name" className="h-11" /></Field>
                  <Field label="Supervisor signature date" required><Input type="date" value={supervisorSig} onChange={(e) => setSupervisorSig(e.target.value)} className="h-11" /></Field>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Footer nav */}
      <div className="shrink-0 border-t border-border bg-white p-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} className="gap-1"><ArrowLeft className="h-4 w-4" /> Back</Button>
          )}
          <Button type="button" variant="ghost" onClick={() => submit(true)} disabled={saving} className="gap-1 text-muted-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
          </Button>
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext} className="gap-1" style={{ background: BMZ_GREEN }}>Next <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button type="button" onClick={() => submit(false)} disabled={saving} className="gap-1" style={{ background: BMZ_GREEN }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit form
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
