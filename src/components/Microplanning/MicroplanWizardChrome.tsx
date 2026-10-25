import { useEffect, useMemo, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { List, ChevronLeft, ChevronRight, WifiOff, Wifi, Calendar, Building2, Users, MapPin, Accessibility, Eye, ClipboardCheck, Leaf } from "lucide-react";

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
    const icons = [Calendar, Building2, Building2, Users, MapPin, MapPin, Users, Accessibility, Eye, ClipboardCheck, Leaf];
  return (
    <div className={`microplan-wizard sticky top-0 z-20 mb-3 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0"><span className="microplan-section-number"><ClipboardCheck className="h-5 w-5" /></span><div><h1 className="text-lg font-bold text-foreground">New Microplan Entry</h1><p className="text-xs text-muted-foreground">Plan, target and track frontline implementation</p></div></div>
        <Badge variant="outline" className="shrink-0 gap-1 text-xs">{online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{online ? 'Online' : 'Offline'}{lastSavedAt ? ' · Draft saved' : ''}</Badge>
      </div>
      <nav className="microplan-step-track" aria-label="Microplan sections">
        {sections.map((section, idx) => { const Icon = icons[idx] || ClipboardCheck; return <Button key={section.id} variant="ghost" type="button" className="microplan-step" aria-current={idx === activeIdx ? 'step' : undefined} onClick={() => scrollTo(idx)}><span className="microplan-step-icon"><Icon className="h-4 w-4" /></span><span>{idx + 1} {section.title.split(' ')[0]}</span></Button>; })}
      </nav>
    </div>
  );
};

export default MicroplanWizardChrome;
