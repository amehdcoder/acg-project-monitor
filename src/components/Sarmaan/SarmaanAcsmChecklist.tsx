import { useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, Send, Loader2, X, Wifi, WifiOff,
  Users, CheckCircle2, Landmark, Flag, Home, Building2, ClipboardList,
  MessageSquare, Megaphone, ClipboardCheck, Pill, HeartPulse, FileText,
  AlertTriangle, BadgeCheck, ShieldCheck, PenTool,
} from "lucide-react";
import heroImg from "@/assets/sarmaan-acsm-hero.png";
import MdaLocationCascade from "@/components/MdaChecklist/MdaLocationCascade";
import SignatureCapture from "@/components/FormFiller/SignatureCapture";
import GPSCapture from "@/components/FormFiller/GPSCapture";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useGeolocation } from "@/hooks/useGeolocation";
import { MapPin, Navigation } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  ACSM_SECTIONS, IEC_ITEMS, MOBILIZATION_ITEMS, ANNOUNCEMENT_CONTENT_ITEMS, ID_TYPES,
  MEDICINE_PREVENTS_OPTIONS, AWARENESS_COLUMNS, AWARENESS_SAMPLE_SIZE, AWARENESS_TARGETS,
  DRUG_ITEMS, ELIGIBILITY_ITEMS, DOCUMENTATION_ITEMS, ACSM_FIELD, type CheckItem,
} from "@/lib/sarmaan/acsmChecklist";

const GREEN = "#22A55A";
const NAVY = "#0A2540";
const TEAL = "#12B5A5";

const ICONS: Record<string, any> = {
  Landmark, Flag, Home, Building2, ClipboardList, MessageSquare,
};

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-[#12B5A5] focus:ring-2 focus:ring-[#12B5A5]/20";

interface Props {
  formId: string;
  userId: string;
  projectId: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

type Responses = Record<string, any>;

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------- stable presentational helpers (defined outside to preserve focus) ----------
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}{required && <span className="text-[#E25555]">*</span>}
      </span>
      {children}
    </label>
  );
}

