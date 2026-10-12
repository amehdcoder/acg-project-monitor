import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Building2, Search, Stethoscope, FileCheck2, IdCard, Home, ClipboardList, CalendarClock, ShieldCheck, BarChart3,
  ChevronLeft, ChevronRight, SkipForward, X, Check, Compass, Sparkles, Lightbulb, Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TourPrefs = "every_sign_in" | "never";
type Can = (p: string) => boolean;

interface TourStage {
  key: string;
  title: string;
  icon: LucideIcon;
  view?: string;
  show: (c: { can: Can; canConfigure: boolean; isOfficer: boolean }) => boolean;
  steps: { title: string; body: string }[];
}

const STAGES: TourStage[] = [
  {
    key: "setup", title: "Facilities & CDD registration", icon: Building2, view: "casesearch",
    show: ({ can, canConfigure }) => canConfigure || can("manage_cdds"),
    steps: [
      { title: "Register health facilities", body: "Open Manage → Health facilities to add each facility. Every record, CDD and referral is anchored to a facility." },
      { title: "Register CDDs under a facility", body: "In CDD case search, add community drug distributors and attach each one to their supervising facility, community and ward." },
    ],
  },
  {
    key: "search", title: "Case search", icon: Search, view: "casesearch",
    show: ({ can, canConfigure }) => canConfigure || can("manage_cdds"),
    steps: [
      { title: "Record a potential case", body: "CDDs log suspected cases found in the community — symptoms, photos and location — as potential cases. They work offline and sync later." },
      { title: "Track what's waiting", body: "Potential cases stay in the review list until a clinician confirms or rules them out." },
    ],
  },
  {
    key: "confirm", title: "Clinician confirmation", icon: Stethoscope, view: "casesearch",
    show: ({ can, canConfigure }) => canConfigure || can("confirm_cases"),
    steps: [
      { title: "Review potential cases", body: "Clinicians open each potential case, examine the evidence and mark it confirmed or not a case, with a reason." },
    ],
  },
  {
    key: "commit", title: "Facility record & Case ID", icon: FileCheck2, view: "records",
    show: ({ can }) => can("edit_records"),
    steps: [
      { title: "Commit to the facility record", body: "A confirmed case becomes a beneficiary record at its facility. Missing details can be completed with Register beneficiary." },
      { title: "Unique Case ID", body: "Each record receives one permanent Case ID (CiS2-facility-date-index) used everywhere in the system." },
    ],
  },
  {
    key: "card", title: "Digital Hand Card", icon: IdCard, view: "records",
    show: ({ can }) => can("view_records"),
    steps: [
      { title: "Generate the Hand Card", body: "Open a record and choose Hand Card to view, download or print it with the beneficiary's photo and QR code." },
      { title: "Scan to open a record", body: "Use Scan Case ID in the field — the camera reads the card and opens that beneficiary's record instantly." },
    ],
  },
  {
    key: "households", title: "Households & MDA", icon: Home, view: "households",
    show: ({ can }) => can("manage_households") || can("view_dashboards"),
    steps: [
      { title: "Link the household", body: "Add household members, water points and kinship so the whole family's NTD history is visible." },
      { title: "Record MDA rounds", body: "Log each mass drug administration round and the treatments given to every household member." },
    ],
  },
  {
    key: "services", title: "Services for each component", icon: ClipboardList, view: "records",
    show: ({ can }) => can("edit_records"),
    steps: [
      { title: "Record a service", body: "From a record, tap Record a service and choose the component — MMDP, mental health (with mhGAP support), documents and more." },
      { title: "Progress by component", body: "Each component shows its latest status, so you can see where the beneficiary is in their care." },
    ],
  },
  {
    key: "followups", title: "Follow-ups & referrals", icon: CalendarClock, view: "followups",
    show: ({ can }) => can("view_records"),
    steps: [
      { title: "Schedule follow-ups", body: "Set the next visit date with each service; upcoming and overdue visits appear in Follow-ups & referrals." },
      { title: "Refer and track outcomes", body: "Refer beneficiaries to other facilities and record whether the referral was accepted and completed." },
    ],
  },
  {
    key: "safeguarding", title: "Documenting safeguarding", icon: ShieldCheck, view: "safeguarding",
    show: ({ can, isOfficer }) => isOfficer && can("view_safeguarding"),
    steps: [
      { title: "Record a concern", body: "Safeguarding officers document concerns, actions taken and secure notes. Only officers can see these cases." },
    ],
  },
  {
    key: "insight", title: "Dashboards & insight", icon: BarChart3, view: "dashboard",
    show: ({ can }) => can("view_dashboards"),
    steps: [
      { title: "Monitor the programme", body: "The General dashboard, Beneficiary journey and Facility dashboard summarise outcomes, alerts and performance — showing only the components you work on." },
    ],
  },
];

