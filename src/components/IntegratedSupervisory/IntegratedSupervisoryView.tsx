import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Database, Server, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import KoboSyncDialog from "./KoboSyncDialog";
import SupervisoryDashboardView from "./SupervisoryDashboardView";
import RawKoboDataTable from "./RawKoboDataTable";
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
            <h1 className="text-xl font-bold flex items-center gap-2"><LayoutDashboard className="h-5 w-5 text-primary" /> Integrated Supervisory Dashboard</h1>
            <p className="text-xs text-muted-foreground">KoboToolbox-linked MDA supervisory intelligence · offline-cached · realtime refresh.</p>
          </div>
          <div className="flex items-center gap-2">
            {cache && <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">{cache.count.toLocaleString()} records · {new Date(cache.fetchedAt).toLocaleString()}</Badge>}
            <Button variant="outline" onClick={() => setOpenSync(true)}><Server className="h-4 w-4 mr-1" /> Kobo Sync</Button>
            <Button onClick={refresh} disabled={syncing}>{syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Sync Now</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard"><LayoutDashboard className="h-4 w-4 mr-1" /> Supervisory Dashboard</TabsTrigger>
          <TabsTrigger value="raw"><Database className="h-4 w-4 mr-1" /> Raw Kobo Data</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4">
          <SupervisoryDashboardView cache={cache} onRefresh={refresh} syncing={syncing} />
        </TabsContent>
        <TabsContent value="raw" className="mt-4">
          <RawKoboDataTable cache={cache} />
        </TabsContent>
      </Tabs>

      <KoboSyncDialog open={openSync} onOpenChange={setOpenSync} onSynced={() => { setCache(loadKoboCache()); }} />
    </div>
  );
}
