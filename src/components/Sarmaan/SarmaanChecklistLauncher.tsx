import { useMemo, useRef, useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  BarChart3,
  Lightbulb,
  MapPin,
  ShieldCheck,
  BookOpen,
  Save,
  Send,
  Sparkles,
  Loader2,
  Crosshair,
  Users,
  ClipboardList,
  Compass,
  MessageCircle,
  CalendarDays,
  UserRound,
  ArrowRight,
  Route,
  X,
  ChevronDown,
} from "lucide-react";
import {
  NAVY,
  SECTION_HUES,
  MODULE_GUIDANCE,
  REMOVED_CHECKLIST_QUESTIONS,
  SUPERVISORY_CHAPTERS,
  chapterCodeFromLabel,
  chapterGuidance,
  type ModuleGuidance,
} from "./sarmaanBrand";
import type { Question, FormGroup } from "@/components/FormBuilder/types";
import { buildNameToIdMap, evaluateRelevant } from "@/lib/skipLogic";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useGeolocation } from "@/hooks/useGeolocation";
import MdaLocationCascade from "@/components/MdaChecklist/MdaLocationCascade";
import { toast } from "@/hooks/use-toast";

interface Props {
  formName: string;
  formId: string;
  userId: string;
  projectId: string;
  questions?: Question[];
  groups?: FormGroup[];
  requiresGps?: boolean;
  stateScope?: string[];
  /** When provided, restricts the visible modules to these section ids (per-module access). Null/undefined = all modules. */
  allowedSectionIds?: string[] | null;
  onOpenDashboard?: () => void;
  onClose: () => void;
  onSubmitted?: () => void;
}

// SARMAAN supervision is locked to State → LGA → Ward only (Ward optional).
// FLHF / Community / Settlement are intentionally excluded from this checklist.
const GEO_NAMES = new Set(["state", "lga", "ward"]);
const GEO_ORDER = ["state", "lga", "ward"];
const GUIDANCE = "guidance"; // sentinel for the guidance nav entry

/**
 * A merged, immersive chapter built from one or more raw form modules (A–M).
 * Carries the concatenated questions plus the narrative framing used to make
 * the supervision journey feel like one continuous human conversation.
 */
interface ChapterSection {
  id: string;
  label: string;
  subtitle: string;
  narrative: string;
  closing: string;
  /** Raw module group ids merged into this chapter (for access + submission). */
  memberIds: string[];
  guidance: ModuleGuidance[];
  questions: Question[];
}

/**
 * Shared supervision context carried across every module in a guided journey.
 * Captured once, reused on each independent form submission so the supervisor
 * never re-enters who they spoke with, the reporting period, or the round.
 */
interface SharedContext {
  respondentName: string;
  respondentRole: string;
  reportingMonth: string; // YYYY-MM
  round: string;
}

/**
 * Natural-language connectors used when handing a supervisor from one module to
 * the next — chosen to mimic how a person eases from one topic to another in a
 * real supervision conversation. Varied so consecutive prompts never feel robotic.
 */
const TRANSITION_OPENERS = [
  "Naturally,",
  "While we're still here,",
  "Following on from that,",
  "Building on what you just noted,",
  "That leads us nicely into",
  "With that fresh in mind,",
  "Now that the ground is set,",
  "Keeping the same visit going,",
  "It makes sense to now",
  "Before we wrap up,",
  "As the conversation flows,",
  "Rounding things out,",
];

/** Hexcolor helper — translucent tint. */
const tint = (hex: string, alpha: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Darken a hex color by a factor (0..1) for crisp outlines / centers.
const shade = (hex: string, factor: number) => {
  const h = hex.replace("#", "");
  const r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - factor));
  const g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - factor));
  const b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - factor));
  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * SARMAAN ACSM Integrated Supervisory Checklist — an interactive, section-by-
 * section data-collection surface. Every sidebar module is clickable and
 * renders its own questions inline (answerable right here), each on a unique
 * rose-flower backdrop. Geography is driven by a standalone State cascade and
 * GPS is captured on device; submissions save through the offline-capable store.
 */
