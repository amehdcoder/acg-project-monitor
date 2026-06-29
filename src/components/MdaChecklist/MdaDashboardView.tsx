import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, ChevronUp, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useDataAnalytics, type SubmissionRecord } from "@/hooks/useDataAnalytics";
import { clearMdaCache, loadMdaCache, saveMdaCache, isOffline } from "@/lib/mda/offlineCache";
import { canonicalizeSubmissionData } from "@/lib/mda/dashboardData";
import MdaSupervisoryChecklistDashboard from "./MdaSupervisoryChecklistDashboard";
import OwnerSubmissionManager, { type OwnerDataMutation } from "@/components/owner/OwnerSubmissionManager";

interface MdaDashboardForm {
  id: string;
  name: string;
  description?: string | null;
  project_id?: string | null;
  questions?: unknown[];
  groups?: unknown[];
  settings?: unknown;
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

function readGps(data: Record<string, unknown> | undefined): { latitude: number; longitude: number } | null {
  if (!data) return null;
  for (const value of Object.values(data)) {
    if (value && typeof value === "object") {
      const point = value as Record<string, unknown>;
      const lat = Number(point.latitude ?? point.lat);
      const lng = Number(point.longitude ?? point.lng ?? point.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { latitude: lat, longitude: lng };
    }
    if (typeof value === "string") {
      const match = value.match(/(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/);
      if (match) {
        const latitude = Number(match[1]);
        const longitude = Number(match[2]);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
      }
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
    location: readGps(data),
    data,
  };
}

export default function MdaDashboardView({ form, projects = [], onClose, embedded = false }: Props) {
  const { isOwner } = useAuth();
  const { submissions, loading, loadFailed, refresh } = useDataAnalytics({ formId: form.id });
  const [refreshing, setRefreshing] = useState(false);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [optimisticallyHiddenIds, setOptimisticallyHiddenIds] = useState<Set<string>>(new Set());
  const [optimisticallyEmpty, setOptimisticallyEmpty] = useState(false);

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
    () => submissions.map((s) => toMdaSubmission(s, form, questions)),
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
  // Use cached data only while offline; online zero rows must render a true empty state after deletion.
  const useCacheNow = hasCache && submissions.length === 0 && isOffline();

  const dashboardRows = useCacheNow ? cached!.rows : visibleRealRows;
  const dashboardQuestions = useCacheNow ? cached!.questions : questions;
  const projectName = projects.find((p) => p.id === form.project_id)?.name;
  const showLoader = loading && !useCacheNow;
  const handleDataChanged = async () => {
    clearMdaCache(form.id);
    setCacheVersion((v) => v + 1);
    await refresh();
    setOptimisticallyHiddenIds(new Set());
    setOptimisticallyEmpty(false);
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

            {isOwner && (
              <OwnerSubmissionManager
                table="form_submissions"
                title="MDA checklist submissions"
                labelColumns={["data.state", "data.lga", "status"]}
                filter={{ column: "form_id", value: form.id }}
                onMutation={handleOwnerMutation}
                onChanged={handleDataChanged}
              />
            )}
          </div>
        </div>
      </div>

      <main className={`space-y-6 px-4 py-6 ${embedded ? "" : "container mx-auto"}`}>


        {useCacheNow && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              <strong>Offline:</strong> showing the last synced checklist data
              {cached?.cachedAt ? ` (cached ${new Date(cached.cachedAt).toLocaleString()})` : ""}. It will refresh once you reconnect.
            </span>
          </div>
        )}

        {showLoader ? (
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
          />
        )}
      </main>
    </div>
  );
}