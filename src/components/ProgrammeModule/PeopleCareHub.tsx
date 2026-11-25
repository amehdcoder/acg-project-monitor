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

const STYLE: Record<string, { icon: string; art: string; tone: string; noun: string }> = {
  records: { icon: recordsIcon.url, art: recordsArt.url, tone: "blue", noun: "records" },
  followups: { icon: followupsIcon.url, art: followupsArt.url, tone: "red", noun: "upcoming" },
  households: { icon: householdsIcon.url, art: householdsArt.url, tone: "green", noun: "households" },
  casesearch: { icon: casesearchIcon.url, art: casesearchArt.url, tone: "violet", noun: "potential cases" },
  livelihood: { icon: livelihoodIcon.url, art: livelihoodArt.url, tone: "teal", noun: "assessments" },
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

  return (
    <section className="overview-hub space-y-4">
      <header className="overview-heading flex items-start gap-4 px-5 py-6 sm:px-7">
        <img src={headerIcon.url} alt="" className="h-14 w-auto shrink-0 sm:h-16" />
        <div className="min-w-0">
          <h2 className="font-report-display text-4xl font-extrabold">People &amp; care</h2>
          <p className="mt-2 max-w-xl text-base sm:text-lg">Manage beneficiaries, households, follow-ups and support services for integrated NTD care and inclusion.</p>
        </div>
      </header>
      <div className="grid gap-4">
        {items.filter((item) => item.show).map((item) => {
          const s = STYLE[item.key];
          if (!s) return null;
          return (
            <button key={item.key} type="button" onClick={() => onOpen(item.key)}
              className={`overview-card overview-${s.tone} group relative flex h-auto w-full flex-col items-stretch overflow-hidden border p-4 text-left shadow-soft sm:p-5`}>
              <div className="overview-art" aria-hidden="true"><img src={s.art} alt="" loading="lazy" /></div>
              <div className="relative flex items-start gap-4 pr-8 sm:gap-5">
                <img src={s.icon} alt="" className="h-[72px] w-[72px] shrink-0 object-contain sm:h-20 sm:w-20" />
                <div className="overview-card-copy min-w-0 py-1">
                  <h3 className="whitespace-normal break-words font-report-display text-xl font-extrabold sm:text-2xl">{item.label}</h3>
                  <p className="mt-2 whitespace-normal break-words text-base font-normal text-muted-foreground sm:text-lg">{item.description}.</p>
                </div>
              </div>
              <span className="overview-arrow absolute right-4 top-5 flex h-10 w-10 items-center justify-center rounded-full"><ChevronRight className="h-7 w-7" /></span>
              <div className="relative mt-4 flex flex-wrap items-center gap-2">
                <span className="overview-count"><b>{fmt(counts[item.key])}</b>{s.noun}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default PeopleCareHub;
