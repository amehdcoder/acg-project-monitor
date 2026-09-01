import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList, Database, GitCompareArrows, Globe2, LayoutDashboard, Loader2, Lock, Plus, Radio, Server, Settings2, ShieldCheck, Trash2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import KoboSyncDialog from "./KoboSyncDialog";
import KoboSyncStatus from "./KoboSyncStatus";
import ChecklistAccessManager from "./ChecklistAccessManager";

/* Heavy dashboards are code-split so the page shell paints immediately and each
   tab only downloads/executes its own bundle when it is first opened. */
const SupervisoryDashboardView = lazyWithRetry(() => import("./SupervisoryDashboardView"));
const ChecklistDashboard = lazyWithRetry(() => import("./ChecklistDashboard"));
const RawKoboDataTabs = lazyWithRetry(() => import("./RawKoboDataTabs"));
const MedicineAccountabilityDashboard = lazyWithRetry(() => import("./MedicineAccountabilityDashboard"));

const TabFallback = () => (
  <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/30 py-16 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
  </div>
);

import {
  deleteConnection, fetchSubmissions, getActiveConnectionId, listConnections, loadKoboCache,
  loadKoboConfig, setActiveConnectionId, type KoboCache, type KoboConnection,
} from "./koboClient";
import { useChecklistPermissions } from "@/hooks/useChecklistPermissions";
import { useRealtimeKoboChecklist } from "@/hooks/useRealtimeKoboChecklist";
import { useMdaLens } from "@/hooks/useMdaLens";
import { campaignInLensScope, readKoboCampaign, readKoboGeo, rowInLensScope } from "@/lib/mdaLens/config";
import MdaLensExportButton from "@/components/UserManagement/MdaLensExportButton";
import LensScopeBanner, { lensScopeSummary } from "@/components/MdaLens/LensScopeBanner";
import {
  fetchScopedSubmissions, feedCacheKey, listChecklistFeeds, publishChecklistFeed, type ChecklistFeed,
} from "./checklistFeed";