function YnpRow({ item, options, value, onSelect }: {
  item: CheckItem; options: string[]; value: any; onSelect: (v: string) => void;
}) {
  const Icon = item.icon ? ICONS[item.icon] : null;
  const colors: Record<string, string> = { Yes: GREEN, No: "#E25555", Partly: "#F0A020", "N/A": "#94A3B8" };
  return (
    <div className="flex flex-col gap-2 border-b border-border/50 py-3 last:border-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: GREEN }} />}
        <span className="text-sm font-medium text-foreground">{item.label}</span>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onSelect(o)}
              className="min-w-[52px] rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95"
              style={active
                ? { background: colors[o], borderColor: colors[o], color: "#fff" }
                : { background: "transparent", borderColor: "#D5DEEA", color: "#64748B" }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SarmaanAcsmChecklist({ formId, userId, projectId, onClose, onSubmitted }: Props) {
  const { saveSubmission, isOnline } = useOfflineStorage();
  const { position } = useGeolocation();
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState<Responses>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (name: string, value: any) => setResponses((p) => ({ ...p, [name]: value }));
  const merge = (updates: Responses) => setResponses((p) => ({ ...p, ...updates }));
  const toggleMulti = (name: string, option: string) =>
    setResponses((p) => {
      const cur: string[] = Array.isArray(p[name]) ? p[name] : [];
      const next = cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option];
      return { ...p, [name]: next };
    });
  const isChecked = (name: string, option: string) =>
    Array.isArray(responses[name]) && responses[name].includes(option);

  const nameToId = useMemo(() => {
    const m: Record<string, string> = {};
    ["state", "lga", "ward", "community"].forEach((n) => (m[n] = n));
    return m;
  }, []);

  // ---- Derived KPIs (Section A) ----
  const teamsPlanned = num(responses[ACSM_FIELD.teamsPlanned]);
  const teamsWent = num(responses[ACSM_FIELD.teamsWentOut]);
  const teamsNotOut = Math.max(0, teamsPlanned - teamsWent);
  const deploymentRate = teamsPlanned > 0 ? Math.round((teamsWent / teamsPlanned) * 100) : 0;

  // ---- Derived awareness rates (Section D) ----
  const awarenessStats = useMemo(() => {
    const rows = Array.from({ length: AWARENESS_SAMPLE_SIZE }).map((_, r) => r + 1);
    const pct = (col: string) => {
      const answered = rows.filter((r) => responses[`aw_${r}_${col}`] !== undefined && responses[`aw_${r}_${col}`] !== "");
      if (!answered.length) return 0;
      const yes = answered.filter((r) => responses[`aw_${r}_${col}`] === "Yes").length;
      return Math.round((yes / answered.length) * 100);
    };
    return {
      awareness: pct("heard"),
      ageKnowledge: pct("knows_age"),
      freeMedicine: pct("knows_free"),
    };
  }, [responses]);

  const allAnswered = (items: CheckItem[]) => items.every((i) => !!responses[i.name]);

  const validateStep = (idx: number): string | null => {
    if (idx === 0) {
      if (!responses[ACSM_FIELD.state]) return "Select the State of supervision.";
      if (!responses[ACSM_FIELD.lga]) return "Select the LGA.";
      if (!responses[ACSM_FIELD.supervisionDate]) return "Enter the date of supervision.";
      if (!responses[ACSM_FIELD.teamsPlanned]) return "Enter the number of teams planned.";
      if (responses[ACSM_FIELD.teamsWentOut] === undefined || responses[ACSM_FIELD.teamsWentOut] === "")
        return "Enter the number of teams that went out.";
      if (teamsNotOut > 0 && !String(responses[ACSM_FIELD.teamReason] || "").trim())
        return "Enter the reason at least one team did not go out.";
    }
    if (idx === 1 && !allAnswered(IEC_ITEMS)) return "Answer all IEC materials & visibility checks.";
    // Section C (Town Announcers & Mobilization) is optional.

    if (idx === 4 && !allAnswered(DRUG_ITEMS)) return "Answer all drug management & administration checks.";
    if (idx === 5 && !allAnswered(ELIGIBILITY_ITEMS)) return "Answer all eligibility & safety checks.";
    if (idx === 6 && !allAnswered(DOCUMENTATION_ITEMS)) return "Answer all documentation & house marking checks.";
    if (idx === 7) {
      if (!responses[ACSM_FIELD.supervisorSignature]) return "Please provide the supervisor signature.";
      if (!responses[ACSM_FIELD.attestation]) return "You must confirm the attestation before submitting.";
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) { toast({ title: "Complete required fields", description: err, variant: "destructive" }); return; }
    setStep((s) => Math.min(ACSM_SECTIONS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goPrev = () => { setStep((s) => Math.max(0, s - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const handleSubmit = async () => {
    const err = validateStep(7);
    if (err) { toast({ title: "Complete required fields", description: err, variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const payload: Responses = {
        ...responses,
        [ACSM_FIELD.teamsNotOut]: teamsNotOut,
        [ACSM_FIELD.deploymentRate]: deploymentRate,
        [ACSM_FIELD.awarenessRate]: awarenessStats.awareness,
        [ACSM_FIELD.ageKnowledge]: awarenessStats.ageKnowledge,
        [ACSM_FIELD.freeMedicineKnowledge]: awarenessStats.freeMedicine,
      };
      const gps = responses[ACSM_FIELD.gps] || position;
      const loc = gps ? { lat: gps.lat, lng: gps.lng } : null;
      const res = await saveSubmission(formId, userId, payload, loc, null, "regular");
      if (res.success) {
        toast({
          title: res.offline ? "Saved offline" : "Checklist submitted",
          description: res.offline ? "Will sync automatically when back online." : "Thank you. Your supervision has been recorded.",
        });
        onSubmitted?.();
        onClose();
      } else {
        toast({ title: "Could not submit", description: "Please try again.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Submission failed", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const Chip = ({ label, active, onClick, color = GREEN }: { label: string; active: boolean; onClick: () => void; color?: string }) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-95"
      style={active ? { background: color, borderColor: color, color: "#fff" } : { borderColor: "#D5DEEA", color: "#64748B" }}
    >
      {active && <CheckCircle2 className="h-3.5 w-3.5" />}
      {label}
    </button>
  );

  // ---------- step content ----------
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-5">
            <MdaLocationCascade
              projectId={projectId}
              responses={responses}
              nameToId={nameToId}
              onSet={merge}
              disableMicroplan
              visibleLevels={["state", "lga", "ward", "community_name"]}
              optionalLevels={["ward", "community_name"]}
              big
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Ward Apex Facility">
                <input className={inputCls} value={responses[ACSM_FIELD.wardApexFacility] || ""}
                  onChange={(e) => set(ACSM_FIELD.wardApexFacility, e.target.value)} placeholder="Facility name" />
              </Field>
              <Field label="Date" required>
                <input type="date" className={inputCls} value={responses[ACSM_FIELD.supervisionDate] || ""}
                  onChange={(e) => set(ACSM_FIELD.supervisionDate, e.target.value)} />
              </Field>
              <Field label="Team(s) Supervised">
                <input className={inputCls} value={responses[ACSM_FIELD.teamSupervised] || ""}
                  onChange={(e) => set(ACSM_FIELD.teamSupervised, e.target.value)} placeholder="e.g. Team 011, 012" />
              </Field>
            </div>

            {/* Instant GPS capture — colourful, auto-triggered */}
            <div className="overflow-hidden rounded-2xl border shadow-sm"
              style={{ borderColor: "#12B5A533", background: "linear-gradient(135deg,#E9FBF4 0%,#EAF3FF 100%)" }}>
              <div className="flex items-center gap-2.5 px-4 pt-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow"
                  style={{ background: `linear-gradient(135deg,${TEAL},${GREEN})` }}>
                  <Navigation className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-extrabold" style={{ color: NAVY }}>
                    <MapPin className="h-4 w-4" style={{ color: TEAL }} /> Supervision Location (GPS)
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground">
                    Captured automatically — pins this visit on the Kano supervision map.
                  </div>
                </div>
              </div>
              <div className="p-3">
                <GPSCapture
                  value={responses[ACSM_FIELD.gps] || null}
                  onChange={(pos) => set(ACSM_FIELD.gps, pos)}
                  autoTrigger
                />
              </div>
            </div>



            <SectionBadge letter="A" title="Location & Teams" color="#2F6FE6" tint="#EAF1FE" />
            <div className="grid gap-3 sm:grid-cols-4">
              <KpiCard label="Teams Planned" accent="#2F6FE6"
                value2={responses[ACSM_FIELD.teamsPlanned]} onEdit={(v) => set(ACSM_FIELD.teamsPlanned, v)} />
              <KpiCard label="Teams That Went Out" accent={GREEN}
                value2={responses[ACSM_FIELD.teamsWentOut]} onEdit={(v) => set(ACSM_FIELD.teamsWentOut, v)} />

              <div className="rounded-2xl border border-border bg-card p-3">
                <div className="text-xs font-semibold text-muted-foreground">Teams Deployment Rate</div>
                <div className="mt-1 text-2xl font-extrabold" style={{ color: "#2F6FE6" }}>{deploymentRate}%</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${deploymentRate}%`, background: "#2F6FE6" }} />
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3">
                <div className="text-xs font-semibold text-muted-foreground">Teams Not Out</div>
                <div className="mt-1 flex items-center gap-2 text-2xl font-extrabold" style={{ color: "#E25555" }}>
                  {teamsNotOut}<Users className="h-4 w-4" />
                </div>
              </div>
            </div>
            {teamsNotOut > 0 && (
              <Field label="Reason any team did not go out" required>
                <input className={inputCls} value={responses[ACSM_FIELD.teamReason] || ""}
                  onChange={(e) => set(ACSM_FIELD.teamReason, e.target.value)} placeholder="Explain why a team did not deploy" />
              </Field>
            )}
          </div>
        );
      case 1:
        return (
          <div>
            <SectionBadge letter="B" title="IEC Materials & Visibility" color={GREEN} tint="#E7F6EE" />
            <div className="rounded-2xl border border-border bg-card px-4">
              {IEC_ITEMS.map((i) => (
                <YnpRow key={i.name} item={i} options={["Yes", "No", "Partly", "N/A"]}
                  value={responses[i.name]} onSelect={(v) => set(i.name, v)} />
              ))}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-5">
            <SectionBadge letter="C" title="Town Announcers & Mobilization" color="#F0A020" tint="#FDF3E3" />
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card px-4">
                {MOBILIZATION_ITEMS.map((i) => (
                  <YnpRow key={i.name} item={i} options={["Yes", "No"]}
                    value={responses[i.name]} onSelect={(v) => set(i.name, v)} />
                ))}
                <div className="border-t border-border/50 py-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Type of identification <span className="normal-case opacity-60">(select all that apply)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ID_TYPES.map((t) => (
                      <Chip key={t} label={t} active={isChecked(ACSM_FIELD.idType, t)}
                        onClick={() => toggleMulti(ACSM_FIELD.idType, t)} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border p-4" style={{ background: "#FDF6EC", borderColor: "#F0A02033" }}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: "#C77C10" }}>
                    <Megaphone className="h-4 w-4" /> Announcement Content Check
                  </div>
                  {ANNOUNCEMENT_CONTENT_ITEMS.map((i) => (
                    <YnpRow key={i.name} item={i} options={["Yes", "No"]}
                      value={responses[i.name]} onSelect={(v) => set(i.name, v)} />
                  ))}
                </div>
                <div className="rounded-2xl border p-4" style={{ background: "#EAF6FF", borderColor: "#2F6FE633" }}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: "#2F6FE6" }}>
                    <ShieldCheck className="h-4 w-4" /> What caregivers think the medicine prevents
                  </div>
                  <div className="mb-2 text-[11px] text-muted-foreground">Select all that were mentioned.</div>
                  <div className="flex flex-wrap gap-2">
                    {MEDICINE_PREVENTS_OPTIONS.map((o) => (
                      <Chip key={o} label={o} color="#2F6FE6" active={isChecked(ACSM_FIELD.medicinePrevents, o)}
                        onClick={() => toggleMulti(ACSM_FIELD.medicinePrevents, o)} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-5">
            <SectionBadge letter="D" title="Community Awareness Validation" color="#7C5CFF" tint="#EFEBFE" subtitle="Sample of 5 caregivers" />
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-3">#</th>
                    {AWARENESS_COLUMNS.map((c) => (
                      <th key={c.name} className="p-3 font-semibold">
                        {c.label}{c.sub && <div className="font-normal text-[10px] opacity-70">{c.sub}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: AWARENESS_SAMPLE_SIZE }).map((_, r) => {
                    const row = r + 1;
                    return (
                      <tr key={row} className="border-b border-border/50 last:border-0">
                        <td className="p-3 font-semibold text-muted-foreground">{row}</td>
                        {AWARENESS_COLUMNS.map((c) => {
                          const fname = `aw_${row}_${c.name}`;
                          if (c.kind === "yn") {
                            return (
                              <td key={c.name} className="p-2">
                                <div className="flex gap-1.5">
                                  {["Yes", "No"].map((o) => {
                                    const active = responses[fname] === o;
                                    return (
                                      <button key={o} type="button" onClick={() => set(fname, o)}
                                        className="rounded-md border px-2.5 py-1 text-xs font-semibold transition"
                                        style={active ? { background: o === "Yes" ? GREEN : "#E25555", borderColor: o === "Yes" ? GREEN : "#E25555", color: "#fff" } : { borderColor: "#D5DEEA", color: "#64748B" }}>
                                        {o}
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                            );
                          }
                          return (
                            <td key={c.name} className="p-2">
                              <select className={inputCls + " min-w-[140px] py-1.5"} value={responses[fname] || ""}
                                onChange={(e) => set(fname, e.target.value)}>
                                <option value="">Select option</option>
                                {c.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="rounded-2xl border p-4" style={{ background: "#F7F5FF", borderColor: "#7C5CFF22" }}>
              <div className="mb-3 text-sm font-bold" style={{ color: "#5B3FD6" }}>Awareness Summary</div>
              <div className="grid gap-4 sm:grid-cols-3">
                <RateBar label="Awareness Rate" value={awarenessStats.awareness} target={AWARENESS_TARGETS.awareness} color={GREEN} />
                <RateBar label="Correct Age Knowledge" value={awarenessStats.ageKnowledge} target={AWARENESS_TARGETS.ageKnowledge} color="#F0A020" />
                <RateBar label="Free Medicine Knowledge" value={awarenessStats.freeMedicine} target={AWARENESS_TARGETS.freeMedicine} color="#7C5CFF" />
              </div>
              <div className="mt-3 text-[11px] text-muted-foreground">
                Targets: Awareness ≥{AWARENESS_TARGETS.awareness}% · Age Knowledge ≥{AWARENESS_TARGETS.ageKnowledge}% · Free Medicine ≥{AWARENESS_TARGETS.freeMedicine}%
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div>
            <SectionBadge letter="E" title="Drug Management & Administration" color={TEAL} tint="#E4F7F4" icon={<Pill className="h-4 w-4" />} />
            <div className="rounded-2xl border border-border bg-card px-4">
              {DRUG_ITEMS.map((i) => (
                <YnpRow key={i.name} item={i} options={["Yes", "No", "N/A"]}
                  value={responses[i.name]} onSelect={(v) => set(i.name, v)} />
              ))}
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-5">
            <SectionBadge letter="F" title="Eligibility & Safety" color="#E25555" tint="#FCEBEB" icon={<HeartPulse className="h-4 w-4" />} />
            <div className="rounded-2xl border border-border bg-card px-4">
              {ELIGIBILITY_ITEMS.map((i) => (
                <YnpRow key={i.name} item={i} options={["Yes", "No", "N/A"]}
                  value={responses[i.name]} onSelect={(v) => set(i.name, v)} />
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Adverse events observed">
                <input type="number" min={0} className={inputCls} value={responses[ACSM_FIELD.aesObserved] ?? ""}
                  onChange={(e) => set(ACSM_FIELD.aesObserved, e.target.value)} placeholder="0" />
              </Field>
              <Field label="Adverse events referred to facility">
                <input type="number" min={0} className={inputCls} value={responses[ACSM_FIELD.aesReferred] ?? ""}
                  onChange={(e) => set(ACSM_FIELD.aesReferred, e.target.value)} placeholder="0" />
              </Field>
            </div>
          </div>
        );
      case 6:
        return (
          <div>
            <SectionBadge letter="G" title="Documentation & House Marking" color="#2F6FE6" tint="#EAF1FE" icon={<FileText className="h-4 w-4" />} />
            <div className="rounded-2xl border border-border bg-card px-4">
              {DOCUMENTATION_ITEMS.map((i) => (
                <YnpRow key={i.name} item={i} options={["Yes", "No", "Partly", "N/A"]}
                  value={responses[i.name]} onSelect={(v) => set(i.name, v)} />
              ))}
            </div>
          </div>
        );
      case 7:
        return (
          <div className="space-y-5">
            <SectionBadge letter="H" title="Summary & Corrective Actions" color={NAVY} tint="#E9EEF4" icon={<ClipboardCheck className="h-4 w-4" />} />
            <Field label="Issues identified">
              <textarea rows={3} className={inputCls} value={responses[ACSM_FIELD.issues] || ""}
                onChange={(e) => set(ACSM_FIELD.issues, e.target.value)} placeholder="Key issues observed during supervision" />
            </Field>
            <Field label="Corrective actions agreed">
              <textarea rows={3} className={inputCls} value={responses[ACSM_FIELD.corrective] || ""}
                onChange={(e) => set(ACSM_FIELD.corrective, e.target.value)} placeholder="Actions agreed to fix the issues" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Responsible person">
                <input className={inputCls} value={responses[ACSM_FIELD.responsible] || ""}
                  onChange={(e) => set(ACSM_FIELD.responsible, e.target.value)} />
              </Field>
              <Field label="Action deadline">
                <input type="date" className={inputCls} value={responses[ACSM_FIELD.deadline] || ""}
                  onChange={(e) => set(ACSM_FIELD.deadline, e.target.value)} />
              </Field>
            </div>
            <Field label="Supervisor name">
              <input className={inputCls} value={responses[ACSM_FIELD.supervisorName] || ""}
                onChange={(e) => set(ACSM_FIELD.supervisorName, e.target.value)} placeholder="Your full name" />
            </Field>

            <div className="rounded-2xl border p-4" style={{ background: "#F2FBF5", borderColor: `${GREEN}33` }}>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: GREEN }}>
                <PenTool className="h-4 w-4" /> Supervisor Signature <span className="text-[#E25555]">*</span>
              </div>
              <div className="mb-3 text-[11px] text-muted-foreground">
                Sign in the box below to authenticate this supervisory visit.
              </div>
              <SignatureCapture
                value={responses[ACSM_FIELD.supervisorSignature] || null}
                onChange={(sig) => set(ACSM_FIELD.supervisorSignature, sig)}
                penColor={NAVY}
              />
            </div>

            <label className="flex items-start gap-3 rounded-2xl border p-4" style={{ background: "#E7F6EE", borderColor: `${GREEN}44` }}>
              <input type="checkbox" checked={!!responses[ACSM_FIELD.attestation]}
                onChange={(e) => set(ACSM_FIELD.attestation, e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#22A55A]" />
              <span className="text-sm text-foreground">
                <span className="font-semibold">Attestation</span> — I confirm the above observations are accurate and were made during this supervisory visit.
                <span className="text-[#E25555]"> *</span>
              </span>
            </label>
          </div>
        );
      default:
        return null;
    }
  };

  const isLast = step === ACSM_SECTIONS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#F4F8FC]">
      {/* Scrollable region: hero + progress + body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg,#F2FBF5 0%,#EAF6FF 100%)" }}>
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-white/80 p-2 text-muted-foreground shadow hover:bg-white">
          <X className="h-5 w-5" />
        </button>
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-5 text-center sm:flex-row sm:gap-5 sm:py-6 sm:text-left">
          <div className="order-1 w-full shrink-0 sm:order-2 sm:w-auto">
            <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl bg-white/60 shadow-md ring-1 ring-black/5 sm:w-44 sm:max-w-none">
              <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
                <img
                  src={heroImg}
                  alt="SARMAAN community health — mother, children and health worker"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
          <div className="order-2 min-w-0 flex-1 sm:order-1">
            <h1 className="text-xl font-extrabold leading-tight sm:text-2xl" style={{ color: NAVY }}>
              SARMAAN ACSM &amp; MDA SUPERVISION CHECKLIST
            </h1>
            <div className="mt-1 text-sm font-bold" style={{ color: GREEN }}>Mass Drug Administration by CDDs</div>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
              <Pill className="h-3.5 w-3.5" style={{ color: TEAL }} /> Azithromycin for children 1–59 months
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold">
              {isOnline ? <><Wifi className="h-3 w-3 text-[#22A55A]" /> Online</> : <><WifiOff className="h-3 w-3 text-[#E25555]" /> Offline — will sync</>}
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold">
            <span style={{ color: NAVY }}>{ACSM_SECTIONS[step].label}</span>
            <span className="text-muted-foreground">Section {step + 1} of {ACSM_SECTIONS.length}</span>
          </div>
          <div className="flex gap-1.5">
            {ACSM_SECTIONS.map((_, i) => (
              <div key={i} className="h-1.5 flex-1 rounded-full transition"
                style={{ background: i <= step ? GREEN : "#DCE5EF" }} />
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        {renderStep()}
      </div>
      </div>
      {/* end scroll region */}

      {/* Footer nav — always visible sibling of the scroll region */}
      <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <button type="button" onClick={goPrev} disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          {!isLast ? (
            <button type="button" onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow transition hover:brightness-105"
              style={{ background: GREEN }}>
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow transition hover:brightness-105 disabled:opacity-60"
              style={{ background: GREEN }}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit Checklist
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- small presentational helpers ----------
function SectionBadge({ letter, title, subtitle, color, tint, icon }: {
  letter: string; title: string; subtitle?: string; color: string; tint: string; icon?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: tint }}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: color }}>
        {icon || letter}
      </span>
      <span className="text-sm font-extrabold uppercase tracking-wide" style={{ color }}>
        {title}{subtitle && <span className="ml-1.5 text-[11px] font-semibold normal-case opacity-70">({subtitle})</span>}
      </span>
    </div>
  );
}

function KpiCard({ label, accent, value2, onEdit }: {
  label: string; accent: string; value2?: any; onEdit?: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <input type="number" min={0} value={value2 ?? ""} onChange={(e) => onEdit?.(e.target.value)}
        placeholder="0"
        className="mt-1 w-full bg-transparent text-2xl font-extrabold outline-none"
        style={{ color: accent }} />
    </div>
  );
}

function RateBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const met = value >= target;
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="text-xl font-extrabold" style={{ color }}>{value}%</span>
        {met ? <BadgeCheck className="h-4 w-4 text-[#22A55A]" /> : <AlertTriangle className="h-3.5 w-3.5 text-[#F0A020]" />}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}