export default function SarmaanChecklistLauncher({
  formName,
  formId,
  userId,
  projectId,
  questions = [],
  groups = [],
  requiresGps = true,
  stateScope,
  allowedSectionIds,
  onOpenDashboard,
  onClose,
  onSubmitted,
}: Props) {
  const { saveSubmission, isOnline } = useOfflineStorage();
  const geo = useGeolocation();

  // ---- Build the answerable section model from the form's groups ----
  //
  // The raw form ships 13 modules (A–M), but a real supervisor experiences the
  // visit as six connected chapters. We merge the closely-related modules into
  // an immersive narrative arc (Arrival → Rooms of Power → Community Encounter →
  // Proof → Reflection → Verdict). Each chapter concatenates the questions of
  // its member modules yet still submits independently, so the dashboard,
  // offline store and per-module access grants keep working unchanged.
  const sections = useMemo<ChapterSection[]>(() => {
    const src = groups.length > 0 ? groups : [{ id: "all", name: "all", label: formName, questions } as FormGroup];
    const raw = src.map((g) => ({
      id: g.id,
      label: g.label || g.name,
      code: chapterCodeFromLabel(g.label || g.name),
      questions: (g.questions || []).filter(
        (q) => q.type !== "calculate" && q.type !== "note" && !REMOVED_CHECKLIST_QUESTIONS.has(q.name || ""),
      ),
    }));

    // Per-module access: when an allow-list is supplied, only expose granted raw
    // modules. A chapter later becomes visible if any of its members are granted.
    const singleAll = raw.length === 1 && raw[0].id === "all";
    let accessible = raw;
    if (allowedSectionIds && !singleAll) {
      const allow = new Set(allowedSectionIds);
      accessible = raw.filter((s) => allow.has(s.id));
    }

    // A form without recognizable A–M codes (e.g. a custom copy) can't be
    // merged safely — present its groups as-is so nothing is ever lost.
    const anyCoded = accessible.some((s) => s.code);
    if (singleAll || !anyCoded) {
      return accessible.map((s) => ({
        id: s.id,
        label: s.label,
        subtitle: "",
        narrative: "",
        closing: "",
        memberIds: [s.id],
        guidance: [],
        questions: s.questions,
      }));
    }

    const used = new Set<string>();
    const chapters: ChapterSection[] = [];
    for (const ch of SUPERVISORY_CHAPTERS) {
      const members = accessible.filter((s) => s.code && ch.members.includes(s.code));
      if (members.length === 0) continue;
      members.forEach((m) => used.add(m.id));
      chapters.push({
        id: ch.id,
        label: ch.title,
        subtitle: ch.subtitle,
        narrative: ch.narrative,
        closing: ch.closing,
        memberIds: members.map((m) => m.id),
        guidance: chapterGuidance(ch),
        questions: members.flatMap((m) => m.questions),
      });
    }
    // Append any leftover groups that didn't map to a chapter so they remain fillable.
    for (const s of accessible) {
      if (used.has(s.id)) continue;
      chapters.push({
        id: s.id,
        label: s.label,
        subtitle: "",
        narrative: "",
        closing: "",
        memberIds: [s.id],
        guidance: [],
        questions: s.questions,
      });
    }
    return chapters;
  }, [groups, questions, formName, allowedSectionIds]);

  const allQuestions = useMemo(
    () => sections.flatMap((s) => s.questions),
    [sections],
  );
  const nameToId = useMemo(() => buildNameToIdMap(allQuestions), [allQuestions]);
  const mdaNameToId = useMemo(() => {
    const m: Record<string, string> = {};
    allQuestions.forEach((q) => { if (q.name) m[q.name] = q.id; });
    return m;
  }, [allQuestions]);

  const [responses, setResponses] = useState<Record<string, any>>({});
  const MENU = "menu" as const;
  const [active, setActive] = useState<number | typeof GUIDANCE | typeof MENU>(MENU);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---- Shared context carried across every module (captured once) ----
  const [shared, setShared] = useState<SharedContext>(() => {
    try {
      const raw = sessionStorage.getItem(`sarmaan_shared_${formId}`);
      if (raw) return JSON.parse(raw) as SharedContext;
    } catch { /* ignore */ }
    const d = new Date();
    return {
      respondentName: "",
      respondentRole: "",
      reportingMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      round: "",
    };
  });
  useEffect(() => {
    try { sessionStorage.setItem(`sarmaan_shared_${formId}`, JSON.stringify(shared)); } catch { /* ignore */ }
  }, [shared, formId]);
  const [contextOpen, setContextOpen] = useState(false);

  // ---- Guided journey (conversational chaining across modules) ----
  const [journeyMode, setJourneyMode] = useState(false);
  const [handoff, setHandoff] = useState<{ fromIdx: number } | null>(null);

  // GPS captured timestamp (shared context reused across every module).
  const [gpsCapturedAt, setGpsCapturedAt] = useState<string | null>(null);

  const setValue = (id: string, value: any) =>
    setResponses((r) => ({ ...r, [id]: value }));

  // GPS question (geopoint) — capture the device fix into responses.
  const gpsQuestion = allQuestions.find((q) => q.type === "geopoint");
  useEffect(() => {
    if (geo.position) {
      setGpsCapturedAt((prev) => prev ?? new Date().toISOString());
      if (gpsQuestion) {
        setResponses((r) => ({
          ...r,
          [gpsQuestion.id]: `${geo.position!.lat},${geo.position!.lng}`,
        }));
      }
    }
  }, [geo.position, gpsQuestion]);

  // Geography summary derived from the shared responses (carried across modules).
  const geoSummary = useMemo(() => {
    const parts: string[] = [];
    for (const name of GEO_ORDER) {
      const id = mdaNameToId[name];
      const v = id ? responses[id] : undefined;
      if (v) parts.push(String(v));
    }
    return parts;
  }, [responses, mdaNameToId]);
  const hasContext = geoSummary.length > 0 || !!geo.position || !!shared.respondentName;

  const isGeoSection = (i: number) =>
    sections[i]?.questions.some((q) => GEO_NAMES.has(q.name || ""));

  const visibleQuestions = (i: number) =>
    (sections[i]?.questions || []).filter((q) =>
      evaluateRelevant(q.relevant, responses, nameToId),
    );

  const answeredCount = useMemo(() => {
    let done = 0, total = 0;
    allQuestions.forEach((q) => {
      if (!evaluateRelevant(q.relevant, responses, nameToId)) return;
      if (!q.required) return;
      total++;
      const v = responses[q.id];
      if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) done++;
    });
    return { done, total };
  }, [allQuestions, responses, nameToId]);

  const progress = typeof active === "number"
    ? Math.round((visibleQuestions(active).filter((q) => {
        const v = responses[q.id];
        return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
      }).length / Math.max(visibleQuestions(active).length, 1)) * 100)
    : 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [active]);

  // ---- Per-section submission (each section is an independent form) ----
  const missingInSection = (idx: number) =>
    visibleQuestions(idx).filter((q) => {
      if (!q.required) return false;
      const v = responses[q.id];
      return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    });

  const handleSubmit = async (idx: number) => {
    const section = sections[idx];
    if (!section) return;
    const missing = missingInSection(idx);
    if (missing.length > 0) {
      toast({
        title: "Complete required questions",
        description: `${missing.length} required question(s) still need an answer in this form.`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const location = geo.position ? { lat: geo.position.lat, lng: geo.position.lng } : null;
      // Build a self-contained payload: this section's answers + shared geography/GPS context.
      const geoIds = new Set(
        allQuestions.filter((q) => GEO_NAMES.has(q.name || "") || q.type === "geopoint").map((q) => q.id),
      );
      const sectionIds = new Set(section.questions.map((q) => q.id));
      const payload: Record<string, any> = {};
      Object.entries(responses).forEach(([k, v]) => {
        if (sectionIds.has(k) || geoIds.has(k)) payload[k] = v;
      });
      payload.__section_id = section.id;
      payload.__section_label = section.label;
      payload.__member_section_ids = section.memberIds;
      payload.__section_index = idx + 1;
      // Shared supervision context — carried forward across every module so the
      // dashboard can stitch a complete picture of one supervision visit.
      payload.__respondent_name = shared.respondentName || null;
      payload.__respondent_role = shared.respondentRole || null;
      payload.__reporting_month = shared.reportingMonth || null;
      payload.__round = shared.round || null;
      payload.__project_id = projectId || null;
      payload.__captured_at = gpsCapturedAt || new Date().toISOString();
      payload.__submitted_at = new Date().toISOString();
      const result = await saveSubmission(formId, userId, payload, location, null, "regular");
      if (result.success) {
        toast({
          title: result.offline ? "Saved offline" : `“${section.label}” submitted`,
          description: result.offline
            ? "Your form is stored on device and will sync when you're online."
            : "This supervision form has been recorded to the dashboard.",
        });
        onSubmitted?.();
        if (journeyMode) {
          setHandoff({ fromIdx: idx });
          setActive(MENU);
        } else {
          setActive(MENU);
        }
      } else {
        toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Submission failed", description: "An error occurred. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Journey completion helpers ----
  const isSectionComplete = (i: number) => {
    const vq = visibleQuestions(i).filter((q) => !GEO_NAMES.has(q.name || "") && q.type !== "geopoint");
    if (vq.length === 0) return false;
    return vq.every((q) => {
      if (!q.required) {
        const v = responses[q.id];
        return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
      }
      const v = responses[q.id];
      return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
    });
  };
  const firstIncompleteIdx = () => {
    for (let i = 0; i < sections.length; i++) if (!isSectionComplete(i)) return i;
    return sections.length ? 0 : -1;
  };
  const nextIncompleteAfter = (from: number) => {
    for (let i = from + 1; i < sections.length; i++) if (!isSectionComplete(i)) return i;
    for (let i = 0; i < from; i++) if (!isSectionComplete(i)) return i;
    return -1;
  };
  const startJourney = () => {
    setJourneyMode(true);
    setHandoff(null);
    const idx = firstIncompleteIdx();
    if (idx >= 0) setActive(idx);
  };
  const completedCount = useMemo(
    () => sections.reduce((n, _s, i) => n + (isSectionComplete(i) ? 1 : 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, responses, nameToId],
  );

  const currentIdx = typeof active === "number" ? active : -1;
  const hue = currentIdx >= 0 ? SECTION_HUES[currentIdx % SECTION_HUES.length] : NAVY.teal;
  const currentSection = currentIdx >= 0 ? sections[currentIdx] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex overflow-hidden"
      style={{ background: NAVY.canvas, fontFamily: NAVY.bodyFont, color: NAVY.ink }}
    >
      {/* ---------- Left navy sidebar ---------- */}
      <aside
        className="hidden w-[300px] shrink-0 flex-col md:flex"
        style={{ background: `linear-gradient(180deg, ${NAVY.sidebar} 0%, ${NAVY.sidebarDeep} 100%)`, color: NAVY.sidebarText }}
      >
        <div className="flex items-start gap-3 px-5 pb-4 pt-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: NAVY.teal }}>
            <ClipboardCheck className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-extrabold leading-tight" style={{ fontFamily: NAVY.headingFont }}>
              SARMAAN ACSM Integrated Supervisory Checklist
            </h1>
            <p className="mt-0.5 text-[11px]" style={{ color: NAVY.sidebarSub }}>
              for Programme Implementation Learning
            </p>
          </div>
        </div>

        <div className="px-5 pb-2 pt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: NAVY.sidebarSub }}>
          Checklist Modules
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {/* All forms menu — return to the form picker */}
          <button
            onClick={() => setActive(MENU)}
            className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
            style={{ background: active === MENU ? NAVY.sidebarActive : "rgba(18,181,165,0.10)", border: `1px solid ${active === MENU ? NAVY.teal : "rgba(18,181,165,0.35)"}` }}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: NAVY.teal }}>
              <ClipboardList className="h-4 w-4 text-white" />
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">All supervision forms</span>
          </button>
          {/* Guided journey — chain modules with shared context + conversational hand-offs */}
          {sections.length > 1 && (
            <button
              onClick={startJourney}
              className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
              style={{ background: journeyMode ? NAVY.sidebarActive : "rgba(99,102,241,0.12)", border: `1px solid ${journeyMode ? NAVY.teal : "rgba(129,140,248,0.4)"}` }}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "#6366F1" }}>
                <Route className="h-4 w-4 text-white" />
              </span>
              <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">
                Guided supervision journey
                <span className="mt-0.5 block text-[10.5px] font-medium" style={{ color: NAVY.sidebarSub }}>
                  {completedCount}/{sections.length} forms complete
                </span>
              </span>
            </button>
          )}
          {/* Guidance entry */}
          <button
            onClick={() => setActive(GUIDANCE)}
            className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
            style={{ background: active === GUIDANCE ? NAVY.sidebarActive : "rgba(244,177,43,0.10)", border: `1px solid ${active === GUIDANCE ? NAVY.teal : "rgba(244,177,43,0.35)"}` }}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: NAVY.gold }}>
              <BookOpen className="h-4 w-4 text-white" />
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">Checklist Guidance &amp; Resources</span>
          </button>

          {sections.map((s, i) => {
            const isActive = active === i;
            const secHue = SECTION_HUES[i % SECTION_HUES.length];
            const done = visibleQuestions(i).every((q) => {
              if (!q.required) return true;
              const v = responses[q.id];
              return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
            }) && visibleQuestions(i).length > 0;
            return (
              <button
                key={s.id}
                onClick={() => setActive(i)}
                className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
                style={{ background: isActive ? NAVY.sidebarActive : "transparent" }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                  style={{ background: isActive ? secHue : "rgba(255,255,255,0.08)", color: isActive ? "#fff" : NAVY.sidebarSub }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">{s.label}</span>
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: NAVY.teal }} />
                ) : (
                  <Circle className="h-4 w-4 shrink-0" style={{ color: NAVY.sidebarSub, opacity: 0.5 }} />
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t px-5 py-4 text-[11px]" style={{ borderColor: NAVY.sidebarLine, color: NAVY.sidebarSub }}>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: NAVY.teal }} />
            {isOnline ? "Auto-saved · ready to submit" : "Offline · answers stored on device"}
          </div>
          {onOpenDashboard && (
            <button
              onClick={onOpenDashboard}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[12px] font-semibold text-white transition hover:bg-white/5"
              style={{ borderColor: NAVY.sidebarLine }}
            >
              <BarChart3 className="h-4 w-4" /> Learning Dashboard
            </button>
          )}
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="flex items-center gap-4 border-b px-5 py-3" style={{ borderColor: NAVY.line, background: NAVY.panel }}>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold transition hover:bg-black/5"
            style={{ color: NAVY.inkSoft }}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-xs font-semibold" style={{ color: NAVY.inkSoft }}>
              {active === GUIDANCE ? "Guidance" : active === MENU ? "Supervision forms" : `Form ${currentIdx + 1} of ${sections.length}`}
            </span>
            {currentSection && <span className="text-sm font-bold" style={{ color: NAVY.ink }}>· {currentSection.label}</span>}
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-[11px] font-semibold" style={{ color: NAVY.inkSoft }}>Required</span>
              <span className="text-[12px] font-bold" style={{ color: answeredCount.done >= answeredCount.total ? NAVY.good : NAVY.warn }}>
                {answeredCount.done}/{answeredCount.total}
              </span>
            </div>
            <ProgressRing pct={progress} color={hue} />
          </div>
        </header>

        {/* shared supervision context — carried across every module */}
        {active !== GUIDANCE && (
          <SharedContextBar
            shared={shared}
            setShared={setShared}
            open={contextOpen}
            setOpen={setContextOpen}
            geoSummary={geoSummary}
            gps={geo.position ? { lat: geo.position.lat, lng: geo.position.lng } : null}
            gpsCapturedAt={gpsCapturedAt}
            hasContext={hasContext}
          />
        )}

        {/* body */}
        <div ref={scrollRef} className="relative flex min-h-0 flex-1 overflow-y-auto">
          {active === GUIDANCE ? (
            <GuidancePanel onStart={() => setActive(MENU)} />
          ) : active === MENU ? (
            <div className="min-w-0 flex-1">
              {handoff && (
                <HandoffCard
                  sections={sections}
                  fromIdx={handoff.fromIdx}
                  nextIdx={nextIncompleteAfter(handoff.fromIdx)}
                  completedCount={completedCount}
                  onContinue={(i) => { setHandoff(null); setActive(i); }}
                  onChooseAnother={() => setHandoff(null)}
                  onFinish={() => { setHandoff(null); setJourneyMode(false); }}
                />
              )}
              <FormMenu
                sections={sections}
                responses={responses}
                visibleQuestions={visibleQuestions}
                onOpenGuidance={() => setActive(GUIDANCE)}
                onPick={(i) => setActive(i)}
                onStartJourney={sections.length > 1 ? startJourney : undefined}
                completedCount={completedCount}
              />
            </div>
          ) : currentSection ? (
            <main className="relative min-w-0 flex-1 p-5 lg:p-6">
              <RoseBackground hue={hue} />
              <div className="relative">
                {journeyMode && (
                  <JourneyRail
                    sections={sections}
                    currentIdx={currentIdx}
                    isSectionComplete={isSectionComplete}
                    onJump={(i) => setActive(i)}
                  />
                )}
                <button
                  onClick={() => setActive(MENU)}
                  className="mb-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold transition hover:bg-black/5"
                  style={{ color: hue }}
                >
                  <ChevronLeft className="h-4 w-4" /> {journeyMode ? "Pause journey · all forms" : "All supervision forms"}
                </button>
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold text-white shadow"
                    style={{ background: hue, fontFamily: NAVY.headingFont }}
                  >
                    {currentIdx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: hue }}>
                      Chapter {currentIdx + 1} of {sections.length}
                    </p>
                    <h2 className="text-2xl font-extrabold leading-tight" style={{ fontFamily: NAVY.headingFont }}>
                      {currentSection.label}
                    </h2>
                  </div>
                </div>
                {currentSection.subtitle && (
                  <p className="mb-1 text-[13.5px] font-semibold" style={{ color: NAVY.inkSoft }}>
                    {currentSection.subtitle}
                  </p>
                )}


                {/* chapter narrative + guidance pulled from merged modules */}
                <ModuleHint section={currentSection} hue={hue} />


                {/* GPS strip — every form is self-contained */}
                {requiresGps && (
                  <GpsStrip
                    hue={hue}
                    position={geo.position}
                    loading={geo.isLoading}
                    onCapture={() => geo.getCurrentPosition()}
                  />
                )}

                {/* Location cascade — captured on every independent form for context */}
                {projectId && (
                  <div className="mb-5 rounded-2xl border bg-white/70 p-5 backdrop-blur" style={{ borderColor: tint(hue, 0.35) }}>
                    <div className="mb-4 flex items-center gap-2 text-base font-bold sm:text-lg" style={{ color: hue }}>
                      <Compass className="h-5 w-5" /> Supervision location
                    </div>
                    <MdaLocationCascade
                      projectId={projectId}
                      responses={responses}
                      nameToId={mdaNameToId}
                      onSet={(updates) => setResponses((r) => ({ ...r, ...updates }))}
                      stateScope={stateScope}
                      disableMicroplan
                      visibleLevels={["state", "lga", "ward"]}
                      optionalLevels={["ward"]}
                      big
                    />
                  </div>
                )}

                {/* Questions */}
                <div className="space-y-4">
                  {visibleQuestions(currentIdx)
                    .filter((q) => !GEO_NAMES.has(q.name || ""))
                    .filter((q) => q.type !== "geopoint")
                    .map((q) => (
                      <QuestionField
                        key={q.id}
                        q={q}
                        hue={hue}
                        value={responses[q.id]}
                        onChange={(v) => setValue(q.id, v)}
                      />
                    ))}
                  {visibleQuestions(currentIdx).filter((q) => !GEO_NAMES.has(q.name || "") && q.type !== "geopoint").length === 0 && (
                    <div className="rounded-2xl border bg-white/70 p-6 text-center text-sm" style={{ borderColor: tint(hue, 0.3), color: NAVY.inkSoft }}>
                      Fill the supervision location above, then submit this form.
                    </div>
                  )}
                </div>
              </div>
            </main>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm" style={{ color: NAVY.inkSoft }}>
              This checklist has no sections yet.
            </div>
          )}
        </div>

        {/* bottom action bar — only when filling an individual form */}
        {typeof active === "number" && currentSection && (
          <footer
            className="flex items-center gap-2 border-t px-4 py-3"
            style={{ borderColor: NAVY.line, background: NAVY.panel, paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={() => setActive(MENU)}
              className="inline-flex items-center gap-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-black/5"
              style={{ borderColor: NAVY.line, color: NAVY.inkSoft }}
            >
              <ChevronLeft className="h-4 w-4" /> Cancel
            </button>
            <button
              onClick={() => handleSubmit(currentIdx)}
              disabled={submitting}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
              style={{ background: hue }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit “{currentSection.label}”
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Form picker — each section is an independent, separately-submittable */
/* supervision form.                                                    */
/* ------------------------------------------------------------------ */
function FormMenu({
  sections,
  responses,
  visibleQuestions,
  onOpenGuidance,
  onPick,
  onStartJourney,
  completedCount = 0,
}: {
  sections: ChapterSection[];
  responses: Record<string, any>;
  visibleQuestions: (idx: number) => Question[];
  onOpenGuidance: () => void;
  onPick: (idx: number) => void;
  onStartJourney?: () => void;
  completedCount?: number;
}) {
  return (
    <main className="min-w-0 flex-1 p-5 lg:p-7" style={{ background: NAVY.canvas }}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold" style={{ fontFamily: NAVY.headingFont }}>
            Choose a supervision chapter
          </h2>
          <p className="mt-0.5 text-[13px]" style={{ color: NAVY.inkSoft }}>
            The visit is told in six connected chapters — open the one you're supervising now; each submits on its own.
          </p>
        </div>
        <button
          onClick={onOpenGuidance}
          className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:bg-black/5"
          style={{ borderColor: tint(NAVY.gold, 0.5), color: NAVY.ink, background: tint(NAVY.gold, 0.12) }}
        >
          <BookOpen className="h-4 w-4" style={{ color: NAVY.gold }} /> Guidance &amp; Resources
        </button>
      </div>

      {onStartJourney && sections.length > 1 && (
        <button
          onClick={onStartJourney}
          className="mt-4 flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          style={{ borderColor: "rgba(129,140,248,0.5)", background: "linear-gradient(100deg, rgba(99,102,241,0.14), rgba(56,189,248,0.10))" }}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow" style={{ background: "#6366F1" }}>
            <Route className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold" style={{ fontFamily: NAVY.headingFont, color: NAVY.ink }}>
              Start a guided supervision journey
            </span>
            <span className="mt-0.5 block text-[12.5px]" style={{ color: NAVY.inkSoft }}>
              Walk the modules in a natural order — your location, GPS &amp; respondent carry over, with a friendly nudge to the next form after each submission. {completedCount}/{sections.length} done.
            </span>
          </span>
          <ArrowRight className="hidden h-5 w-5 shrink-0 sm:block" style={{ color: "#6366F1" }} />
        </button>
      )}

      {sections.length === 0 && (
        <div className="mt-6 rounded-2xl border p-8 text-center" style={{ borderColor: NAVY.line, background: NAVY.panel }}>
          <p className="text-sm font-semibold" style={{ color: NAVY.ink }}>No modules assigned to you yet</p>
          <p className="mt-1 text-[13px]" style={{ color: NAVY.inkSoft }}>
            Ask an Owner or Admin to grant you access to one or more checklist modules.
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">

        {sections.map((s, i) => {
          const h = SECTION_HUES[i % SECTION_HUES.length];
          const total = visibleQuestions(i).filter((q) => q.type !== "geopoint" && !GEO_NAMES.has(q.name || "")).length;
          const done = visibleQuestions(i).filter((q) => {
            if (q.type === "geopoint" || GEO_NAMES.has(q.name || "")) return false;
            const v = responses[q.id];
            return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
          }).length;
          const started = done > 0;
          return (
            <button
              key={s.id}
              onClick={() => onPick(i)}
              className="group relative overflow-hidden rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              style={{ borderColor: tint(h, 0.5), background: NAVY.panel }}
            >
              <div
                className="absolute inset-x-0 top-0 h-1.5"
                style={{ background: `linear-gradient(90deg, ${h}, ${shade(h, 0.25)})` }}
              />
              <div className="pointer-events-none absolute right-0 top-0 opacity-90">
                <MiniRose hue={h} />
              </div>
              <div className="relative">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-[15px] font-extrabold text-white shadow"
                  style={{ background: h, fontFamily: NAVY.headingFont }}
                >
                  {i + 1}
                </span>
                <h3 className="mt-3 text-[15px] font-extrabold leading-snug" style={{ fontFamily: NAVY.headingFont, color: NAVY.ink }}>
                  {s.label}
                </h3>
                {s.subtitle && (
                  <p className="mt-1 text-[12px] leading-snug" style={{ color: NAVY.inkSoft }}>
                    {s.subtitle}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{
                      background: started ? tint(h, 0.16) : NAVY.panel2,
                      color: started ? shade(h, 0.2) : NAVY.inkSoft,
                    }}
                  >
                    {started ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
                    {done}/{total} answered
                  </span>
                </div>
                <div className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold" style={{ color: h }}>
                  {started ? "Continue chapter" : "Open chapter"} <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}

function MiniRose({ hue }: { hue: string }) {
  const stroke = shade(hue, 0.45);
  return (
    <svg width="92" height="92" viewBox="-46 -46 92 92" aria-hidden="true" opacity={0.35}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <ellipse key={a} rx={26} ry={13} fill={hue} stroke={stroke} strokeWidth={2} transform={`rotate(${a}) translate(0 -20)`} />
      ))}
      <circle r={11} fill={shade(hue, 0.15)} stroke={stroke} strokeWidth={2} />
      <circle r={5} fill={NAVY.gold} />
    </svg>
  );
}




/* ------------------------------------------------------------------ */
/* Guidance panel                                                      */
/* ------------------------------------------------------------------ */
function GuidancePanel({ onStart }: { onStart: () => void }) {
  return (
    <main className="min-w-0 flex-1 p-5 lg:p-7">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow" style={{ background: NAVY.gold }}>
          <BookOpen className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-2xl font-extrabold" style={{ fontFamily: NAVY.headingFont }}>Checklist Guidance &amp; Resources</h2>
          <p className="text-sm" style={{ color: NAVY.inkSoft }}>Detailed instructions for every module before you begin supervision.</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border p-5" style={{ borderColor: NAVY.line, background: NAVY.primarySoft }}>
        <div className="flex items-center gap-2 text-sm font-bold" style={{ color: NAVY.primary }}>
          <Sparkles className="h-4 w-4" /> How to use this checklist
        </div>
        <ul className="mt-2 space-y-1.5 text-[13px]" style={{ color: NAVY.ink }}>
          <li>• Click any module on the left to answer its questions right here — the checklist adapts and hides questions that don't apply.</li>
          <li>• Capture GPS on site and pick State → LGA → Ward (Ward optional) from the location cascade.</li>
          <li>• Score quality items honestly against evidence: 2 = Yes, 1 = Partly, 0 = No.</li>
          <li>• Complete all required questions, then submit — offline submissions sync automatically once you're back online.</li>
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {MODULE_GUIDANCE.map((m, i) => {
          const h = SECTION_HUES[i % SECTION_HUES.length];
          return (
            <div key={m.code} className="relative overflow-hidden rounded-2xl border p-4" style={{ borderColor: tint(h, 0.4), background: NAVY.panel }}>
              <div className="absolute right-0 top-0 h-20 w-20 -translate-y-6 translate-x-6 rounded-full" style={{ background: tint(h, 0.12) }} />
              <div className="relative">
                <div className="mb-1 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-extrabold text-white" style={{ background: h }}>
                    {i + 1}
                  </span>
                  <h3 className="text-[14px] font-bold" style={{ fontFamily: NAVY.headingFont }}>{m.title}</h3>
                </div>
                <p className="mb-3 text-[12.5px] leading-snug" style={{ color: NAVY.inkSoft }}>{m.purpose}</p>
                <GuideRow icon={<Users className="h-3.5 w-3.5" style={{ color: h }} />} label="Who to ask" text={m.whoToAsk} />
                <GuideRow icon={<ClipboardList className="h-3.5 w-3.5" style={{ color: h }} />} label="What to check" text={m.whatToCheck} />
                <GuideRow icon={<ClipboardCheck className="h-3.5 w-3.5" style={{ color: h }} />} label="How to collect" text={m.howToCollect} />
                {m.scoring && <GuideRow icon={<Sparkles className="h-3.5 w-3.5" style={{ color: h }} />} label="Scoring" text={m.scoring} />}
                {m.tips.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded-lg p-2.5 text-[11.5px]" style={{ background: tint(h, 0.08), color: NAVY.ink }}>
                    {m.tips.map((t, k) => <li key={k}>💡 {t}</li>)}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onStart}
        className="mt-6 inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-lg transition active:scale-[0.99]"
        style={{ background: `linear-gradient(90deg, ${NAVY.teal}, ${NAVY.tealDeep})` }}
      >
        Start the checklist <ChevronRight className="h-4 w-4" />
      </button>
    </main>
  );
}

function GuideRow({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div className="mb-1.5 flex gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="text-[12px] leading-snug">
        <span className="font-bold">{label}: </span>
        <span style={{ color: NAVY.inkSoft }}>{text}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section decor + hints                                               */
/* ------------------------------------------------------------------ */
function RoseBackground({ hue }: { hue: string }) {
  // Bold, high-contrast rose-flower motif tinted to the section hue.
  // Uses saturated fills + dark outlines so the pattern is clearly visible,
  // including for low-vision users.
  const stroke = shade(hue, 0.45);
  const rose = (cx: number, cy: number, r: number, opacity: number) => (
    <g transform={`translate(${cx} ${cy})`} opacity={opacity}>
      {/* outer petals */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <ellipse
          key={`o${a}`}
          rx={r}
          ry={r * 0.5}
          fill={hue}
          stroke={stroke}
          strokeWidth={2}
          transform={`rotate(${a}) translate(0 ${-r * 0.75})`}
        />
      ))}
      {/* inner petals */}
      {[22, 67, 112, 157, 202, 247, 292, 337].map((a) => (
        <ellipse
          key={`i${a}`}
          rx={r * 0.6}
          ry={r * 0.32}
          fill={tint(hue, 0.35)}
          stroke={stroke}
          strokeWidth={1.5}
          transform={`rotate(${a}) translate(0 ${-r * 0.45})`}
        />
      ))}
      <circle r={r * 0.42} fill={shade(hue, 0.15)} stroke={stroke} strokeWidth={2} />
      <circle r={r * 0.18} fill={NAVY.gold} />
    </g>
  );
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 420 560"
    >
      {rose(60, 80, 52, 0.3)}
      {rose(340, 60, 40, 0.26)}
      {rose(100, 380, 44, 0.26)}
      {rose(300, 320, 58, 0.24)}
      {rose(200, 200, 30, 0.22)}
      {rose(380, 500, 46, 0.26)}
      {rose(30, 260, 26, 0.22)}
    </svg>
  );
}

function ModuleHint({ section, hue }: { section: ChapterSection; hue: string }) {
  const guides = section.guidance;
  const hasNarrative = !!section.narrative;
  if (!hasNarrative && guides.length === 0) return null;
  return (
    <div className="mb-6 mt-2 space-y-4">
      {/* Conversational chapter opening — sets the human scene before the questions. */}
      {hasNarrative && (
        <div
          className="relative overflow-hidden rounded-2xl border p-5"
          style={{ borderColor: tint(hue, 0.4), background: tint(hue, 0.08) }}
        >
          <div className="mb-2 flex items-center gap-2">
            <MessageCircle className="h-5 w-5" style={{ color: hue }} />
            <span className="text-[13px] font-extrabold uppercase tracking-wide" style={{ color: hue }}>
              Setting the scene
            </span>
          </div>
          <p className="text-[16px] font-medium leading-relaxed" style={{ color: NAVY.ink }}>
            {section.narrative}
          </p>
        </div>
      )}

      {/* Combined supervisor guidance for every module folded into this chapter. */}
      {guides.length > 0 && (
        <div className="rounded-2xl border bg-white/75 backdrop-blur" style={{ borderColor: tint(hue, 0.4) }}>
          <div className="flex items-center gap-2 border-b px-5 py-3.5" style={{ borderColor: tint(hue, 0.25) }}>
            <Lightbulb className="h-5 w-5" style={{ color: hue }} />
            <span className="text-base font-bold sm:text-lg" style={{ color: hue }}>
              Supervisor guidance{guides.length > 1 ? ` · ${guides.length} areas in this chapter` : ""}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: tint(hue, 0.18) }}>
            {guides.map((g) => (
              <div key={g.code} className="p-5">
                {guides.length > 1 && (
                  <div className="mb-3 text-[15px] font-extrabold" style={{ color: NAVY.ink }}>
                    {g.title}
                  </div>
                )}
                <div className="grid gap-5 sm:grid-cols-3">
                  <HintCol title="Who to ask" text={g.whoToAsk} hue={hue} />
                  <HintCol title="What to check" text={g.whatToCheck} hue={hue} />
                  <HintCol title="How to collect" text={g.howToCollect} hue={hue} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HintCol({ title, text, hue }: { title: string; text: string; hue: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[13.5px] font-bold" style={{ color: hue }}>{title}</div>
      <div className="text-[14px] leading-relaxed" style={{ color: NAVY.inkSoft }}>{text}</div>
    </div>
  );
}

function GpsStrip({ hue, position, loading, onCapture }: { hue: string; position: { lat: number; lng: number; accuracy: number } | null; loading: boolean; onCapture: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border bg-white/75 p-4 backdrop-blur" style={{ borderColor: tint(hue, 0.35) }}>
      <MapPin className="h-5 w-5" style={{ color: hue }} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold">GPS location of supervision</div>
        {position ? (
          <div className="mt-0.5 inline-flex items-center gap-1 text-[11.5px]" style={{ color: NAVY.good }}>
            <ShieldCheck className="h-3.5 w-3.5" /> {position.lat.toFixed(5)}, {position.lng.toFixed(5)} · ±{Math.round(position.accuracy)}m
          </div>
        ) : (
          <div className="mt-0.5 text-[11.5px]" style={{ color: NAVY.inkSoft }}>Capture your position while at the visit site.</div>
        )}
      </div>
      <button
        onClick={onCapture}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: hue }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
        {position ? "Recapture" : "Capture GPS"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Question field renderer                                             */
/* ------------------------------------------------------------------ */
function QuestionField({ q, hue, value, onChange }: { q: Question; hue: string; value: any; onChange: (v: any) => void }) {
  const label = (q.label || "").replace(/<[^>]*>/g, "");
  const multiline = q.appearance === "multiline" || (q as any).text?.multiline;

  const renderControl = () => {
    switch (q.type) {
      case "select_one": {
        const options = (q.options || []).filter((o) => o.label && o.value);
        return (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            {options.map((o) => {
              const selected = value === o.value;
              return (
                <button
                  key={o.id || o.value}
                  type="button"
                  onClick={() => onChange(selected ? "" : o.value)}
                  className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-[16px] font-semibold transition active:scale-[0.99] sm:min-h-0 sm:text-[14px]"
                  style={{
                    borderColor: selected ? hue : NAVY.line,
                    background: selected ? tint(hue, 0.14) : "#fff",
                    color: selected ? hue : NAVY.ink,
                  }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                    style={{ borderColor: selected ? hue : NAVY.line, background: selected ? hue : "transparent" }}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
        );
      }
      case "select_multiple": {
        const options = (q.options || []).filter((o) => o.label && o.value);
        const arr: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            {options.map((o) => {
              const selected = arr.includes(o.value);
              return (
                <button
                  key={o.id || o.value}
                  type="button"
                  onClick={() => onChange(selected ? arr.filter((v) => v !== o.value) : [...arr, o.value])}
                  className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-[16px] font-semibold transition active:scale-[0.99] sm:min-h-0 sm:text-[14px]"
                  style={{
                    borderColor: selected ? hue : NAVY.line,
                    background: selected ? tint(hue, 0.14) : "#fff",
                    color: selected ? hue : NAVY.ink,
                  }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2"
                    style={{ borderColor: selected ? hue : NAVY.line, background: selected ? hue : "transparent" }}
                  >
                    {selected && <span className="text-[11px] font-black text-white">✓</span>}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
        );
      }
      case "number":
      case "range":
        return (
          <input
            type="number"
            inputMode="decimal"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-2xl border bg-white px-4 py-3.5 text-[16px] outline-none focus:ring-2 sm:py-2.5 sm:text-[14px]"
            style={{ borderColor: NAVY.line }}
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-2xl border bg-white px-4 py-3.5 text-[16px] outline-none focus:ring-2 sm:py-2.5 sm:text-[14px]"
            style={{ borderColor: NAVY.line }}
          />
        );
      default:
        return multiline ? (
          <textarea
            rows={4}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-2xl border bg-white px-4 py-3.5 text-[16px] leading-relaxed outline-none focus:ring-2 sm:py-2.5 sm:text-[14px]"
            style={{ borderColor: NAVY.line }}
          />
        ) : (
          <input
            type="text"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-2xl border bg-white px-4 py-3.5 text-[16px] outline-none focus:ring-2 sm:py-2.5 sm:text-[14px]"
            style={{ borderColor: NAVY.line }}
          />
        );
    }
  };

  return (
    <div className="rounded-2xl border bg-white/90 p-4 backdrop-blur sm:p-5" style={{ borderColor: NAVY.line }}>
      <label className="mb-2.5 block text-[16.5px] font-bold leading-snug sm:text-[15px]" style={{ color: NAVY.ink }}>
        {label}
        {q.required && <span className="ml-1" style={{ color: NAVY.bad }}>*</span>}
      </label>
      {q.hint && <p className="mb-3 text-[13.5px] leading-relaxed sm:text-[12px]" style={{ color: NAVY.inkSoft }}>{q.hint}</p>}
      {renderControl()}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Shared supervision context bar — carried across every module        */
function SharedContextBar({
  shared,
  setShared,
  open,
  setOpen,
  geoSummary,
  gps,
  gpsCapturedAt,
  hasContext,
}: {
  shared: SharedContext;
  setShared: React.Dispatch<React.SetStateAction<SharedContext>>;
  open: boolean;
  setOpen: (v: boolean) => void;
  geoSummary: string[];
  gps: { lat: number; lng: number } | null;
  gpsCapturedAt: string | null;
  hasContext: boolean;
}) {
  const monthLabel = shared.reportingMonth
    ? new Date(shared.reportingMonth + "-01").toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "Set period";
  const chip = (icon: React.ReactNode, label: string, active: boolean) => (
    <span
      className="inline-flex max-w-[46vw] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11.5px] font-semibold sm:max-w-none"
      style={{ background: active ? tint(NAVY.teal, 0.14) : NAVY.panel2, color: active ? shade(NAVY.teal, 0.15) : NAVY.inkSoft, border: `1px solid ${active ? tint(NAVY.teal, 0.4) : NAVY.line}` }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
  return (
    <div className="border-b px-4 py-2" style={{ borderColor: NAVY.line, background: NAVY.canvas }}>
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: NAVY.inkSoft }}>
          Shared context
        </span>
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {chip(<MapPin className="h-3.5 w-3.5" />, geoSummary.length ? geoSummary.slice(-3).join(" › ") : "Set location", geoSummary.length > 0)}
          {chip(<Crosshair className="h-3.5 w-3.5" />, gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : "Awaiting GPS", !!gps)}
          {chip(<UserRound className="h-3.5 w-3.5" />, shared.respondentName ? `${shared.respondentName}${shared.respondentRole ? ` · ${shared.respondentRole}` : ""}` : "Add respondent", !!shared.respondentName)}
          {chip(<CalendarDays className="h-3.5 w-3.5" />, `${monthLabel}${shared.round ? ` · ${shared.round}` : ""}`, !!shared.reportingMonth)}
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold transition hover:bg-black/5"
          style={{ color: NAVY.teal }}
        >
          {open ? "Done" : "Edit context"}
          <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="mt-2 grid gap-2 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-4" style={{ borderColor: NAVY.line, background: NAVY.panel }}>
          <label className="text-[11px] font-semibold" style={{ color: NAVY.inkSoft }}>
            Person spoken to
            <input
              value={shared.respondentName}
              onChange={(e) => setShared((s) => ({ ...s, respondentName: e.target.value }))}
              placeholder="e.g. Hajiya A. (in-charge)"
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-[13px] font-medium"
              style={{ borderColor: NAVY.line, color: NAVY.ink }}
            />
          </label>
          <label className="text-[11px] font-semibold" style={{ color: NAVY.inkSoft }}>
            Their role
            <input
              value={shared.respondentRole}
              onChange={(e) => setShared((s) => ({ ...s, respondentRole: e.target.value }))}
              placeholder="e.g. Facility in-charge"
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-[13px] font-medium"
              style={{ borderColor: NAVY.line, color: NAVY.ink }}
            />
          </label>
          <label className="text-[11px] font-semibold" style={{ color: NAVY.inkSoft }}>
            Reporting month
            <input
              type="month"
              value={shared.reportingMonth}
              onChange={(e) => setShared((s) => ({ ...s, reportingMonth: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-[13px] font-medium"
              style={{ borderColor: NAVY.line, color: NAVY.ink }}
            />
          </label>
          <label className="text-[11px] font-semibold" style={{ color: NAVY.inkSoft }}>
            Round / phase
            <input
              value={shared.round}
              onChange={(e) => setShared((s) => ({ ...s, round: e.target.value }))}
              placeholder="e.g. Round 2"
              className="mt-1 w-full rounded-lg border px-2.5 py-1.5 text-[13px] font-medium"
              style={{ borderColor: NAVY.line, color: NAVY.ink }}
            />
          </label>
          <p className="sm:col-span-2 lg:col-span-4 text-[11px]" style={{ color: NAVY.inkSoft }}>
            This context is captured once and attached to every form you submit in this visit{gpsCapturedAt ? ` · GPS fixed at ${new Date(gpsCapturedAt).toLocaleTimeString()}` : ""}.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Journey rail — persistent stepper shown while chaining modules      */
function JourneyRail({
  sections,
  currentIdx,
  isSectionComplete,
  onJump,
}: {
  sections: ChapterSection[];
  currentIdx: number;
  isSectionComplete: (i: number) => boolean;
  onJump: (i: number) => void;
}) {
  return (
    <div className="mb-3 rounded-xl border p-2.5" style={{ borderColor: "rgba(129,140,248,0.4)", background: "linear-gradient(100deg, rgba(99,102,241,0.10), rgba(56,189,248,0.06))" }}>
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <Route className="h-3.5 w-3.5" style={{ color: "#6366F1" }} />
        <span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "#4f46e5" }}>Guided journey</span>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {sections.map((s, i) => {
          const done = isSectionComplete(i);
          const isActive = i === currentIdx;
          return (
            <button
              key={s.id}
              onClick={() => onJump(i)}
              title={s.label}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition"
              style={{
                background: isActive ? "#6366F1" : done ? tint(NAVY.good, 0.18) : NAVY.panel,
                color: isActive ? "#fff" : done ? shade(NAVY.good, 0.2) : NAVY.inkSoft,
                border: `1px solid ${isActive ? "#6366F1" : done ? tint(NAVY.good, 0.4) : NAVY.line}`,
              }}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              <span className="max-w-[120px] truncate">{i + 1}. {s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conversational hand-off after a module is submitted in the journey  */
function HandoffCard({
  sections,
  fromIdx,
  nextIdx,
  completedCount,
  onContinue,
  onChooseAnother,
  onFinish,
}: {
  sections: ChapterSection[];
  fromIdx: number;
  nextIdx: number;
  completedCount: number;
  onContinue: (i: number) => void;
  onChooseAnother: () => void;
  onFinish: () => void;
}) {
  const fromSection = sections[fromIdx];
  const fromLabel = fromSection?.label || "that chapter";
  const hasNext = nextIdx >= 0 && nextIdx < sections.length;
  const nextSection = hasNext ? sections[nextIdx] : null;
  const nextLabel = nextSection?.label || "";
  const opener = TRANSITION_OPENERS[fromIdx % TRANSITION_OPENERS.length];
  // Prefer the chapter's own closing line — it's written as a natural bridge to
  // whatever comes next; fall back to a generated sentence otherwise.
  const bridge = hasNext
    ? fromSection?.closing
      ? `${fromSection.closing} ${opener} “${nextLabel}”${nextSection?.subtitle ? ` — ${nextSection.subtitle.toLowerCase()}` : "."}`
      : `We've captured “${fromLabel}”. ${opener} let's move to “${nextLabel}”.`
    : `You've captured “${fromLabel}”, and every chapter in this visit is now complete. Nice work.`;
  return (
    <div className="p-4 lg:p-5">
      <div className="relative overflow-hidden rounded-2xl border p-5 shadow-sm" style={{ borderColor: "rgba(129,140,248,0.5)", background: "linear-gradient(120deg, rgba(99,102,241,0.12), rgba(56,189,248,0.08))" }}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow" style={{ background: hasNext ? "#6366F1" : NAVY.good }}>
            {hasNext ? <MessageCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#4f46e5" }}>
              {hasNext ? "Continuing the conversation" : "Journey complete"} · {completedCount}/{sections.length} forms
            </p>
            <p className="mt-1 text-[14px] font-semibold leading-snug" style={{ color: NAVY.ink }}>
              {bridge}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {hasNext && (
                <button
                  onClick={() => onContinue(nextIdx)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white shadow transition hover:brightness-105"
                  style={{ background: "#6366F1" }}
                >
                  Continue to “{nextLabel}” <ArrowRight className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={onChooseAnother}
                className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[13px] font-bold transition hover:bg-black/5"
                style={{ borderColor: NAVY.line, color: NAVY.ink }}
              >
                Choose another form
              </button>
              <button
                onClick={onFinish}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition hover:bg-black/5"
                style={{ color: NAVY.inkSoft }}
              >
                <X className="h-4 w-4" /> {hasNext ? "End journey" : "Done"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-11 w-11">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke={NAVY.line} strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{pct}%</span>
    </div>
  );
}
