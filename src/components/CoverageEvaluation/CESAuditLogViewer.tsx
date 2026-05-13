import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ClipboardList, RefreshCw, Search, Filter, MapPin, Smartphone,
  User, Clock, ChevronDown, ChevronUp, Wifi, WifiOff,
  Lock, CheckCircle2, Home, BarChart3, Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  syncCESOfflineQueue, getPendingCount,
} from "@/lib/ces/offlineHouseholds";

interface AuditEntry {
  id: string;
  survey_id: string;
  actor_id: string | null;
  action: string;
  payload: any;
  lat: number | null;
  lng: number | null;
  device_id: string | null;
  created_at: string;
  actor_email?: string;
}

const ACTION_META: Record<string, { label: string; icon: typeof Home; color: string }> = {
  household_added:       { label: "Household Added",       icon: Home,        color: "text-green-600" },
  supervisor_qc_lock:    { label: "Survey Locked (QC)",    icon: Lock,        color: "text-blue-600"  },
  build_segments:        { label: "Segments Built",        icon: BarChart3,   color: "text-purple-600"},
  household_mopup:       { label: "Mop-Up Completed",      icon: CheckCircle2,color: "text-teal-600"  },
  survey_created:        { label: "Survey Created",        icon: ClipboardList,color: "text-slate-600"},
  validation_submitted:  { label: "Validator Submitted",   icon: Settings,    color: "text-orange-600"},
};

function ActionIcon({ action }: { action: string }) {
  const meta = ACTION_META[action];
  if (!meta) return <ClipboardList className="h-4 w-4 text-muted-foreground" />;
  const Icon = meta.icon;
  return <Icon className={`h-4 w-4 ${meta.color}`} />;
}

interface CESAuditLogViewerProps {
  /** If provided, pre-filter to this survey; otherwise show cross-survey selector */
  surveyId?: string;
}

