import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Check,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  User,
  MapPin,
  Brain,
  CloudRain,
  Smile,
  Meh,
  Frown,
  Angry,
  Search,
  History,
  CalendarClock,
  Activity,
  UserSearch,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAllStates } from "@/lib/nigeriaAdminData";
import {
  STANDARD_ASSESSMENTS,
  scoreAssessment,
} from "@/lib/standardAssessments/definitions";
import MentalHealthRecordsView from "./MentalHealthRecordsView";
import { LineChart as LineChartIcon } from "lucide-react";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

interface ClientInfo {
  patientId: string;
  fullName: string;
  sex: "female" | "male" | "";
  age: string;
  state: string;
}

const FREQ_COLUMNS = [
  { value: "0", label: "Not at all", score: 0 },
  { value: "1", label: "Several days", score: 1 },
  { value: "2", label: "More than half the days", score: 2 },
  { value: "3", label: "Nearly every day", score: 3 },
];

const DIFFICULTY = [
  { value: "not", label: "Not difficult at all", Icon: Smile, color: "emerald" },
  { value: "somewhat", label: "Somewhat difficult", Icon: Meh, color: "amber" },
  { value: "very", label: "Very difficult", Icon: Frown, color: "orange" },
  { value: "extremely", label: "Extremely difficult", Icon: Angry, color: "rose" },
] as const;

const diffStyles: Record<string, { active: string; idle: string; icon: string }> = {
  emerald: {
    active: "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/30",
    idle: "border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50",
    icon: "text-emerald-600",
  },
  amber: {
    active: "border-amber-500 bg-amber-50 ring-2 ring-amber-500/30",
    idle: "border-amber-200 bg-amber-50/40 hover:bg-amber-50",
    icon: "text-amber-600",
  },
  orange: {
    active: "border-orange-500 bg-orange-50 ring-2 ring-orange-500/30",
    idle: "border-orange-200 bg-orange-50/40 hover:bg-orange-50",
    icon: "text-orange-600",
  },
  rose: {
    active: "border-rose-500 bg-rose-50 ring-2 ring-rose-500/30",
    idle: "border-rose-200 bg-rose-50/40 hover:bg-rose-50",
    icon: "text-rose-600",
  },
};

function genPatientId() {
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const seq = String(Math.floor(Math.random() * 90000) + 10000);
  return `NHF-${ym}-${seq}`;
}

type FormKey = "gad_7" | "phq_9";

const THEME: Record<FormKey, {
  name: string;
  subtitle: string;
  questions: string;
  minutes: string;
  blurb: string;
  Icon: typeof Brain;
  headerBg: string;
  accentBar: string;
  cardIconBg: string;
  cardIconFg: string;
  intro: string;
  progress: string;
  radioChecked: string;
  nextBtn: string;
}> = {
  gad_7: {
    name: "GAD-7",
    subtitle: "General Anxiety Disorder",
    questions: "7 questions",
    minutes: "~2 min",
    blurb: "Assesses anxiety symptoms over the past 2 weeks.",
    Icon: Brain,
    headerBg: "bg-emerald-800",
    accentBar: "bg-emerald-600",
    cardIconBg: "bg-emerald-100",
    cardIconFg: "text-emerald-700",
    intro:
      "The questions below ask about how often and how severe you may experience anxiety symptoms over the past two weeks.",
    progress: "bg-emerald-600",
    radioChecked: "border-emerald-600 bg-emerald-600",
    nextBtn: "bg-emerald-700 hover:bg-emerald-800",
  },
  phq_9: {
    name: "PHQ-9",
    subtitle: "Patient Health Questionnaire",
    questions: "9 questions",
    minutes: "~3 min",
    blurb: "Screens for depression severity over the past 2 weeks.",
    Icon: CloudRain,
    headerBg: "bg-violet-800",
    accentBar: "bg-violet-600",
    cardIconBg: "bg-violet-100",
    cardIconFg: "text-violet-700",
    intro:
      "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
    progress: "bg-violet-600",
    radioChecked: "border-violet-600 bg-violet-600",
    nextBtn: "bg-violet-700 hover:bg-violet-800",
  },
};

