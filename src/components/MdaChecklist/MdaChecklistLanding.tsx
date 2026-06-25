import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Search,
  Inbox,
  Pencil,
  Check,
  Upload,
  RotateCcw,
} from "lucide-react";
import { FormFiller } from "@/components/FormFiller";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Question, FormGroup } from "@/components/FormBuilder/types";
import { evaluateRelevant, type NameToIdMap } from "@/lib/skipLogic";
import {
  getMdaFollowUpGroupName,
  isMdaFollowUpGroup,
  MDA_FOLLOWUP_ADVERSE,
  MDA_FOLLOWUP_COMMODITIES,
  MDA_FOLLOWUP_COMPLETION,
} from "@/lib/mdaFollowUp";

// Default illustrated tile icons (match the supervisory checklist design).
import imgCommunity from "@/assets/mda-tiles/community-checklist.png";
import imgHousehold from "@/assets/mda-tiles/household-coverage.png";
import imgCompletion from "@/assets/mda-tiles/mda-completion.png";
import imgCommodities from "@/assets/mda-tiles/mda-commodities.png";
import imgAdverse from "@/assets/mda-tiles/adverse-reactions.png";

/** Canonical MDA follow-up group names. */
const GROUP_COMPLETION = MDA_FOLLOWUP_COMPLETION;
const GROUP_COMMODITIES = MDA_FOLLOWUP_COMMODITIES;
const GROUP_ADVERSE = MDA_FOLLOWUP_ADVERSE;

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

interface TileDef {
  key: string;
  view: View;
  title: string;
  defaultImg: string;
}

const TILES: TileDef[] = [
  { key: "community", view: "community", title: "Community Checklist", defaultImg: imgCommunity },
  { key: "hcs", view: "hcs-list", title: "Household Coverage Survey", defaultImg: imgHousehold },
  { key: "completion", view: "completion-list", title: "Follow-up on MDA Completion", defaultImg: imgCompletion },
  { key: "commodities", view: "commodities-list", title: "Follow-up on MDA Commodities", defaultImg: imgCommodities },
  { key: "adverse", view: "adverse-list", title: "Follow-up on Adverse Reactions", defaultImg: imgAdverse },
];

// Resize an uploaded image to a small square PNG data-URL (keeps the row light & offline-cacheable).
async function fileToIconDataUrl(file: File, size = 256): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // Contain the image centered on a transparent square.
  const scale = Math.min(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/png");
}

