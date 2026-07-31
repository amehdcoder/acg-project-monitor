import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Database, LayoutDashboard, Loader2, Server } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import KoboSyncDialog from "./KoboSyncDialog";
import SupervisoryDashboardView from "./SupervisoryDashboardView";
import RawKoboDataTable from "./RawKoboDataTable";
import ChecklistDashboard from "./ChecklistDashboard";
import ChecklistDataTable from "./ChecklistDataTable";
import { fetchSubmissions, loadKoboCache, loadKoboConfig, type KoboCache } from "./koboClient";

export default function IntegratedSupervisoryView() {
  const [openSync, setOpenSync] = useState(false);
  const [cache, setCache] = useState<KoboCache | null>(loadKoboCache());
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const cfg = loadKoboConfig();
    if (!cfg?.formUid || !cfg?.apiToken) { setOpenSync(true); return; }
    setSyncing(true);
    try {
      const c = await fetchSubmissions(cfg);
      setCache(c);
      toast({ title: "Data refreshed", description: `${c.count} submissions from KoboToolbox.` });
    } catch (e: any) {
      toast({ title: "Refresh failed", description: e?.message || "Unable to reach KoboToolbox.", variant: "destructive" });
    } finally { setSyncing(false); }
  }, []);

  // Optional background auto-sync
  useEffect(() => {
    const cfg = loadKoboConfig();
    if (!cfg?.autoSync) return;
    const min = Math.max(1, cfg.pollMinutes ?? 15);
    const id = setInterval(() => { refresh(); }, min * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="p-4 space-y-4">
      <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> Integrated Supervisory Checklist
            </h1>
            <p className="text-xs text-muted-foreground">
              Integrated MDA Supervisory Checklist · KoboToolbox-linked · offline-cached · flattened respondent analytics.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cache && <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">{cache.count.toLocaleString()} records · {new Date(cache.fetchedAt).toLocaleString()}</Badge>}
            <Button variant="outline" onClick={() => setOpenSync(true)}><Server className="h-4 w-4 mr-1" /> Kobo Sync</Button>
            <Button onClick={refresh} disabled={syncing}>{syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Sync Now</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="checklist" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="checklist"><ClipboardList className="h-4 w-4 mr-1" /> Checklist Dashboard</TabsTrigger>
          <TabsTrigger value="records"><Database className="h-4 w-4 mr-1" /> Raw Kobo Data</TabsTrigger>
          <TabsTrigger value="studio"><LayoutDashboard className="h-4 w-4 mr-1" /> Dashboard Studio</TabsTrigger>
          <TabsTrigger value="explorer"><Database className="h-4 w-4 mr-1" /> Data Explorer</TabsTrigger>
        </TabsList>
        <TabsContent value="checklist" className="mt-4">
          <ChecklistDashboard cache={cache} onRefresh={refresh} syncing={syncing} />
        </TabsContent>
        <TabsContent value="records" className="mt-4">
          <ChecklistDataTable cache={cache} />
        </TabsContent>
        <TabsContent value="studio" className="mt-4">
          <SupervisoryDashboardView cache={cache} onRefresh={refresh} syncing={syncing} />
        </TabsContent>
        <TabsContent value="explorer" className="mt-4">
          <RawKoboDataTable cache={cache} onRefresh={refresh} />
        </TabsContent>
      </Tabs>

      <KoboSyncDialog open={openSync} onOpenChange={setOpenSync} onSynced={() => { setCache(loadKoboCache()); }} />
    </div>
  );
}
