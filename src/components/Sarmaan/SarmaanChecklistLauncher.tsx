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
} from "lucide-react";
import {
  NAVY,
  SECTION_HUES,
  MODULE_GUIDANCE,
  REMOVED_CHECKLIST_QUESTIONS,
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
  onOpenDashboard?: () => void;
  onClose: () => void;
  onSubmitted?: () => void;
}

const GEO_NAMES = new Set(["state", "lga", "ward", "flhf_name", "community", "settlement_name"]);
const GUIDANCE = "guidance"; // sentinel for the guidance nav entry

/** Hexcolor helper — translucent tint. */
const tint = (hex: string, alpha: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * SARMAAN ACSM Integrated Supervisory Checklist — an interactive, section-by-
 * section data-collection surface. Every sidebar module is clickable and
 * renders its own questions inline (answerable right here), each on a unique
 * rose-flower backdrop. Geography is driven by the microplan cascade and GPS
 * is captured on device; submissions save through the offline-capable store.
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
  onOpenDashboard,
  onClose,
  onSubmitted,
}: Props) {
  const { saveSubmission, isOnline } = useOfflineStorage();
  const geo = useGeolocation();

  // ---- Build the answerable section model from the form's groups ----
  const sections = useMemo(() => {
    const src = groups.length > 0 ? groups : [{ id: "all", name: "all", label: formName, questions } as FormGroup];
    return src.map((g) => ({
      id: g.id,
      label: g.label || g.name,
      questions: (g.questions || []).filter(
        (q) => q.type !== "calculate" && q.type !== "note" && !REMOVED_CHECKLIST_QUESTIONS.has(q.name || ""),
      ),
    }));
  }, [groups, questions, formName]);

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

  const setValue = (id: string, value: any) =>
    setResponses((r) => ({ ...r, [id]: value }));

  // GPS question (geopoint) — capture the device fix into responses.
  const gpsQuestion = allQuestions.find((q) => q.type === "geopoint");
  useEffect(() => {
    if (gpsQuestion && geo.position) {
      setResponses((r) => ({
        ...r,
        [gpsQuestion.id]: `${geo.position!.lat},${geo.position!.lng}`,
      }));
    }
  }, [geo.position, gpsQuestion]);

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
      payload.__section_index = idx + 1;
      const result = await saveSubmission(formId, userId, payload, location, null, "regular");
      if (result.success) {
        toast({
          title: result.offline ? "Saved offline" : `“${section.label}” submitted`,
          description: result.offline
            ? "Your form is stored on device and will sync when you're online."
            : "This supervision form has been recorded to the dashboard.",
        });
        onSubmitted?.();
        setActive(MENU);
      } else {
        toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Submission failed", description: "An error occurred. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };


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
              {active === GUIDANCE ? "Guidance" : `Step ${currentIdx + 1} of ${sections.length}`}
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

        {/* body */}
        <div ref={scrollRef} className="relative flex min-h-0 flex-1 overflow-y-auto">
          {active === GUIDANCE ? (
            <GuidancePanel onStart={() => setActive(MENU)} />
          ) : active === MENU ? (
            <FormMenu
              sections={sections}
              responses={responses}
              visibleQuestions={visibleQuestions}
              onOpenGuidance={() => setActive(GUIDANCE)}
              onPick={(i) => setActive(i)}
            />
          ) : currentSection ? (
            <main className="relative min-w-0 flex-1 p-5 lg:p-6">
              <RoseBackground hue={hue} />
              <div className="relative">
                <button
                  onClick={() => setActive(MENU)}
                  className="mb-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold transition hover:bg-black/5"
                  style={{ color: hue }}
                >
                  <ChevronLeft className="h-4 w-4" /> All supervision forms
                </button>
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold text-white shadow"
                    style={{ background: hue, fontFamily: NAVY.headingFont }}
                  >
                    {currentIdx + 1}
                  </span>
                  <h2 className="text-2xl font-extrabold" style={{ fontFamily: NAVY.headingFont }}>
                    {currentSection.label}
                  </h2>
                </div>

                {/* module hint pulled from guidance */}
                <ModuleHint idx={currentIdx} hue={hue} />

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
                  <div className="mb-5 rounded-2xl border bg-white/70 p-4 backdrop-blur" style={{ borderColor: tint(hue, 0.35) }}>
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: hue }}>
                      <Compass className="h-4 w-4" /> Supervision location (from microplan)
                    </div>
                    <MdaLocationCascade
                      projectId={projectId}
                      responses={responses}
                      nameToId={mdaNameToId}
                      onSet={(updates) => setResponses((r) => ({ ...r, ...updates }))}
                      stateScope={stateScope}
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
          <li>• Capture GPS on site and let the microplan drive State → LGA → Ward → FLHF → Community → Settlement.</li>
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
  // Repeating rose-flower motif, tinted to the section hue, sitting softly
  // behind the questions.
  const rose = (cx: number, cy: number, r: number, opacity: number) => (
    <g transform={`translate(${cx} ${cy})`} opacity={opacity}>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse key={a} rx={r} ry={r * 0.55} fill={hue} transform={`rotate(${a}) translate(0 ${-r * 0.7})`} />
      ))}
      <circle r={r * 0.5} fill={hue} />
      <circle r={r * 0.22} fill="#fff" opacity={0.5} />
    </g>
  );
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      {rose(60, 80, 46, 0.06)}
      {rose(320, 40, 30, 0.05)}
      {rose(90, 360, 34, 0.05)}
      {rose(280, 300, 52, 0.05)}
      {rose(180, 180, 24, 0.04)}
      {rose(360, 480, 40, 0.05)}
    </svg>
  );
}

