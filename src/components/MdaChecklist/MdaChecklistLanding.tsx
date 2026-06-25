import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  Radar,
  ClipboardList,
  Pill,
  HeartPulse,
  ChevronRight,
  Loader2,
  Search,
  Inbox,
} from "lucide-react";
import { FormFiller } from "@/components/FormFiller";
import { supabase } from "@/integrations/supabase/client";
import type { Question, FormGroup } from "@/components/FormBuilder/types";

/** Group name slugs (mirror mdaSupervisoryChecklist.ts). */
const GROUP_COMPLETION = "follow_up_on_mda_completion";
const GROUP_COMMODITIES = "follow_up_on_mda_commodities";
const GROUP_ADVERSE = "adverse_reaction_management";
// The "Community Checklist" = every group EXCEPT the standalone follow-up subforms.
const FOLLOWUP_GROUPS = new Set([GROUP_COMPLETION, GROUP_COMMODITIES, GROUP_ADVERSE]);

interface VisitedCommunity {
  id: string;
  lga: string;
  ward: string;
  flhf: string;
  community: string;
  data: Record<string, any>;
}

interface MdaChecklistLandingProps {
  formId: string;
  formName: string;
  formDescription: string;
  questions: Question[];
  groups?: FormGroup[];
  geofence?: any;
  userId: string;
  projectId: string;
  requireLocation?: boolean;
  settings?: Record<string, any>;
  onClose: () => void;
}

type View =
  | "home"
  | "community"
  | "hcs-list"
  | "completion"
  | "commodities-list"
  | "commodities"
  | "adverse";

