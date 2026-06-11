import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  MessageSquareText,
  Radar,
  Users2,
  Sparkles,
  Layers,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Video,
  Phone,
  Lock,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePageAccess } from "@/hooks/usePageAccess";
import { supabase } from "@/integrations/supabase/client";

interface GuidedTourProps {
  /** Navigate the app shell to a tab (used by "Take me there" actions). */
  onNavigate?: (tab: string) => void;
}

interface Step {
  id: string;
  icon: typeof MessageSquareText;
  accent: string; // gradient classes for the header
  ring: string; // icon halo
  title: string;
  body: string;
  bullets?: { icon: typeof Video; label: string }[];
  cta?: { label: string; tab: string };
  /** Page id whose access gates this feature's CTA. Omit for always-available steps. */
  requiresPage?: string;
  /** Shown when the user lacks access to requiresPage. */
  lockMessage?: string;
  /**
   * DOM marker (data-tour-section value) for this step's target UI section.
   * The numbered step dot only becomes clickable once this section is actually
   * rendered & visible on screen. Omit for intro/outro steps that are always reachable.
   */
  targetSection?: string;
}

const STEPS: Step[] = [
  {
    id: "welcome",
    icon: Sparkles,
    accent: "from-primary via-primary to-accent",
    ring: "bg-primary/15 text-primary",
    title: "Welcome aboard 👋",
    body: "Let's take a quick tour of the collaboration tools that help you and your team work together — in the field and from anywhere.",
  },
  {
    id: "project-chat",
    icon: MessageSquareText,
    accent: "from-emerald-500 via-emerald-500 to-teal-500",
    ring: "bg-emerald-500/15 text-emerald-600",
    title: "Project Chat",
    body: "Every project you belong to has its own chat room. Message your team, share forms and files, and stay in sync in real time.",
    bullets: [
      { icon: MessageSquareText, label: "Group & team messaging" },
      { icon: Phone, label: "Crystal-clear voice calls" },
      { icon: Video, label: "Face-to-face video calls" },
    ],
    cta: { label: "Take me to Project Chat", tab: "project-chat" },
    targetSection: "project-chat",
    requiresPage: "project-chat",
    lockMessage:
      "Project Chat unlocks once you're assigned to a project. Ask the owner or an admin to add you to a project in User Management.",
  },
  {
    id: "proximity",
    icon: Radar,
    accent: "from-sky-500 via-blue-500 to-indigo-500",
    ring: "bg-sky-500/15 text-sky-600",
    title: "Proximity Discovery",
    body: "See teammates working within 10 km of you out in the field and start a quick chat instantly. Tap the radar button at the bottom-right to switch your visibility on or off.",
    targetSection: "proximity",
  },
  {
    id: "community-forum",
    icon: Users2,
    accent: "from-violet-500 via-purple-500 to-fuchsia-500",
    ring: "bg-violet-500/15 text-violet-600",
    title: "Community Forum",
    body: "Ask questions, share insights and learn from the wider community of field workers and supervisors. Great answers help everyone.",
    cta: { label: "Take me to Community Forum", tab: "community-forum" },
    targetSection: "community-forum",
    requiresPage: "community-forum",
    lockMessage:
      "The Community Forum isn't enabled for your account yet. Ask the owner to grant you access to the Community Forum page.",
  },
  {
    id: "your-space",
    icon: Layers,
    accent: "from-amber-500 via-orange-500 to-rose-500",
    ring: "bg-amber-500/15 text-amber-600",
    title: "Your personalised workspace",
    body: "On top of these, your sidebar shows everything unlocked by your project(s), your role, and any extra access the owner grants you. You're all set — enjoy!",
  },
];

const TOUR_KEY = "amehnities_guided_tour_v1";
export const REPLAY_TOUR_EVENT = "amehnities:replay-tour";

