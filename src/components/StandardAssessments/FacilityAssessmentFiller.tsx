import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Loader2, Save, CheckCircle2, Check, X,
  ShieldCheck, ClipboardCheck, Target, MapPin, Wifi, Clock, Lock, Building2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAllStates, getLGAsForState } from "@/lib/nigeriaAdminData";
import {
  STANDARD_ASSESSMENTS, StandardFormCode, SAQuestion, scoreAssessment,
} from "@/lib/standardAssessments/definitions";
import heroImg from "@/assets/facility-assessment-hero.jpg";

interface Props {
  code: Extract<StandardFormCode, "hfat" | "lfat">;
  projectId?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
}

interface Step {
  /** Top-level domain title, e.g. "Domain 1 - Background Information" */
  title: string;
  /** Short label for the progress dots, e.g. "1" or "Background" */
  subtitle: string;
  /** Sub-section groups inside the step */
  groups: { name: string | null; questions: SAQuestion[] }[];
}

const domainOf = (section?: string) => (section ?? "Questions").split(" · ")[0];
const subOf = (section?: string) => {
  const parts = (section ?? "Questions").split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ") : null;
};

const isYesNo = (q: SAQuestion) => {
  if (q.type !== "select_one" || !q.options || q.options.length < 2 || q.options.length > 3) return false;
  const vals = q.options.map((o) => o.value.toLowerCase());
  return vals.includes("yes") && vals.includes("no");
};