const TONES = [
  { solid: "bg-records-blue", soft: "bg-records-blue/10", text: "text-records-blue", border: "border-records-blue/25" },
  { solid: "bg-records-teal", soft: "bg-records-teal/10", text: "text-records-teal", border: "border-records-teal/25" },
  { solid: "bg-records-purple", soft: "bg-records-purple/10", text: "text-records-purple", border: "border-records-purple/25" },
  { solid: "bg-records-cyan", soft: "bg-records-cyan/10", text: "text-records-cyan", border: "border-records-cyan/25" },
  { solid: "bg-records-green", soft: "bg-records-green/10", text: "text-records-green", border: "border-records-green/25" },
  { solid: "bg-records-amber", soft: "bg-records-amber/10", text: "text-records-amber", border: "border-records-amber/25" },
  { solid: "bg-records-red", soft: "bg-records-red/10", text: "text-records-red", border: "border-records-red/25" },
];

const prefKey = (uid: string) => `amehnities.workflowTour.pref.${uid}`;
const sessionKey = (uid: string) => `amehnities.workflowTour.seen.${uid}`;

export const openWorkflowTour = () => window.dispatchEvent(new Event("open-workflow-tour"));

interface Props {
  can: Can;
  canConfigure: boolean;
  isOfficer: boolean;
  ready: boolean;
  onNavigate: (view: string) => void;
}

