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
  steps: { title: string; body: string; permission?: string; view?: string }[];
}

export const STAGES: TourStage[] = [
  {
    key: "orientation", title: "Start safely", icon: Compass,
    show: () => true,
    steps: [
      { title: "Choose the right project and facility", body: "Check the selected project before working. Use only the facilities and programme components assigned to you; this tour includes only your available workflows." },
      { title: "Consent, privacy and urgent safety", body: "Explain why information is being collected and record consent in the relevant form. Collect only necessary details. Address urgent clinical or protection needs immediately — do not wait to finish registration or this tour. Keep safeguarding narratives out of ordinary service notes." },
    ],
  },
  {
    key: "setup", title: "Facilities & team setup", icon: Building2,
    show: ({ can, canConfigure }) => canConfigure || can("manage_facilities") || can("manage_team"),
    steps: [
      { title: "Prepare facilities and clinical teams", body: "Use Manage → Health facilities to maintain the facility registry. Administrators use Facility teams to assign clinicians and focal persons to their facilities before case review begins.", permission: "manage_facilities" },
      { title: "Assign project responsibilities", body: "In Manage → Project team, assign cadres, programme areas and individual permissions. Designate safeguarding officers through Manage → Safeguarding officers; that designation is separate from ordinary record access.", permission: "manage_team" },
      { title: "Configure forms and project medicines", body: "Use Manage → Configure module to review components, questions and workflow statuses. Register applicable medicines in Manage → mhGAP medicines before health workers select them in mental-health services.", permission: "configure_module" },
    ],
  },
  {
    key: "search", title: "CDDs & case search", icon: Search, view: "casesearch",
    show: ({ can }) => can("view_records") || can("manage_cdds") || can("confirm_cases"),
    steps: [
      { title: "Register CDDs under a facility", body: "In CDD case search, register each community drug distributor under the supervising facility and correct community, ward and LGA before recording potential cases.", permission: "manage_cdds" },
      { title: "Record and track potential cases", body: "Record suspected condition, symptoms, location and appropriate photographs. Review the case-search list for cases awaiting clinician review. A potential case is not yet a confirmed beneficiary.", permission: "manage_cdds" },
      { title: "Follow the case-search status", body: "Use the case-search list to distinguish pending review, confirmed, referred and registered cases. Do not register the same person again while their existing case is being reviewed." },
    ],
  },
  {
    key: "confirm", title: "Clinical confirmation", icon: Stethoscope, view: "casesearch",
    show: ({ can, canConfigure }) => canConfigure || can("confirm_cases"),
    steps: [
      { title: "Examine, stage and confirm", body: "Designated clinicians review symptoms and photographs, assess the person, record lesion stage where relevant, then confirm or rule out the suspected condition with supporting reasons. Decision tools support — not replace — clinical judgement." },
      { title: "Keep at the facility or refer", body: "For a confirmed case, use Keep & register here when the facility will provide care, or refer to the appropriate facility. Complete the receiving-facility decision rather than creating another unrelated registration." },
    ],
  },
  {
    key: "identity", title: "Registration & profile", icon: FileCheck2, view: "records",
    show: ({ can }) => can("view_records"),
    steps: [
      { title: "Find the person before registering", body: "Search Beneficiary records by name or Case ID, or scan an existing card first. Check suggested duplicates using name, age/date of birth and LGA before creating a new beneficiary." },
      { title: "Complete identity and geography", body: "Use Register beneficiary for a new person, or Edit Profile for an existing record. Check name, date of birth/age, gender, contact, facility, State, LGA, ward, community, photo and consent fields. Review the permanent Case ID generated by the system.", permission: "edit_records" },
      { title: "Complete health and next of kin", body: "Record blood group, known allergies, chronic conditions, regular medications, next of kin and their phone number. Existing beneficiaries can use Fill in missing details. Do not guess unknown medical information.", permission: "edit_records" },
      { title: "Read the record overview", body: "Check Overview for personal details, health information, location, latest assessments, data-quality warnings and component progress before adding care." },
    ],
  },
  {
    key: "card", title: "Digital Hand Card", icon: IdCard, view: "records",
    show: ({ can }) => can("view_records"),
    steps: [
      { title: "Review, download and print", body: "Open Hand Card from the beneficiary record. Verify the record-sourced photo, Case ID and health details before downloading or printing. Use the dedicated page when you need a larger view; share the card only with the beneficiary or authorised carers." },
      { title: "Return to the same record", body: "Use Scan Case ID to scan the QR code or barcode, granting camera permission when asked. Use the light only if the device supports it, or enter the Case ID manually. Opening a card does not bypass sign-in or record permissions." },
    ],
  },
  {
    key: "households", title: "Households, WASH & MDA", icon: Home, view: "households",
    show: ({ can }) => can("manage_households") || can("view_dashboards"),
    steps: [
      { title: "Link people, households and water points", body: "Review household membership, kinship and community water points. Check the family's NTD history and WASH context before recording household activity. Users with household permissions can maintain these links." },
      { title: "Document each MDA round", body: "Record the round, date and member-level treatments in Households & MDA or the beneficiary's MDA rounds tab. Distinguish eligibility, treatment and non-treatment reasons; check existing rounds before entering another one.", permission: "manage_households" },
    ],
  },
  {
    key: "services", title: "Component assessments & care", icon: ClipboardList, view: "records",
    show: ({ can }) => can("view_records") || can("record_services"),
    steps: [
      { title: "Review care before recording a service", body: "Open the appropriate component tab and review previous assessments, results and status. Work only in components available to you, and record assessment findings before treatment or support." },
      { title: "Record the service and next action", body: "Choose Record a service and the correct component. Complete service date, assessment, intervention, result/status and provider details, then set the next follow-up or referral. Save once and check the new entry in the component history.", permission: "record_services" },
    ],
  },
  {
    key: "lesions", title: "Lesion staging", icon: Stethoscope, view: "records",
    show: ({ can }) => can("view_records"),
    steps: [
      { title: "Document baseline and progression", body: "In Lesion staging, record the affected area, stage and consented photographs. Compare follow-up images with the baseline under similar conditions. On-device comparisons support assessment; a clinician confirms staging and changes." },
    ],
  },
  {
    key: "care", title: "Care network & medication", icon: Building2, view: "records",
    show: ({ can }) => can("view_records"),
    steps: [
      { title: "Coordinate the care network", body: "Open Care network to review linked facilities, referrals and pharmacy information. Confirm who is responsible for each next action and keep regular medication, allergy and chronic-condition details current." },
    ],
  },
  {
    key: "livelihood", title: "Livelihood & verification", icon: ClipboardList, view: "livelihood",
    show: ({ can }) => can("view_records") || can("view_dashboards"),
    steps: [
      { title: "Review vulnerability and support", body: "Use Livelihood & empowerment to review vulnerability assessments, eligibility and shortlists. Record support through the relevant component so it remains connected to the beneficiary's care history." },
      { title: "Assess and verify in the field", body: "Complete the livelihood assessment before shortlisting. Document ground-verification evidence and the decision before approving support.", permission: "assess_livelihood" },
      { title: "Record ground-verification findings", body: "Users with verification access document field findings against the assessment and update the verification decision; keep the evidence linked to the original beneficiary.", permission: "verify_livelihood" },
    ],
  },
  {
    key: "followups", title: "Follow-ups & referrals", icon: CalendarClock, view: "followups",
    show: ({ can }) => can("view_records"),
    steps: [
      { title: "Review upcoming and overdue visits", body: "Use Follow-ups & referrals to prioritise due and missed visits. Open the linked beneficiary to review the last service and contact information before arranging the next appointment." },
      { title: "Close the referral loop", body: "Track the referring and receiving facilities, referral reason and status. Update the outcome after the receiving service is completed, rather than treating a sent referral as completed care." },
      { title: "Accept incoming referrals", body: "If you have referral-acceptance access, review incoming referrals for your facility and record the receiving decision and subsequent care.", permission: "accept_referrals" },
    ],
  },
  {
    key: "risk", title: "CHEW visits & follow-up risk", icon: CalendarClock, view: "risk",
    show: ({ can }) => can("view_dashboards"),
    steps: [
      { title: "Prioritise follow-up risk", body: "Review Follow-up risk & CHEW visits to identify beneficiaries who may be lost to follow-up. Risk estimates guide prioritisation; verify the person's circumstances before taking action." },
      { title: "Dispatch a home visit", body: "Assign the visit to the responsible CHEW, with a clear reason and follow-up plan. Review outstanding assignments so visits are not dispatched twice.", permission: "dispatch_visits" },
      { title: "Document the visit and next action", body: "Open the home-visit report, record contact attempts, findings, support provided and the next appointment or referral. Update the assignment after the visit.", permission: "home_visits" },
    ],
  },
  {
    key: "vault", title: "Safeguarding vault", icon: ShieldCheck, view: "safeguarding",
    show: ({ can, isOfficer }) => isOfficer && can("view_safeguarding"),
    steps: [
      { title: "Set up your officer vault key", body: "Before entering confidential safeguarding narratives, open Safeguarding cases → Safeguarding vault → Set up my key. Choose and confirm a unique passphrase of at least 10 characters. Keep it safely: the system cannot reset it, and losing every officer's key makes sealed narratives unreadable." },
      { title: "Open the vault before saving sensitive details", body: "Choose Open vault and enter your passphrase. Confirm the vault shows Open before saving confidential narratives, actions, outcomes or case notes. These fields are sealed when saved with the vault open; saving while locked does not automatically seal a new concern." },
      { title: "Share only with authorised officers", body: "For a sealed case you can open, use Share with officers to grant access to other designated officers who have set up vault keys. Officer designation alone does not guarantee access to a previously sealed narrative. Never put your passphrase in notes or messages." },
    ],
  },
  {
    key: "safeguarding", title: "Safeguarding response", icon: ShieldCheck, view: "safeguarding",
    show: ({ can, isOfficer }) => isOfficer && can("view_safeguarding"),
    steps: [
      { title: "Act on safety concerns without delay", body: "Safeguarding can be needed at any point in the beneficiary journey — this stage is not a reason to delay urgent protection. Follow your organisation's safeguarding procedures, arrange immediate safety or emergency support where needed, and keep the response survivor-centred." },
      { title: "Log the concern in the protected area", body: "With the vault open, create a concern in Safeguarding cases. Link the beneficiary/facility when appropriate and fill concern date, categories, severity, immediate action, consent, factual narrative, action taken and referral details. Keep confidential narratives out of routine beneficiary notes." },
      { title: "Follow through and document outcomes", body: "Use Open & update and Case notes for dated follow-up, actions and outcomes. Update status as the response progresses; record the outcome before closure. Confirm sensitive records are sealed, then use Lock when finished or leaving the device." },
    ],
  },
  {
    key: "safeguarding_insight", title: "Safeguarding oversight", icon: ShieldCheck, view: "safeguarding_dashboard",
    show: ({ can, isOfficer }) => isOfficer && can("view_safeguarding"),
    steps: [
      { title: "Review the restricted caseload", body: "Use Safeguarding dashboard to review severity, actions, referrals and case outcomes within your access. Use it for timely follow-through without copying confidential narratives into general reports." },
    ],
  },
  {
    key: "outcomes", title: "Outcomes & record history", icon: FileCheck2, view: "records",
    show: ({ can }) => can("view_records"),
    steps: [
      { title: "Review outcomes across visits", body: "Open Outcomes to compare progress across recorded services. Review component progress and outstanding care before considering completion; administrators update beneficiary status through More actions when the evidence supports it." },
      { title: "Check the longitudinal history", body: "Use History to review services and referrals in sequence. Confirm dates, results and next actions tell a consistent story. Use Print / export record only when authorised and share identifiable information only for an appropriate care purpose." },
    ],
  },
  {
    key: "quality", title: "Data quality & duplicates", icon: Search, view: "brain",
    show: ({ can }) => can("view_records") || can("view_dashboards"),
    steps: [
      { title: "Review flags rather than treating them as diagnoses", body: "Use Record quality brain to review flagged records, confidence and learning progress. A flag is a request to verify the source data, not proof of an error. Check the beneficiary record before resolving a flag with a reason." },
      { title: "Merge only verified duplicates", body: "Administrators review potential duplicate pairs and the merge preview before merging. Confirm both records belong to the same person, preserve the correct permanent identity and review completeness afterward. Do not merge on a matching name alone.", permission: "configure_module" },
    ],
  },
  {
    key: "guide", title: "Field guide", icon: ClipboardList, view: "guide",
    show: ({ can }) => can("view_records") || can("view_dashboards"),
    steps: [
      { title: "Use the field guide before the next collection", body: "Review Field guide examples to improve identity, geography, dates and clinical data at entry. Correct verified mistakes at their source and use this guidance before the next registration or service visit." },
    ],
  },
  {
    key: "insight", title: "Dashboards & programme review", icon: BarChart3, view: "dashboard",
    show: ({ can }) => can("view_dashboards"),
    steps: [
      { title: "Review the General dashboard", body: "Check date ranges, KPI changes, service uptake and geographic distribution. Figures reflect the project and components within your access; review alerts against the underlying records before acting." },
      { title: "Follow the beneficiary journey", body: "Open Beneficiary journey to review progression, service reach and outcomes using the appropriate date range." , view: "journey" },
      { title: "Review facility performance", body: "Use Facility dashboard to compare caseloads and referral performance and follow up on outstanding care.", view: "facility" },
      { title: "Review community patterns", body: "Use Community clusters to investigate geographic concentrations. Interpret patterns alongside local context, not as a substitute for field verification.", view: "clusters" },
      { title: "Review household transmission links", body: "Use Transmission network to explore household, kinship and WASH connections and plan coordinated community follow-up.", view: "network" },
    ],
  },
  {
    key: "exchange", title: "Reporting & data exchange", icon: FileCheck2, view: "exchange",
    show: ({ can, canConfigure }) => canConfigure || can("view_dashboards"),
    steps: [
      { title: "Review reporting configuration", body: "In Data exchange, select the correct connected server, programme area, reporting period and mappings. Each server has its own configuration; confirm destinations before transferring any information." },
      { title: "Check totals before sending", body: "Authorised administrators use Check to review real aggregated totals, location matches and validation results before sending. Review transfer results afterward and investigate failures before retrying; only import or export information permitted for that destination." },
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
  visibleViews: string[];
  components: { key: string; label: string }[];
  onNavigate: (view: string) => void;
}

const WorkflowTour = ({ can, canConfigure, isOfficer, ready, visibleViews, components, onNavigate }: Props) => {
  const [uid, setUid] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [stageIdx, setStageIdx] = useState(-1); // -1 = welcome
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pref, setPref] = useState<TourPrefs>("every_sign_in");

  const stages = useMemo(() => STAGES
    .filter((s) => s.show({ can, canConfigure, isOfficer }) && (!s.view || visibleViews.includes(s.view)))
    .filter((s) => s.key !== "lesions" || components.some((c) => /mmdp|ntd|lesion|eye|mental|health/i.test(`${c.key} ${c.label}`)))
    .map((s) => ({ ...s, steps: [
      ...s.steps.filter((step) => (!step.permission || canConfigure || can(step.permission)) && (!step.view || visibleViews.includes(step.view))),
      ...(s.key === "services" ? components.map((c) => ({
        title: c.label,
        body: /mental|psycho|mhgap/i.test(`${c.key} ${c.label}`)
          ? "In this component, document the presenting problem and assessment, including GAD-7/PHQ-9 where relevant. Use mhGAP support to review risks, psychosocial care, registered project medicines and follow-up. Medicines require an authorised clinician's assessment; the tool does not replace clinical judgement."
          : /wash|water|sanitation/i.test(`${c.key} ${c.label}`)
            ? "Document water, sanitation and hygiene needs, assessment findings and support in this component. Link the household and water-point context where relevant, and record the result and next action."
            : /document/i.test(`${c.key} ${c.label}`)
              ? "Use this component for the document-related services configured by the project. Record the document type, action, result and outstanding requirements; do not copy safeguarding narratives here."
              : `In ${c.label}, complete the project's assessment questions, intervention, result and service status. Check earlier visits, record the next follow-up and confirm the saved entry before moving to another component.`,
      })) : []),
    ] }))
    .filter((s) => s.steps.length > 0), [can, canConfigure, isOfficer, visibleViews, components]);

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
  useEffect(() => {
    const destination = stage?.steps[stepIdx]?.view || stage?.view;
    if (open && destination && visibleViews.includes(destination)) onNavigate(destination);
  }, [open, stage?.key, stepIdx]);

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
      <DialogContent className="max-h-[90dvh] max-w-4xl gap-0 overflow-y-auto rounded-2xl border-0 p-0 shadow-2xl">
        <div className="grid md:grid-cols-[16rem_1fr]">
          <aside className="hidden bg-gradient-to-b from-records-blue/10 via-records-teal/5 to-records-purple/10 max-h-[85dvh] overflow-y-auto p-4 md:block">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-records-blue to-records-teal text-primary-foreground shadow-sm"><Compass className="h-4 w-4" /></span>
              <div><p className="text-xs font-bold text-foreground">Your workflow</p><p className="text-[10px] text-muted-foreground">{stages.length} stages · {totalSteps} steps</p></div>
            </div>
            <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[1.05rem] before:top-3 before:w-px before:bg-border">
              {stages.map((s, i) => {
                const Icon = s.icon; const on = i === stageIdx; const ok = done.has(s.key); const st = tone(s.key);
                return (
                  <li key={s.key} className="relative">
                    <Button variant="ghost" onClick={() => goStage(i)} aria-current={on ? "step" : undefined}
                      className={`flex h-auto min-h-11 w-full justify-start whitespace-normal items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-xs transition-all ${on ? "bg-background font-semibold text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"}`}>
                      <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ok ? "bg-records-green text-primary-foreground" : on ? `${st.solid} text-primary-foreground shadow-md` : `${st.soft} ${st.text}`}`}>
                        {ok ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                      </span>
                      <span className="leading-tight">{s.title}</span>
                    </Button>
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
                      Your complete care workflow, from first contact to follow-through — tailored to your project, components and permissions.
                    </DialogDescription>
                  </DialogHeader>
                </div>
                <div className="flex-1 p-6">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What you'll learn</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {stages.map((s, i) => { const st = tone(s.key); const Icon = s.icon; return (
                      <Button variant="ghost" key={s.key} onClick={() => goStage(i)} className={`flex h-auto min-h-[52px] justify-start whitespace-normal items-center gap-2 rounded-lg border p-2.5 text-left text-xs font-medium transition-all hover:-translate-y-0.5 hover:shadow-md ${st.border} ${st.soft}`}>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${st.solid} text-primary-foreground`}><Icon className="h-3.5 w-3.5" /></span>
                        <span className="leading-tight text-foreground">{s.title}</span>
                      </Button>
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
                    <p className="break-words text-base font-bold text-foreground">{stage.title}</p>
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
                    <span className="text-foreground/80">{stage.view ? <>Workspace: <b>{stage.steps[stepIdx]?.view || stage.view}</b>. Record-level instructions start by opening the beneficiary; the tour never saves or changes a record.</> : <>Follow the stages in sequence, or choose any stage. Address urgent safety needs at any time.</>}</span>
                  </div>
                </div>
                <div className="px-6"><Progress value={pct} className="h-1.5" /></div>
              </>
            )}

            <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
              {stage && <Button variant="ghost" size="sm" onClick={back} className="gap-1"><ChevronLeft className="h-4 w-4" /> Back</Button>}
              {stage && (
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
                <Button variant="ghost" size="sm" key={v} role="radio" aria-checked={pref === v} onClick={() => savePref(v)}
                  className={`rounded-full border px-3 py-1 font-medium transition-colors ${pref === v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>{l}</Button>
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
