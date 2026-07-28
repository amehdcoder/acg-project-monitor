import { useEffect, useMemo, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { List, ChevronLeft, ChevronRight, WifiOff, Wifi } from "lucide-react";

export type WizardSection = { id: string; title: string; icon?: React.ComponentType<{ className?: string }> };

interface Props {
  sections: WizardSection[];
  /** Anchors these ids inside the form scroll container. */
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  /** Optional per-section completion percent (0..1). */
  completion?: Record<string, number>;
  lastSavedAt?: number | null;
  className?: string;
}

/**
 * Sticky progress header + Quick Navigator drawer that operates over any
 * form whose sub-sections have `id="section-<id>"` anchors. Non-invasive:
 * the underlying form keeps its own submit / draft controls; this chrome
 * only augments navigation and progress feedback.
 */
const MicroplanWizardChrome = ({
  sections, scrollContainerRef, completion = {}, lastSavedAt, className,
}: Props) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Track which section is closest to the top of the scroll container.
  useEffect(() => {
    const root = scrollContainerRef?.current ?? null;
    const targets = sections
      .map((s) => document.getElementById(`section-${s.id}`))
      .filter(Boolean) as HTMLElement[];
    if (targets.length === 0) return;

    observerRef.current?.disconnect();
    const io = new IntersectionObserver(
      (entries) => {
        // Pick the top-most visible section.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const id = visible[0].target.id.replace(/^section-/, "");
          const idx = sections.findIndex((s) => s.id === id);
          if (idx >= 0) setActiveIdx(idx);
        }
      },
      { root, rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    targets.forEach((t) => io.observe(t));
    observerRef.current = io;
    return () => io.disconnect();
  }, [sections, scrollContainerRef]);

  const scrollTo = (idx: number) => {
    const s = sections[idx];
    if (!s) return;
    const el = document.getElementById(`section-${s.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveIdx(idx);
  };

  const current = sections[activeIdx];
  const progress = ((activeIdx + 1) / Math.max(sections.length, 1)) * 100;
  const savedLabel = useMemo(() => {
    if (!lastSavedAt) return null;
    const secs = Math.max(1, Math.round((Date.now() - lastSavedAt) / 1000));
    if (secs < 60) return `Saved ${secs}s ago`;
    const mins = Math.round(secs / 60);
    return `Saved ${mins}m ago`;
  }, [lastSavedAt]);

  return (
    <div className={`sticky top-0 z-20 -mx-1 mb-2 rounded-b-2xl border-b border-border/60 bg-white/95 px-3 py-2 shadow-sm backdrop-blur ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Section {activeIdx + 1} of {sections.length}</span>
            {savedLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-700">
                {savedLabel}
              </span>
            )}
            {!online && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-700">
                <WifiOff className="h-2.5 w-2.5" /> Saved locally — will sync when online
              </span>
            )}
            {online && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                <Wifi className="h-2.5 w-2.5" /> Online
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
            {current?.title ?? ""}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button" size="sm" variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() => scrollTo(Math.max(0, activeIdx - 1))}
            disabled={activeIdx === 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <Button
            type="button" size="sm" variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() => scrollTo(Math.min(sections.length - 1, activeIdx + 1))}
            disabled={activeIdx >= sections.length - 1}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" size="sm" variant="secondary" className="h-8 px-2 text-xs">
                <List className="h-3.5 w-3.5 mr-1" /> Sections
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>Quick Navigator</SheetTitle>
              </SheetHeader>
              <div className="mt-3 space-y-1">
                {sections.map((s, idx) => {
                  const pct = completion[s.id];
                  const state =
                    pct == null ? null :
                    pct >= 1 ? { label: "Complete", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" } :
                    pct > 0  ? { label: "In progress", cls: "bg-amber-100 text-amber-800 border-amber-200" } :
                               { label: "Missing", cls: "bg-rose-100 text-rose-700 border-rose-200" };
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => scrollTo(idx)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                        idx === activeIdx
                          ? "border-primary/50 bg-primary/5"
                          : "border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-700">
                          {idx + 1}
                        </span>
                        <span className="truncate font-medium text-slate-800">{s.title}</span>
                      </span>
                      {state && (
                        <Badge variant="outline" className={`shrink-0 text-[10px] ${state.cls}`}>
                          {state.label}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <Progress value={progress} className="mt-2 h-1.5" />
    </div>
  );
};

export default MicroplanWizardChrome;
