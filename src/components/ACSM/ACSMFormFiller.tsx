import { useMemo, useState, useEffect } from "react";
import {
  ArrowLeft, Calendar, MapPin, BarChart3, FileText, Save, Send, Info, Users,
  Loader2, UploadCloud, X, Layers, Target, GraduationCap, BookOpen, ListChecks,
  Lightbulb, SlidersHorizontal, Gauge, CheckCircle2, AlertTriangle, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { toast } from "sonner";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { mirrorSpecialForm } from "@/lib/specialFormBridge";
import {
import KoboSyncButton from "@/components/Kobo/KoboSyncButton";
  ACSM_CATEGORIES, REPORTING_LEVELS, INDICATOR_LEVELS, UNITS_OF_MEASURE,
  DATA_SOURCES, ACSM_INDICATORS, DISAGG_DIMENSIONS, findIndicator, computeAchievement,
  statusFromAchievement, STATUS_META, achievementColor, unitLabel, categoryLabel,
  indicatorLevelLabel, type AcsmCategory, type AcsmStatus,
} from "@/lib/acsm/definition";

const ACSM_FORM_ID = "acsm-indicator-reporting-form";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

/* ---------- Theme tokens (dark navy) ---------- */
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

const CAT_ICON: Record<AcsmCategory, any> = {
  results_of_advocacy: Target,
  capacities_for_advocacy: GraduationCap,
  stakeholder_engagement: Users,
};

const CAT_ACCENT: Record<AcsmCategory, string> = {
  results_of_advocacy: "#34d399",
  capacities_for_advocacy: "#a78bfa",
  stakeholder_engagement: "#22d3ee",
};

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="mb-1.5 block text-[13px] font-medium" style={{ color: C.sub }}>
    {children} {required && <span style={{ color: "#f87171" }}>*</span>}
  </label>
);

const inputCls = "w-full rounded-lg px-3 py-2.5 text-[14px] outline-none transition-colors focus:ring-2";
const inputStyle: React.CSSProperties = { background: C.panel2, border: `1px solid ${C.border}`, color: C.text };

const Sel = ({
  value, onChange, children, placeholder,
}: { value: string; onChange: (v: string) => void; children: React.ReactNode; placeholder?: string }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={inputStyle}>
    {placeholder && <option value="" disabled>{placeholder}</option>}
    {children}
  </select>
);

const SectionCard = ({
  icon: Icon, num, title, subtitle, accent = C.primary, children,
}: { icon: any; num: number; title: string; subtitle?: string; accent?: string; children: React.ReactNode }) => (
  <div className="rounded-2xl p-4 sm:p-5" style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}>
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${accent}1f`, color: accent }}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h3 className="text-[15px] font-bold" style={{ color: accent }}>{num}. {title}</h3>
        {subtitle && <p className="text-[12px]" style={{ color: C.sub }}>{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

const StatusPill = ({ status }: { status: AcsmStatus }) => {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}55` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} /> {m.label}
    </span>
  );
};

const SummaryItem = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="flex flex-col">
    <span className="mb-1 flex items-center gap-1.5 text-[12px]" style={{ color: C.sub }}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
    <span className="truncate text-[14px] font-semibold">{value}</span>
  </div>
);

