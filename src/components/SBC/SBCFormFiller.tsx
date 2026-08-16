import { useMemo, useState, useEffect } from "react";
import {
  ArrowLeft, HelpCircle, Calendar, MapPin, BarChart3, HeartHandshake, MessageSquare,
  FileText, Paperclip, Save, ShieldCheck, Send, CheckCircle2, Info, Users,
  Loader2, UploadCloud, X, FileType2, Layers, Activity, Gauge,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { toast } from "sonner";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { mirrorSpecialForm } from "@/lib/specialFormBridge";
import {
import KoboSyncButton from "@/components/Kobo/KoboSyncButton";
  SBC_CATEGORIES, REPORTING_LEVELS, INDICATOR_LEVELS, UNITS_OF_MEASURE,
  STAKEHOLDER_TYPES, ENGAGEMENT_TYPES, COMMUNICATION_CHANNELS, REACH_TYPES,
  DATA_SOURCES, SBC_INDICATORS, findIndicator, computeAchievement,
  statusFromAchievement, STATUS_META, achievementColor, unitLabel,
  indicatorLevelLabel, type SbcCategory, type SbcStatus,
} from "@/lib/sbc/definition";

const SBC_FORM_ID = "sbc-indicator-reporting-form";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

/* ---------- Theme tokens (dark navy, matching the design) ---------- */
const C = {
  bg: "#0a1628",
  panel: "#0f1f38",
  panel2: "#11253f",
  border: "#1c3a5e",
  borderSoft: "#16304f",
  text: "#e6eefb",
  sub: "#8aa2c4",
  primary: "#22d3ee",
  blue: "#3b82f6",
};

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="mb-1.5 block text-[13px] font-medium" style={{ color: C.sub }}>
    {children} {required && <span style={{ color: "#f87171" }}>*</span>}
  </label>
);

const inputCls =
  "w-full rounded-lg px-3 py-2.5 text-[14px] outline-none transition-colors focus:ring-2";
const inputStyle: React.CSSProperties = {
  background: C.panel2,
  border: `1px solid ${C.border}`,
  color: C.text,
};

const Sel = ({
  value, onChange, children, placeholder,
}: { value: string; onChange: (v: string) => void; children: React.ReactNode; placeholder?: string }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={inputCls}
    style={inputStyle}
  >
    <option value="" disabled>{placeholder || "Select…"}</option>
    {children}
  </select>
);

const SectionCard = ({
  icon: Icon, num, title, children,
}: { icon: any; num: number; title: string; children: React.ReactNode }) => (
  <div className="rounded-2xl p-4 sm:p-5" style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}>
    <div className="mb-4 flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "#13345a", color: C.primary }}>
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-[15px] font-bold" style={{ color: C.primary }}>{num}. {title}</h3>
    </div>
    {children}
  </div>
);

