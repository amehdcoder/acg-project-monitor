import { useEffect, useState } from "react";
import { BadgeCheck, ChevronRight, FileText, FileWarning, FolderClosed, Lock, MessageSquareHeart, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { WorkspaceNavItem, WorkspaceView } from "./WorkspaceNavigation";
import safeDash from "@/assets/protection/safeguarding-dashboard.png.asset.json";
import safeCases from "@/assets/protection/safeguarding-cases.png.asset.json";
import feedbackArt from "@/assets/protection/community-feedback.png.asset.json";

interface Stat { icon: typeof FileText; value: number; label: string; }
interface CardDef { art: string; tone: string; stats: Stat[]; }

const trust = [
  { icon: Lock, title: "Secure access", note: "Authorised users only" },
  { icon: ShieldCheck, title: "Data encrypted", note: "End-to-end security" },
  { icon: FileText, title: "Audit trail", note: "All actions logged" },
  { icon: BadgeCheck, title: "Compliant", note: "Global safeguarding standards" },
];

interface Props {
  projectId: string;
  items: WorkspaceNavItem[];
  onOpen: (view: WorkspaceView) => void;
}

export default function ProtectionHub({ projectId, items, onOpen }: Props) {
  const [cards, setCards] = useState<Record<string, CardDef>>({
    safeguarding_dashboard: { art: safeDash.url, tone: "blue", stats: [] },
    safeguarding: { art: safeCases.url, tone: "orange", stats: [] },
    feedback: { art: feedbackArt.url, tone: "green", stats: [] },
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      const [{ data: concerns }, { data: feedback }] = await Promise.all([
        supabase.from("safeguarding_concerns" as never).select("status, severity, created_by, assigned_to").eq("project_id" as never, projectId as never) as unknown as Promise<{ data: { status: string; severity: string; created_by: string | null; assigned_to: string | null }[] | null }>,
        supabase.from("project_feedback").select("status, category").eq("project_id", projectId),
      ]);
      if (cancelled) return;
      const sc = concerns || [];
      const fb = (feedback || []) as { status: string; category: string }[];
      const open = sc.filter((c) => ["open", "in_progress", "referred"].includes(c.status));
      setCards({
        safeguarding_dashboard: { art: safeDash.url, tone: "blue", stats: [
          { icon: FileText, value: open.length, label: "Open cases" },
          { icon: FileWarning, value: sc.filter((c) => c.status === "in_progress").length, label: "In action" },
          { icon: BadgeCheck, value: sc.filter((c) => c.status === "closed").length, label: "Resolved" },
          { icon: Users, value: sc.filter((c) => ["high", "critical"].includes(c.severity)).length, label: "High priority" },
        ] },
        safeguarding: { art: safeCases.url, tone: "orange", stats: [
          { icon: FileText, value: sc.filter((c) => c.created_by === me).length, label: "My cases" },
          { icon: Users, value: sc.filter((c) => c.assigned_to === me).length, label: "Assigned to me" },
          { icon: FileWarning, value: sc.filter((c) => c.status === "in_progress").length, label: "In review" },
          { icon: FolderClosed, value: sc.filter((c) => c.status === "closed").length, label: "Closed" },
        ] },
        feedback: { art: feedbackArt.url, tone: "green", stats: [
          { icon: MessageSquareHeart, value: fb.length, label: "Total feedback" },
          { icon: BadgeCheck, value: fb.filter((f) => ["resolved", "closed"].includes(f.status)).length, label: "Resolved" },
          { icon: ShieldCheck, value: fb.filter((f) => f.category === "safeguarding").length, label: "Safeguarding related" },
          { icon: FileWarning, value: fb.filter((f) => f.status === "new").length, label: "Pending action" },
        ] },
      });
    };
    void load().catch(() => undefined);
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <section className="overview-hub space-y-4">
      <header className="overview-heading px-5 py-6 sm:px-7">
        <h2 className="font-report-display text-4xl font-extrabold">Protection</h2>
        <p className="mt-2 max-w-xl text-base sm:text-lg">Safeguarding, secure feedback and confidential case management.</p>
      </header>
      <div className="overview-status grid grid-cols-2 gap-4 border bg-card p-4 sm:grid-cols-4">
        {trust.map(({ icon: Icon, title, note }) => (
          <div key={title} className="flex items-center gap-3"><Icon className="h-7 w-7 shrink-0 text-health-teal" /><div><p className="font-bold">{title}</p><p className="text-sm text-muted-foreground">{note}</p></div></div>
        ))}
      </div>
      <div className="grid gap-4">
        {items.filter((item) => item.show).map((item) => {
          const card = cards[item.key];
          if (!card) return null;
          return (
            <Button key={item.key} variant="ghost" onClick={() => onOpen(item.key)} className={`overview-card overview-${card.tone} group relative h-auto w-full flex-col items-stretch overflow-hidden border p-4 text-left shadow-soft sm:p-5`}>
              <div className="overview-art" aria-hidden="true"><img src={card.art} alt="" loading="lazy" /></div>
              <div className="relative flex items-start gap-4 pr-8 sm:gap-5">
                <span className="overview-card-icon flex shrink-0 items-center justify-center rounded-2xl"><item.icon className="h-10 w-10 sm:h-12 sm:w-12" /></span>
                <div className="overview-card-copy min-w-0 py-1"><h3 className="whitespace-normal break-words font-report-display text-xl font-extrabold sm:text-2xl">{item.label}</h3><p className="mt-2 whitespace-normal break-words text-base font-normal text-muted-foreground sm:text-lg">{item.description}.</p></div>
              </div>
              <span className="overview-arrow absolute right-4 top-5 flex h-10 w-10 items-center justify-center rounded-full"><ChevronRight className="h-7 w-7" /></span>
              {card.stats.length > 0 && (
                <div className="protection-stats relative mt-4 grid grid-cols-2 gap-3 rounded-xl border bg-card/80 p-3 sm:grid-cols-4">
                  {card.stats.map(({ icon: Icon, value, label }, i) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className={`overview-chip overview-chip-${i % 5} flex h-9 w-9 shrink-0 items-center justify-center rounded-full`}><Icon className="h-4 w-4" /></span>
                      <div><p className="text-lg font-extrabold leading-tight">{value.toLocaleString()}</p><p className="text-xs text-muted-foreground">{label}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