export default function CESAuditLogViewer({ surveyId: propSurveyId }: CESAuditLogViewerProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Survey list for selector
  const [surveys, setSurveys] = useState<any[]>([]);
  const [selectedSurvey, setSelectedSurvey] = useState<string>(propSurveyId ?? "all");

  // Log data (server-paginated; only one page in memory at a time)
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [filterAction, setFilterAction] = useState("all");

  // ─── Online status ────────────────────────────────────────────────────────
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ─── Pending offline count ────────────────────────────────────────────────
  const refreshPendingCount = useCallback(async () => {
    setPendingOffline(await getPendingCount());
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  // ─── Survey selector load ─────────────────────────────────────────────────
  useEffect(() => {
    if (propSurveyId) return; // No need when pre-filtered
    supabase.from("ces_surveys" as any)
      .select("id, community_name, state, lga, created_at, status")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setSurveys(data ?? []));
  }, [propSurveyId]);

  // Reset to page 1 when filters change so the user always sees the newest matches
  useEffect(() => { setPage(1); }, [propSurveyId, selectedSurvey, filterAction]);

  // ─── Load audit logs (server-paginated) ──────────────────────────────────
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase.from("ces_audit_log" as any)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      const effectiveSurvey = propSurveyId ?? (selectedSurvey !== "all" ? selectedSurvey : null);
      if (effectiveSurvey) query = query.eq("survey_id", effectiveSurvey);
      if (filterAction !== "all") query = query.eq("action", filterAction);

      const { data, error, count } = await query;
      if (error) throw error;
      setLogs((data as any) ?? []);
      setTotalCount(count ?? 0);
    } catch (e: any) {
      console.error("Audit log load error:", e);
    } finally {
      setLoading(false);
    }
  }, [propSurveyId, selectedSurvey, filterAction, page, pageSize]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // ─── Manual sync trigger ──────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    setSyncing(true);
    await syncCESOfflineQueue();
    await refreshPendingCount();
    await loadLogs();
    setSyncing(false);
  }, [refreshPendingCount, loadLogs]);

  // ─── Filter ───────────────────────────────────────────────────────────────
  const filtered = logs.filter(log => {
    const matchAction = filterAction === "all" || log.action === filterAction;
    const matchSearch = !searchText ||
      log.action.includes(searchText.toLowerCase()) ||
      (log.device_id ?? "").toLowerCase().includes(searchText.toLowerCase()) ||
      (log.actor_id ?? "").toLowerCase().includes(searchText.toLowerCase()) ||
      JSON.stringify(log.payload).toLowerCase().includes(searchText.toLowerCase());
    return matchAction && matchSearch;
  });

  const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-5 w-5 text-primary" />
                CES Audit Log
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Immutable record of all field actions — who, what, when, and from which device.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Online indicator */}
              <Badge
                variant={isOnline ? "default" : "destructive"}
                className={`gap-1 ${isOnline ? "bg-green-600" : ""}`}
              >
                {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {isOnline ? "Online" : "Offline"}
              </Badge>

              {/* Pending offline count */}
              {pendingOffline > 0 && (
                <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700 dark:text-amber-300">
                  <Smartphone className="h-3 w-3" />
                  {pendingOffline} pending sync
                </Badge>
              )}

              {/* Sync button */}
              {isOnline && pendingOffline > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncing}
                  className="gap-1 text-xs"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing…" : "Sync Now"}
                </Button>
              )}

              <Button size="sm" variant="ghost" onClick={loadLogs} disabled={loading} className="gap-1 text-xs">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Offline banner */}
      {!isOnline && (
        <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
          <WifiOff className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
            You are offline. Household visits are being saved locally.
            {pendingOffline > 0 && ` ${pendingOffline} visit${pendingOffline > 1 ? "s" : ""} will sync when you reconnect.`}
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card className="border-border/40">
        <CardContent className="p-3 flex flex-col sm:flex-row gap-2">
          {/* Survey selector (only when not pre-filtered) */}
          {!propSurveyId && (
            <Select value={selectedSurvey} onValueChange={setSelectedSurvey}>
              <SelectTrigger className="w-full sm:w-64 h-8 text-xs">
                <SelectValue placeholder="All surveys" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Surveys</SelectItem>
                {surveys.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.community_name || "Unknown"} — {s.lga} ({new Date(s.created_at).toLocaleDateString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Action filter */}
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-full sm:w-48 h-8 text-xs">
              <Filter className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {uniqueActions.map(a => (
                <SelectItem key={a} value={a}>{ACTION_META[a]?.label ?? a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Text search */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by action, device, user…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total Events", value: totalCount.toLocaleString() },
          { label: "On This Page", value: filtered.length },
          { label: "Pending Sync", value: pendingOffline },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-lg border border-border p-2 text-center">
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
            <div className="text-lg font-bold text-foreground">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Log list */}
      <Card className="border-border/40">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading audit log…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm text-muted-foreground">No audit events found.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {filtered.map((log) => {
                const meta = ACTION_META[log.action];
                const isExp = expanded === log.id;
                const ts = new Date(log.created_at);
                return (
                  <div key={log.id} className="p-3 hover:bg-muted/30 transition-colors">
                    <button
                      className="w-full text-left"
                      onClick={() => setExpanded(isExp ? null : log.id)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="mt-0.5 p-1.5 rounded-md bg-muted/50 shrink-0">
                          <ActionIcon action={log.action} />
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">
                              {meta?.label ?? log.action.replace(/_/g, " ")}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">
                                {ts.toLocaleDateString()} {ts.toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {log.actor_id && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                                <User className="h-2.5 w-2.5" />
                                {log.actor_id.slice(0, 8)}…
                              </span>
                            )}
                            {log.device_id && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                                <Smartphone className="h-2.5 w-2.5" />
                                {log.device_id.slice(0, 12)}
                              </span>
                            )}
                            {log.lat != null && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                                <MapPin className="h-2.5 w-2.5" />
                                {log.lat.toFixed(4)}, {log.lng?.toFixed(4)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expand chevron */}
                        <div className="shrink-0 text-muted-foreground">
                          {isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </button>

                    {/* Expanded payload */}
                    {isExp && (
                      <div className="mt-2 ml-9 rounded-md bg-slate-900 dark:bg-slate-950 p-3 overflow-x-auto">
                        <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap break-all">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                        {log.survey_id && (
                          <div className="mt-2 text-[9px] text-slate-500 font-mono">
                            survey_id: {log.survey_id}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        {/* Server-side pagination footer */}
        {!loading && totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-border/40 text-xs">
            <div className="text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount.toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-7 w-[88px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 200].map(n => (
                    <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
                Prev
              </Button>
              <span className="text-muted-foreground">
                Page {page} / {Math.max(1, Math.ceil(totalCount / pageSize))}
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => setPage(p => p + 1)}
                disabled={page * pageSize >= totalCount || loading}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
