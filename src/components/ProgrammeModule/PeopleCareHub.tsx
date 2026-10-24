import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { WorkspaceNavItem, WorkspaceView } from "./WorkspaceNavigation";
import headerIcon from "@/assets/people-care/header-icon.png.asset.json";
import recordsIcon from "@/assets/people-care/records-icon.png.asset.json";
import recordsArt from "@/assets/people-care/records-art.jpg.asset.json";
import followupsIcon from "@/assets/people-care/followups-icon.png.asset.json";
import followupsArt from "@/assets/people-care/followups-art.jpg.asset.json";
import householdsIcon from "@/assets/people-care/households-icon.png.asset.json";
import householdsArt from "@/assets/people-care/households-art.jpg.asset.json";
import casesearchIcon from "@/assets/people-care/casesearch-icon.png.asset.json";
import casesearchArt from "@/assets/people-care/casesearch-art.jpg.asset.json";
import livelihoodIcon from "@/assets/people-care/livelihood-icon.png.asset.json";
import livelihoodArt from "@/assets/people-care/livelihood-art.jpg.asset.json";

interface Person { next_follow_up_date?: string | null; household_id?: string | null }

interface Props {
  projectId: string;
  beneficiaries: Person[];
  items: WorkspaceNavItem[];
  onOpen: (view: WorkspaceView) => void;
}

const STYLE: Record<string, { icon: string; art: string; tone: string; badge: string }> = {
  records: { icon: recordsIcon.url, art: recordsArt.url, tone: "--pc-blue", badge: "--pc-blue-soft" },
  followups: { icon: followupsIcon.url, art: followupsArt.url, tone: "--pc-red", badge: "--pc-red-soft" },
  households: { icon: householdsIcon.url, art: householdsArt.url, tone: "--pc-green", badge: "--pc-green-soft" },
  casesearch: { icon: casesearchIcon.url, art: casesearchArt.url, tone: "--pc-violet", badge: "--pc-violet-soft" },
  livelihood: { icon: livelihoodIcon.url, art: livelihoodArt.url, tone: "--pc-teal", badge: "--pc-teal-soft" },
};

const countRows = async (table: string, projectId: string) => {
  try {
    const { count } = await (supabase as unknown as { from: (t: string) => any })
      .from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
    return count ?? 0;
  } catch { return 0; }
};

const PeopleCareHub = ({ projectId, beneficiaries, items, onOpen }: Props) => {
  const [remote, setRemote] = useState<{ casesearch: number | null; livelihood: number | null }>({ casesearch: null, livelihood: null });
  useEffect(() => {
    let live = true;
    void Promise.all([countRows("mmdp_potential_cases", projectId), countRows("livelihood_assessments", projectId)])
      .then(([casesearch, livelihood]) => live && setRemote({ casesearch, livelihood }));
    return () => { live = false; };
  }, [projectId]);

  const counts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      records: beneficiaries.length,
      followups: beneficiaries.filter((b) => b.next_follow_up_date && b.next_follow_up_date.slice(0, 10) >= today).length,
      households: new Set(beneficiaries.map((b) => b.household_id).filter(Boolean)).size,
      casesearch: remote.casesearch,
      livelihood: remote.livelihood,
    } as Record<string, number | null>;
  }, [beneficiaries, remote]);

  const fmt = (n: number | null | undefined) => (n == null ? "…" : n.toLocaleString());
  const grid = items.filter((i) => i.key !== "livelihood");
  const wide = items.find((i) => i.key === "livelihood");

  const Badge = ({ k }: { k: string }) => (
    <span className="rounded-full px-4 py-1.5 text-lg font-bold"
      style={{ background: `hsl(var(${STYLE[k].badge}))`, color: `hsl(var(${STYLE[k].tone}))` }}>{fmt(counts[k])}</span>
  );

  return (
    <section className="space-y-5 rounded-2xl bg-card p-4 sm:p-6">
      <header className="flex items-start gap-4">
        <img src={headerIcon.url} alt="" className="h-14 w-auto shrink-0 sm:h-16" />
        <div>
          <h2 className="font-report-display text-3xl font-extrabold sm:text-4xl" style={{ color: "hsl(var(--pc-ink))" }}>People &amp; care</h2>
          <p className="mt-1 max-w-2xl text-base text-muted-foreground">Manage beneficiaries, households, follow-ups and support services for integrated NTD care and inclusion.</p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {grid.map((item) => {
          const s = STYLE[item.key];
          return (
            <button key={item.key} type="button" onClick={() => onOpen(item.key)}
              className="group flex flex-col overflow-hidden rounded-2xl border text-left shadow-soft transition-transform hover:-translate-y-0.5"
              style={{ background: `linear-gradient(160deg, hsl(var(${s.badge}) / .55), hsl(var(--card)))` }}>
              <div className="flex items-start justify-between p-5 pb-2">
                <img src={s.icon} alt="" className="h-16 w-16 sm:h-[72px] sm:w-[72px]" />
                <Badge k={item.key} />
              </div>
              <div className="px-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xl font-extrabold sm:text-2xl" style={{ color: "hsl(var(--pc-ink))" }}>{item.label}</h3>
                  <ChevronRight className="h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1" style={{ color: "hsl(var(--pc-ink))" }} />
                </div>
                <p className="mt-1 text-base text-muted-foreground">{item.description}.</p>
              </div>
              <img src={s.art} alt="" className="mt-auto w-full object-cover" loading="lazy" />
            </button>
          );
        })}
      </div>

      {wide && (
        <button type="button" onClick={() => onOpen("livelihood")}
          className="group relative flex w-full overflow-hidden rounded-2xl border text-left shadow-soft transition-transform hover:-translate-y-0.5"
          style={{ background: `linear-gradient(120deg, hsl(var(--pc-teal-soft)), hsl(var(--card)))` }}>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 p-5">
            <img src={STYLE.livelihood.icon} alt="" className="h-16 w-16 sm:h-[72px] sm:w-[72px]" />
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-extrabold sm:text-2xl" style={{ color: "hsl(var(--pc-ink))" }}>{wide.label}</h3>
              <ChevronRight className="h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1" style={{ color: "hsl(var(--pc-ink))" }} />
            </div>
            <p className="text-base text-muted-foreground">{wide.description}.</p>
          </div>
          <div className="relative w-[45%] max-w-md shrink-0">
            <img src={STYLE.livelihood.art} alt="" className="h-full w-full object-cover object-left" loading="lazy" />
            <span className="absolute right-4 top-4"><Badge k="livelihood" /></span>
          </div>
        </button>
      )}
    </section>
  );
};

export default PeopleCareHub;
