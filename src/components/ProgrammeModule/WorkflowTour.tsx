import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Building2, Search, Stethoscope, FileCheck2, IdCard, Home, ClipboardList, CalendarClock, ShieldCheck, BarChart3,
  ChevronLeft, ChevronRight, SkipForward, X, Check, Compass,
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
      { title: "Monitor the programme", body: "The General dashboard, Beneficiary journey and Facility dashboard summarise outcomes, alerts and performance." },
    ],
  },
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <div className="grid md:grid-cols-[13rem_1fr]">
          <aside className="hidden border-r border-border bg-muted/40 p-4 md:block">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your workflow</p>
            <ol className="space-y-1">
              {stages.map((s, i) => {
                const Icon = s.icon; const on = i === stageIdx; const ok = done.has(s.key);
                return (
                  <li key={s.key}>
                    <button onClick={() => goStage(i)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${on ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${ok ? "border-primary bg-primary text-primary-foreground" : on ? "border-primary" : "border-border"}`}>
                        {ok ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <Icon className="h-3.5 w-3.5 shrink-0" /><span className="leading-tight">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          <section className="flex min-h-[22rem] flex-col p-6">
            {!stage ? (
              <>
                <DialogHeader className="text-left">
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><Compass className="h-5 w-5" /></span>
                  <DialogTitle className="text-xl">Welcome to your records workspace</DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed">
                    This short tour walks through the {stages.length} stages of work you have access to — from finding cases in the community to following up and keeping people safe. You can skip any step or stage.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-5 flex-1 space-y-1.5 md:hidden">
                  {stages.map((s, i) => <p key={s.key} className="text-sm text-muted-foreground">{i + 1}. {s.title}</p>)}
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><stage.icon className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stage {stageIdx + 1} of {stages.length} · {stage.title}</p>
                    <p className="text-xs text-muted-foreground">Step {stepIdx + 1} of {stage.steps.length}</p>
                  </div>
                </div>
                <DialogHeader className="text-left">
                  <DialogTitle className="text-lg">{step?.title}</DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed">{step?.body}</DialogDescription>
                </DialogHeader>
                <div className="flex-1" />
                <Progress value={(position / totalSteps) * 100} className="mt-6 h-1.5" />
              </>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {stage && <Button variant="ghost" size="sm" onClick={back} className="gap-1"><ChevronLeft className="h-4 w-4" /> Back</Button>}
              {stage && stageIdx < stages.length - 1 && (
                <Button variant="ghost" size="sm" onClick={skipStage} className="gap-1 text-muted-foreground"><SkipForward className="h-4 w-4" /> Skip this stage</Button>
              )}
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="gap-1"><X className="h-4 w-4" /> {stage ? "Skip tour" : "Not now"}</Button>
              <Button size="sm" onClick={isLast ? () => setOpen(false) : next} className="gap-1">
                {!stage ? "Start tour" : isLast ? "Finish" : "Next"} {!isLast && <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>

            <fieldset className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <legend className="sr-only">When to show this tour</legend>
              <span className="font-medium">On sign-in:</span>
              {([["every_sign_in", "Show this tour"], ["never", "Never show again"]] as const).map(([v, l]) => (
                <label key={v} className="flex cursor-pointer items-center gap-1.5">
                  <input type="radio" name="tour-pref" checked={pref === v} onChange={() => savePref(v)} className="accent-primary" /> {l}
                </label>
              ))}
              <span className="ml-auto">Reopen anytime from Manage → Guided tour</span>
            </fieldset>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowTour;