const MentalHealthAssessment = ({ projectId, onClose }: Props) => {
  const { user } = useAuth();
  const greetingName =
    (user?.user_metadata as any)?.full_name?.split(" ")?.[0] ||
    (user?.user_metadata as any)?.name?.split(" ")?.[0] ||
    "there";

  const [client, setClient] = useState<ClientInfo>({
    patientId: genPatientId(),
    fullName: "",
    sex: "female",
    age: "28",
    state: "Kano",
  });
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<ClientInfo>(client);

  // ---------- Follow-up lookup state ----------
  const [followOpen, setFollowOpen] = useState(false);
  const [lookupId, setLookupId] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundPatient, setFoundPatient] = useState<null | {
    demographics: Record<string, any>;
    lastDate: string;
    lastForm: string;
    lastScore: number | null;
    lastSeverity: string | null;
    visits: number;
  }>(null);

  const [activeForm, setActiveForm] = useState<FormKey | null>(null);
  const [showRecords, setShowRecords] = useState(false);

  // ---------- Individual form fill state ----------
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | ReturnType<typeof scoreAssessment>>(null);

  const def = activeForm ? STANDARD_ASSESSMENTS[activeForm] : null;
  const theme = activeForm ? THEME[activeForm] : null;

  const answeredCount = useMemo(() => {
    if (!def) return 0;
    return def.items.filter((q) => responses[q.id] != null && responses[q.id] !== "").length;
  }, [def, responses]);

  const totalItems = def?.items.length ?? 0;

  const openForm = (key: FormKey) => {
    setActiveForm(key);
    setResponses({});
    setResult(null);
  };

  const backToSelect = () => {
    setActiveForm(null);
    setResponses({});
    setResult(null);
  };

  const openFollowUp = () => {
    setFollowOpen(true);
    setLookupId("");
    setLookupError(null);
    setFoundPatient(null);
  };

  const lookupPatient = async () => {
    const pid = lookupId.trim();
    if (!pid) {
      setLookupError("Enter a Patient ID to search.");
      return;
    }
    setLooking(true);
    setLookupError(null);
    setFoundPatient(null);
    try {
      const { data, error } = await supabase
        .from("standard_assessment_submissions")
        .select("form_code,demographics,score,severity,created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = (data ?? []).filter(
        (r) =>
          String((r.demographics as any)?.patient_id || "")
            .trim()
            .toLowerCase() === pid.toLowerCase(),
      );
      if (rows.length === 0) {
        setLookupError("No previous records found for this Patient ID.");
        return;
      }
      const latest = rows[0] as any;
      setFoundPatient({
        demographics: (latest.demographics as any) || {},
        lastDate: latest.created_at,
        lastForm: latest.form_code,
        lastScore: latest.score ?? null,
        lastSeverity: latest.severity ?? null,
        visits: rows.length,
      });
    } catch (e: any) {
      setLookupError(e?.message || "Lookup failed. Please try again.");
    } finally {
      setLooking(false);
    }
  };

  const confirmFollowUp = () => {
    if (!foundPatient) return;
    const d = foundPatient.demographics;
    setClient({
      patientId: d.patient_id || lookupId.trim(),
      fullName: d.full_name || "",
      sex: (d.sex as ClientInfo["sex"]) || "female",
      age: String(d.age ?? ""),
      state: d.state || "",
    });
    setFollowOpen(false);
    setFoundPatient(null);
    setLookupId("");
    toast({
      title: "Patient confirmed",
      description: `Following up with ${d.full_name || d.patient_id || "patient"}.`,
    });
  };

  const handleSubmit = async () => {
    if (!def || !activeForm) return;
    if (!user) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    if (answeredCount < totalItems) {
      toast({ title: "Please answer all questions", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const scored = scoreAssessment(activeForm, responses);
      const demographics = {
        patient_id: client.patientId,
        full_name: client.fullName,
        sex: client.sex,
        age: client.age,
        state: client.state,
      };
      const payload = { ...responses, ...demographics };
      const { error } = await supabase.from("standard_assessment_submissions").insert({
        user_id: user.id,
        form_code: activeForm,
        project_id: projectId ?? null,
        data: payload,
        demographics,
        score: scored.score,
        severity: scored.severity,
        disability_flags: null,
      } as any);
      if (error) throw error;
      setResult(scored);
      toast({ title: "Assessment saved", description: scored.severity });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ====================== RECORDS & LONGITUDINAL TRACKING ======================
  if (showRecords) {
    return <MentalHealthRecordsView projectId={projectId} onClose={() => setShowRecords(false)} />;
  }

  // ====================== RESULT SCREEN ======================
  if (activeForm && def && theme && result) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className={`${theme.headerBg} text-white px-4 pt-5 pb-8 text-center`}>
          <h1 className="text-xl font-bold">{theme.name} — Result</h1>
          <p className="text-sm text-white/80">{theme.subtitle}</p>
        </div>
        <div className="max-w-md mx-auto px-4 -mt-5">
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <div className="text-4xl font-bold text-slate-900">{result.score}</div>
            <div className="text-lg font-semibold text-slate-800">{result.severity}</div>
            <p className="text-sm text-slate-600">{result.interpretation}</p>
            <div className="flex flex-col gap-2 pt-3">
              <Button className={`${theme.nextBtn} text-white`} onClick={backToSelect}>
                Back to assessments
              </Button>
              <Button variant="outline" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ====================== INDIVIDUAL FORM ======================
  if (activeForm && def && theme) {
    const IntroIcon = theme.Icon;
    const closing = def.closing?.[0];
    const pct = totalItems ? Math.round((answeredCount / totalItems) * 100) : 0;
    return (
      <div className="min-h-screen bg-slate-50 pb-28">
        {/* Header */}
        <div className={`${theme.headerBg} text-white sticky top-0 z-20`}>
          <div className="px-4 py-4 flex items-center gap-3">
            <button onClick={backToSelect} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 text-center">
              <h1 className="text-lg font-bold leading-tight">{theme.name}</h1>
              <p className="text-xs text-white/80">{theme.subtitle}</p>
            </div>
            <Info className="h-5 w-5 shrink-0 opacity-90" />
          </div>
        </div>

        {/* Progress */}
        <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-slate-100">
          <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
            <div className={`h-full ${theme.progress} transition-all`} style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
          <span className="text-sm font-medium text-slate-500 shrink-0">1 of 3</span>
        </div>

        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 space-y-5">
          {/* Intro callout */}
          <div className={`flex gap-3 rounded-xl p-4 ${activeForm === "gad_7" ? "bg-emerald-50" : "bg-violet-50"}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${theme.cardIconBg}`}>
              <IntroIcon className={`h-5 w-5 ${theme.cardIconFg}`} />
            </div>
            <p className="text-sm text-slate-700">{theme.intro}</p>
          </div>

          {/* Matrix */}
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-3">
              Over the last 2 weeks, how often have you been bothered by the following problems?
            </h2>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_repeat(4,3rem)] sm:grid-cols-[1fr_repeat(4,4rem)] gap-1 px-3 pt-3 pb-2 border-b border-slate-100">
                <div />
                {FREQ_COLUMNS.map((c) => (
                  <div key={c.value} className="text-center">
                    <div className="text-[10px] sm:text-xs font-medium leading-tight text-slate-500">{c.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{c.score}</div>
                  </div>
                ))}
              </div>
              {def.items.map((q, i) => {
                const cur = responses[q.id];
                const label = q.label.replace(/^\d+\.\s*/, "");
                return (
                  <div
                    key={q.id}
                    className="grid grid-cols-[1fr_repeat(4,3rem)] sm:grid-cols-[1fr_repeat(4,4rem)] gap-1 items-center px-3 py-3 border-b border-slate-50 last:border-b-0"
                  >
                    <div className="flex gap-1.5 text-xs sm:text-sm text-slate-700 pr-1">
                      <span className="text-slate-400">{i + 1}.</span>
                      <span>{label}</span>
                    </div>
                    {FREQ_COLUMNS.map((c) => {
                      const selected = cur === c.value;
                      return (
                        <div key={c.value} className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => setResponses((p) => ({ ...p, [q.id]: c.value }))}
                            aria-label={`${label}: ${c.label}`}
                            className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              selected ? theme.radioChecked : "border-slate-300 bg-white"
                            }`}
                          >
                            {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Functional impact */}
          {closing && (
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3">
                If you checked off any problems, how difficult have these problems made it for you to do your work,
                take care of things at home, or get along with other people?
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DIFFICULTY.map((d) => {
                  const s = diffStyles[d.color];
                  const selected = responses[closing.id] === d.value;
                  const DIcon = d.Icon;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setResponses((p) => ({ ...p, [closing.id]: d.value }))}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                        selected ? s.active : s.idle
                      }`}
                    >
                      <DIcon className={`h-6 w-6 ${s.icon}`} />
                      <span className="text-xs font-semibold text-slate-700 leading-tight">{d.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="outline" onClick={backToSelect} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Previous
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className={`flex-1 gap-2 text-white ${theme.nextBtn}`}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-slate-400">
            <Lock className="h-3 w-3" /> Your responses are confidential and secure.
          </div>
        </div>
      </div>
    );
  }

  // ====================== SELECT / LANDING ======================
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Greeting */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <button onClick={onClose} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <h1 className="text-2xl font-bold text-slate-900">
              Good day, {greetingName} <span className="inline-block">👋</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Let's collect quality data for better health outcomes.</p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Online
          </span>
        </div>

        {/* Patient card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <User className="h-7 w-7 text-emerald-700" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-400">Patient ID</div>
              <div className="text-lg font-bold text-slate-900 truncate">{client.patientId}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {client.sex === "male" ? "Male" : "Female"}, {client.age || "—"} years
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {client.state ? `${client.state} State` : "—"}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => {
                setDraft(client);
                setEditOpen(true);
              }}
            >
              Change
            </Button>
          </div>

          {/* Follow-up lookup */}
          <button
            onClick={openFollowUp}
            className="mt-4 flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-left transition-colors hover:bg-emerald-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
              <UserSearch className="h-5 w-5 text-emerald-700" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-emerald-800">Follow up an existing patient</span>
              <span className="block text-xs text-emerald-700/80">Enter a previous Patient ID to load and confirm their details.</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-emerald-400" />
          </button>
        </div>

        {/* Stepper */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center">
            <Step n="1" label="Client Info" state="done" />
            <Line active />
            <Step n="2" label="Assessments" state="active" />
            <Line />
            <Step n="3" label="Review & Submit" state="todo" />
          </div>
        </div>

        {/* Select assessment */}
        <div>
          <h2 className="text-xl font-bold text-slate-900">Select Assessment</h2>
          <p className="text-sm text-slate-500">Choose an assessment tool to begin.</p>
        </div>

        {(["gad_7", "phq_9"] as FormKey[]).map((key) => {
          const t = THEME[key];
          const TIcon = t.Icon;
          return (
            <button
              key={key}
              onClick={() => openForm(key)}
              className="group flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
            >
              <span className={`-ml-4 mr-0 h-[5.5rem] w-1.5 shrink-0 rounded-r ${t.accentBar}`} />
              <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl ${t.cardIconBg}`}>
                <TIcon className={`h-8 w-8 ${t.cardIconFg}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold text-slate-900">{t.name}</div>
                <div className="text-sm font-medium text-slate-700">{t.subtitle}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {t.questions} • {t.minutes}
                </div>
                <p className="text-xs text-slate-500 mt-1">{t.blurb}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 group-hover:text-slate-500" />
            </button>
          );
        })}

        {/* Records & longitudinal tracking */}
        <button
          onClick={() => setShowRecords(true)}
          className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <LineChartIcon className="h-8 w-8 text-slate-700" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-slate-900">Records & Tracking</div>
            <div className="text-sm font-medium text-slate-700">Longitudinal patient outcomes</div>
            <p className="text-xs text-slate-500 mt-1">View saved results over time and export to Excel.</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 group-hover:text-slate-500" />
        </button>

        <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-600" />
          <div>
            <div className="text-sm font-bold text-emerald-800">Confidential &amp; Secure</div>
            <p className="text-xs text-emerald-700/80">
              All data is confidential and secure. Collect with care. Every response counts.
            </p>
          </div>
        </div>
      </div>

      {/* Edit client dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Client information</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Patient ID</Label>
              <Input
                value={draft.patientId}
                onChange={(e) => setDraft((d) => ({ ...d, patientId: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Full name (optional)</Label>
              <Input
                value={draft.fullName}
                onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
                placeholder="Leave blank to keep anonymous"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sex</Label>
                <Select value={draft.sex} onValueChange={(v) => setDraft((d) => ({ ...d, sex: v as any }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Age (years)</Label>
                <Input
                  type="number"
                  value={draft.age}
                  onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>State of residence</Label>
              <Select value={draft.state} onValueChange={(v) => setDraft((d) => ({ ...d, state: v }))}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {getAllStates().map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => { setClient(draft); setEditOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Patient follow-up lookup & confirmation dialog */}
      <Dialog open={followOpen} onOpenChange={setFollowOpen}>
        <DialogContent className="sm:max-w-lg overflow-hidden p-0">
          <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
                <UserSearch className="h-6 w-6" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold text-white">Patient Follow-up</DialogTitle>
                <p className="text-xs text-white/80">Find a previous patient and confirm before continuing.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="space-y-1.5">
              <Label>Patient ID</Label>
              <div className="flex gap-2">
                <Input
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && lookupPatient()}
                  placeholder="e.g. NHF-2026-12345"
                  autoFocus
                />
                <Button onClick={lookupPatient} disabled={looking} className="shrink-0 gap-1.5 bg-emerald-700 text-white hover:bg-emerald-800">
                  {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Find
                </Button>
              </div>
            </div>

            {lookupError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                <X className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{lookupError}</span>
              </div>
            )}

            {foundPatient && (
              <div className="rounded-2xl border border-emerald-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <User className="h-6 w-6 text-emerald-700" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-bold text-slate-900">
                      {foundPatient.demographics.full_name || "Anonymous patient"}
                    </div>
                    <div className="text-xs font-medium text-slate-500">
                      {foundPatient.demographics.patient_id || lookupId.trim()}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    <Check className="h-3 w-3" /> Match found
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    {foundPatient.demographics.sex === "male" ? "Male" : "Female"},{" "}
                    {foundPatient.demographics.age || "—"} yrs
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {foundPatient.demographics.state ? `${foundPatient.demographics.state} State` : "—"}
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <History className="h-3.5 w-3.5 text-slate-400" />
                    {foundPatient.visits} previous {foundPatient.visits === 1 ? "visit" : "visits"}
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                    {new Date(foundPatient.lastDate).toLocaleDateString()}
                  </div>
                  {foundPatient.lastSeverity && (
                    <div className="col-span-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                      <Activity className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs">
                        Last result:{" "}
                        <span className="font-semibold">
                          {String(foundPatient.lastForm).toUpperCase().replace("_", "-")}
                        </span>{" "}
                        — {foundPatient.lastSeverity}
                        {foundPatient.lastScore != null ? ` (score ${foundPatient.lastScore})` : ""}
                      </span>
                    </div>
                  )}
                </div>
                <div className="px-4 pb-2 text-center text-xs text-slate-400">
                  Please confirm this is the correct patient before proceeding.
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-slate-100 px-6 py-4">
            <Button variant="outline" onClick={() => setFollowOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmFollowUp}
              disabled={!foundPatient}
              className="gap-1.5 bg-emerald-700 text-white hover:bg-emerald-800"
            >
              <Check className="h-4 w-4" /> Confirm &amp; continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function Step({ n, label, state }: { n: string; label: string; state: "done" | "active" | "todo" }) {
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
          state === "done"
            ? "bg-emerald-600 text-white"
            : state === "active"
            ? "bg-emerald-600 text-white"
            : "bg-slate-100 text-slate-400"
        }`}
      >
        {state === "done" ? <Check className="h-4 w-4" /> : n}
      </div>
      <span className={`text-xs font-medium ${state === "todo" ? "text-slate-400" : "text-slate-700"}`}>
        {label}
      </span>
    </div>
  );
}

function Line({ active }: { active?: boolean }) {
  return <div className={`h-0.5 flex-1 mx-1 mb-5 ${active ? "bg-emerald-500" : "bg-slate-200"}`} />;
}

export default MentalHealthAssessment;
