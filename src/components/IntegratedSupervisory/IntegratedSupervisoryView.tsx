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
import SupervisoryDashboardView from "./SupervisoryDashboardView";
import ChecklistDashboard from "./ChecklistDashboard";
import ChecklistDataTable from "./ChecklistDataTable";
import MedicineAccountabilityDashboard from "./MedicineAccountabilityDashboard";
import ChecklistAccessManager from "./ChecklistAccessManager";
import {
  deleteConnection, fetchSubmissions, getActiveConnectionId, listConnections, loadKoboCache,
  loadKoboConfig, setActiveConnectionId, type KoboCache, type KoboConnection,
} from "./koboClient";
import { useChecklistPermissions } from "@/hooks/useChecklistPermissions";
import { useRealtimeKoboChecklist } from "@/hooks/useRealtimeKoboChecklist";

export default function IntegratedSupervisoryView() {
  const perms = useChecklistPermissions();

  const [connections, setConnections] = useState<KoboConnection[]>(() => listConnections());
  const [activeId, setActiveId] = useState<string | null>(() => getActiveConnectionId());
  const [openSync, setOpenSync] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cache, setCache] = useState<KoboCache | null>(() => loadKoboCache());
  const [syncing, setSyncing] = useState(false);
  const [openAccess, setOpenAccess] = useState(false);

  const activeConnection = useMemo(
    () => connections.find((c) => c.id === activeId) ?? null,
    [connections, activeId],
  );

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
      if (!silent) toast({ title: "Data refreshed", description: `${c.count} submissions from KoboToolbox.` });
    } catch (e: any) {
      if (!silent) toast({ title: "Refresh failed", description: e?.message || "Unable to reach KoboToolbox.", variant: "destructive" });
    } finally { setSyncing(false); }
  }, [perms.canManageIntegrations]);

  // Real-time: refresh the moment KoboToolbox posts a new submission.
  const { lastEventAt, connected } = useRealtimeKoboChecklist(() => refresh(true), {
    enabled: perms.canView && !!activeConnection,
  });

  // Optional background auto-sync
  useEffect(() => {
    const cfg = loadKoboConfig(activeId);
    if (!cfg?.autoSync) return;
    const min = Math.max(1, cfg.pollMinutes ?? 15);
    const id = setInterval(() => { refresh(true); }, min * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh, activeId]);

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

            <Badge
              variant="outline"
              className={connected ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-muted text-muted-foreground"}
              title={lastEventAt ? `Last Kobo event ${lastEventAt.toLocaleTimeString()}` : "Waiting for Kobo submissions"}
            >
              <Radio className={`h-3 w-3 mr-1 ${connected ? "animate-pulse" : ""}`} />
              {connected ? "Live" : "Offline"}
            </Badge>

            {cache && (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                {cache.count.toLocaleString()} records · {new Date(cache.fetchedAt).toLocaleString()}
              </Badge>
            )}

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
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="checklist" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="checklist"><ClipboardList className="h-4 w-4 mr-1" /> Checklist Dashboard</TabsTrigger>
          {perms.canViewRawData && (
            <TabsTrigger value="records"><Database className="h-4 w-4 mr-1" /> Raw Kobo Data</TabsTrigger>
          )}
          <TabsTrigger value="studio"><LayoutDashboard className="h-4 w-4 mr-1" /> Dashboard Studio</TabsTrigger>
          
          {perms.canViewMedicineAccountability && (
            <TabsTrigger value="reconciliation"><GitCompareArrows className="h-4 w-4 mr-1" /> Medicine Accountability</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="checklist" className="mt-4">
          <ChecklistDashboard cache={cache} onRefresh={() => refresh(false)} syncing={syncing} />
        </TabsContent>
        {perms.canViewRawData && (
          <TabsContent value="records" className="mt-4">
            <ChecklistDataTable cache={cache} />
          </TabsContent>
        )}
        <TabsContent value="studio" className="mt-4">
          <SupervisoryDashboardView cache={cache} onRefresh={() => refresh(false)} syncing={syncing} />
        </TabsContent>
        {perms.canViewMedicineAccountability && (
          <TabsContent value="reconciliation" className="mt-4">
            <MedicineAccountabilityDashboard canExport={perms.canExport} checklistCache={cache} />
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
