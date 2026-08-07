import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList, Database, GitCompareArrows, LayoutDashboard, Loader2, Lock, Plus, Radio, Server, Settings2, ShieldCheck, Trash2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import KoboSyncDialog from "./KoboSyncDialog";
import KoboSyncStatus from "./KoboSyncStatus";
import SupervisoryDashboardView from "./SupervisoryDashboardView";
import ChecklistDashboard from "./ChecklistDashboard";
import RawKoboDataTabs from "./RawKoboDataTabs";
import MedicineAccountabilityDashboard from "./MedicineAccountabilityDashboard";
import ChecklistAccessManager from "./ChecklistAccessManager";
import {
  deleteConnection, fetchSubmissions, getActiveConnectionId, listConnections, loadKoboCache,
  loadKoboConfig, setActiveConnectionId, type KoboCache, type KoboConnection,
} from "./koboClient";
import { useChecklistPermissions } from "@/hooks/useChecklistPermissions";
import { useRealtimeKoboChecklist } from "@/hooks/useRealtimeKoboChecklist";
import { useMdaLens } from "@/hooks/useMdaLens";
import { readKoboGeo, rowInLensScope } from "@/lib/mdaLens/config";
import MdaLensExportButton from "@/components/UserManagement/MdaLensExportButton";

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

  const { lens, lensEnabled, canOpenSupervisoryTab } = useMdaLens();

  const activeConnection = useMemo(
    () => connections.find((c) => c.id === activeId) ?? null,
    [connections, activeId],
  );

  /** Lens users only ever see rows inside their granted State / LGA scope. */
  const scopedCache = useMemo<KoboCache | null>(() => {
    if (!cache || !lens) return cache;
    const keep = (r: Record<string, unknown>) => {
      const { state, lga } = readKoboGeo(r);
      return rowInLensScope(lens, state, lga);
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

  const scopeLabel = lens
    ? `Scope: ${lens.states.length ? lens.states.join(", ") : "All states"}${lens.lgas.length ? ` · ${lens.lgas.join(", ")}` : ""}`
    : "Scope: full dataset";

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

  const refresh = useCallback(async (silent = false) => {
    const id = getActiveConnectionId();
    const cfg = loadKoboConfig(id);
    if (!cfg?.formUid || !cfg?.apiToken) {
      if (!silent && perms.canManageIntegrations) { setEditingId(id ?? "new"); setOpenSync(true); }
      return;
    }
    setSyncing(true);
    try {
      const c = await fetchSubmissions(cfg, id);
      setCache(c);
      setSyncError(null);
      if (!silent) toast({ title: "Data refreshed", description: `${c.count} submissions from KoboToolbox.` });
    } catch (e: any) {
      setSyncError({ message: e?.message || "Unable to reach KoboToolbox.", hint: e?.hint });
      if (!silent) toast({ title: "Refresh failed", description: e?.hint || e?.message || "Unable to reach KoboToolbox.", variant: "destructive" });
    } finally { setSyncing(false); }
  }, [perms.canManageIntegrations]);

  // Real-time: refresh the moment KoboToolbox posts a new submission.
  const { lastEventAt, connected } = useRealtimeKoboChecklist(() => refresh(true), {
    enabled: perms.canView && !!activeConnection,
  });

  // Automatic background sync: always on (configurable interval, default 5 min),
  // plus an immediate catch-up when the tab regains focus or the device reconnects.
  useEffect(() => {
    if (!perms.canView || !activeConnection) return;
    const cfg = loadKoboConfig(activeId);
    const min = Math.max(1, cfg?.pollMinutes ?? 5);
    const timer = setInterval(() => { if (navigator.onLine !== false) void refresh(true); }, min * 60 * 1000);
    const catchUp = () => { if (document.visibilityState === "visible" && navigator.onLine !== false) void refresh(true); };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("online", catchUp);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("online", catchUp);
    };
  }, [refresh, activeId, perms.canView, activeConnection]);

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
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              {activeConnection?.name || "Integrated Supervisory Checklist"}
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
            <ChecklistDashboard cache={scopedCache} onRefresh={() => refresh(false)} syncing={syncing} />
          </TabsContent>
        )}
        {perms.canViewRawData && showTab("records") && (
          <TabsContent value="records" className="mt-4">
            <RawKoboDataTabs cache={scopedCache} onRefresh={() => refresh(false)} />
          </TabsContent>
        )}

        {showTab("studio") && (
          <TabsContent value="studio" className="mt-4">
            <SupervisoryDashboardView cache={scopedCache} onRefresh={() => refresh(false)} syncing={syncing} />
          </TabsContent>
        )}
        {perms.canViewMedicineAccountability && showTab("reconciliation") && (
          <TabsContent value="reconciliation" className="mt-4">
            <MedicineAccountabilityDashboard canExport={perms.canExport} checklistCache={scopedCache} />
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