const pick = (d: Record<string, any>, keys: string[]): string => {
  for (const k of keys) {
    const v = d?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
};

const TILES: {
  view: View;
  title: string;
  Icon: typeof MapPin;
  gradient: string;
  ring: string;
}[] = [
  { view: "community", title: "Community Checklist", Icon: MapPin, gradient: "from-rose-500 to-pink-600", ring: "ring-rose-200" },
  { view: "hcs-list", title: "Household Coverage Survey", Icon: Radar, gradient: "from-fuchsia-500 to-purple-600", ring: "ring-fuchsia-200" },
  { view: "completion", title: "Follow-up on MDA Completion", Icon: ClipboardList, gradient: "from-emerald-500 to-teal-600", ring: "ring-emerald-200" },
  { view: "commodities-list", title: "Follow-up on MDA Commodities", Icon: Pill, gradient: "from-amber-500 to-orange-600", ring: "ring-amber-200" },
  { view: "adverse", title: "Follow-up on Adverse Reactions", Icon: HeartPulse, gradient: "from-sky-500 to-indigo-600", ring: "ring-sky-200" },
];

export default function MdaChecklistLanding(props: MdaChecklistLandingProps) {
  const { formId, formName, projectId, onClose, groups = [] } = props;
  const navigate = useNavigate();
  const [view, setView] = useState<View>("home");

  // Build the FormFiller props for a focused sub-form / community checklist.
  const fillerProps = useCallback(
    (focusGroupNames?: string[]) => ({
      formId: props.formId,
      formName: props.formName,
      formDescription: props.formDescription,
      questions: props.questions,
      groups: props.groups,
      geofence: props.geofence,
      userId: props.userId,
      projectId: props.projectId,
      requireLocation: props.requireLocation,
      settings: props.settings,
      localWorkflow: true as const,
      focusGroupNames,
      onClose: () => setView("home"),
      onSavedLocally: () => setView("home"),
    }),
    [props],
  );

  // "Community Checklist" = all groups except the standalone follow-up subforms.
  const communityGroupNames = useMemo(
    () => groups.filter((g) => !FOLLOWUP_GROUPS.has(g.name)).map((g) => g.name),
    [groups],
  );

  if (view === "community") {
    return <FormFiller {...fillerProps(communityGroupNames)} />;
  }
  if (view === "completion") {
    return <FormFiller {...fillerProps([GROUP_COMPLETION])} />;
  }
  if (view === "commodities") {
    return <FormFiller {...fillerProps([GROUP_COMMODITIES])} />;
  }
  if (view === "adverse") {
    return <FormFiller {...fillerProps([GROUP_ADVERSE])} />;
  }
  if (view === "hcs-list") {
    return (
      <CommunityListView
        formId={formId}
        projectId={projectId}
        title="Household Coverage Survey"
        subtitle="Select a community to run the linked Coverage Evaluation 3D survey."
        onBack={() => setView("home")}
        onSelect={(c) => {
          // Prefill + lock the Coverage Evaluation 3D location from this visit.
          try {
            const prefill = {
              state: pick(c.data, ["state"]),
              lga: c.lga,
              ward: c.ward,
              flhf_name: c.flhf,
              community_name: c.community,
              settlement_name: pick(c.data, ["settlement", "settlement_name"]),
              projectId: projectId ?? "",
              ts: Date.now(),
            };
            sessionStorage.setItem("amehnities:cesLocationPrefill", JSON.stringify(prefill));
            sessionStorage.setItem("amehnities:cesFromChecklist", "1");
          } catch { /* ignore */ }
          window.dispatchEvent(new CustomEvent("amehnities:navigate-tab", { detail: { tab: "coverage-eval" } }));
          navigate("/?tab=coverage-eval", { replace: true });
        }}
      />
    );
  }
  if (view === "commodities-list") {
    return (
      <CommunityListView
        formId={formId}
        projectId={projectId}
        title="Follow-up on MDA Commodities"
        subtitle="Select a community to record commodity follow-up."
        onBack={() => setView("home")}
        onSelect={() => setView("commodities")}
      />
    );
  }

  // ── Landing grid ──
  return (
    <div className="min-h-screen bg-[#eef0f3]">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-[#5b6fc4] px-4 py-4 text-white shadow-md">
        <button onClick={onClose} className="rounded-full p-1 transition-colors hover:bg-white/15" aria-label="Back">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-semibold tracking-wide">MDA Supervisory Checklist</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8">
          {TILES.map(({ view: v, title, Icon, gradient, ring }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="group flex flex-col items-center gap-3 rounded-2xl p-3 text-center transition-transform active:scale-95"
            >
              <span
                className={`flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br ${gradient} text-white shadow-lg ring-4 ${ring} transition-transform group-hover:scale-105`}
              >
                <Icon className="h-12 w-12" strokeWidth={1.6} />
              </span>
              <span className="text-[15px] font-medium leading-tight text-slate-800">{title}</span>
            </button>
          ))}
        </div>
        <p className="mt-10 text-center text-xs text-slate-400">{formName}</p>
      </main>
    </div>
  );
}

// ───────────────────────── Community list table ─────────────────────────
function CommunityListView({
  formId,
  projectId,
  title,
  subtitle,
  onBack,
  onSelect,
}: {
  formId: string;
  projectId: string;
  title: string;
  subtitle: string;
  onBack: () => void;
  onSelect: (c: VisitedCommunity) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VisitedCommunity[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("form_submissions")
          .select("id, data, project_id, submitted_at")
          .eq("form_id", formId)
          .order("submitted_at", { ascending: false })
          .limit(2000);
        if (projectId) q = q.eq("project_id", projectId);
        const { data, error } = await q;
        if (error) throw error;
        const seen = new Set<string>();
        const out: VisitedCommunity[] = [];
        for (const s of data || []) {
          const d = (s.data as Record<string, any>) || {};
          const community = pick(d, ["community", "community_name", "settlement", "settlement_name"]);
          const lga = pick(d, ["lga"]);
          const ward = pick(d, ["ward"]);
          const flhf = pick(d, ["flhf_name", "flhf", "health_facility"]);
          if (!community && !lga && !ward) continue;
          const key = `${lga}|${ward}|${flhf}|${community}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ id: s.id, lga, ward, flhf, community, data: d });
        }
        if (active) setRows(out);
      } catch (e) {
        console.error("Community list load error", e);
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [formId, projectId]);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.lga, r.ward, r.flhf, r.community].some((v) => v.toLowerCase().includes(t)),
    );
  }, [rows, query]);

  return (
    <div className="min-h-screen bg-[#eef0f3]">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-[#5b6fc4] px-4 py-4 text-white shadow-md">
        <button onClick={onBack} className="rounded-full p-1 transition-colors hover:bg-white/15" aria-label="Back">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="truncate text-lg font-semibold tracking-wide">{title}</h1>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-5">
        <p className="mb-3 text-sm text-slate-600">{subtitle}</p>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search LGA, Ward, FLHF or Community"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-[#5b6fc4]"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading communities…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">
            <Inbox className="h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium">No communities visited yet</p>
            <p className="text-xs">Communities appear here once Community Checklists are submitted.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Header row (hidden on very small screens; cards used instead) */}
            <div className="hidden grid-cols-[1fr_1fr_1fr_1.2fr_auto] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
              <span>LGA</span><span>Ward</span><span>FLHF</span><span>Community / Settlement</span><span />
            </div>
            <ul className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onSelect(r)}
                    className="grid w-full grid-cols-1 items-center gap-1 px-4 py-3 text-left transition-colors hover:bg-[#f4f6fc] active:bg-[#eaeefb] sm:grid-cols-[1fr_1fr_1fr_1.2fr_auto] sm:gap-2"
                  >
                    <CellLabel label="LGA" value={r.lga} />
                    <CellLabel label="Ward" value={r.ward} />
                    <CellLabel label="FLHF" value={r.flhf} />
                    <CellLabel label="Community" value={r.community} strong />
                    <ChevronRight className="hidden h-5 w-5 shrink-0 justify-self-end text-slate-400 sm:block" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

function CellLabel({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">{label}:</span>
      <span className={`truncate text-sm ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>
        {value || "—"}
      </span>
    </div>
  );
}
