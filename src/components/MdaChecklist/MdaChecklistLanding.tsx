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
  Link2,
  ShieldCheck,
  ShieldAlert,

} from "lucide-react";
import { FormFiller } from "@/components/FormFiller";
import FollowUpLinkEditor from "@/components/FormBuilder/FollowUpLinkEditor";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Question, FormGroup } from "@/components/FormBuilder/types";
import { evaluateRelevant, type NameToIdMap } from "@/lib/skipLogic";
import { buildCesLocationUrl } from "@/lib/mda/cesLocationBridge";
import { prewarmSatelliteAround } from "@/lib/ces/satellitePrewarm";
import {
  getMdaFollowUpGroupName,
  isMdaFollowUpGroup,
  canRoleBuildMdaFollowUps,
  MDA_FOLLOWUP_ADVERSE,
  MDA_FOLLOWUP_COMMODITIES,
  MDA_FOLLOWUP_COMPLETION,
} from "@/lib/mdaFollowUp";
import { flattenQuestions, isYes } from "@/lib/mda/analyses";
import { canonicalizeSubmissionData } from "@/lib/mda/dashboardData";
import { listAllSavedEntries } from "@/lib/savedForms";

// Default illustrated tile icons (match the supervisory checklist design).
import imgCommunity from "@/assets/mda-tiles/community-checklist.png";
import imgHousehold from "@/assets/mda-tiles/household-coverage.png";
import imgCompletion from "@/assets/mda-tiles/mda-completion.png";
import imgCommodities from "@/assets/mda-tiles/mda-commodities.png";
import imgAdverse from "@/assets/mda-tiles/adverse-reactions.png";
import chwHero from "@/assets/community-health-worker.jpg.asset.json";

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
  location?: { lat?: number; lng?: number; latitude?: number; longitude?: number; accuracy?: number } | null;
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

const asFinite = (value: any): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const pickCoordinate = (d: Record<string, any>, location?: VisitedCommunity["location"]) => {
  const meta = d?.form_metadata || {};
  const autoGps = meta?.auto_gps || {};
  const gpsCandidates = [
    location,
    autoGps,
    d?.gps,
    d?.geopoint,
    d?.location,
    d?.coordinates,
    d?.community_gps,
    d?.settlement_gps,
  ].filter(Boolean);
  for (const c of gpsCandidates) {
    const lat = asFinite((c as any).lat ?? (c as any).latitude);
    const lng = asFinite((c as any).lng ?? (c as any).lon ?? (c as any).long ?? (c as any).longitude);
    if (lat !== undefined && lng !== undefined) {
      return { lat, lng, accuracy: asFinite((c as any).accuracy ?? (c as any).gps_accuracy_m) };
    }
  }
  const lat = asFinite(d?.lat ?? d?.latitude ?? d?.community_latitude ?? d?.settlement_latitude);
  const lng = asFinite(d?.lng ?? d?.lon ?? d?.long ?? d?.longitude ?? d?.community_longitude ?? d?.settlement_longitude);
  if (lat !== undefined && lng !== undefined) return { lat, lng, accuracy: asFinite(d?.accuracy ?? d?.gps_accuracy_m) };
  return {};
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
  { key: "commodities", view: "commodities-list", title: "Follow-up on MDA Commodities / Communities", defaultImg: imgCommodities },
  { key: "adverse", view: "adverse-list", title: "Follow-up on Adverse Reactions", defaultImg: imgAdverse },
];

const BUILDER_TARGETS = [GROUP_COMPLETION, GROUP_COMMODITIES, GROUP_ADVERSE] as const;

const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const defaultFollowUpLabel = (canonical: string): string =>
  canonical === GROUP_COMPLETION
    ? "Follow-up on MDA Completion"
    : canonical === GROUP_COMMODITIES
      ? "Follow-up on MDA Commodities / Communities"
      : "Follow-up on Adverse Reactions";

