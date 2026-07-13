import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, ChevronUp, Loader2, RefreshCw, WifiOff, UserPlus, Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";
import DashboardAccessManager from "@/components/dashboard/DashboardAccessManager";
import DashboardShareManager from "@/components/dashboard/DashboardShareManager";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useDataAnalytics, type SubmissionRecord } from "@/hooks/useDataAnalytics";
import { clearLegacyMdaCache, clearMdaCache, loadMdaCache, saveMdaCache, isOffline } from "@/lib/mda/offlineCache";
import { canonicalizeSubmissionData } from "@/lib/mda/dashboardData";
import { isDashboardPublished, type MdaCopySettings } from "@/lib/mda/copyChecklist";
import MdaSupervisoryChecklistDashboard from "./MdaSupervisoryChecklistDashboard";
import OwnerSubmissionManager, { type OwnerDataMutation } from "@/components/owner/OwnerSubmissionManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


interface MdaDashboardForm {
  id: string;
  name: string;
  description?: string | null;
  project_id?: string | null;
  questions?: unknown[];
  groups?: unknown[];
  settings?: unknown;
  status?: string | null;
}

interface DashboardOption {
  id?: string;
  label: string;
  value: string;
}

interface DashboardQuestion {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  options?: DashboardOption[];
  questions?: DashboardQuestion[];
  [key: string]: unknown;
}

interface ProjectLite {
  id: string;
  name: string;
}

interface Props {
  form: MdaDashboardForm;
  projects?: ProjectLite[];
  onClose: () => void;
  /** When true, render inline (no full-screen wrapper / sticky header). */
  embedded?: boolean;
}



const norm = (v: unknown) => String(v ?? "").trim();

function pick(data: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!data) return null;
  const entries = Object.entries(data);
  for (const wanted of keys) {
    const exact = entries.find(([k, v]) => k.toLowerCase() === wanted.toLowerCase() && norm(v));
    if (exact) return norm(exact[1]);
  }
  for (const wanted of keys) {
    const partial = entries.find(([k, v]) => k.toLowerCase().includes(wanted.toLowerCase()) && norm(v));
    if (partial) return norm(partial[1]);
  }
  return null;
}

// Valid on-Earth coordinate. We deliberately reject the (0,0) null-island pair
// which is a common "empty GPS" sentinel that would otherwise plot in the Gulf
// of Guinea, far from any Nigerian LGA.
function isValidLatLng(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

// Pull a {lat,lng} pair out of a single value that may be an object
// ({lat,lng} | {latitude,longitude}) or a "lat,lng" / "lat lng" string.
// Coordinates are sanitized: numbers are coerced from strings, and if a pair
// is out of range but swaps into range (lng in the lat slot, common with
// mis-ordered captures) we auto-correct it so the point still plots.
function coerceLatLng(value: unknown): { latitude: number; longitude: number } | null {
  if (value && typeof value === "object") {
    const p = value as Record<string, unknown>;
    const lat = Number(p.latitude ?? p.lat);
    const lng = Number(p.longitude ?? p.lng ?? p.lon ?? p.long);
    if (isValidLatLng(lat, lng)) return { latitude: lat, longitude: lng };
    // Auto-correct an obvious lat/lng swap.
    if (isValidLatLng(lng, lat)) return { latitude: lng, longitude: lat };
    return null;
  }
  if (typeof value === "string") {
    const m = value.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (isValidLatLng(lat, lng)) return { latitude: lat, longitude: lng };
      if (isValidLatLng(lng, lat)) return { latitude: lng, longitude: lat };
    }
  }
  return null;
}

// Robust GPS extraction. We check the KNOWN GPS-carrying fields first (in
// priority order) so a stray numeric string elsewhere in the submission can
// never be mistaken for coordinates — the previous "scan every value" approach
// could grab garbage and cause valid captures (e.g. some Babura submissions)
// to silently drop. Only if none of the explicit fields yield a valid pair do
// we fall back to a best-effort scan of the remaining values.
function readGps(data: Record<string, unknown> | undefined): { latitude: number; longitude: number } | null {
  if (!data) return null;

  // 1) Explicit paired lat/lng scalar fields captured by the form.
  const latScalar = Number(data.community_latitude ?? data.latitude ?? data.lat ?? data.gps_latitude);
  const lngScalar = Number(data.community_longitude ?? data.longitude ?? data.lng ?? data.gps_longitude);
  if (isValidLatLng(latScalar, lngScalar)) return { latitude: latScalar, longitude: lngScalar };
  if (isValidLatLng(lngScalar, latScalar)) return { latitude: lngScalar, longitude: latScalar };

  // 2) Well-known GPS object fields, in priority order.
  const preferredKeys = ["community_gps", "gps", "geolocation", "geopoint", "location", "coordinates"];
  for (const key of preferredKeys) {
    const found = coerceLatLng(data[key]);
    if (found) return found;
  }

  // 3) Any GPS-question object (Special Form Studio uses q_*_* keys whose value
  //    is a {lat,lng,accuracy,...} object).
  for (const [k, value] of Object.entries(data)) {
    if (/^q[_-]/i.test(k)) {
      const found = coerceLatLng(value);
      if (found) return found;
    }
  }

  // 4) form_metadata.auto_gps captured automatically in the background.
  const meta = data.form_metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta === "object") {
    const autoGps = coerceLatLng(meta.auto_gps);
    if (autoGps) return autoGps;
  }

  // 5) Last-resort scan of remaining OBJECT values (never raw strings, which
  //    caused false positives) so we don't regress unexpected key layouts.
  for (const value of Object.values(data)) {
    if (value && typeof value === "object") {
      const found = coerceLatLng(value);
      if (found) return found;
    }
  }
  return null;
}

