/**
 * Medicine Accountability Dashboard — the Reconciliation tab of the
 * Integrated Supervisory Checklist page.
 *
 * WHO-style tabular dashboard (no charts): the complete forward movement of
 * medicines across the cascade (Level 0 State → LGA, Level 1 LGA receipt,
 * Level 2 LGA → FLHF, Level 3 FLHF → CDD) and Level 4 reverse logistics, plus
 * the at-risk community register that joins the supervisory checklist to the
 * medicines actually issued and the people accountable for them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlugZap, RefreshCw, Truck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { parseLogistics } from "@/lib/isc/medicineAccountability";
import { loadMedLogCache, loadMedLogConfig, syncMedLog } from "./medicineKoboClient";
import MedicineKoboConnectDialog from "./MedicineKoboConnectDialog";
import MedicineRawLevelTables from "./MedicineRawLevelTables";
import AtRiskCommunitiesTable from "./AtRiskCommunitiesTable";
import type { KoboCache } from "./koboClient";

interface Props { canExport?: boolean; checklistCache?: KoboCache | null }

export default function MedicineAccountabilityDashboard({ checklistCache = null }: Props) {
  const [cache, setCache] = useState<KoboCache | null>(() => loadMedLogCache());
  const [syncing, setSyncing] = useState(false);
  const [openConnect, setOpenConnect] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    const cfg = loadMedLogConfig();
    if (!cfg?.formUid || !cfg?.apiToken) { if (!silent) setOpenConnect(true); return; }
    setSyncing(true);
    try {
      const c = await syncMedLog(cfg);
      setCache(c);
      if (!silent) toast({ title: "Logistics data refreshed", description: `${c.count} submissions synced.` });
    } catch (e: any) {
      if (!silent) {
        toast({
          title: "Sync failed",
          description: e?.hint || e?.message || "Unable to reach KoboToolbox.",
          variant: "destructive",
        });
      }
    } finally { setSyncing(false); }
  }, []);

  useEffect(() => {
    const cfg = loadMedLogConfig();
    if (!cfg?.autoSync) return;
    const id = setInterval(() => refresh(true), Math.max(1, cfg.pollMinutes ?? 10) * 60_000);
    return () => clearInterval(id);
  }, [refresh, cache?.fetchedAt]);

  const dataset = useMemo(() => parseLogistics(cache?.results ?? []), [cache]);
  const connected = !!loadMedLogConfig()?.formUid;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Truck className="h-5 w-5 text-primary" /> Medicine Accountability — cascade & reverse logistics register
            </h2>
            <p className="text-xs text-muted-foreground">
              State → LGA → Health Facility → CDD forward movement and returns ·{" "}
              {dataset.submissions.toLocaleString()} logistics submissions ·{" "}
              {dataset.dispatches.length} State dispatches · {dataset.receipts.length} LGA receipts ·{" "}
              {dataset.issues.length} facility issues · {dataset.cddIssues.length} CDD issues ·{" "}
              {dataset.returns.length} returns
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cache && (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                {cache.count.toLocaleString()} records · {new Date(cache.fetchedAt).toLocaleString()}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => setOpenConnect(true)}>
              <PlugZap className="mr-1 h-4 w-4" /> {connected ? "Integration" : "Link Kobo form"}
            </Button>
            <Button size="sm" onClick={() => refresh(false)} disabled={syncing}>
              {syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Sync
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Level 0 → 4 transaction tables (forward movement + reverse logistics) */}
      <MedicineRawLevelTables cache={cache} />

      {/* At-risk communities: blocked MDA + insufficient medicines */}
      <AtRiskCommunitiesTable checklistCache={checklistCache} logistics={dataset} />

      <MedicineKoboConnectDialog
        open={openConnect}
        onOpenChange={setOpenConnect}
        onSynced={() => { setCache(loadMedLogCache()); }}
      />
    </div>
  );
}