const makeFollowUpGroup = (canonical: string): FormGroup => ({
  id: uid("mda_followup_group"),
  name: canonical,
  label: defaultFollowUpLabel(canonical),
  questions: [],
});

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
  const { formId, formName, projectId, onClose } = props;
  const navigate = useNavigate();
  const { user, isOwner, isOwnerLevel, role } = useAuth();
  const { toast } = useToast();
  const [localGroups, setLocalGroups] = useState<FormGroup[]>(props.groups || []);
  const groups = localGroups;
  const canEditIcons = !!(isOwner || isOwnerLevel);

  // Admins (super/systems) must additionally be assigned to THIS project before the
  // follow-up linkage builder is exposed. Owner-level (Owner/Co-owner) always bypass.
  // Regular users never qualify regardless of assignment.
  const hasBuilderRole = canRoleBuildMdaFollowUps({ role, isOwnerLevel });
  const [assignedToProject, setAssignedToProject] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasBuilderRole) { setAssignedToProject(false); return; }
      if (isOwnerLevel) { setAssignedToProject(true); return; }
      if (!user?.id || !projectId) { setAssignedToProject(false); return; }
      const { data } = await supabase
        .from("user_project_assignments")
        .select("project_id")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .maybeSingle();
      if (!cancelled) setAssignedToProject(!!data);
    })();
    return () => { cancelled = true; };
  }, [hasBuilderRole, isOwnerLevel, user?.id, projectId]);
  const canBuildFollowUps = hasBuilderRole && assignedToProject;

  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<VisitedCommunity | null>(null);
  const [builderGroup, setBuilderGroup] = useState<FormGroup | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  useEffect(() => {
    setLocalGroups(props.groups || []);
  }, [props.groups]);

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
    (focusGroupNames?: string[], initialResponses?: Record<string, any>, groupsOverride?: FormGroup[]) => ({
      formId: props.formId,
      formName: props.formName,
      formDescription: props.formDescription,
      questions: props.questions,
      groups: groupsOverride ?? groups,
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
    [props, groups],
  );

  const checklistQuestions = useMemo<Question[]>(
    () => [
      ...groups.filter((g) => !isMdaFollowUpGroup(g)).flatMap((g) => g.questions),
      ...(props.questions || []),
    ],
    [groups, props.questions],
  );

  const followUpGroups = useMemo(() => groups.filter(isMdaFollowUpGroup), [groups]);
  const groupFor = (name: string) => followUpGroups.find((g) => getMdaFollowUpGroupName(g) === name) || null;

  const ensureFollowUpGroup = (canonical: string): FormGroup => {
    const existing = groupFor(canonical);
    if (existing) return existing;
    const created = makeFollowUpGroup(canonical);
    setLocalGroups((prev) => {
      if (prev.some((g) => getMdaFollowUpGroupName(g) === canonical || g.id === created.id)) return prev;
      return [...prev, created];
    });
    return created;
  };

  const openBuilder = (group: FormGroup | null) => {
    if (!group) return;
    if (!canBuildFollowUps) {
      // Surface an explicit access-denied state instead of silently bailing,
      // so unauthorized direct/bypass attempts get a clear message.
      setBuilderGroup(null);
      setBuilderOpen(true);
      return;
    }
    setBuilderGroup(group);
    setBuilderOpen(true);
  };


  const saveBuilderGroup = (updatedGroup: FormGroup) => {
    const previousGroups = groups;
    const exists = groups.some((g) => g.id === updatedGroup.id);
    const nextGroups = exists
      ? groups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g))
      : [...groups, updatedGroup];
    setLocalGroups(nextGroups);
    setBuilderGroup(updatedGroup);
    supabase
      .from("forms")
      .update({ questions: [...nextGroups, ...(props.questions || [])] as any })
      .eq("id", formId)
      .then(({ error }) => {
        if (error) {
          setLocalGroups(previousGroups);
          toast({
            title: "Could not save follow-up builder",
            description: error.message || "Please try again.",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Follow-up builder saved", description: "Questions, source options, and community rules were saved." });
      });
  };

  const builderLabelFor = (canonical: string | null) =>
    canonical === GROUP_COMPLETION
      ? "MDA Completion"
      : canonical === GROUP_COMMODITIES
        ? "MDA Commodities / Communities"
        : "Adverse Reactions";

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

  // "Community Checklist" = all groups except the standalone follow-up subforms,
  // PLUS an inline "Status of MDA" question so every user records the MDA status
  // at the main visit. This status drives which communities surface in the
  // "Follow-up on MDA Completion" module (anything not "Completed").
  const STATUS_OF_MDA_NAME = "status_of_mda";
  const communityFillerGroups = useMemo<FormGroup[]>(() => {
    const base = groups.filter((g) => !isMdaFollowUpGroup(g));
    // Don't duplicate if the checklist already asks for the MDA status.
    const alreadyHasStatus = base.some((g) =>
      (g.questions || []).some(
        (q) =>
          q.name === STATUS_OF_MDA_NAME ||
          /status of mda|current status of mda|completion status/i.test(String(q.label || "")),
      ),
    );
    if (alreadyHasStatus) return base;
    const statusGroup: FormGroup = {
      id: "mda_status_inline_group",
      name: "Status of MDA",
      label: "Status of MDA",
      questions: [
        {
          id: "status_of_mda_inline",
          type: "select_one",
          name: STATUS_OF_MDA_NAME,
          label: "Status of MDA",
          required: true,
          hint: "Select the current MDA status for this community. Anything other than 'Completed' will appear in the Follow-up on MDA Completion module.",
          options: [
            { id: "status_not_started", label: "Not Started", value: "Not Started" },
            { id: "status_ongoing", label: "Ongoing", value: "Ongoing" },
            { id: "status_halted", label: "Halted", value: "Halted" },
            { id: "status_completed", label: "Completed", value: "Completed" },
          ],
        },
      ],
    };
    return [...base, statusGroup];
  }, [groups]);

  const communityGroupNames = useMemo(
    () => communityFillerGroups.map((g) => g.name),
    [communityFillerGroups],
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
          if (q.linkedSourceValue && !responseHasOption(v, q.linkedSourceValue)) continue;
          if (v !== undefined && v !== null && String(v) !== "") base[q.name] = v;
        }
      }
    }
    return base;
  };

  const filterFor = (groupName: string) => groupByName.get(groupName)?.communityFilter;

  // Raw question tree (checklist + follow-up groups + ungrouped) used to
  // canonicalize submission data and resolve the "Status of MDA" and SAE
  // questions for the built-in follow-up eligibility rules.
  const allQuestionTree = useMemo(
    () => [...groups, ...(props.questions || [])],
    [groups, props.questions],
  );

  // Resolve the canonical keys of the Status-of-MDA and SAE-complaint questions
  // by tolerant label matching so the rules work across every project. We collect
  // ALL matches (checklist source AND follow-up destination) so a community
  // marked "Completed" at either the first visit or any follow-up is recognised.
  const followUpResolution = useMemo(() => {
    const flat = flattenQuestions(allQuestionTree as any);
    const matchAny = (label: string, pats: RegExp[]) => pats.some((p) => p.test(label));
    const statusPats = [/current status of mda/i, /status of mda/i, /mda.*complet/i, /completion status/i];
    const saePats = [/complain.*side effect/i, /side effects during mda/i, /anybody complain/i, /adverse reaction/i, /\bsae\b/i];
    // Always include the inline community-checklist status field so the status
    // captured at the main visit drives follow-up eligibility.
    const statusKeys: string[] = [STATUS_OF_MDA_NAME];
    const saeKeys: string[] = [];
    for (const q of flat) {
      const label = String(q.label || "");
      const key = String(q.key || "");
      if (!key) continue;
      if (matchAny(label, statusPats) && !statusKeys.includes(key)) statusKeys.push(key);
      if (matchAny(label, saePats) && !saeKeys.includes(key)) saeKeys.push(key);
    }
    return { statusKeys, saeKeys };
  }, [allQuestionTree]);



  const builderDialog = builderGroup && canBuildFollowUps ? (
    <FollowUpLinkEditor
      key={`mda-landing-builder-${builderGroup.id}`}
      open={builderOpen}
      onOpenChange={setBuilderOpen}
      group={builderGroup}
      checklistQuestions={checklistQuestions}
      onSave={saveBuilderGroup}
    />
  ) : builderOpen && !canBuildFollowUps ? (
    <BuilderAccessDenied onClose={() => { setBuilderOpen(false); setBuilderGroup(null); }} />
  ) : null;


  if (view === "community") {
    return <FormFiller {...fillerProps(communityGroupNames, undefined, communityFillerGroups)} />;
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
      <>
        <CommunityListView
          formId={formId}
          projectId={projectId}
          title="Household Coverage Survey"
          subtitle="Select a community to run the linked Coverage Evaluation 3D survey."
          onBack={() => setView("home")}
          onSelect={(c) => {
            // Prefill + lock the Coverage Evaluation 3D location from this visit.
            // Read every field straight from the raw submission `data` using a
            // comprehensive set of candidate keys so the State, LGA, Ward, FLHF,
            // Community and Settlement transfer accurately 100% of the time,
            // regardless of how the checklist questions were named. We deliberately
            // keep Community and Settlement distinct (no cross-fallback) so the two
            // identity fields are never confused with each other.
            try {
              const d = c.data || {};
              const coords = pickCoordinate(d, c.location);
              // Background pre-warm the CES satellite tiles for this community so
              // the Coverage Evaluation 3D map locks instantly when it opens.
              if (coords && Number.isFinite((coords as any).lat) && Number.isFinite((coords as any).lng)) {
                prewarmSatelliteAround((coords as any).lat, (coords as any).lng);
              }
              const url = buildCesLocationUrl({
                state: pick(d, ["state", "state_name", "admin_state", "state_of_residence"]),
                lga: pick(d, ["lga", "lga_name", "local_government", "lga_of_residence"]) || c.lga,
                ward: pick(d, ["ward", "ward_name"]) || c.ward,
                flhf_name:
                  pick(d, ["flhf_name", "flhf", "health_facility", "facility", "facility_name"]) ||
                  c.flhf,
                community_name: pick(d, ["community", "community_name"]) || c.community,
                settlement_name: pick(d, ["settlement", "settlement_name", "settlement_village"]),
                ...coords,
                projectId: projectId ?? "",
                formId,
                submissionId: c.id,
                source: "mda_community_list",
                ts: Date.now(),
              });
              window.dispatchEvent(new CustomEvent("amehnities:navigate-tab", { detail: { tab: "coverage-eval" } }));
              navigate(url, { replace: true });
              return;
            } catch { /* fall back to plain tab navigation */ }
            window.dispatchEvent(new CustomEvent("amehnities:navigate-tab", { detail: { tab: "coverage-eval" } }));
            navigate("/?tab=coverage-eval", { replace: true });
          }}

        />
        {builderDialog}
      </>
    );
  }
  if (view === "completion-list") {
    return (
      <>
        <CommunityListView
          formId={formId}
          projectId={projectId}
          title="Follow-up on MDA Completion"
          subtitle="Select a community to record the MDA completion follow-up."
          accent="completion"
          filterExpr={filterFor(GROUP_COMPLETION)}
          nameMap={checklistNameMap}
          questions={allQuestionTree}
          statusKeys={followUpResolution.statusKeys}
          excludeCompleted
          onConfigure={canBuildFollowUps ? () => openBuilder(ensureFollowUpGroup(GROUP_COMPLETION)) : undefined}
          onBack={() => setView("home")}
          onSelect={(c) => { setSelected(c); setView("completion"); }}
        />
        {builderDialog}
      </>
    );
  }
  if (view === "commodities-list") {
    return (
      <>
        <CommunityListView
          formId={formId}
          projectId={projectId}
          title="Follow-up on MDA Commodities / Communities"
          subtitle="Select a community to record commodity follow-up."
          accent="commodities"
          filterExpr={filterFor(GROUP_COMMODITIES)}
          nameMap={checklistNameMap}
          questions={allQuestionTree}
          statusKeys={followUpResolution.statusKeys}
          excludeCompleted
          onConfigure={canBuildFollowUps ? () => openBuilder(ensureFollowUpGroup(GROUP_COMMODITIES)) : undefined}
          onBack={() => setView("home")}
          onSelect={(c) => { setSelected(c); setView("commodities"); }}
        />
        {builderDialog}
      </>
    );
  }
  if (view === "adverse-list") {
    return (
      <>
        <CommunityListView
          formId={formId}
          projectId={projectId}
          title="Follow-up on Adverse Reactions"
          subtitle="Select a community to record adverse reaction follow-up."
          accent="adverse"
          filterExpr={filterFor(GROUP_ADVERSE)}
          nameMap={checklistNameMap}
          questions={allQuestionTree}
          saeKeys={followUpResolution.saeKeys}
          requireSae
          onConfigure={canBuildFollowUps ? () => openBuilder(ensureFollowUpGroup(GROUP_ADVERSE)) : undefined}
          onBack={() => setView("home")}
          onSelect={(c) => { setSelected(c); setView("adverse"); }}
        />
        {builderDialog}
      </>
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
        <section className="mb-7 overflow-hidden rounded-3xl border border-emerald-100 shadow-lg">
          <div className="relative">
            <img
              src={chwHero.url}
              alt="Community health worker engaging a mother and her children"
              className="h-40 w-full object-cover object-center sm:h-56"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-emerald-900/85 via-emerald-800/35 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
              <p className="text-lg font-extrabold leading-tight text-white drop-shadow sm:text-xl">
                Integrated MDA Supervisory Checklist
              </p>
              <p className="mt-1 text-xs font-medium text-emerald-50/95 sm:text-sm">
                Every Child Healthy. Every Future Bright.
              </p>
            </div>
          </div>
        </section>

        {canBuildFollowUps && (
          <section className="mb-7 overflow-hidden rounded-3xl bg-gradient-to-br from-[#4338ca] via-[#7c3aed] to-[#db2777] p-4 text-white shadow-lg">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/25">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-tight">Follow-up question & linkage builder</p>
                <p className="mt-1 text-xs leading-relaxed text-white/85">
                  Add follow-up questions, link them to Community Checklist response options, and set which visited communities appear in each follow-up list.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {BUILDER_TARGETS.map((canonical) => {
                const group = groupFor(canonical);
                const linked = !!group?.questions.some((q) => q.linkedSourceField && q.linkedSourceValue);
                return (
                  <button
                    key={canonical}
                    onClick={() => openBuilder(ensureFollowUpGroup(canonical))}
                    className="flex min-h-[4.25rem] flex-col items-start justify-between rounded-2xl bg-white/15 p-3 text-left ring-1 ring-white/20 transition hover:bg-white/22 active:scale-[0.99]"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <Link2 className="h-4 w-4" /> Build {builderLabelFor(canonical)}
                    </span>
                    <span className={`mt-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${linked ? "bg-emerald-100 text-emerald-700" : "bg-white/20 text-white"}`}>
                      {linked ? "linked" : group ? "needs link" : "add questions"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-x-6 gap-y-8">
          {TILES.map((t) => {
            const busy = uploadingKey === t.key;
            const hasCustom = !!iconUrls[t.key];
            return (
              <div key={t.key} className="relative flex flex-col items-center">
                <button
                  onClick={() => (editingIcons ? triggerUpload(t.key) : setView(t.view))}
                  disabled={busy}
                  className="group flex w-full flex-col items-center gap-3 rounded-3xl p-4 text-center transition-colors hover:bg-white/40"
                >
                  <span className="relative flex aspect-square w-full max-w-[9rem] items-center justify-center rounded-3xl transition-transform group-hover:scale-105 group-active:scale-95">
                    {busy ? (
                      <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
                    ) : (
                      <img
                        src={imgFor(t)}
                        alt={t.title}
                        loading="lazy"
                        className="h-full w-full object-contain drop-shadow-sm"
                      />
                    )}
                    {editingIcons && !busy && (
                      <span className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#5b6fc4] shadow-md">
                        <Upload className="h-4 w-4" />
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

      {builderDialog}
    </div>
  );
}

// Clear access-denied overlay for unauthorized attempts to open the follow-up
// builder (e.g. UI bypass / direct access). The DB guard also blocks any write.
function BuilderAccessDenied({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
          <ShieldAlert className="h-7 w-7 text-rose-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access denied</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          The Follow-up question &amp; linkage builder is restricted to Systems Admins,
          Super Admins, Owners, and Co-owners who are assigned to this project.
        </p>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}


function responseHasOption(response: any, optionValue: string): boolean {
  if (Array.isArray(response)) return response.map(String).includes(optionValue);
  return String(response ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .includes(optionValue);
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
  questions,
  statusKeys,
  saeKeys,
  excludeCompleted,
  requireSae,
  onConfigure,
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
  /** Raw question tree (groups + questions) for canonicalizing answers. */
  questions?: any[];
  /** Canonical key(s) of the "Status of MDA" question. */
  statusKeys?: string[];
  /** Canonical key(s) of the SAE-complaint question. */
  saeKeys?: string[];
  /** Hide communities whose latest Status of MDA is "Completed". */
  excludeCompleted?: boolean;
  /** Only show communities with a reported adverse reaction (SAE = Yes). */
  requireSae?: boolean;
  onConfigure?: () => void;
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
        // We tolerate an offline/failed server read: locally-saved (offline)
        // checklist entries are merged in below so household sampling and the
        // follow-up modules work fully offline, KoboCollect-style.
        let serverRows: any[] = [];
        try {
          const { data, error } = await supabase
            .from("form_submissions")
            .select("id, data, location, submitted_at")
            .eq("form_id", formId)
            .order("submitted_at", { ascending: false })
            .limit(2000);
          if (error) throw error;
          serverRows = data || [];
        } catch (netErr) {
          console.warn("Community list: server read unavailable, using local cache only", netErr);
          serverRows = [];
        }

        // Merge locally-saved checklist entries (draft / ready-to-send / sent)
        // for THIS form so anything captured offline is immediately available
        // for household sampling and follow-up filling, before it syncs.
        let localRows: any[] = [];
        try {
          const saved = await listAllSavedEntries();
          localRows = saved
            .filter((e) => e.formId === formId)
            .map((e) => ({
              id: e.submissionId || e.id,
              data: e.submissionData || e.responses || {},
              location: e.submissionLocation || e.gps || null,
              submitted_at: e.finalizedAt || e.sentAt || e.updatedAt || e.createdAt,
              __local: true,
            }));
        } catch (localErr) {
          console.warn("Community list: local saved entries unavailable", localErr);
        }

        // Local entries first (most authoritative for offline), then server
        // rows; the loop dedupes by community key and by id.
        const seenIds = new Set<string>();
        const data = [...localRows, ...serverRows]
          .filter((r) => {
            const id = String(r.id);
            if (seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
          })
          .sort((x, y) => String(y.submitted_at || "").localeCompare(String(x.submitted_at || "")));


        const norm = (v: any) => String(Array.isArray(v) ? v.join(" ") : v ?? "").trim().toLowerCase();
        const firstVal = (d: Record<string, any>, keys?: string[]) => {
          for (const k of keys || []) {
            const v = d[k];
            if (v !== undefined && v !== null && String(v).trim() !== "") return v;
          }
          return undefined;
        };
        const isCompleted = (v: any) => norm(v).includes("complet");

        const seen = new Set<string>();
        const out: VisitedCommunity[] = [];
        // Latest (most-recent-first) status / SAE per community across ALL its
        // submissions (checklist + follow-up), so eligibility reflects reality.
        const statusByKey = new Map<string, any>();
        const saeByKey = new Map<string, any>();

        for (const s of data || []) {
          const raw = (s.data as Record<string, any>) || {};
          // Canonicalize so answers stored under regenerated ids / names resolve.
          const d = questions ? canonicalizeSubmissionData(raw, questions) : raw;

          const community = pick(d, ["community", "community_name", "settlement", "settlement_name"]);
          const lga = pick(d, ["lga"]);
          const ward = pick(d, ["ward"]);
          const flhf = pick(d, ["flhf_name", "flhf", "health_facility"]);
          if (!community && !lga && !ward) continue;
          const key = `${lga}|${ward}|${flhf}|${community}`.toLowerCase();

          // Track latest status / SAE for the community (desc order ⇒ first wins).
          if (!statusByKey.has(key)) {
            const sv = firstVal(d, statusKeys);
            if (sv !== undefined) statusByKey.set(key, sv);
          }
          if (!saeByKey.has(key)) {
            const sae = firstVal(d, saeKeys);
            if (sae !== undefined) saeByKey.set(key, sae);
          }

          // Admin-defined appearance condition, evaluated against canonical data.
          if (filterExpr) {
            const identityMap: NameToIdMap = { ...(nameMap || {}) };
            for (const k of Object.keys(d)) identityMap[k] = k;
            if (!evaluateRelevant(filterExpr, d, identityMap)) continue;
          }

          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ id: s.id, lga, ward, flhf, community, data: d, location: (s as any).location ?? null });
        }

        // Built-in eligibility rules:
        //  • Completion / Commodities: drop communities already Completed.
        //  • Adverse Reactions: keep only communities with a reported SAE
        //    (this includes Completed ones that still have adverse reactions).
        let result = out;
        if (excludeCompleted) {
          result = result.filter((r) => {
            const key = `${r.lga}|${r.ward}|${r.flhf}|${r.community}`.toLowerCase();
            return !isCompleted(statusByKey.get(key));
          });
        }
        if (requireSae) {
          result = result.filter((r) => {
            const key = `${r.lga}|${r.ward}|${r.flhf}|${r.community}`.toLowerCase();
            return isYes(saeByKey.get(key));
          });
        }

        if (active) setRows(result);
      } catch (e) {
        console.error("Community list load error", e);
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [formId, projectId, filterExpr, nameMap, questions, statusKeys, saeKeys, excludeCompleted, requireSae]);

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
        {onConfigure && (
          <button
            onClick={onConfigure}
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold transition hover:bg-white/30"
          >
            <Link2 className="h-3.5 w-3.5" /> Build
          </button>
        )}
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