export default function SBCFormFiller({ projectId, onClose }: Props) {
  const { user } = useAuth();
  const { position, getCurrentPosition } = useGeolocation();

  useEffect(() => { try { getCurrentPosition(); } catch { /* ignore */ } }, []);

  // ----- form state -----
  const now = new Date();
  const defaultPeriod = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const [reportingPeriod, setReportingPeriod] = useState(defaultPeriod);
  const [reportingLevel, setReportingLevel] = useState("state");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [community, setCommunity] = useState("");
  const [category, setCategory] = useState<SbcCategory>("exposure");
  const [indicator, setIndicator] = useState("recall_messages");
  const [indicatorLevel, setIndicatorLevel] = useState("outcome");
  const [unit, setUnit] = useState("percentage");
  const [target, setTarget] = useState<string>("100");
  const [actual, setActual] = useState<string>("72");
  const [officer, setOfficer] = useState("");
  const [dataSource, setDataSource] = useState("KAP Survey");
  const [dateReported, setDateReported] = useState(now.toISOString().slice(0, 10));
  const [stakeholder, setStakeholder] = useState("Community Members");
  const [engagement, setEngagement] = useState("Interpersonal Communication");
  const [channel, setChannel] = useState("Interpersonal Communication");
  const [reachType, setReachType] = useState("direct");
  const [female, setFemale] = useState<string>("450");
  const [male, setMale] = useState<string>("350");
  const [u18, setU18] = useState<string>("180");
  const [a1835, setA1835] = useState<string>("360");
  const [a35, setA35] = useState<string>("260");
  const [narrative, setNarrative] = useState("");
  const [story, setStory] = useState("");
  const [challenges, setChallenges] = useState("");
  const [actions, setActions] = useState("");
  const [files, setFiles] = useState<{ name: string; size: number; type: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const states = useMemo(() => getAllStates(), []);
  const lgas = useMemo(() => (state ? getLGAsForState(state) : []), [state]);
  const wards = useMemo(() => (state && lga ? getWardsForLGA(state, lga) : []), [state, lga]);
  const indicators = SBC_INDICATORS[category];
  const indDef = findIndicator(indicator);

  // Keep indicator valid when category changes
  useEffect(() => {
    if (!indicators.find((i) => i.value === indicator)) {
      const first = indicators[0];
      setIndicator(first.value);
      setIndicatorLevel(first.level);
      setUnit(first.unit);
    }
  }, [category]);

  // When indicator changes, sync level + unit from its definition
  const onIndicator = (v: string) => {
    setIndicator(v);
    const def = findIndicator(v);
    if (def) { setIndicatorLevel(def.level); setUnit(def.unit); }
  };

  const targetN = Number(target) || 0;
  const actualN = Number(actual) || 0;
  const achievement = computeAchievement(targetN, actualN);
  const status: SbcStatus = statusFromAchievement(achievement);
  const achColor = achievementColor(achievement);

  const totalReach = (Number(female) || 0) + (Number(male) || 0);
  const fPct = totalReach ? Math.round(((Number(female) || 0) / totalReach) * 100) : 0;
  const mPct = totalReach ? 100 - fPct : 0;
  const ageTotal = (Number(u18) || 0) + (Number(a1835) || 0) + (Number(a35) || 0);
  const agePct = (v: string) => (ageTotal ? Math.round(((Number(v) || 0) / ageTotal) * 100) : 0);

  const locationLabel = [community, lga, state].filter(Boolean).join(" / ") || "Not set";

  const onPickFiles = (fl: FileList | null) => {
    if (!fl) return;
    const next = Array.from(fl).slice(0, 6 - files.length).map((f) => ({ name: f.name, size: f.size, type: f.type }));
    setFiles((p) => [...p, ...next].slice(0, 6));
  };

  const buildPayload = (submission_status: "draft" | "finalized") => ({
    project_id: projectId || null,
    created_by: user?.id,
    reporting_period: reportingPeriod,
    reporting_level: reportingLevel,
    state, lga, ward, community,
    category, indicator, indicator_level: indicatorLevel, unit_of_measure: unit,
    target_value: targetN, actual_achieved: actualN, achievement_pct: achievement, status,
    responsible_officer: officer, data_source: dataSource, date_reported: dateReported || null,
    stakeholder_type: stakeholder, engagement_type: engagement,
    communication_channel: channel, reach_type: reachType,
    female_count: Number(female) || 0, male_count: Number(male) || 0,
    age_under18: Number(u18) || 0, age_18_35: Number(a1835) || 0, age_35_plus: Number(a35) || 0,
    narrative_progress: narrative, contribution_story: story,
    key_challenges: challenges, actions_next_steps: actions,
    evidence: files as any,
    gps_lat: position?.lat ?? null, gps_lng: position?.lng ?? null,
    submission_status,
  });

  const save = async (submission_status: "draft" | "finalized") => {
    if (!user?.id) { toast.error("Please sign in first."); return; }
    if (submission_status === "finalized") {
      if (!state || !indicator || !targetN) {
        toast.error("Please complete location, indicator and target value before submitting.");
        return;
      }
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("sbc_reports" as any)
        .insert([buildPayload(submission_status)] as any)
        .select("id")
        .single();
      if (error) throw error;
      await mirrorSpecialForm({
        userId: user.id,
        formId: SBC_FORM_ID,
        formName: "SBC Indicator Reporting Form",
        formDescription: `${SBC_CATEGORIES.find((c) => c.value === category)?.label} · ${indDef?.label}`,
        status: submission_status === "finalized" ? "finalized" : "draft",
        responses: buildPayload(submission_status),
        gps: position ? { lat: position.lat, lng: position.lng, accuracy: position.accuracy } : null,
        submissionId: (data as any)?.id ?? null,
      });
      toast.success(submission_status === "draft" ? "Draft saved." : "Report submitted — dashboard updated.");
      if (submission_status === "finalized") onClose();
    } catch (e: any) {
      console.error("SBC save error", e);
      toast.error(e?.message || "Could not save the report.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 sm:px-6 py-4" style={{ background: "rgba(10,22,40,0.9)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.borderSoft}` }}>
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: C.primary }}>
            <ArrowLeft className="h-4 w-4" /> Back to Reporting
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "#13345a" }}>
              <FileText className="h-5 w-5" style={{ color: C.primary }} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold leading-tight">SBC Indicator Reporting Form</h1>
              <p className="text-[13px]" style={{ color: C.sub }}>Report data for Social & Behaviour Change indicators</p>
            </div>
          </div>
          <div className="ml-auto">
            <KoboSyncButton formType="sbc" formTitle="SBC Indicator Reporting Checklist" />
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]" style={{ border: `1px solid ${C.border}`, color: C.sub }}>
            <HelpCircle className="h-4 w-4" /> Help
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
        {/* Summary strip */}
        <div className="mb-5 grid grid-cols-2 gap-3 rounded-2xl p-4 sm:grid-cols-3 lg:grid-cols-5" style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}>
          <SummaryItem icon={Calendar} label="Reporting Period" value={reportingPeriod} />
          <SummaryItem icon={Layers} label="Reporting Level" value={REPORTING_LEVELS.find((l) => l.value === reportingLevel)?.label || "—"} />
          <SummaryItem icon={MapPin} label="Location" value={locationLabel} />
          <SummaryItem icon={BarChart3} label="Indicator" value={indDef?.label || "—"} />
          <div className="flex flex-col">
            <span className="mb-1 flex items-center gap-1.5 text-[12px]" style={{ color: C.sub }}><Gauge className="h-3.5 w-3.5" /> Achievement</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold" style={{ color: achColor }}>{achievement}%</span>
              <StatusPill status={status} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
          {/* Main column */}
          <div className="space-y-5">
            {/* 1. Indicator Details */}
            <SectionCard icon={BarChart3} num={1} title="Indicator Details">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label required>Reporting Period</Label>
                  <input className={inputCls} style={inputStyle} value={reportingPeriod} onChange={(e) => setReportingPeriod(e.target.value)} placeholder="e.g. May 2025" />
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <Label required>State</Label>
                  <Sel value={state} onChange={(v) => { setState(v); setLga(""); setWard(""); }} placeholder="Select state">
                    {states.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label>LGA</Label>
                  <Sel value={lga} onChange={(v) => { setLga(v); setWard(""); }} placeholder="Select LGA">
                    {lgas.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label>Ward</Label>
                  <Sel value={ward} onChange={setWard} placeholder="Select ward">
                    {wards.map((w) => <option key={w} value={w}>{w}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label>Community</Label>
                  <input className={inputCls} style={inputStyle} value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="Community / location" />
                </div>
                <div>
                  <Label required>Reporting Level</Label>
                  <Sel value={reportingLevel} onChange={setReportingLevel}>
                    {REPORTING_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label required>Result Area</Label>
                  <Sel value={category} onChange={(v) => setCategory(v as SbcCategory)}>
                    {SBC_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label required>Indicator</Label>
                  <Sel value={indicator} onChange={onIndicator}>
                    {indicators.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label required>Indicator Level</Label>
                  <Sel value={indicatorLevel} onChange={setIndicatorLevel}>
                    {INDICATOR_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label required>Unit of Measure</Label>
                  <Sel value={unit} onChange={setUnit}>
                    {UNITS_OF_MEASURE.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label required>Target Value</Label>
                  <input type="number" className={inputCls} style={inputStyle} value={target} onChange={(e) => setTarget(e.target.value)} />
                </div>
                <div>
                  <Label required>Actual Achieved</Label>
                  <input type="number" className={inputCls} style={inputStyle} value={actual} onChange={(e) => setActual(e.target.value)} />
                </div>
                <div>
                  <Label>Achievement %</Label>
                  <div className="flex items-center rounded-lg px-3 py-2.5 text-[14px] font-bold" style={{ background: `${achColor}1f`, border: `1px solid ${achColor}55`, color: achColor }}>
                    {achievement}%
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
                    <StatusPill status={status} />
                  </div>
                </div>
                <div>
                  <Label required>Responsible Officer</Label>
                  <input className={inputCls} style={inputStyle} value={officer} onChange={(e) => setOfficer(e.target.value)} placeholder="Officer name" />
                </div>
                <div>
                  <Label required>Data Source</Label>
                  <Sel value={dataSource} onChange={setDataSource}>
                    {DATA_SOURCES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label required>Date Reported</Label>
                  <input type="date" className={inputCls} style={inputStyle} value={dateReported} onChange={(e) => setDateReported(e.target.value)} />
                </div>
                <div>
                  <Label required>Target Audience</Label>
                  <Sel value={stakeholder} onChange={setStakeholder}>
                    {STAKEHOLDER_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label required>Engagement Type</Label>
                  <Sel value={engagement} onChange={setEngagement}>
                    {ENGAGEMENT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Sel>
                </div>
              </div>
            </SectionCard>

            {/* 2. Communication & Engagement Details */}
            <SectionCard icon={MessageSquare} num={2} title="Communication & Engagement Details">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label required>Communication Channel</Label>
                  <Sel value={channel} onChange={setChannel}>
                    {COMMUNICATION_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label required>Reach Type</Label>
                  <Sel value={reachType} onChange={setReachType}>
                    {REACH_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </Sel>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <Label required>Gender Disaggregation</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <DisaggInput color="#22c55e" icon={Users} label="Female" value={female} onChange={setFemale} pct={fPct} />
                    <DisaggInput color="#3b82f6" icon={Users} label="Male" value={male} onChange={setMale} pct={mPct} />
                  </div>
                </div>
                <div>
                  <Label required>Age Group Disaggregation</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <DisaggInput color="#22d3ee" label="< 18" value={u18} onChange={setU18} pct={agePct(u18)} />
                    <DisaggInput color="#6366f1" label="18–35" value={a1835} onChange={setA1835} pct={agePct(a1835)} />
                    <DisaggInput color="#a855f7" label="35+" value={a35} onChange={setA35} pct={agePct(a35)} />
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* 3. Narrative & Qualitative Reporting */}
            <SectionCard icon={FileText} num={3} title="Narrative & Qualitative Reporting">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NarrativeBox label="Narrative Progress Update" required value={narrative} onChange={setNarrative} max={2000} />
                <NarrativeBox label="Contribution / Change Story" required value={story} onChange={setStory} max={2000} />
                <NarrativeBox label="Key Challenges & Barriers" required value={challenges} onChange={setChallenges} max={1000} />
                <NarrativeBox label="Actions / Next Steps" required value={actions} onChange={setActions} max={1000} />
              </div>
            </SectionCard>

            {/* 4. Evidence & Attachments */}
            <SectionCard icon={Paperclip} num={4} title="Evidence & Attachments">
              <p className="mb-3 text-[12px]" style={{ color: C.sub }}>
                Upload supporting documents, photos, reports · PDF, JPG, PNG, DOC, DOCX · Max file size: 10MB each · Max 6 files
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3" style={{ border: `1px dashed ${C.border}`, background: C.panel2 }}>
                  <UploadCloud className="h-5 w-5" style={{ color: C.primary }} />
                  <span className="text-[13px]" style={{ color: C.sub }}>Drag & drop files here or</span>
                  <span className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white" style={{ background: C.blue }}>Browse Files</span>
                  <input type="file" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
                </label>
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
                    <FileType2 className="h-4 w-4" style={{ color: C.primary }} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium" style={{ maxWidth: 160 }}>{f.name}</p>
                      <p className="text-[11px]" style={{ color: C.sub }}>{(f.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}><X className="h-4 w-4" style={{ color: C.sub }} /></button>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: C.sub }}>
                <ShieldCheck className="h-3.5 w-3.5" /> All uploaded files are secure and will be available for verification and review.
              </p>
            </SectionCard>
          </div>

          {/* Right — Indicator Reference */}
          <aside className="space-y-4">
            <div className="rounded-2xl p-5 lg:sticky lg:top-24" style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}>
              <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: C.sub }}>
                <BarChart3 className="h-4 w-4" /> Indicator Reference
              </div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "#13345a", color: C.primary }}>
                  <HeartHandshake className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[15px] font-bold">{indDef?.label}</p>
                  <span className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px]" style={{ background: "#13345a", color: C.primary }}>
                    {indicatorLevelLabel(indDef?.level || "")} Level
                  </span>
                </div>
              </div>

              <RefBlock title="Indicator Wording" color={C.primary}>{indDef?.wording}</RefBlock>
              <RefBlock title="Purpose" color={C.primary}>{indDef?.purpose}</RefBlock>

              <p className="mb-1.5 mt-4 text-[13px] font-bold" style={{ color: C.primary }}>Counts</p>
              <ul className="space-y-1.5">
                {indDef?.counts.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[12.5px]" style={{ color: C.text }}>
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#22c55e" }} /> {c}
                  </li>
                ))}
              </ul>

              <p className="mb-1.5 mt-4 text-[13px] font-bold" style={{ color: "#f87171" }}>Excludes</p>
              <ul className="space-y-1.5">
                {indDef?.excludes.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[12.5px]" style={{ color: C.text }}>
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#f87171" }} /> {c}
                  </li>
                ))}
              </ul>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4" style={{ borderColor: C.borderSoft }}>
                <div>
                  <p className="flex items-center gap-1 text-[11px]" style={{ color: C.sub }}><Activity className="h-3 w-3" /> Unit of Measure</p>
                  <p className="text-[13px] font-semibold">{unitLabel(indDef?.unit || "")}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-[11px]" style={{ color: C.sub }}><Calendar className="h-3 w-3" /> Frequency</p>
                  <p className="text-[13px] font-semibold">{indDef?.frequency}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl p-3" style={{ background: "#0c2a4a", border: `1px solid ${C.border}` }}>
                <p className="flex items-start gap-1.5 text-[12px]" style={{ color: C.primary }}>
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Ensure your report is accurate and supported with evidence. Submissions update the dashboard in real time.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 z-20 px-4 sm:px-6 py-3" style={{ background: "rgba(10,22,40,0.95)", backdropFilter: "blur(8px)", borderTop: `1px solid ${C.borderSoft}` }}>
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-[12px]" style={{ color: "#22c55e" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "#22c55e" }} /> Live Sync: Submissions update the SBC dashboard in real time.
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => save("draft")} disabled={saving} className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium disabled:opacity-60" style={{ border: `1px solid ${C.border}`, color: C.text }}>
              <Save className="h-4 w-4" /> Save Draft
            </button>
            <button onClick={() => save("finalized")} disabled={saving} className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-semibold text-[#06121f] disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.blue})` }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- sub-components ---------- */
const SummaryItem = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="flex flex-col">
    <span className="mb-1 flex items-center gap-1.5 text-[12px]" style={{ color: C.sub }}><Icon className="h-3.5 w-3.5" /> {label}</span>
    <span className="truncate text-[15px] font-semibold">{value}</span>
  </div>
);

const StatusPill = ({ status }: { status: SbcStatus }) => {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}55` }}>
      <CheckCircle2 className="h-3.5 w-3.5" /> {m.label}
    </span>
  );
};

const DisaggInput = ({ color, icon: Icon, label, value, onChange, pct }: { color: string; icon?: any; label: string; value: string; onChange: (v: string) => void; pct: number }) => (
  <div className="rounded-xl p-3" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
    <div className="mb-1 flex items-center gap-1.5 text-[12px]" style={{ color }}>
      {Icon && <Icon className="h-3.5 w-3.5" />} {label}
    </div>
    <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-[16px] font-bold outline-none" style={{ color: C.text }} />
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#0a1c33" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
    <p className="mt-1 text-[11px]" style={{ color: C.sub }}>{pct}%</p>
  </div>
);

const NarrativeBox = ({ label, required, value, onChange, max }: { label: string; required?: boolean; value: string; onChange: (v: string) => void; max: number }) => (
  <div>
    <Label required={required}>{label}</Label>
    <div className="relative">
      <textarea
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full resize-none rounded-lg px-3 py-2.5 text-[13.5px] outline-none"
        style={inputStyle}
        placeholder={`Enter ${label.toLowerCase()}…`}
      />
      <span className="absolute bottom-2 right-3 flex items-center gap-1 text-[11px]" style={{ color: value ? "#22c55e" : C.sub }}>
        {value.length}/{max} {value && <CheckCircle2 className="h-3 w-3" />}
      </span>
    </div>
  </div>
);

const RefBlock = ({ title, color, children }: { title: string; color: string; children: React.ReactNode }) => (
  <div className="mb-3">
    <p className="mb-1 text-[13px] font-bold" style={{ color }}>{title}</p>
    <p className="text-[12.5px] leading-relaxed" style={{ color: C.text }}>{children}</p>
  </div>
);