export default function MdaChecklistLanding(props: MdaChecklistLandingProps) {
  const { formId, formName, projectId, onClose, groups = [] } = props;
  const navigate = useNavigate();
  const { isOwner, isOwnerLevel, isAdmin } = useAuth();
  const { toast } = useToast();
  const canEditIcons = !!(isOwner || isOwnerLevel);
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<VisitedCommunity | null>(null);

  // ── Owner-uploaded tile icons (shared via DB, cached locally for offline) ──
  const cacheKey = `amehnities:mdaTileIconUrls:${formId}`;
  const [iconUrls, setIconUrls] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [editingIcons, setEditingIcons] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTileRef = useRef<string | null>(null);

  // Load shared overrides from the database.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("mda_tile_icons")
          .select("tile_key, icon_url")
          .eq("form_id", formId);
        if (error) throw error;
        if (!active) return;
        const map: Record<string, string> = {};
        for (const r of data || []) map[r.tile_key] = r.icon_url;
        setIconUrls(map);
        try { localStorage.setItem(cacheKey, JSON.stringify(map)); } catch { /* ignore */ }
      } catch {
        /* offline / not yet available — keep cached values */
      }
    })();
    return () => { active = false; };
  }, [formId, cacheKey]);

  const imgFor = (t: TileDef): string => iconUrls[t.key] || t.defaultImg;

  const triggerUpload = (tileKey: string) => {
    pendingTileRef.current = tileKey;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const tileKey = pendingTileRef.current;
    e.target.value = "";
    if (!file || !tileKey) return;
    setUploadingKey(tileKey);
    try {
      const iconUrl = await fileToIconDataUrl(file);
      const { error } = await supabase
        .from("mda_tile_icons")
        .upsert(
          { form_id: formId, tile_key: tileKey, icon_url: iconUrl, updated_at: new Date().toISOString(), updated_by: props.userId },
          { onConflict: "form_id,tile_key" },
        );
      if (error) throw error;
      setIconUrls((prev) => {
        const next = { ...prev, [tileKey]: iconUrl };
        try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      toast({ title: "Icon updated", description: "The tile icon has been saved for everyone." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Could not save the icon.", variant: "destructive" });
    } finally {
      setUploadingKey(null);
    }
  };

  const resetIcon = async (tileKey: string) => {
    setUploadingKey(tileKey);
    try {
      const { error } = await supabase
        .from("mda_tile_icons")
        .delete()
        .eq("form_id", formId)
        .eq("tile_key", tileKey);
      if (error) throw error;
      setIconUrls((prev) => {
        const next = { ...prev };
        delete next[tileKey];
        try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      toast({ title: "Icon reset", description: "Reverted to the default icon." });
    } catch (err: any) {
      toast({ title: "Reset failed", description: err?.message || "Could not reset the icon.", variant: "destructive" });
    } finally {
      setUploadingKey(null);
    }
  };

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
    () => groups.filter((g) => !isMdaFollowUpGroup(g)).map((g) => g.name),
    [groups],
  );

  // Lookup helpers for follow-up linking & community filtering.
  const groupByName = useMemo(() => {
    const m = new Map<string, FormGroup>();
    for (const g of groups) {
      m.set(g.name, g);
      const canonical = getMdaFollowUpGroupName(g);
      if (canonical) m.set(canonical, g);
    }
    return m;
  }, [groups]);

  // Identity name map for evaluating community filters against submission data
  // (form_submissions.data is keyed by question `name`).
  const checklistNameMap = useMemo<NameToIdMap>(() => {
    const map: NameToIdMap = {};
    for (const g of groups) {
      if (isMdaFollowUpGroup(g)) continue;
      for (const q of g.questions) if (q.name) map[q.name] = q.name;
    }
    return map;
  }, [groups]);

  // Carry linked Community Checklist responses into the follow-up form.
  const linkedPrefill = (groupName: string, c: VisitedCommunity | null): Record<string, any> => {
    const base = prefillFromCommunity(c);
    const g = groupByName.get(groupName);
    if (g && c) {
      for (const q of g.questions) {
        if (q.linkedSourceField && q.name) {
          const v = c.data?.[q.linkedSourceField];
          if (v !== undefined && v !== null && String(v) !== "") base[q.name] = v;
        }
      }
    }
    return base;
  };

  const filterFor = (groupName: string) => groupByName.get(groupName)?.communityFilter;

  if (view === "community") {
    return <FormFiller {...fillerProps(communityGroupNames)} />;
  }
  if (view === "completion") {
    return <FormFiller {...fillerProps([GROUP_COMPLETION], linkedPrefill(GROUP_COMPLETION, selected))} />;
  }
  if (view === "commodities") {
    return <FormFiller {...fillerProps([GROUP_COMMODITIES], linkedPrefill(GROUP_COMMODITIES, selected))} />;
  }
  if (view === "adverse") {
    return <FormFiller {...fillerProps([GROUP_ADVERSE], linkedPrefill(GROUP_ADVERSE, selected))} />;
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
        accent="completion"
        filterExpr={filterFor(GROUP_COMPLETION)}
        nameMap={checklistNameMap}
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
        accent="commodities"
        filterExpr={filterFor(GROUP_COMMODITIES)}
        nameMap={checklistNameMap}
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
        accent="adverse"
        filterExpr={filterFor(GROUP_ADVERSE)}
        nameMap={checklistNameMap}
        onBack={() => setView("home")}
        onSelect={(c) => { setSelected(c); setView("adverse"); }}
      />
    );
  }

  // ── Landing grid ──
  return (
    <div className="min-h-screen bg-[#eef0f3]">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFileSelected}
      />
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-[#5b6fc4] px-4 py-4 text-white shadow-md">
        <button onClick={onClose} className="rounded-full p-1 transition-colors hover:bg-white/15" aria-label="Back">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 truncate text-lg font-semibold tracking-wide">MDA Supervisory Checklist</h1>
        {canEditIcons && (
          <button
            onClick={() => setEditingIcons((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/25"
          >
            {editingIcons ? <><Check className="h-4 w-4" /> Done</> : <><Pencil className="h-4 w-4" /> Edit icons</>}
          </button>
        )}
      </header>

      {editingIcons && (
        <p className="mx-auto mt-3 max-w-2xl px-5 text-center text-xs text-slate-500">
          Tap a tile to upload a custom icon image. Changes are saved for everyone.
        </p>
      )}

      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8">
          {TILES.map((t) => {
            const busy = uploadingKey === t.key;
            const hasCustom = !!iconUrls[t.key];
            return (
              <div key={t.key} className="relative flex flex-col items-center">
                <button
                  onClick={() => (editingIcons ? triggerUpload(t.key) : setView(t.view))}
                  disabled={busy}
                  className="group flex w-full flex-col items-center gap-3 rounded-2xl p-4 text-center transition-colors hover:bg-white/60"
                >
                  <span className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white transition-transform group-hover:scale-105 group-active:scale-95">
                    {busy ? (
                      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                    ) : (
                      <img
                        src={imgFor(t)}
                        alt={t.title}
                        loading="lazy"
                        className="h-14 w-14 object-contain"
                      />
                    )}
                    {editingIcons && !busy && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#5b6fc4]">
                        <Upload className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </span>
                  <span className="text-[15px] font-medium leading-tight text-slate-800">{t.title}</span>
                </button>
                {editingIcons && hasCustom && !busy && (
                  <button
                    onClick={() => resetIcon(t.key)}
                    className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-center text-xs text-slate-400">{formName}</p>
      </main>
    </div>
  );
}

// ───────────────────────── Community list table ─────────────────────────
type AccentKey = "completion" | "commodities" | "adverse" | "default";

const ACCENTS: Record<AccentKey, {
  headerFrom: string;
  headerTo: string;
  chip: string;
  ring: string;
  hover: string;
  active: string;
  avatarFrom: string;
  avatarTo: string;
  count: string;
}> = {
  completion: {
    headerFrom: "from-emerald-600", headerTo: "to-teal-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    ring: "focus:border-emerald-500 focus:ring-emerald-200",
    hover: "hover:bg-emerald-50/70", active: "active:bg-emerald-100",
    avatarFrom: "from-emerald-500", avatarTo: "to-teal-400",
    count: "bg-emerald-100 text-emerald-700",
  },
  commodities: {
    headerFrom: "from-indigo-600", headerTo: "to-violet-500",
    chip: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    ring: "focus:border-indigo-500 focus:ring-indigo-200",
    hover: "hover:bg-indigo-50/70", active: "active:bg-indigo-100",
    avatarFrom: "from-indigo-500", avatarTo: "to-violet-400",
    count: "bg-indigo-100 text-indigo-700",
  },
  adverse: {
    headerFrom: "from-rose-600", headerTo: "to-orange-500",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    ring: "focus:border-rose-500 focus:ring-rose-200",
    hover: "hover:bg-rose-50/70", active: "active:bg-rose-100",
    avatarFrom: "from-rose-500", avatarTo: "to-orange-400",
    count: "bg-rose-100 text-rose-700",
  },
  default: {
    headerFrom: "from-[#5b6fc4]", headerTo: "to-indigo-500",
    chip: "bg-slate-100 text-slate-700 ring-slate-200",
    ring: "focus:border-[#5b6fc4] focus:ring-indigo-200",
    hover: "hover:bg-[#f4f6fc]", active: "active:bg-[#eaeefb]",
    avatarFrom: "from-[#5b6fc4]", avatarTo: "to-indigo-400",
    count: "bg-slate-100 text-slate-700",
  },
};

const initialsOf = (s: string): string => {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

function CommunityListView({
  formId,
  projectId,
  title,
  subtitle,
  accent = "default",
  filterExpr,
  nameMap,
  onBack,
  onSelect,
}: {
  formId: string;
  projectId: string;
  title: string;
  subtitle: string;
  accent?: AccentKey;
  filterExpr?: string;
  nameMap?: NameToIdMap;
  onBack: () => void;
  onSelect: (c: VisitedCommunity) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VisitedCommunity[]>([]);
  const [query, setQuery] = useState("");
  const a = ACCENTS[accent];

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
          // Admin-defined appearance condition: only include communities whose
          // Community Checklist response satisfies the configured filter.
          if (filterExpr && !evaluateRelevant(filterExpr, d, nameMap || {})) continue;
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
  }, [formId, projectId, filterExpr, nameMap]);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.lga, r.ward, r.flhf, r.community].some((v) => v.toLowerCase().includes(t)),
    );
  }, [rows, query]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-[#eef0f3]">
      <header className={`sticky top-0 z-20 flex items-center gap-3 bg-gradient-to-r ${a.headerFrom} ${a.headerTo} px-4 py-4 text-white shadow-md`}>
        <button onClick={onBack} className="rounded-full p-1 transition-colors hover:bg-white/20" aria-label="Back">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 truncate text-base font-semibold tracking-wide sm:text-lg">{title}</h1>
        {!loading && (
          <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
            {filtered.length}
          </span>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-5">
        <p className="mb-3 text-sm leading-snug text-slate-600">{subtitle}</p>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search LGA, Ward, FLHF or Community"
            className={`w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-base shadow-sm outline-none ring-0 transition focus:ring-2 ${a.ring}`}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading communities…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">
            <Inbox className="h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium">No communities to follow up yet</p>
            <p className="max-w-xs px-6 text-xs">
              {filterExpr
                ? "No visited community matches the follow-up condition set by your admin."
                : "Communities appear here once Community Checklists are submitted."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onSelect(r)}
                  className={`group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition ${a.hover} ${a.active} hover:shadow-md`}
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${a.avatarFrom} ${a.avatarTo} text-sm font-bold text-white shadow-sm`}>
                    {initialsOf(r.community || r.ward || r.lga)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-slate-900">
                      {r.community || "Unnamed community"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {r.lga && <Tag accentClass={a.chip} icon="LGA" value={r.lga} />}
                      {r.ward && <Tag accentClass={a.chip} icon="Ward" value={r.ward} />}
                      {r.flhf && <Tag accentClass={a.chip} icon="FLHF" value={r.flhf} />}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Tag({ accentClass, icon, value }: { accentClass: string; icon: string; value: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${accentClass}`}>
      <span className="opacity-60">{icon}</span>
      <span className="truncate">{value}</span>
    </span>
  );
}

