import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, PlugZap, RefreshCw, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { testConnection, type KoboConfig } from "./koboClient";
import { loadMedLogConfig, saveMedLogConfig, syncMedLog } from "./medicineKoboClient";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSynced?: () => void;
}

const DEFAULTS: KoboConfig = {
  serverUrl: "https://kf.kobotoolbox.org",
  formUid: "",
  apiToken: "",
  autoSync: true,
  pollMinutes: 10,
};

export default function MedicineKoboConnectDialog({ open, onOpenChange, onSynced }: Props) {
  const [cfg, setCfg] = useState<KoboConfig>(DEFAULTS);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCfg(loadMedLogConfig() ?? DEFAULTS);
    setStatus(null);
  }, [open]);

  const runTest = async () => {
    setTesting(true); setStatus(null);
    try {
      const r = await testConnection(cfg);
      setStatus({
        ok: !!r?.ok,
        message: r?.ok ? `Connected · ${r?.form_title ?? cfg.formUid} · ${r?.submission_count ?? 0} submissions` : "Connection failed",
      });
    } catch (e: any) {
      setStatus({ ok: false, message: e?.hint ? `${e.message}. ${e.hint}` : (e?.message || "Connection failed") });
    } finally { setTesting(false); }
  };

  const runSync = async () => {
    if (!cfg.serverUrl || !cfg.formUid || !cfg.apiToken) {
      toast({ title: "Missing details", description: "Server URL, form UID and API token are all required.", variant: "destructive" });
      return;
    }
    setSyncing(true);
    try {
      saveMedLogConfig(cfg);
      const cache = await syncMedLog(cfg);
      toast({ title: "Medicine logistics form linked", description: `${cache.count} submissions pulled from KoboToolbox.` });
      onSynced?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Sync failed", description: e?.hint || e?.message || "Unable to reach KoboToolbox.", variant: "destructive" });
    } finally { setSyncing(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-primary" /> Link Medicine Logistics Kobo form
          </DialogTitle>
          <DialogDescription>
            Connect the 3-tier medicine accountability XLSForm (State → LGA → FLHF → CDD). Submissions are cached
            offline and power every accountability indicator on this tab.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Kobo server URL</Label>
            <Input value={cfg.serverUrl} onChange={(e) => setCfg({ ...cfg, serverUrl: e.target.value })} placeholder="https://kf.kobotoolbox.org" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Form UID</Label>
            <Input value={cfg.formUid} onChange={(e) => setCfg({ ...cfg, formUid: e.target.value })} placeholder="aXXXXXXXXXXXXXXXXXXXX" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">API token</Label>
            <div className="flex gap-2">
              <Input
                type={showToken ? "text" : "password"}
                value={cfg.apiToken}
                onChange={(e) => setCfg({ ...cfg, apiToken: e.target.value })}
                placeholder="Kobo → Account Settings → API"
              />
              <Button variant="outline" size="icon" onClick={() => setShowToken((s) => !s)} type="button">
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Background auto-sync</p>
              <p className="text-xs text-muted-foreground">Poll KoboToolbox automatically while the tab is open.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={1} className="h-8 w-20"
                value={cfg.pollMinutes ?? 10}
                onChange={(e) => setCfg({ ...cfg, pollMinutes: Math.max(1, Number(e.target.value) || 10) })}
              />
              <span className="text-xs text-muted-foreground">min</span>
              <Switch checked={!!cfg.autoSync} onCheckedChange={(v) => setCfg({ ...cfg, autoSync: v })} />
            </div>
          </div>

          {status && (
            <Badge variant="outline" className={status.ok ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-destructive/40 bg-destructive/10 text-destructive"}>
              {status.ok ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />} {status.message}
            </Badge>
          )}

          <p className="text-[11px] text-muted-foreground flex items-start gap-1">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Your token is stored only on this device and is sent to KoboToolbox through the platform's secure proxy.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={runTest} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wifi className="h-4 w-4 mr-1" />} Test connection
          </Button>
          <Button onClick={runSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />} Save & sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
