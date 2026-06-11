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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
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
    cta: { label: "Open Project Chat", tab: "project-chat" },
  },
  {
    id: "proximity",
    icon: Radar,
    accent: "from-sky-500 via-blue-500 to-indigo-500",
    ring: "bg-sky-500/15 text-sky-600",
    title: "Proximity Discovery",
    body: "See teammates working within 10 km of you out in the field and start a quick chat instantly. Tap the radar button at the bottom-right to switch your visibility on or off.",
  },
  {
    id: "community-forum",
    icon: Users2,
    accent: "from-violet-500 via-purple-500 to-fuchsia-500",
    ring: "bg-violet-500/15 text-violet-600",
    title: "Community Forum",
    body: "Ask questions, share insights and learn from the wider community of field workers and supervisors. Great answers help everyone.",
    cta: { label: "Open Community Forum", tab: "community-forum" },
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

const GuidedTour = ({ onNavigate }: GuidedTourProps) => {
  const { user, profile, loading, isApproved, isPendingApproval, isAdhoc, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

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
    await persistDone();
  };

  const goTo = async (tab: string) => {
    await finish();
    onNavigate?.(tab);
  };

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

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
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30">
              <Icon className="h-8 w-8" />
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
                  <div key={b.label} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${current.ring}`}>
                      <BIcon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-foreground">{b.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {current.cta && (
            <Button variant="outline" className="mt-4 w-full" onClick={() => goTo(current.cta!.tab)}>
              {current.cta.label}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}

          {/* Progress dots */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
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
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default GuidedTour;