function flattenQuestions(items: DashboardQuestion[]): DashboardQuestion[] {
  const out: DashboardQuestion[] = [];
  for (const item of items || []) {
    if (Array.isArray(item?.questions)) out.push(...flattenQuestions(item.questions));
    else if (item) out.push(item);
  }
  return out;
}

function normalizeQuestions(items: unknown[]): DashboardQuestion[] {
  return (items || [])
    .map((item, idx) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = String(row.id || row.name || `question_${idx}`);
      const nested = Array.isArray(row.questions) ? normalizeQuestions(row.questions) : undefined;
      const options = Array.isArray(row.options)
        ? row.options
            .map((opt, optIdx) => {
              if (!opt || typeof opt !== "object") return null;
              const option = opt as Record<string, unknown>;
              const label = String(option.label || option.value || `Option ${optIdx + 1}`);
              const value = String(option.value || option.label || label);
              return { ...option, id: option.id ? String(option.id) : undefined, label, value } as DashboardOption;
            })
            .filter((opt): opt is DashboardOption => !!opt)
        : undefined;
      return {
        ...row,
        id,
        name: row.name ? String(row.name) : undefined,
        label: row.label ? String(row.label) : undefined,
        type: row.type ? String(row.type) : undefined,
        questions: nested,
        options,
      } as DashboardQuestion;
    })
    .filter((item): item is DashboardQuestion => !!item);
}



function toMdaSubmission(s: SubmissionRecord, form: MdaDashboardForm, questions: DashboardQuestion[]) {
  // Re-key answers to canonical question keys so historical / re-keyed
  // submissions still resolve against the current form definition.
  const data = canonicalizeSubmissionData(s.data || {}, questions as any);
  return {
    id: s.id,
    projectId: form.project_id || undefined,
    state: pick(data, ["state", "state_name"]) || s.state,
    lga: pick(data, ["lga", "local_government", "local_government_area"]),
    ward: pick(data, ["ward", "ward_name"]),
    submitter: s.submitter_name || "Unknown",
    submittedAt: s.submitted_at,
    status: s.status,
    location: readGps((s as any).raw_location) || readGps(data),
    data,
  };
}