const FacilityAssessmentFiller = ({ code, projectId, onClose, onSubmitted }: Props) => {
  const def = STANDARD_ASSESSMENTS[code];
  const { user } = useAuth();
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0); // 0 = intro hero
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const allQuestions = useMemo(
    () => [...def.identification, ...def.demographics, ...def.items],
    [def],
  );

  // Build wizard steps grouped by domain, then sub-section
  const steps = useMemo<Step[]>(() => {
    const order: string[] = [];
    const byDomain = new Map<string, SAQuestion[]>();
    allQuestions.forEach((q) => {
      const d = q.section ? domainOf(q.section) : "General";
      if (!byDomain.has(d)) {
        byDomain.set(d, []);
        order.push(d);
      }
      byDomain.get(d)!.push(q);
    });
    return order.map((d, i) => {
      const qs = byDomain.get(d)!;
      const groupOrder: (string | null)[] = [];
      const groupMap = new Map<string | null, SAQuestion[]>();
      qs.forEach((q) => {
        const sub = q.section ? subOf(q.section) : null;
        const key = sub && !/^comments?$/i.test(sub) ? sub : sub;
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
          groupOrder.push(key);
        }
        groupMap.get(key)!.push(q);
      });
      return {
        title: d,
        subtitle: d.replace(/^Domain\s*\d+[a-z]?\s*-\s*/i, "").trim() || `Step ${i + 1}`,
        groups: groupOrder.map((name) => ({ name, questions: groupMap.get(name)! })),
      };
    });
  }, [allQuestions]);

  const totalSteps = steps.length;
  const current = step >= 1 ? steps[step - 1] : null;

  const ageVal = parseInt(responses.age ?? "", 10);
  const isVisible = (q: SAQuestion): boolean => {
    if (q.showIfMinAge != null && (isNaN(ageVal) || ageVal < q.showIfMinAge)) return false;
    return true;
  };

  const resolveOptions = (q: SAQuestion) => {
    if (q.optionsFrom === "nigeria_states") return getAllStates().map((s) => ({ value: s, label: s }));
    if (q.optionsFrom === "nigeria_lgas") {
      const parent = q.dependsOn ? responses[q.dependsOn] : null;
      if (!parent) return [];
      return getLGAsForState(parent).map((l) => ({ value: l, label: l }));
    }
    return q.options ?? [];
  };

  const set = (id: string, v: any) => {
    setErrors((e) => { const n = { ...e }; delete n[id]; return n; });
    setResponses((p) => {
      const next = { ...p, [id]: v };
      allQuestions.forEach((q) => { if (q.dependsOn === id) next[q.id] = ""; });
      return next;
    });
  };

  const validateStep = (s: Step): boolean => {
    const errs: Record<string, string> = {};
    s.groups.forEach((g) => g.questions.forEach((q) => {
      if (!isVisible(q) || q.type === "note") return;
      if (q.required && (responses[q.id] === undefined || responses[q.id] === "")) errs[q.id] = "Required";
    }));
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Readiness score: % of yes/no items answered "yes"
  const readiness = useMemo(() => {
    let yes = 0, total = 0;
    allQuestions.forEach((q) => {
      if (isYesNo(q) && responses[q.id] != null && responses[q.id] !== "") {
        total++;
        if (String(responses[q.id]).toLowerCase() === "yes") yes++;
      }
    });
    const pct = total ? Math.round((yes / total) * 100) : 0;
    return { pct, total, yes };
  }, [allQuestions, responses]);

  const goNext = () => {
    if (step === 0) { setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (current && !validateStep(current)) {
      toast({ title: "Please complete required fields", variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(s + 1, totalSteps));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goBack = () => { setStep((s) => Math.max(s - 1, 0)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const handleSubmit = async () => {
    if (!user) { toast({ title: "Sign in required", variant: "destructive" }); return; }
    if (current && !validateStep(current)) {
      toast({ title: "Please complete required fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const result = scoreAssessment(code, responses);
      const { error } = await supabase.from("standard_assessment_submissions").insert({
        user_id: user.id,
        form_code: code,
        project_id: projectId ?? null,
        data: responses,
        demographics: { facility_name: responses.facility_name ?? responses.health_facility ?? null },
        score: readiness.pct,
        severity: result.severity,
        disability_flags: null,
      } as any);
      if (error) throw error;
      setSubmitted(true);
      toast({ title: "Assessment submitted", description: `Readiness ${readiness.pct}%` });
      onSubmitted?.();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Field renderer ----------
  const renderField = (q: SAQuestion) => {
    if (!isVisible(q)) return null;
    if (q.type === "note") {
      return (
        <div key={q.id} className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-900 whitespace-pre-line">
          {q.label}
        </div>
      );
    }
    const opts = resolveOptions(q);
    const yesNo = isYesNo(q);
    const useDropdown = !yesNo && (q.optionsFrom != null || opts.length > 4);
    const dependentNoParent = q.optionsFrom === "nigeria_lgas" && q.dependsOn && !responses[q.dependsOn];
    const err = errors[q.id];

    return (
      <div key={q.id} className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700 flex gap-1">
          <span>{q.label}</span>
          {q.required && <span className="text-emerald-600">*</span>}
        </label>
        {q.hint && <p className="text-xs text-slate-400">{q.hint}</p>}

        {(q.type === "text") && (
          <Input
            value={responses[q.id] ?? ""}
            onChange={(e) => set(q.id, e.target.value)}
            className="h-11 rounded-xl border-slate-200 bg-slate-50/60 focus-visible:ring-emerald-500"
          />
        )}
        {q.type === "number" && (
          <Input type="number" value={responses[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)}
            className="h-11 rounded-xl border-slate-200 bg-slate-50/60 focus-visible:ring-emerald-500" />
        )}
        {q.type === "date" && (
          <Input type="date" value={responses[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)}
            className="h-11 rounded-xl border-slate-200 bg-slate-50/60 focus-visible:ring-emerald-500" />
        )}

        {q.type === "select_one" && yesNo && (
          <div className="flex gap-2">
            {opts.map((o) => {
              const active = responses[q.id] === o.value;
              const yes = o.value.toLowerCase() === "yes";
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => set(q.id, o.value)}
                  className={cn(
                    "flex-1 h-11 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 transition-all",
                    active && yes && "bg-emerald-600 border-emerald-600 text-white shadow-sm",
                    active && !yes && "bg-slate-700 border-slate-700 text-white shadow-sm",
                    !active && "bg-white border-slate-200 text-slate-600 hover:border-emerald-300",
                  )}
                >
                  {yes ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {o.label}
                </button>
              );
            })}
          </div>
        )}

        {q.type === "select_one" && !yesNo && useDropdown && (
          <Select value={responses[q.id] ?? ""} onValueChange={(v) => set(q.id, v)} disabled={!!dependentNoParent}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/60 focus:ring-emerald-500">
              <SelectValue placeholder={dependentNoParent ? "Select state first" : "Select…"} />
            </SelectTrigger>
            <SelectContent>
              {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {q.type === "select_one" && !yesNo && !useDropdown && (
          <div className="grid gap-2">
            {opts.map((o) => {
              const active = responses[q.id] === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => set(q.id, o.value)}
                  className={cn(
                    "w-full text-left rounded-xl border px-3 py-2.5 text-sm font-medium transition-all flex items-center gap-2",
                    active ? "bg-emerald-50 border-emerald-500 text-emerald-800" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300",
                  )}
                >
                  <span className={cn("h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                    active ? "border-emerald-600 bg-emerald-600" : "border-slate-300")}>
                    {active && <Check className="h-3 w-3 text-white" />}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
        )}

        {err && <p className="text-xs text-red-500">{err}</p>}
      </div>
    );
  };

  const StepDots = () => (
    <div className="flex items-center justify-center gap-1.5 flex-wrap">
      {steps.map((_, i) => {
        const idx = i + 1;
        const done = step > idx;
        const active = step === idx;
        return (
          <div key={i} className="flex items-center">
            <div className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
              done && "bg-emerald-600 text-white",
              active && "bg-emerald-600 text-white ring-4 ring-emerald-100",
              !done && !active && "bg-slate-100 text-slate-400",
            )}>
              {done ? <Check className="h-3.5 w-3.5" /> : idx}
            </div>
            {i < steps.length - 1 && <div className={cn("h-0.5 w-3 sm:w-5", step > idx ? "bg-emerald-600" : "bg-slate-200")} />}
          </div>
        );
      })}
    </div>
  );

  const StatusBar = () => (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-slate-500 pt-2">
      <span className="flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5 text-emerald-600" /> Offline Mode</span>
      <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-emerald-600" /> GPS Capture</span>
      <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-emerald-600" /> Auto Save</span>
      <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-emerald-600" /> Secure & Encrypted</span>
    </div>
  );

  // ---------- Success ----------
  if (submitted) {
    return (
      <div className="max-w-md mx-auto p-4">
        <div className="rounded-3xl bg-white border border-slate-100 shadow-xl p-8 text-center space-y-5">
          <div className="mx-auto h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="h-11 w-11 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-emerald-700">Assessment Submitted!</h2>
            <p className="text-sm text-slate-500 mt-1">Thank you. Your data has been saved successfully.</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4">
            <div className="text-xs text-slate-500">Facility Readiness Score</div>
            <div className="text-3xl font-bold text-emerald-700">{readiness.pct}%</div>
            <div className="text-xs text-slate-500 mt-1">{readiness.yes} of {readiness.total} readiness indicators met</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-left">
            <div className="font-semibold text-slate-700 text-sm mb-1">Next Steps</div>
            <p className="text-xs text-slate-500">Your assessment will help strengthen surgical and lymphoedema services in your community.</p>
          </div>
          <Button onClick={onClose} className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 gap-2">
            Back to forms <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Intro hero ----------
  if (step === 0) {
    const features = [
      { icon: ClipboardCheck, color: "bg-emerald-100 text-emerald-600", title: "Evidence Based", body: "Standardized assessment aligned with national guidelines" },
      { icon: Building2, color: "bg-sky-100 text-sky-600", title: "Comprehensive", body: "Covers infrastructure, equipment, staff and services" },
      { icon: Target, color: "bg-violet-100 text-violet-600", title: "Action Oriented", body: "Identify gaps and strengthen service delivery" },
    ];
    return (
      <div className="max-w-lg mx-auto p-4">
        <Button variant="ghost" onClick={onClose} className="gap-2 mb-2 text-slate-600">
          <ArrowLeft className="h-4 w-4" /> Back to forms
        </Button>
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-7 space-y-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <ShieldCheck className="h-6 w-6" />
              <span className="text-xs font-bold tracking-wide uppercase">NTD · Nigeria</span>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-emerald-800 leading-tight">{def.shortName === "HFAT" ? "Health Facility Assessment" : "Lymphoedema Facility Assessment"}</h1>
              <p className="text-slate-500 mt-2">{def.description}</p>
            </div>
            <div className="space-y-3">
              {features.map((f) => (
                <div key={f.title} className="flex gap-3 rounded-2xl border border-slate-100 p-3.5">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", f.color)}>
                    <f.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 text-sm">{f.title}</div>
                    <div className="text-xs text-slate-500">{f.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <img src={heroImg} alt="Nigerian primary health centre" loading="lazy" width={1024} height={640} className="w-full h-44 object-cover" />
        </div>
        <Button onClick={goNext} className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 gap-2 mt-4">
          Start Assessment <ArrowRight className="h-4 w-4" />
        </Button>
        <StatusBar />
      </div>
    );
  }

  // ---------- Step body ----------
  const isLast = step === totalSteps;
  return (
    <div className="max-w-lg mx-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5 text-slate-600">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <span className="text-xs font-semibold text-emerald-700">Step {step} of {totalSteps}</span>
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{current!.title.replace(/^Domain\s*\d+[a-z]?\s*-\s*/i, (m) => m)}</h2>
          <p className="text-sm text-slate-500">{current!.subtitle}</p>
        </div>

        <StepDots />

        <div className="space-y-6">
          {current!.groups.map((g, gi) => (
            <div key={gi} className="space-y-3">
              {g.name && (
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 border-b border-slate-100 pb-1">
                  {g.name}
                </div>
              )}
              {g.questions.map(renderField)}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <Button variant="outline" onClick={goBack} className="flex-1 h-12 rounded-xl border-slate-200 gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {isLast ? (
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Submit
          </Button>
        ) : (
          <Button onClick={goNext} className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 gap-2">
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
      <StatusBar />
    </div>
  );
};

export default FacilityAssessmentFiller;