export default function IntegratedSupervisoryView() {
  const perms = useChecklistPermissions();

  const [connections, setConnections] = useState<KoboConnection[]>(() => listConnections());
  const [activeId, setActiveId] = useState<string | null>(() => getActiveConnectionId());
  const [openSync, setOpenSync] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cache, setCache] = useState<KoboCache | null>(() => loadKoboCache());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<{ message: string; hint?: string } | null>(null);
  const [openAccess, setOpenAccess] = useState(false);

  /* ── Shared, State-scoped server feed (for granted non-admin users) ── */
  const [feeds, setFeeds] = useState<ChecklistFeed[]>([]);
  const [feedScopeStates, setFeedScopeStates] = useState<string[]>([]);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [usingSharedFeed, setUsingSharedFeed] = useState(false);

  /** A user with no local Kobo credentials must read through the shared feed. */
  const needsSharedFeed = connections.length === 0;

  const { lens, lensEnabled, canOpenSupervisoryTab } = useMdaLens();

  const activeConnection = useMemo(
    () => connections.find((c) => c.id === activeId) ?? null,
    [connections, activeId],
  );

  /** Lens users only ever see rows inside their granted State / LGA scope. */
  const scopedCache = useMemo<KoboCache | null>(() => {
    if (!cache || !lens) return cache;
    const keep = (r: Record<string, unknown>) => {
      const { state, lga, ward } = readKoboGeo(r);
      return rowInLensScope(lens, state, lga, ward) && campaignInLensScope(lens, readKoboCampaign(r));
    };
    const results = (cache.results || []).filter(keep);
    const flatResults = (cache.flatResults || []).filter(keep);
    return { ...cache, results, flatResults, count: results.length };
  }, [cache, lens]);

  const showTab = useCallback((t: string) => canOpenSupervisoryTab(t), [canOpenSupervisoryTab]);
  const defaultTab = useMemo(
    () => ["checklist", "records", "studio", "reconciliation"].find((t) => showTab(t)) ?? "checklist",
    [showTab],
  );

  const scopeLabel = lensScopeSummary(lens);

  const exportColumns = useMemo(() => {
    const cols = (scopedCache?.columns ?? []).map((c: any) => ({
      key: c.key ?? c.name,
      label: c.label ?? c.key ?? c.name,
      geo: /(^|\/)(state|lga|ward)$/i.test(String(c.key ?? c.name)),
    }));
    if (cols.length) return cols;
    const first = scopedCache?.flatResults?.[0] ?? {};
    return Object.keys(first).map((k) => ({ key: k, label: k.split("/").pop() || k }));
  }, [scopedCache]);

  const reloadRegistry = useCallback(() => {
    const all = listConnections();
    setConnections(all);
    const id = getActiveConnectionId();
    setActiveId(id);
    setCache(loadKoboCache(id));
  }, []);

  const switchTo = (id: string) => {
    setActiveConnectionId(id);
    setActiveId(id);
    setCache(loadKoboCache(id));
  };

  /* Cheap payload fingerprint: a merged burst that resolves to the same data
     must not push a new cache object (that would re-render every chart). */
  const cacheSigRef = useRef<string>("");
  /* Always-current cache, used as the delta cursor without re-creating callbacks. */
  const cacheRef = useRef<KoboCache | null>(null);
  const cacheSignature = (c: KoboCache | null) =>
    !c ? "" : `${c.count}|${c.formUid ?? ""}|${(c.results?.[0] as any)?._submission_time ?? ""}|${(c.results?.[0] as any)?._id ?? ""}|${(c.results?.[c.results.length - 1] as any)?._id ?? ""}`;
  const applyCache = useCallback((c: KoboCache) => {
    cacheRef.current = c;
    const sig = cacheSignature(c);
    if (sig && sig === cacheSigRef.current) return false;
    cacheSigRef.current = sig;
    setCache(c);
    return true;
  }, []);


  /** Pull live submissions through the server feed — filtered server-side to scope. */
  const sharedInFlight = useRef<Promise<void> | null>(null);
  const refreshShared = useCallback(async (silent = false) => {
    // Concurrent triggers (realtime burst + poll + focus) share one request.
    if (sharedInFlight.current) return sharedInFlight.current;
    const job = (async () => {
      setSyncing(true);
      try {
        // Delta sync: only submissions newer than what we already hold.
        const prev = cacheRef.current;
        const { cache: c, feed, scopeStates, delta } = await fetchScopedSubmissions(feeds[0]?.id ?? null, prev);
        applyCache(c);
        setFeedScopeStates(scopeStates);
        setUsingSharedFeed(true);
        setSyncError(null);
        if (!silent) {
          toast({
            title: delta ? "Live data up to date" : "Live data refreshed",
            description: `${c.count} submissions from ${feed.name}${scopeStates.length ? ` · ${scopeStates.join(", ")}` : ""}.`,
          });
        }
      } catch (e: any) {
        setSyncError({ message: e?.message || "Unable to load the shared Checklist feed." });
        if (!silent) {
          toast({ title: "Refresh failed", description: e?.message ?? "Unable to load live data.", variant: "destructive" });
        }
      } finally { setSyncing(false); sharedInFlight.current = null; }
    })();
    sharedInFlight.current = job;
    return job;
  }, [feeds, applyCache]);


  const refresh = useCallback(async (silent = false) => {
    const id = getActiveConnectionId();
    const cfg = loadKoboConfig(id);
    if (!cfg?.formUid || !cfg?.apiToken) {
      // Grantees have no local Kobo credentials — read the shared, scoped feed.
      if (feeds.length) return refreshShared(silent);
      if (!silent && perms.canManageIntegrations) { setEditingId(id ?? "new"); setOpenSync(true); }
      return;
    }
    setSyncing(true);
    try {
      const c = await fetchSubmissions(cfg, id);
      applyCache(c);
      setUsingSharedFeed(false);
      setSyncError(null);
      // Keep the shared feed in step so grantees always see the live connection.
      if (perms.canManageIntegrations) {
        void publishChecklistFeed(
          listConnections().find((x) => x.id === id)?.name || "Integrated Supervisory Checklist",
          cfg,
        )
          .then((f) => setFeeds((prev) => (prev.some((p) => p.id === f.id) ? prev : [...prev, f])))
          .catch(() => { /* publishing is best-effort */ });
      }
      if (!silent) toast({ title: "Data refreshed", description: `${c.count} submissions from KoboToolbox.` });
    } catch (e: any) {
      setSyncError({ message: e?.message || "Unable to reach KoboToolbox.", hint: e?.hint });
      if (!silent) toast({ title: "Refresh failed", description: e?.hint || e?.message || "Unable to reach KoboToolbox.", variant: "destructive" });
    } finally { setSyncing(false); }
  }, [perms.canManageIntegrations, feeds, refreshShared, applyCache]);

  /* Load the shared feed registry once the user is known, then hydrate any
     cached scoped payload so grantees paint instantly, offline included. */
  useEffect(() => {
    if (!perms.canView || perms.loading) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await listChecklistFeeds();
        if (cancelled) return;
        setFeeds(reg.feeds);
        setFeedScopeStates(reg.scopeStates);
        if (reg.feeds[0] && needsSharedFeed) {
          const cached = loadKoboCache(feedCacheKey(reg.feeds[0].id));
          if (cached) { setCache(cached); setUsingSharedFeed(true); }
        }
      } catch { /* registry is optional for admins with local configs */ }
      finally { if (!cancelled) setFeedLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [perms.canView, perms.loading, needsSharedFeed]);

  /* First live pull through the shared feed for grantees. */
  useEffect(() => {
    if (!feedLoaded || !needsSharedFeed || !feeds.length) return;
    void refreshShared(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedLoaded, needsSharedFeed, feeds.length]);

  // Real-time: refresh the moment KoboToolbox posts a new submission.
  // Grantees re-pull through the scoped feed, so realtime can never widen scope.
  const { lastEventAt, connected } = useRealtimeKoboChecklist(
    () => (usingSharedFeed || (needsSharedFeed && feeds.length) ? refreshShared(true) : refresh(true)),
    { enabled: perms.canView && (!!activeConnection || feeds.length > 0) },
  );

  // Background sync safety net. Realtime is the primary path, so when the
  // socket is live we only poll slowly (configurable, default 5 min); if the
  // socket is down we fall back to a fast 20 s poll so the dashboard still
  // feels near-instant. Focus / reconnect always triggers an immediate catch-up.
  useEffect(() => {
    if (!perms.canView || (!activeConnection && !feeds.length)) return;
    const cfg = loadKoboConfig(activeId);
    const slowMs = Math.max(1, cfg?.pollMinutes ?? 5) * 60 * 1000;
    const intervalMs = connected ? slowMs : 20_000;
    const tick = () => {
      if (navigator.onLine === false) return;
      if (document.visibilityState === "hidden") return; // don't burn quota in background tabs
      void refresh(true);
    };
    const timer = setInterval(tick, intervalMs);
    const catchUp = () => { if (document.visibilityState === "visible" && navigator.onLine !== false) void refresh(true); };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("online", catchUp);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("online", catchUp);
    };
  }, [refresh, activeId, perms.canView, activeConnection, feeds.length, connected]);

  // Initial auto-sync on mount so the dashboard is fresh without pressing Sync.
  useEffect(() => {
    if (perms.canView && activeConnection) void refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.canView, activeId]);


  if (!perms.loading && !perms.canView) {
    return (
      <div className="p-6">
        <Card className="max-w-lg mx-auto border-destructive/30">
          <CardContent className="p-6 text-center space-y-2">
            <Lock className="h-8 w-8 mx-auto text-destructive" />
            <h2 className="text-lg font-semibold">Restricted dashboard</h2>
            <p className="text-sm text-muted-foreground">
              You don't have permission to view the Integrated Supervisory Checklist data.
              Ask an administrator to grant you access to this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
              <ClipboardList className="h-5 w-5 text-primary" />
              {activeConnection?.name || feeds[0]?.name || "Integrated Supervisory Checklist"}
              <Badge
                variant="outline"
                className="gap-1 border-primary/40 bg-primary/10 text-[10px] font-semibold text-primary"
                title={
                  feedScopeStates.length
                    ? `Live data is filtered on the server to ${feedScopeStates.join(", ")}.`
                    : "You can see submissions from every State."
                }
              >
                <Globe2 className="h-3 w-3" />
                Scope: {feedScopeStates.length ? feedScopeStates.join(" · ") : "All States"}
              </Badge>
              {usingSharedFeed && (
                <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-[10px] font-semibold text-emerald-700">
                  <Radio className="h-3 w-3" /> Shared live feed
                </Badge>
              )}
            </h1>
            <p className="text-xs text-muted-foreground">
              KoboToolbox-linked · offline-cached · flattened respondent analytics · {perms.roleLabel}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {connections.length > 0 && (
              <Select value={activeId ?? undefined} onValueChange={switchTo}>
                <SelectTrigger className="h-9 w-[230px] text-xs">
                  <SelectValue placeholder="Select dashboard" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <KoboSyncStatus
              phase={syncing ? "syncing" : syncError ? "error" : "synced"}
              lastSyncedAt={cache?.fetchedAt ?? null}
              live={connected}
              lastEventAt={lastEventAt}
              recordCount={cache?.count ?? null}
              error={syncError}
              onRetry={() => refresh(false)}
            />


            {perms.canManageAccess && (
              <Button
                variant="outline"
                className="border-primary/40 bg-gradient-to-r from-primary/10 to-fuchsia-500/10 hover:from-primary/20"
                onClick={() => setOpenAccess(true)}
              >
                <ShieldCheck className="h-4 w-4 mr-1 text-primary" /> Access
              </Button>
            )}

            {perms.canManageIntegrations && (
              <>
                <Button variant="outline" onClick={() => { setEditingId(activeId ?? "new"); setOpenSync(true); }}>
                  <Settings2 className="h-4 w-4 mr-1" /> Kobo Sync
                </Button>
                <Button variant="outline" onClick={() => { setEditingId("new"); setOpenSync(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add integration
                </Button>
                {activeConnection && connections.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove this integration"
                    onClick={() => {
                      if (!window.confirm(`Remove "${activeConnection.name}" and its cached dashboard?`)) return;
                      deleteConnection(activeConnection.id);
                      reloadRegistry();
                      toast({ title: "Integration removed" });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </>
            )}

            <Button onClick={() => refresh(false)} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Server className="h-4 w-4 mr-1" />}
              Sync Now
            </Button>

            {(perms.canExport || (lensEnabled && lens?.can_export)) && (
              <MdaLensExportButton
                title="Integrated Supervisory Checklist — Scoped Export"
                scopeLabel={scopeLabel}
                sheetName="Responses"
                columns={exportColumns}
                rows={(scopedCache?.flatResults ?? []) as Record<string, unknown>[]}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <LensScopeBanner lens={lens} />

      {/* Scope-aware empty state — distinguishes "no feed yet" from "no data in your States". */}
      {feedLoaded && !syncing && !feeds.length && !activeConnection && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold text-amber-700">No live data feed has been published yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              An administrator needs to connect KoboToolbox and sync once. The dashboard will then stream
              live submissions to everyone who has been granted access.
            </p>
          </CardContent>
        </Card>
      )}

      {feedLoaded && !syncing && (feeds.length > 0 || !!activeConnection) && (scopedCache?.count ?? 0) === 0 && (
        <Card className="border-primary/30 bg-muted/30">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-primary" />
              {feedScopeStates.length
                ? `No submissions yet for ${feedScopeStates.join(", ")}`
                : "No submissions available yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {feedScopeStates.length
                ? "Your access is scoped to the State(s) above, and no field submissions have landed there yet. This view updates automatically the moment one does."
                : "The connected form has no submissions yet, or none matched the current filters."}
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="flex-wrap h-auto">
          {showTab("checklist") && (
            <TabsTrigger value="checklist"><ClipboardList className="h-4 w-4 mr-1" /> Checklist Dashboard</TabsTrigger>
          )}
          {perms.canViewRawData && showTab("records") && (
            <TabsTrigger value="records"><Database className="h-4 w-4 mr-1" /> Raw Kobo Data</TabsTrigger>
          )}
          {showTab("studio") && (
            <TabsTrigger value="studio"><LayoutDashboard className="h-4 w-4 mr-1" /> Dashboard Studio</TabsTrigger>
          )}

          {perms.canViewMedicineAccountability && showTab("reconciliation") && (
            <TabsTrigger value="reconciliation"><GitCompareArrows className="h-4 w-4 mr-1" /> Medicine Accountability</TabsTrigger>
          )}
        </TabsList>
        {showTab("checklist") && (
          <TabsContent value="checklist" className="mt-4">
            <Suspense fallback={<TabFallback />}>
              <ChecklistDashboard cache={scopedCache} onRefresh={() => refresh(false)} syncing={syncing} />
            </Suspense>
          </TabsContent>
        )}
        {perms.canViewRawData && showTab("records") && (
          <TabsContent value="records" className="mt-4">
            <Suspense fallback={<TabFallback />}>
              <RawKoboDataTabs cache={scopedCache} onRefresh={() => refresh(false)} />
            </Suspense>
          </TabsContent>
        )}

        {showTab("studio") && (
          <TabsContent value="studio" className="mt-4">
            <Suspense fallback={<TabFallback />}>
              <SupervisoryDashboardView cache={scopedCache} onRefresh={() => refresh(false)} syncing={syncing} />
            </Suspense>
          </TabsContent>
        )}
        {perms.canViewMedicineAccountability && showTab("reconciliation") && (
          <TabsContent value="reconciliation" className="mt-4">
            <Suspense fallback={<TabFallback />}>
              <MedicineAccountabilityDashboard canExport={perms.canExport} checklistCache={scopedCache} />
            </Suspense>
          </TabsContent>
        )}

      </Tabs>

      {perms.canManageAccess && (
        <ChecklistAccessManager open={openAccess} onOpenChange={setOpenAccess} />
      )}

      {perms.canManageIntegrations && (
        <KoboSyncDialog
          open={openSync}
          onOpenChange={(o) => { setOpenSync(o); if (!o) reloadRegistry(); }}
          connectionId={editingId}
          onSynced={reloadRegistry}
        />
      )}
    </div>
  );
}