const GuidedTour = ({ onNavigate }: GuidedTourProps) => {
  const { user, profile, loading, isApproved, isPendingApproval, isAdhoc, refreshProfile } = useAuth();
  const { canAccessPage } = usePageAccess();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  // When replayed from settings, ignore the "already seen" guard.
  const [forced, setForced] = useState(false);
  // Which target UI sections are currently rendered & visible on screen.
  // A numbered step dot only unlocks once its target section becomes visible.
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());

  // Poll the DOM while the tour is open to detect which target sections are
  // actually mounted and visible (non-zero box, not display:none).
  useEffect(() => {
    if (!open) return;
    const isVisible = (el: Element | null) => {
      if (!el) return false;
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(el as HTMLElement);
      return style.visibility !== "hidden" && style.display !== "none";
    };
    const scan = () => {
      const found = new Set<string>();
      document.querySelectorAll<HTMLElement>("[data-tour-section]").forEach((el) => {
        const key = el.getAttribute("data-tour-section");
        if (key && isVisible(el)) found.add(key);
      });
      setVisibleSections((prev) => {
        if (prev.size === found.size && [...found].every((k) => prev.has(k))) return prev;
        return found;
      });
    };
    scan();
    const id = window.setInterval(scan, 500);
    return () => window.clearInterval(id);
  }, [open]);

  const hasSeen = useMemo(
    () => Boolean((profile as any)?.has_seen_tour) || localStorage.getItem(TOUR_KEY) === "done",
    [profile],
  );

  // Decide whether to show the tour on first access.
  useEffect(() => {
    if (loading || !user || !profile) return;
    if (isAdhoc) return; // adhoc users have a restricted, self-explanatory surface
    if (!isApproved || isPendingApproval) return;
    if (hasSeen) return;
    setStep(0);
    setOpen(true);
  }, [loading, user, profile, isApproved, isPendingApproval, isAdhoc, hasSeen]);

  // Allow replaying the tour from App Settings even after it's been seen.
  useEffect(() => {
    const handler = () => {
      setForced(true);
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_TOUR_EVENT, handler);
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, handler);
  }, []);

  const persistDone = async () => {
    localStorage.setItem(TOUR_KEY, "done");
    if (user?.id) {
      try {
        await supabase.from("profiles").update({ has_seen_tour: true } as any).eq("user_id", user.id);
        await refreshProfile();
      } catch {
        /* localStorage fallback already set */
      }
    }
  };

  const finish = async () => {
    setOpen(false);
    setForced(false);
    await persistDone();
  };

  const goTo = async (tab: string) => {
    await finish();
    onNavigate?.(tab);
  };

  // A step dot is clickable when it's the current step, an already-visited step,
  // or its target UI section is actually visible. Intro/outro steps (no target)
  // are always reachable.
  const isStepUnlocked = (i: number) => {
    if (i <= step) return true;
    const target = STEPS[i].targetSection;
    if (!target) return true;
    return visibleSections.has(target);
  };

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const isLocked = Boolean(current.requiresPage) && !canAccessPage(current.requiresPage!);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/60 backdrop-blur-sm animate-in fade-in"
        onClick={finish}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border animate-in fade-in zoom-in-95 duration-200">
        {/* Gradient header */}
        <div className={`relative bg-gradient-to-br ${current.accent} px-6 pb-8 pt-7 text-white`}>
          <button
            onClick={finish}
            aria-label="Close tour"
            className="absolute right-3 top-3 rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-white/80">
            <Sparkles className="h-3.5 w-3.5" />
            Step {step + 1} of {STEPS.length}
          </div>
          <div className="mt-4 flex justify-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30">
              <Icon className="h-8 w-8" />
              {isLocked && (
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-foreground shadow ring-1 ring-black/10">
                  <Lock className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <h2 className="text-center font-display text-xl font-bold text-foreground">{current.title}</h2>
          <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">{current.body}</p>

          {current.bullets && (
            <div className="mt-4 space-y-2">
              {current.bullets.map((b) => {
                const BIcon = b.icon;
                return (
                  <div key={b.label} className={`flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 ${isLocked ? "opacity-60" : ""}`}>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${current.ring}`}>
                      <BIcon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-foreground">{b.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Locked explanation */}
          {isLocked && current.lockMessage && (
            <div className="mt-4 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-xs font-semibold text-amber-700">Locked for your account</p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-700/90">{current.lockMessage}</p>
              </div>
            </div>
          )}

          {/* CTA — only when the feature is actually accessible */}
          {current.cta && !isLocked && (
            <Button variant="outline" className="mt-4 w-full" onClick={() => goTo(current.cta!.tab)}>
              {current.cta.label}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}

          {/* Progress bar with step numbers */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>
                Step <span className="text-foreground">{step + 1}</span> / {STEPS.length}
              </span>
              <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
            {/* Numbered step dots */}
            <div className="mt-3 flex items-center justify-center gap-2">
              {STEPS.map((s, i) => {
                const unlocked = isStepUnlocked(i);
                return (
                  <button
                    key={s.id}
                    onClick={() => unlocked && setStep(i)}
                    disabled={!unlocked}
                    aria-label={
                      unlocked
                        ? `Go to step ${i + 1}`
                        : `Step ${i + 1} unlocks once its section is visible`
                    }
                    title={
                      unlocked
                        ? undefined
                        : "Open this feature first — the step unlocks once its section is visible"
                    }
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-200 ${
                      i === step
                        ? "bg-primary text-primary-foreground"
                        : i < step
                        ? "bg-primary/20 text-primary"
                        : unlocked
                        ? "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                        : "cursor-not-allowed bg-muted/50 text-muted-foreground/40"
                    }`}
                  >
                    {unlocked ? i + 1 : <Lock className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>


          {/* Controls */}
          <div className="mt-5 flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={finish}>
                Skip tour
              </Button>
            )}

            {isLast ? (
              <Button size="sm" onClick={finish}>
                <Check className="mr-1 h-4 w-4" />
                Get started
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Next
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Back to start — quickly review onboarding from the beginning */}
          {step > 0 && (
            <div className="mt-2 flex justify-center">
              <button
                onClick={() => setStep(0)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                <RotateCcw className="h-3 w-3" />
                Back to start
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default GuidedTour;