const WorkflowTour = ({ can, canConfigure, isOfficer, ready, onNavigate }: Props) => {
  const [uid, setUid] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [stageIdx, setStageIdx] = useState(-1); // -1 = welcome
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pref, setPref] = useState<TourPrefs>("every_sign_in");

  const stages = useMemo(
    () => STAGES.filter((s) => s.show({ can, canConfigure, isOfficer })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, canConfigure, isOfficer],
  );

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  // Show once per sign-in session unless the user chose "never".
  useEffect(() => {
    if (!uid || !ready || stages.length === 0) return;
    const p = (localStorage.getItem(prefKey(uid)) as TourPrefs) || "every_sign_in";
    setPref(p);
    if (p === "never" || sessionStorage.getItem(sessionKey(uid))) return;
    sessionStorage.setItem(sessionKey(uid), "1");
    setStageIdx(-1); setStepIdx(0); setDone(new Set()); setOpen(true);
  }, [uid, ready, stages.length]);

  useEffect(() => {
    const h = () => { setStageIdx(-1); setStepIdx(0); setDone(new Set()); setOpen(true); };
    window.addEventListener("open-workflow-tour", h);
    return () => window.removeEventListener("open-workflow-tour", h);
  }, []);

  const savePref = (p: TourPrefs) => { setPref(p); if (uid) localStorage.setItem(prefKey(uid), p); };

  const stage = stageIdx >= 0 ? stages[stageIdx] : undefined;
  const totalSteps = stages.reduce((n, s) => n + s.steps.length, 0);
  const position = stage ? stages.slice(0, stageIdx).reduce((n, s) => n + s.steps.length, 0) + stepIdx + 1 : 0;

  const goStage = (i: number) => {
    if (i >= stages.length) { setOpen(false); return; }
    setStageIdx(i); setStepIdx(0);
    const v = stages[i]?.view; if (v) onNavigate(v);
  };
  const next = () => {
    if (!stage) return goStage(0);
    if (stepIdx < stage.steps.length - 1) return setStepIdx(stepIdx + 1);
    setDone((d) => new Set(d).add(stage.key));
    goStage(stageIdx + 1);
  };
  const back = () => {
    if (!stage) return;
    if (stepIdx > 0) return setStepIdx(stepIdx - 1);
    if (stageIdx > 0) { const p = stages[stageIdx - 1]; setStageIdx(stageIdx - 1); setStepIdx(p.steps.length - 1); if (p.view) onNavigate(p.view); }
    else setStageIdx(-1);
  };
  const skipStage = () => { if (stage) goStage(stageIdx + 1); };

  if (stages.length === 0) return null;
  const step = stage?.steps[stepIdx];
  const isLast = stage && stageIdx === stages.length - 1 && stepIdx === stage.steps.length - 1;

  const tone = (k: string) => TONES[STAGES.findIndex((s) => s.key === k) % TONES.length];
  const t = stage ? tone(stage.key) : TONES[0];
  const pct = stage ? Math.round((position / totalSteps) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
        <div className="grid md:grid-cols-[15rem_1fr]">
          <aside className="hidden bg-gradient-to-b from-records-blue/10 via-records-teal/5 to-records-purple/10 p-4 md:block">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-records-blue to-records-teal text-primary-foreground shadow-sm"><Compass className="h-4 w-4" /></span>
              <div><p className="text-xs font-bold text-foreground">Your workflow</p><p className="text-[10px] text-muted-foreground">{stages.length} stages · {totalSteps} steps</p></div>
            </div>
            <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[1.05rem] before:top-3 before:w-px before:bg-border">
              {stages.map((s, i) => {
                const Icon = s.icon; const on = i === stageIdx; const ok = done.has(s.key); const st = tone(s.key);
                return (
                  <li key={s.key} className="relative">
                    <button onClick={() => goStage(i)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-xs transition-all ${on ? "bg-background font-semibold text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}>
                      <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ok ? "bg-records-green text-primary-foreground" : on ? `${st.solid} text-primary-foreground shadow-md` : `${st.soft} ${st.text}`}`}>
                        {ok ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                      </span>
                      <span className="leading-tight">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          <section className="flex min-h-[26rem] flex-col">
            {!stage ? (
              <>
                <div className="relative overflow-hidden bg-gradient-to-br from-records-blue via-records-teal to-records-cyan px-6 py-7 text-primary-foreground">
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-background/10" />
                  <div className="absolute -bottom-12 right-16 h-28 w-28 rounded-full bg-background/10" />
                  <Sparkles className="mb-3 h-7 w-7" />
                  <DialogHeader className="relative text-left">
                    <DialogTitle className="text-2xl font-bold text-primary-foreground">Welcome to your records workspace</DialogTitle>
                    <DialogDescription className="text-sm leading-relaxed text-primary-foreground/85">
                      A short guided walk through the work you can do here — tailored to your role and access.
                    </DialogDescription>
                  </DialogHeader>
                </div>
                <div className="flex-1 p-6">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What you'll learn</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {stages.map((s, i) => { const st = tone(s.key); const Icon = s.icon; return (
                      <button key={s.key} onClick={() => goStage(i)} className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-medium transition-all hover:-translate-y-0.5 hover:shadow-md ${st.border} ${st.soft}`}>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${st.solid} text-primary-foreground`}><Icon className="h-3.5 w-3.5" /></span>
                        <span className="leading-tight text-foreground">{s.title}</span>
                      </button>
                    ); })}
                  </div>
                  <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> About {Math.max(1, Math.round(totalSteps * 0.25))} min · skip any step or stage</p>
                </div>
              </>
            ) : (
              <>
                <div className={`flex items-center gap-3 px-6 py-5 ${t.soft}`}>
                  <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${t.solid} text-primary-foreground shadow-lg`}><stage.icon className="h-6 w-6" /></span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${t.text}`}>Stage {stageIdx + 1} of {stages.length}</p>
                    <p className="truncate text-base font-bold text-foreground">{stage.title}</p>
                  </div>
                  <span className={`rounded-full bg-background px-2.5 py-1 text-xs font-bold ${t.text} shadow-sm`}>{pct}%</span>
                </div>
                <div className="flex-1 px-6 py-5">
                  <div className="mb-4 flex gap-1.5">
                    {stage.steps.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stepIdx ? t.solid : "bg-muted"}`} />)}
                  </div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Step {stepIdx + 1} of {stage.steps.length}</p>
                  <DialogHeader className="text-left">
                    <DialogTitle className="text-xl font-bold">{step?.title}</DialogTitle>
                    <DialogDescription className="text-sm leading-relaxed text-foreground/80">{step?.body}</DialogDescription>
                  </DialogHeader>
                  <div className={`mt-5 flex items-start gap-2 rounded-xl border p-3 text-xs ${t.border} ${t.soft}`}>
                    <Lightbulb className={`mt-0.5 h-4 w-4 shrink-0 ${t.text}`} />
                    <span className="text-foreground/80">The page behind this tour has moved to <b>{stage.title}</b> so you can see where this happens.</span>
                  </div>
                </div>
                <div className="px-6"><Progress value={pct} className="h-1.5" /></div>
              </>
            )}

            <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
              {stage && <Button variant="ghost" size="sm" onClick={back} className="gap-1"><ChevronLeft className="h-4 w-4" /> Back</Button>}
              {stage && stageIdx < stages.length - 1 && (
                <Button variant="ghost" size="sm" onClick={skipStage} className="gap-1 text-muted-foreground"><SkipForward className="h-4 w-4" /> Skip stage</Button>
              )}
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="gap-1"><X className="h-4 w-4" /> {stage ? "Skip tour" : "Not now"}</Button>
              <Button size="sm" onClick={isLast ? () => setOpen(false) : next} className={`gap-1 border-0 ${t.solid} text-primary-foreground shadow-md hover:opacity-90`}>
                {!stage ? "Start tour" : isLast ? "Finish" : "Next"} {isLast ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>

            <div className="mx-6 mb-5 mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground" role="radiogroup" aria-label="When to show this tour">
              <span className="font-medium">On sign-in:</span>
              {([["every_sign_in", "Show this tour"], ["never", "Never show again"]] as const).map(([v, l]) => (
                <button key={v} role="radio" aria-checked={pref === v} onClick={() => savePref(v)}
                  className={`rounded-full border px-3 py-1 font-medium transition-colors ${pref === v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>{l}</button>
              ))}
              <span className="ml-auto hidden sm:inline">Reopen from Manage → Guided tour</span>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowTour;
