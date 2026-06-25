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
  Pencil,
  Check,
  X,
  // Icon library for admin customization
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FlaskConical,
  Home,
  ListChecks,
  Microscope,
  Package,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Truck,
  Users,
} from "lucide-react";
import { FormFiller } from "@/components/FormFiller";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  | "completion-list"
  | "completion"
  | "commodities-list"
  | "commodities"
  | "adverse-list"
  | "adverse";

const pick = (d: Record<string, any>, keys: string[]): string => {
  for (const k of keys) {
    const v = d?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
};

// Library of icons admins can assign to a tile.
const ICON_LIBRARY = {
  MapPin, Radar, ClipboardList, Pill, HeartPulse, Activity, AlertTriangle,
  BarChart3, Boxes, CalendarCheck, CheckCircle2, ClipboardCheck, FileText,
  FlaskConical, Home, ListChecks, Microscope, Package, ShieldCheck,
  Stethoscope, Syringe, Truck, Users,
} as const;
type IconName = keyof typeof ICON_LIBRARY;

interface TileDef {
  key: string;
  view: View;
  title: string;
  defaultIcon: IconName;
  gradient: string;
  ring: string;
}

const TILES: TileDef[] = [
  { key: "community", view: "community", title: "Community Checklist", defaultIcon: "MapPin", gradient: "from-rose-500 to-pink-600", ring: "ring-rose-200" },
  { key: "hcs", view: "hcs-list", title: "Household Coverage Survey", defaultIcon: "Radar", gradient: "from-fuchsia-500 to-purple-600", ring: "ring-fuchsia-200" },
  { key: "completion", view: "completion-list", title: "Follow-up on MDA Completion", defaultIcon: "ClipboardList", gradient: "from-emerald-500 to-teal-600", ring: "ring-emerald-200" },
  { key: "commodities", view: "commodities-list", title: "Follow-up on MDA Commodities", defaultIcon: "Pill", gradient: "from-amber-500 to-orange-600", ring: "ring-amber-200" },
  { key: "adverse", view: "adverse-list", title: "Follow-up on Adverse Reactions", defaultIcon: "HeartPulse", gradient: "from-sky-500 to-indigo-600", ring: "ring-sky-200" },
];

export default function MdaChecklistLanding(props: MdaChecklistLandingProps) {
  const { formId, formName, projectId, onClose, groups = [] } = props;
  const navigate = useNavigate();
  const { isAdmin, isOwner } = useAuth();
  const canEditIcons = !!(isAdmin || isOwner);
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<VisitedCommunity | null>(null);

  // ── Admin-customizable tile icons (persisted per form) ──
  const iconStorageKey = `amehnities:mdaTileIcons:${formId}`;
  const [iconOverrides, setIconOverrides] = useState<Record<string, IconName>>({});
  const [editingIcons, setEditingIcons] = useState(false);
  const [pickingTile, setPickingTile] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(iconStorageKey);
      if (raw) setIconOverrides(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [iconStorageKey]);

  const setTileIcon = (tileKey: string, icon: IconName) => {
    setIconOverrides((prev) => {
      const next = { ...prev, [tileKey]: icon };
      try { localStorage.setItem(iconStorageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setPickingTile(null);
  };

  const iconFor = (t: TileDef): IconName => iconOverrides[t.key] || t.defaultIcon;

  // Build the FormFiller props for a focused sub-form / community checklist.
  const fillerProps = useCallback(
    (focusGroupNames?: string[], initialResponses?: Record<string, any>) => ({
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
      initialResponses,
      onClose: () => setView("home"),
      onSavedLocally: () => setView("home"),
    }),
    [props],
  );

  // Location prefill derived from a chosen community (locks location into the sub-form).
  const prefillFromCommunity = (c: VisitedCommunity | null): Record<string, any> => {
    if (!c) return {};
    return {
      state: pick(c.data, ["state"]),
      lga: c.lga,
      ward: c.ward,
      flhf_name: c.flhf,
      flhf: c.flhf,
      community: c.community,
      community_name: c.community,
      settlement: pick(c.data, ["settlement", "settlement_name"]),
    };
  };

  // "Community Checklist" = all groups except the standalone follow-up subforms.
  const communityGroupNames = useMemo(
    () => groups.filter((g) => !FOLLOWUP_GROUPS.has(g.name)).map((g) => g.name),
    [groups],
  );

  if (view === "community") {
    return <FormFiller {...fillerProps(communityGroupNames)} />;
  }
  if (view === "completion") {
    return <FormFiller {...fillerProps([GROUP_COMPLETION], prefillFromCommunity(selected))} />;
  }
  if (view === "commodities") {
    return <FormFiller {...fillerProps([GROUP_COMMODITIES], prefillFromCommunity(selected))} />;
  }
  if (view === "adverse") {
    return <FormFiller {...fillerProps([GROUP_ADVERSE], prefillFromCommunity(selected))} />;
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
  if (view === "completion-list") {
    return (
      <CommunityListView
        formId={formId}
        projectId={projectId}
        title="Follow-up on MDA Completion"
        subtitle="Select a community to record the MDA completion follow-up."
        onBack={() => setView("home")}
        onSelect={(c) => { setSelected(c); setView("completion"); }}
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
        onSelect={(c) => { setSelected(c); setView("commodities"); }}
      />
    );
  }
  if (view === "adverse-list") {
    return (
      <CommunityListView
        formId={formId}
        projectId={projectId}
        title="Follow-up on Adverse Reactions"
        subtitle="Select a community to record adverse reaction follow-up."
        onBack={() => setView("home")}
        onSelect={(c) => { setSelected(c); setView("adverse"); }}
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
        <h1 className="flex-1 truncate text-lg font-semibold tracking-wide">MDA Supervisory Checklist</h1>
        {canEditIcons && (
          <button
            onClick={() => { setEditingIcons((v) => !v); setPickingTile(null); }}
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/25"
          >
            {editingIcons ? <><Check className="h-4 w-4" /> Done</> : <><Pencil className="h-4 w-4" /> Edit icons</>}
          </button>
        )}
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8">
          {TILES.map((t) => {
            const Icon = ICON_LIBRARY[iconFor(t)];
            return (
              <div key={t.key} className="relative flex flex-col items-center">
                <button
                  onClick={() => (editingIcons ? setPickingTile(t.key) : setView(t.view))}
                  className="group flex w-full flex-col items-center gap-3 rounded-2xl p-3 text-center transition-transform active:scale-95"
                >
                  <span
                    className={`relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br ${t.gradient} text-white shadow-lg ring-4 ${t.ring} transition-transform group-hover:scale-105`}
                  >
                    <Icon className="h-12 w-12" strokeWidth={1.6} />
                    {editingIcons && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#5b6fc4] shadow ring-1 ring-slate-200">
                        <Pencil className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                  <span className="text-[15px] font-medium leading-tight text-slate-800">{t.title}</span>
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-center text-xs text-slate-400">{formName}</p>
      </main>

      {/* Icon picker dialog (admin only) */}
      {pickingTile && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setPickingTile(null)}>
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">
                Choose an icon for “{TILES.find((t) => t.key === pickingTile)?.title}”
              </h3>
              <button onClick={() => setPickingTile(null)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid max-h-[55vh] grid-cols-5 gap-3 overflow-y-auto sm:grid-cols-6">
              {(Object.keys(ICON_LIBRARY) as IconName[]).map((name) => {
                const I = ICON_LIBRARY[name];
                const active = iconOverrides[pickingTile]
                  ? iconOverrides[pickingTile] === name
                  : TILES.find((t) => t.key === pickingTile)?.defaultIcon === name;
                return (
                  <button
                    key={name}
                    onClick={() => setTileIcon(pickingTile, name)}
                    className={`flex aspect-square items-center justify-center rounded-xl border transition-colors ${
                      active ? "border-[#5b6fc4] bg-[#eef1fc] text-[#5b6fc4]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <I className="h-6 w-6" strokeWidth={1.7} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
        // form_submissions has no project_id column; the MDA checklist form
        // instance is itself project-scoped, so filtering by form_id is enough.
        const { data, error } = await supabase
          .from("form_submissions")
          .select("id, data, submitted_at")
          .eq("form_id", formId)
          .order("submitted_at", { ascending: false })
          .limit(2000);
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
