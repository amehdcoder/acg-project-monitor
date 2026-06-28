import { FileSpreadsheet, BarChart3, RefreshCw, Loader2, CheckCircle2, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import type { AcsmKpiPayload } from "@/hooks/useAcsmKpiSync";

interface Props {
  sync: ReturnType<typeof import("@/hooks/useAcsmKpiSync")["useAcsmKpiSync"]>;
  getPayload: () => AcsmKpiPayload;
  canManage: boolean;
  dark?: boolean;
}

export default function AcsmKpiSyncPanel({ sync, getPayload, canManage, dark }: Props) {
  const { config, saveConfig, spreadsheetId, syncing, lastSync, lastError, sync: runSync } = sync;

  const t = dark
    ? { card: "border-[#1c3a5e] bg-[#0f1f38]", sub: "text-[#8aa2c4]", text: "text-[#e6eefb]" }
    : { card: "border-border bg-card", sub: "text-muted-foreground", text: "text-foreground" };

  const manualSync = async () => {
    const ok = await runSync(getPayload());
    if (ok) toast({ title: "Synced to Google Sheets", description: "Looker Studio will refresh automatically." });
    else toast({ title: "Sync failed", description: lastError || "Check the sheet link & access.", variant: "destructive" });
  };

  return (
    <div className={`rounded-xl border ${t.card} p-4`}>
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
        <h3 className={`text-sm font-semibold ${t.text}`}>Realtime Sheets &amp; Looker sync</h3>
        {config.enabled && spreadsheetId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-500">
            <CheckCircle2 className="h-3 w-3" /> Live
          </span>
        )}
      </div>

      <p className={`mt-1 text-[11px] ${t.sub}`}>
        Publishes the deduplicated linked IRF + Advocacy KPIs to your Google Sheet. Looker Studio dashboards
        connected to that sheet refresh automatically.
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <Label className={`text-xs ${t.sub}`}>Google Sheet link</Label>
          <Input
            value={config.spreadsheetUrl}
            onChange={(e) => saveConfig({ spreadsheetUrl: e.target.value })}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            disabled={!canManage}
            className="mt-1 h-9 text-xs"
          />
          {config.spreadsheetUrl && !spreadsheetId && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-500">
              <AlertCircle className="h-3 w-3" /> That doesn’t look like a valid Sheet link.
            </p>
          )}
        </div>

        <div>
          <Label className={`text-xs ${t.sub}`}>Looker Studio link (optional)</Label>
          <div className="mt-1 flex gap-2">
            <Input
              value={config.lookerUrl}
              onChange={(e) => saveConfig({ lookerUrl: e.target.value })}
              placeholder="https://lookerstudio.google.com/…"
              disabled={!canManage}
              className="h-9 text-xs"
            />
            {config.lookerUrl && (
              <Button asChild variant="outline" size="icon" className="h-9 w-9 shrink-0">
                <a href={config.lookerUrl} target="_blank" rel="noopener noreferrer"><BarChart3 className="h-4 w-4" /></a>
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-2.5"
          style={dark ? { borderColor: "#1c3a5e" } : undefined}>
          <div className="min-w-0">
            <p className={`text-xs font-medium ${t.text}`}>Auto-sync on changes</p>
            <p className={`text-[11px] ${t.sub}`}>Push KPIs whenever submissions or duplicate decisions change.</p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => saveConfig({ enabled: v })}
            disabled={!canManage || !spreadsheetId}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] ${t.sub}`}>
            {lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : "Not synced yet"}
          </span>
          <Button size="sm" onClick={manualSync} disabled={!canManage || !spreadsheetId || syncing}>
            {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Sync now
          </Button>
        </div>

        {lastError && (
          <p className="flex items-center gap-1 text-[11px] text-red-500">
            <AlertCircle className="h-3 w-3" /> {lastError}
          </p>
        )}
        {!canManage && (
          <p className={`text-[11px] ${t.sub}`}>Only admins and owners can configure sync.</p>
        )}
      </div>
    </div>
  );
}