export default function ACSMFormFiller({ projectId, onClose }: Props) {
  const { user } = useAuth();
  const { position, getCurrentPosition } = useGeolocation();

  useEffect(() => { try { getCurrentPosition(); } catch { /* ignore */ } }, []);

  const now = new Date();
  const defaultPeriod = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const [reportingPeriod, setReportingPeriod] = useState(defaultPeriod);
  const [reportingLevel, setReportingLevel] = useState("state");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [community, setCommunity] = useState("");

  const [category, setCategory] = useState<AcsmCategory>("results_of_advocacy");
  const [indicator, setIndicator] = useState("people_benefiting");
  const [indicatorLevel, setIndicatorLevel] = useState("outcome");
  const [unit, setUnit] = useState("number_of_people");
  const [targetGroup, setTargetGroup] = useState("");

  const [target, setTarget] = useState<string>("");
  const [actual, setActual] = useState<string>("");
  const [officer, setOfficer] = useState("");
  const [dataSource, setDataSource] = useState("Activity Report");
  const [dateReported, setDateReported] = useState(now.toISOString().slice(0, 10));

  // dynamic disaggregation values: { [dimKey]: { [bucketKey]: number } }
  const [disagg, setDisagg] = useState<Record<string, Record<string, string>>>({});

  const [narrative, setNarrative] = useState("");
  const [story, setStory] = useState("");
  const [challenges, setChallenges] = useState("");
  const [actions, setActions] = useState("");
  const [files, setFiles] = useState<{ name: string; size: number; type: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const states = useMemo(() => getAllStates(), []);
  const lgas = useMemo(() => (state ? getLGAsForState(state) : []), [state]);
  const wards = useMemo(() => (state && lga ? getWardsForLGA(state, lga) : []), [state, lga]);
  const indicators = ACSM_INDICATORS[category];
  const indDef = findIndicator(indicator);
  const accent = CAT_ACCENT[category];

  // Keep indicator valid when thematic area changes
  useEffect(() => {
    if (!indicators.find((i) => i.value === indicator)) {
      applyIndicator(indicators[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  function applyIndicator(v: string) {
    setIndicator(v);
    const def = findIndicator(v);
    if (def) {
      setIndicatorLevel(def.level);
      setUnit(def.unit);
      // reset disaggregation buckets for the new indicator
      const next: Record<string, Record<string, string>> = {};
      def.disaggregations.forEach((dk) => {
        const dim = DISAGG_DIMENSIONS[dk];
        if (dim) next[dk] = Object.fromEntries(dim.buckets.map((b) => [b.key, ""]));
      });
      setDisagg(next);
    }
  }

  const setBucket = (dim: string, bucket: string, val: string) =>
    setDisagg((p) => ({ ...p, [dim]: { ...(p[dim] || {}), [bucket]: val } }));

  const dimTotal = (dim: string) =>
    Object.values(disagg[dim] || {}).reduce((s, v) => s + (Number(v) || 0), 0);

  const targetN = Number(target) || 0;
  const actualN = Number(actual) || 0;
  const achievement = computeAchievement(targetN, actualN);
  const status: AcsmStatus = statusFromAchievement(achievement);
  const achColor = achievementColor(achievement);

  const locationLabel = [community, lga, state].filter(Boolean).join(" / ") || "Not set";
  const isPct = unit === "percentage";
  const isMoney = unit === "amount_ngn";

  // Legacy column mapping for dashboard compatibility
  const genderVals = disagg["gender"] || {};
  const ageVals = disagg["age_group"] || {};

  const onPickFiles = (fl: FileList | null) => {
    if (!fl) return;
    const next = Array.from(fl).slice(0, 6 - files.length).map((f) => ({ name: f.name, size: f.size, type: f.type }));
    setFiles((p) => [...p, ...next].slice(0, 6));
  };

  const missing = {
    period: !reportingPeriod.trim(),
    state: !state,
    indicator: !indicator,
    target: !targetN,
    actual: actual === "",
    officer: !officer.trim(),
  };
  const hasMissing = Object.values(missing).some(Boolean);

  const buildPayload = (submission_status: "draft" | "finalized") => ({
    project_id: projectId || null,
    created_by: user?.id,
    reporting_period: reportingPeriod,
    reporting_level: reportingLevel,
    state, lga, ward, community,
    category, indicator, indicator_level: indicatorLevel, unit_of_measure: unit,
    target_value: targetN, actual_achieved: actualN, achievement_pct: achievement, status,
    responsible_officer: officer, data_source: dataSource, date_reported: dateReported || null,
    // legacy disaggregation columns (kept populated for the dashboard)
    female_count: Number(genderVals.female) || 0,
    male_count: Number(genderVals.male) || 0,
    age_under18: Number(ageVals.under18) || 0,
    age_18_35: Number(ageVals.a18_35) || 0,
    age_35_plus: Number(ageVals.a35plus) || 0,
    // flexible disaggregation breakdown
    disaggregation: { targetGroup, dimensions: disagg } as any,
    narrative_progress: narrative, contribution_story: story,
    key_challenges: challenges, actions_next_steps: actions,
    evidence: files as any,
    gps_lat: position?.lat ?? null, gps_lng: position?.lng ?? null,
    submission_status,
  });

  const save = async (submission_status: "draft" | "finalized") => {
    if (!user?.id) { toast.error("Please sign in first."); return; }
    if (submission_status === "finalized" && hasMissing) {
      setShowErrors(true);
      toast.error("Please complete all required fields before submitting.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("acsm_reports" as any)
        .insert([buildPayload(submission_status)] as any)
        .select("id")
        .single();
      if (error) throw error;
      await mirrorSpecialForm({
        userId: user.id,
        formId: ACSM_FORM_ID,
        formName: "ACSM Indicator Reporting Form",
        formDescription: `${categoryLabel(category)} · ${indDef?.label}`,
        status: submission_status === "finalized" ? "finalized" : "draft",
        responses: buildPayload(submission_status),
        gps: position ? { lat: position.lat, lng: position.lng, accuracy: position.accuracy } : null,
        submissionId: (data as any)?.id ?? null,
      });
      toast.success(submission_status === "draft" ? "Draft saved." : "Report submitted — dashboard updated.");
      if (submission_status === "finalized") onClose();
    } catch (e: any) {
      console.error("ACSM save error", e);
      toast.error(e?.message || "Could not save the report.");
    } finally {
      setSaving(false);
    }
  };

  const errStyle = (bad: boolean): React.CSSProperties =>
    showErrors && bad ? { ...inputStyle, border: "1px solid #f8717188", boxShadow: "0 0 0 1px #f8717155" } : inputStyle;

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 sm:px-6 py-4" style={{ background: "rgba(10,22,40,0.9)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.borderSoft}` }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 sm:gap-4">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: C.primary }}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "#13345a" }}>
              <FileText className="h-5 w-5" style={{ color: C.primary }} />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold leading-tight">ACSM Indicator Reporting Form</h1>
              <p className="text-[12px] sm:text-[13px]" style={{ color: C.sub }}>Advocacy, Communication & Social Mobilization</p>
            </div>
          </div>
          <div className="ml-auto">
            <KoboSyncButton formType="acsm" formTitle="ACSM Indicator Reporting Checklist" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
        {/* Summary strip */}
        <div className="mb-5 grid grid-cols-2 gap-3 rounded-2xl p-4 sm:grid-cols-3 lg:grid-cols-5" style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}>
          <SummaryItem icon={Calendar} label="Period" value={reportingPeriod} />
          <SummaryItem icon={Layers} label="Thematic Area" value={categoryLabel(category)} />
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

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
          {/* Main column */}
          <div className="space-y-5">
            {/* 1. Thematic area + indicator */}
            <SectionCard icon={Layers} num={1} title="Thematic Area & Indicator" subtitle="Pick the advocacy results area, then the indicator you are reporting against." accent={accent}>
              {/* Thematic area cards */}
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {ACSM_CATEGORIES.map((c) => {
                  const Icon = CAT_ICON[c.value];
                  const active = category === c.value;
                  const a = CAT_ACCENT[c.value];
                  return (
                    <button
                      key={c.value}
                      onClick={() => setCategory(c.value)}
                      className="flex flex-col items-start gap-2 rounded-xl p-3 text-left transition-all"
                      style={{
                        background: active ? `${a}1a` : C.panel2,
                        border: `1px solid ${active ? `${a}88` : C.border}`,
                      }}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${a}26`, color: a }}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-[13px] font-semibold leading-tight" style={{ color: active ? a : C.text }}>{c.label}</span>
                      <span className="text-[11px]" style={{ color: C.sub }}>{ACSM_INDICATORS[c.value].length} indicators</span>
                    </button>
                  );
                })}
              </div>

              {/* Indicator chips */}
              <Label required>Indicator</Label>
              <div className="mb-4 flex flex-wrap gap-2">
                {indicators.map((i) => {
                  const active = indicator === i.value;
                  return (
                    <button
                      key={i.value}
                      onClick={() => applyIndicator(i.value)}
                      className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-all"
                      style={{
                        background: active ? accent : C.panel2,
                        color: active ? "#062330" : C.sub,
                        border: `1px solid ${active ? accent : C.border}`,
                      }}
                    >
                      {i.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label required>Indicator Level</Label>
                  <Sel value={indicatorLevel} onChange={setIndicatorLevel}>
                    {(indDef?.levels || INDICATOR_LEVELS.map((l) => l.value)).map((lv) => (
                      <option key={lv} value={lv}>{indicatorLevelLabel(lv)}</option>
                    ))}
                  </Sel>
                </div>
                <div>
                  <Label required>Unit of Measure</Label>
                  <Sel value={unit} onChange={setUnit}>
                    {UNITS_OF_MEASURE.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label>Frequency</Label>
                  <div className="flex h-[42px] items-center rounded-lg px-3 text-[13px]" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.sub }}>
                    {indDef?.frequency || "—"}
                  </div>
                </div>
              </div>

              {/* Target group (only for indicators that specify one) */}
              {indDef?.wording.includes("[target group]") && (
                <div className="mt-4">
                  <Label>Target Group <span style={{ color: C.sub }}>(replaces “[target group]” in the wording)</span></Label>
                  <input className={inputCls} style={inputStyle} value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)} placeholder="e.g. youth, women leaders, health workers" />
                </div>
              )}
            </SectionCard>

            {/* 2. Reporting context */}
            <SectionCard icon={MapPin} num={2} title="Reporting Context" subtitle="When and where this report applies." accent={accent}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label required>Reporting Period</Label>
                  <input className={inputCls} style={errStyle(missing.period)} value={reportingPeriod} onChange={(e) => setReportingPeriod(e.target.value)} placeholder="e.g. May 2025" />
                </div>
                <div>
                  <Label required>Reporting Level</Label>
                  <Sel value={reportingLevel} onChange={setReportingLevel}>
                    {REPORTING_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </Sel>
                </div>
                <div>
                  <Label required>Date Reported</Label>
                  <input type="date" className={inputCls} style={inputStyle} value={dateReported} onChange={(e) => setDateReported(e.target.value)} />
                </div>
                <div>
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
                  <Label required>Responsible Officer</Label>
                  <input className={inputCls} style={errStyle(missing.officer)} value={officer} onChange={(e) => setOfficer(e.target.value)} placeholder="Officer name" />
                </div>
                <div>
                  <Label required>Data Source</Label>
                  <Sel value={dataSource} onChange={setDataSource}>
                    {DATA_SOURCES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Sel>
                </div>
              </div>
            </SectionCard>

            {/* 3. Measurement */}
            <SectionCard icon={Gauge} num={3} title="Measurement" subtitle="Target vs achieved value for this indicator." accent={accent}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label required>Target {isMoney ? "(₦)" : isPct ? "(%)" : ""}</Label>
                  <input type="number" className={inputCls} style={errStyle(missing.target)} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label required>Achieved {isMoney ? "(₦)" : isPct ? "(%)" : ""}</Label>
                  <input type="number" className={inputCls} style={errStyle(missing.actual)} value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>Achievement %</Label>
                  <div className="flex h-[42px] items-center rounded-lg px-3 text-[14px] font-bold" style={{ background: `${achColor}1f`, border: `1px solid ${achColor}55`, color: achColor }}>
                    {achievement}%
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="flex h-[42px] items-center gap-2 rounded-lg px-3" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
                    <StatusPill status={status} />
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* 4. Disaggregation (dynamic per indicator) */}
            {(indDef?.disaggregations.length || 0) > 0 && (
              <SectionCard icon={SlidersHorizontal} num={4} title="Disaggregation" subtitle="Break the achieved value down using the dimensions relevant to this indicator." accent={accent}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {indDef!.disaggregations.map((dk) => {
                    const dim = DISAGG_DIMENSIONS[dk];
                    if (!dim) return null;
                    const total = dimTotal(dk);
                    return (
                      <div key={dk} className="rounded-xl p-3.5" style={{ background: C.panel2, border: `1px solid ${C.border}` }}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[13px] font-semibold" style={{ color: C.text }}>{dim.label}</span>
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${accent}1f`, color: accent }}>Σ {total.toLocaleString()}</span>
                        </div>
                        {dim.hint && <p className="mb-2.5 text-[11.5px]" style={{ color: C.sub }}>{dim.hint}</p>}
                        <div className="grid grid-cols-2 gap-2.5">
                          {dim.buckets.map((b) => (
                            <div key={b.key}>
                              <Label>{b.label}</Label>
                              <input
                                type="number"
                                className={inputCls}
                                style={inputStyle}
                                value={disagg[dk]?.[b.key] ?? ""}
                                onChange={(e) => setBucket(dk, b.key, e.target.value)}
                                placeholder="0"
                              />
                            </div>
                          ))}
                        </div>
                        {actualN > 0 && total > 0 && total !== actualN && (
                          <p className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: "#fbbf24" }}>
                            <AlertTriangle className="h-3 w-3" /> Sum ({total.toLocaleString()}) differs from achieved ({actualN.toLocaleString()}).
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* 5. Narrative & evidence */}
            <SectionCard icon={FileText} num={(indDef?.disaggregations.length || 0) > 0 ? 5 : 4} title="Narrative & Evidence" subtitle="Qualitative context strengthens every advocacy indicator." accent={accent}>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Progress Narrative</Label>
                  <textarea className={inputCls} style={{ ...inputStyle, minHeight: 80 }} value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder="Summarise progress for this indicator…" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Contribution / Story of Change</Label>
                    <textarea className={inputCls} style={{ ...inputStyle, minHeight: 70 }} value={story} onChange={(e) => setStory(e.target.value)} placeholder="How did the advocacy contribute?" />
                  </div>
                  <div>
                    <Label>Key Challenges</Label>
                    <textarea className={inputCls} style={{ ...inputStyle, minHeight: 70 }} value={challenges} onChange={(e) => setChallenges(e.target.value)} placeholder="What constrained progress?" />
                  </div>
                </div>
                <div>
                  <Label>Actions / Next Steps</Label>
                  <textarea className={inputCls} style={{ ...inputStyle, minHeight: 60 }} value={actions} onChange={(e) => setActions(e.target.value)} placeholder="What happens next?" />
                </div>
                <div>
                  <Label>Evidence (up to 6 files)</Label>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-[13px]" style={{ borderColor: C.border, color: C.sub }}>
                    <UploadCloud className="h-4 w-4" /> Click to attach evidence
                    <input type="file" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
                  </label>
                  {files.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {files.map((f, i) => (
                        <span key={i} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.sub }}>
                          {f.name}
                          <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => save("finalized")}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold disabled:opacity-60"
                style={{ background: accent, color: "#062330" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit Report
              </button>
              <button
                onClick={() => save("draft")}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold disabled:opacity-60"
                style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text }}
              >
                <Save className="h-4 w-4" /> Save Draft
              </button>
              {showErrors && hasMissing && (
                <span className="flex items-center gap-1.5 text-[13px]" style={{ color: "#f87171" }}>
                  <AlertTriangle className="h-4 w-4" /> Complete the highlighted required fields.
                </span>
              )}
            </div>
          </div>

          {/* Reference panel */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl p-4" style={{ background: `linear-gradient(160deg, ${accent}18, ${C.panel})`, border: `1px solid ${accent}44` }}>
              <div className="mb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4" style={{ color: accent }} />
                <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: accent }}>Indicator Guidance</span>
              </div>
              <h4 className="text-[16px] font-bold leading-tight">{indDef?.label}</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${accent}26`, color: accent }}>
                  {indicatorLevelLabel(indicatorLevel)} level
                </span>
                <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: C.panel2, color: C.sub, border: `1px solid ${C.border}` }}>
                  {unitLabel(unit)}
                </span>
              </div>
              {indDef?.guidancePending && (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: "#fbbf2418", color: "#fbbf24" }}>
                  <Info className="h-3 w-3" /> Detailed IndiKit guidance to be added when its PDF is provided.
                </p>
              )}
            </div>

            <RefBlock icon={Info} title="Indicator Wording" accent={accent}>
              <p className="text-[13px] italic leading-relaxed" style={{ color: C.text }}>
                “{(indDef?.wording || "").replace("[target group]", targetGroup || "[target group]")}”
              </p>
            </RefBlock>

            <RefBlock icon={Lightbulb} title="Purpose" accent={accent}>
              <p className="text-[13px] leading-relaxed" style={{ color: C.sub }}>{indDef?.purpose}</p>
            </RefBlock>

            <RefBlock icon={ListChecks} title="How to Collect & Analyse" accent={accent}>
              <ol className="space-y-2">
                {indDef?.definition.map((step, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed" style={{ color: C.sub }}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: `${accent}26`, color: accent }}>{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </RefBlock>

            {(indDef?.disaggregations.length || 0) > 0 && (
              <RefBlock icon={SlidersHorizontal} title="Disaggregate By" accent={accent}>
                <div className="flex flex-wrap gap-1.5">
                  {indDef!.disaggregations.map((dk) => (
                    <span key={dk} className="rounded-full px-2.5 py-1 text-[12px]" style={{ background: C.panel2, color: C.text, border: `1px solid ${C.border}` }}>
                      {DISAGG_DIMENSIONS[dk]?.label || dk}
                    </span>
                  ))}
                </div>
              </RefBlock>
            )}

            {(indDef?.importantComments.length || 0) > 0 && (
              <RefBlock icon={CheckCircle2} title="Important Comments" accent={accent}>
                <ul className="space-y-2">
                  {indDef!.importantComments.map((c, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed" style={{ color: C.sub }}>
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </RefBlock>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

const RefBlock = ({
  icon: Icon, title, accent, children,
}: { icon: any; title: string; accent: string; children: React.ReactNode }) => (
  <div className="rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}>
    <div className="mb-2 flex items-center gap-2">
      <Icon className="h-4 w-4" style={{ color: accent }} />
      <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: C.sub }}>{title}</span>
    </div>
    {children}
  </div>
);