export default function MdaDashboardView({ form, projects = [], onClose, embedded = false }: Props) {
  const { isOwner, isAdmin, isOwnerLevel, isSuperAdmin } = useAuth();
  const canManageAccess = isAdmin || isOwnerLevel;
  const canManageLifecycle = isAdmin || isOwnerLevel;
  const canShare = !!isSuperAdmin || isOwnerLevel;
  const [showShare, setShowShare] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const { submissions, loading, loadFailed, refresh } = useDataAnalytics({ formId: form.id });
  const [refreshing, setRefreshing] = useState(false);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [optimisticallyHiddenIds, setOptimisticallyHiddenIds] = useState<Set<string>>(new Set());
  const [optimisticallyEmpty, setOptimisticallyEmpty] = useState(false);

  // ── Dashboard publish / checklist finalize lifecycle ──
  const formSettings = (form.settings ?? {}) as MdaCopySettings;
  const [published, setPublished] = useState(isDashboardPublished(formSettings));
  const [finalized, setFinalized] = useState(String((form as any).status ?? "") === "published");
  const [savingLifecycle, setSavingLifecycle] = useState(false);

  useEffect(() => {
    setPublished(isDashboardPublished((form.settings ?? {}) as MdaCopySettings));
    setFinalized(String((form as any).status ?? "") === "published");
    clearLegacyMdaCache(form.id);
  }, [form]);

  const togglePublish = async () => {
    const next = !published;
    setSavingLifecycle(true);
    try {
      const merged = { ...((form.settings ?? {}) as MdaCopySettings), dashboardPublished: next };
      const { error } = await supabase.from("forms").update({ settings: merged as any }).eq("id", form.id);
      if (error) throw error;
      (form as any).settings = merged;
      setPublished(next);
      toast.success(next ? "Dashboard published — members can now view it." : "Dashboard unpublished — hidden from members.");
    } catch (e: any) {
      toast.error(e?.message || "Could not update the dashboard.");
    } finally {
      setSavingLifecycle(false);
    }
  };

  const finalizeChecklist = async () => {
    setSavingLifecycle(true);
    try {
      const { error } = await supabase.from("forms").update({ status: "published" }).eq("id", form.id);
      if (error) throw error;
      (form as any).status = "published";
      setFinalized(true);
      toast.success("Checklist finalized — field users can now fill it.");
    } catch (e: any) {
      toast.error(e?.message || "Could not finalize the checklist.");
    } finally {
      setSavingLifecycle(false);
    }
  };


  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const questions = useMemo(
    () => normalizeQuestions([...(form.groups || []), ...(form.questions || [])]),
    [form.groups, form.questions],
  );

  const realRows = useMemo(
    // Drop submissions without an LGA / Area Council — these surface as an
    // unactionable "Unspecified" row and must never reach the dashboard.
    () =>
      submissions
        .map((s) => toMdaSubmission(s, form, questions))
        .filter((r) => String(r.lga || "").trim() !== ""),
    [submissions, form, questions],
  );

  const visibleRealRows = useMemo(() => {
    if (optimisticallyEmpty) return [];
    if (!optimisticallyHiddenIds.size) return realRows;
    return realRows.filter((row) => !optimisticallyHiddenIds.has(row.id));
  }, [realRows, optimisticallyHiddenIds, optimisticallyEmpty]);

  // ── Offline cache: keep the last synced rows + questions per form ──
  const cached = useMemo(() => loadMdaCache(form.id), [form.id, cacheVersion]);
  useEffect(() => {
    if (!loading && submissions.length > 0) {
      saveMdaCache(form.id, visibleRealRows, questions);
    }
  }, [loading, submissions.length, visibleRealRows, questions, form.id]);

  const hasCache = !!cached && cached.rows.length > 0;
  const liveHasData = submissions.length > 0;
  // Cache-first hydration: render the last synced checklist rows INSTANTLY while
  // the live fetch is still in flight, or whenever the live fetch failed. This
  // guarantees the dashboard never flashes a spinner or a false "No submissions"
  // message because of RLS latency or a slow/flaky network. As soon as the live
  // query resolves with rows we swap to the fresh data.
  const useCacheNow = hasCache && !liveHasData && (loading || loadFailed);
  // Distinguish a true offline/failed state from a normal cache-first warm-up so
  // the banner copy stays accurate.
  const cacheIsStale = useCacheNow && (loadFailed || isOffline());

  const dashboardRows = useCacheNow ? cached!.rows : visibleRealRows;
  const dashboardQuestions = useCacheNow ? cached!.questions : questions;
  const projectName = projects.find((p) => p.id === form.project_id)?.name;
  // Only block on the loader when there is genuinely nothing to show yet.
  const showLoader = loading && !useCacheNow && !hasCache;

  const handleDataChanged = async () => {
    clearMdaCache(form.id);
    setCacheVersion((v) => v + 1);
    await refresh();
    setOptimisticallyHiddenIds(new Set());
    setOptimisticallyEmpty(false);
  };

  // Cascade-delete the Coverage Evaluation 3D (CES) data that was captured for
  // the same communities so deleting MDA submissions clears EVERYTHING tied to
  // those communities (household visits, segments, the coverage map, etc.).
  const cascadeCesDelete = async (communities: string[] | null) => {
    if (!form.project_id) return;
    try {
      await (supabase as any).rpc("owner_cascade_delete_ces", {
        _project_id: form.project_id,
        _communities: communities,
      });
    } catch (e) {
      console.error("CES cascade delete failed", e);
      toast.error("MDA data deleted, but linked Coverage Evaluation 3D data could not be cleared.");
    }
  };

  const handleOwnerMutation = (mutation: OwnerDataMutation) => {
    clearMdaCache(form.id);
    setCacheVersion((v) => v + 1);
    if (mutation.type === "ids" && mutation.ids?.length) {
      setOptimisticallyHiddenIds((prev) => {
        const next = new Set(prev);
        mutation.ids?.forEach((id) => next.add(id));
        return next;
      });
    }
    const isCurrentFormBulkClear =
      mutation.type === "bulk" &&
      mutation.filter?.column === "form_id" &&
      mutation.filter.value === form.id &&
      !mutation.from &&
      !mutation.to;
    if (isCurrentFormBulkClear) setOptimisticallyEmpty(true);

    // Only cascade on permanent deletes, never on archive.
    if (mutation.mode === "permanent") {
      if (isCurrentFormBulkClear) {
        void cascadeCesDelete(null); // full project clear
      } else if (mutation.type === "ids" && mutation.ids?.length) {
        const idSet = new Set(mutation.ids);
        const communities = realRows
          .filter((r) => idSet.has(r.id))
          .map((r) => norm(pick(r.data as Record<string, unknown>, ["community", "community_name", "settlement", "settlement_name"])).toLowerCase())
          .filter((c) => c.length > 0);
        if (communities.length) void cascadeCesDelete(Array.from(new Set(communities)));
      }
    }
  };


  return (
    <div
      className={embedded ? "overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm" : "min-h-screen bg-background"}
      data-mda-scroll
    >
      <div className={embedded ? "border-b bg-card/95" : "sticky top-0 z-20 border-b bg-card/95 backdrop-blur"}>
        <div className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${embedded ? "" : "container mx-auto"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={embedded ? "Collapse dashboard" : "Back to Forms"}>
              {embedded ? <ChevronUp className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-bold text-foreground">Integrated MDA Supervisory Dashboard</h1>
              <p className="truncate text-sm text-muted-foreground">{form.name}{projectName ? ` · ${projectName}` : ""}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {refreshing ? "Refreshing" : "Refresh"}
            </Button>

            {canManageLifecycle && !finalized && (
              <Button
                variant="outline"
                size="sm"
                onClick={finalizeChecklist}
                disabled={savingLifecycle}
                className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Finalize checklist
              </Button>
            )}

            {canManageLifecycle && (
              <Button
                variant={published ? "outline" : "default"}
                size="sm"
                onClick={togglePublish}
                disabled={savingLifecycle}
                className="gap-1.5"
              >
                {savingLifecycle ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : published ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {published ? "Unpublish dashboard" : "Publish dashboard"}
              </Button>
            )}

            {canManageAccess && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAccess(true)}
                className="gap-1.5"
              >
                <UserPlus className="h-4 w-4" /> Grant access
              </Button>
            )}

            {canShare && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowShare(true)}
                className="gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
              >
                <Share2 className="h-4 w-4" /> Share &amp; permissions
              </Button>
            )}


            {isOwner && (
              <OwnerSubmissionManager
                table="form_submissions"
                title="MDA checklist submissions"
                labelColumns={["data.state", "data.lga", "data.ward", "data.flhf_name", "data.community_name"]}
                filter={{ column: "form_id", value: form.id }}
                onMutation={handleOwnerMutation}
                onChanged={handleDataChanged}
              />
            )}
          </div>
        </div>
        {canManageAccess && (
          <DashboardAccessManager open={showAccess} onOpenChange={setShowAccess} dashboardId="mda_supervisory" projectId={form.project_id} />
        )}
        {canShare && (
          <DashboardShareManager
            open={showShare}
            onOpenChange={setShowShare}
            dashboardId="mda_supervisory"
            dashboardName="Integrated MDA Supervisory Dashboard"
            projectId={form.project_id}
            form={{
              id: form.id,
              name: form.name,
              snapshot: {
                id: form.id,
                name: form.name,
                questions: form.questions ?? [],
                groups: form.groups ?? [],
                settings: form.settings ?? {},
                status: (form as any).status ?? "published",
              },
            }}
          />
        )}

      </div>

      <main className={`space-y-6 px-4 py-6 ${embedded ? "" : "container mx-auto"}`}>


        {!published && canManageLifecycle && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <EyeOff className="h-4 w-4 shrink-0" />
            <span>
              <strong>Unpublished:</strong> only admins & owners can see this dashboard.
              Use <em>Publish dashboard</em> to make it visible to members.
            </span>
          </div>
        )}

        {useCacheNow && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-primary">
            {cacheIsStale ? <WifiOff className="h-4 w-4 shrink-0" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
            <span>
              {cacheIsStale ? (
                <>
                  <strong>Offline:</strong> showing the last synced checklist data
                  {cached?.cachedAt ? ` (cached ${new Date(cached.cachedAt).toLocaleString()})` : ""}. It will refresh once you reconnect.
                </>
              ) : (
                <>
                  <strong>Loaded instantly</strong> from your last synced data — refreshing with the latest checklist submissions…
                </>
              )}
            </span>
          </div>
        )}


        {!published && !canManageLifecycle ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <Lock className="h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">Dashboard not yet published</p>
              <p className="text-xs">An administrator will publish this dashboard when it's ready.</p>
            </CardContent>
          </Card>
        ) : showLoader ? (
          <Card className="border-dashed">
            <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading MDA dashboard data…
            </CardContent>
          </Card>
        ) : (
          <MdaSupervisoryChecklistDashboard
            submissions={dashboardRows}
            questions={dashboardQuestions}
            formName={form.name}
            projectName={projectName}
            projectId={form.project_id || null}
            offline={useCacheNow}
            onDataChanged={refresh}
          />
        )}
      </main>
    </div>

  );
}