function ModuleHint({ idx, hue }: { idx: number; hue: string }) {
  const g = MODULE_GUIDANCE[idx];
  if (!g) return null;
  return (
    <div className="relative mb-5 mt-2 rounded-2xl border bg-white/75 backdrop-blur" style={{ borderColor: tint(hue, 0.4) }}>
      <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: tint(hue, 0.25) }}>
        <Lightbulb className="h-4 w-4" style={{ color: hue }} />
        <span className="text-sm font-bold" style={{ color: hue }}>Supervisor guidance</span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <HintCol title="Who to ask" text={g.whoToAsk} hue={hue} />
        <HintCol title="What to check" text={g.whatToCheck} hue={hue} />
        <HintCol title="How to collect" text={g.howToCollect} hue={hue} />
      </div>
    </div>
  );
}

function HintCol({ title, text, hue }: { title: string; text: string; hue: string }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-bold" style={{ color: hue }}>{title}</div>
      <div className="text-[11.5px] leading-snug" style={{ color: NAVY.inkSoft }}>{text}</div>
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
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const selected = value === o.value;
              return (
                <button
                  key={o.id || o.value}
                  type="button"
                  onClick={() => onChange(selected ? "" : o.value)}
                  className="rounded-xl border px-4 py-2 text-[13px] font-semibold transition"
                  style={{
                    borderColor: selected ? hue : NAVY.line,
                    background: selected ? tint(hue, 0.14) : "#fff",
                    color: selected ? hue : NAVY.ink,
                  }}
                >
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
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const selected = arr.includes(o.value);
              return (
                <button
                  key={o.id || o.value}
                  type="button"
                  onClick={() => onChange(selected ? arr.filter((v) => v !== o.value) : [...arr, o.value])}
                  className="rounded-xl border px-4 py-2 text-[13px] font-semibold transition"
                  style={{
                    borderColor: selected ? hue : NAVY.line,
                    background: selected ? tint(hue, 0.14) : "#fff",
                    color: selected ? hue : NAVY.ink,
                  }}
                >
                  {selected ? "✓ " : ""}{o.label}
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
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-[14px] outline-none focus:ring-2"
            style={{ borderColor: NAVY.line }}
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-[14px] outline-none focus:ring-2"
            style={{ borderColor: NAVY.line }}
          />
        );
      default:
        return multiline ? (
          <textarea
            rows={3}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-[14px] outline-none focus:ring-2"
            style={{ borderColor: NAVY.line }}
          />
        ) : (
          <input
            type="text"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-[14px] outline-none focus:ring-2"
            style={{ borderColor: NAVY.line }}
          />
        );
    }
  };

  return (
    <div className="rounded-2xl border bg-white/85 p-4 backdrop-blur" style={{ borderColor: NAVY.line }}>
      <label className="mb-2 block text-[14px] font-semibold leading-snug" style={{ color: NAVY.ink }}>
        {label}
        {q.required && <span className="ml-1" style={{ color: NAVY.bad }}>*</span>}
      </label>
      {q.hint && <p className="mb-2 text-[12px]" style={{ color: NAVY.inkSoft }}>{q.hint}</p>}
      {renderControl()}
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
