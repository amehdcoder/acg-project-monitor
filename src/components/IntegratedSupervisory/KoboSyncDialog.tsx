import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Copy, Eye, EyeOff, KeyRound, Loader2, RefreshCw, Server, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { fetchSubmissions, fetchWebhookSecret, loadKoboCache, loadKoboConfig, saveKoboConfig, testConnection, type KoboConfig } from "./koboClient";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onSynced?: () => void }

export default function KoboSyncDialog({ open, onOpenChange, onSynced }: Props) {
  const [cfg, setCfg] = useState<KoboConfig>({ serverUrl: "https://kf.kobotoolbox.org", formUid: "", apiToken: "", autoSync: false, pollMinutes: 15 });
  const [secret, setSecret] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const cache = loadKoboCache();

  useEffect(() => {
    if (!open) return;
    const existing = loadKoboConfig();
    if (existing) setCfg(existing);
    fetchWebhookSecret().then(setSecret).catch(() => setSecret(null));
  }, [open]);

  const copy = async (v: string, label: string) => {
    try { await navigator.clipboard.writeText(v); toast({ title: `${label} copied` }); } catch {}
  };

  const runTest = async () => {
    setTesting(true); setStatus(null);
    try {
      const r = await testConnection(cfg);
      setStatus({ ok: !!r?.ok, message: r?.ok ? `Connected · ${r?.form_title ?? cfg.formUid} · ${r?.submission_count ?? 0} submissions` : "Connection failed" });
    } catch (e: any) {
      const msg = e?.hint ? `${e.message}. ${e.hint}` : (e?.message || "Connection failed");
      setStatus({ ok: false, message: msg });
    }
    finally { setTesting(false); }
  };

  const runSync = async () => {
    if (!cfg.serverUrl || !cfg.formUid || !cfg.apiToken) {
      toast({ title: "Missing config", description: "Server, Asset UID and API token are required.", variant: "destructive" });
      return;
    }
    saveKoboConfig(cfg);
    setSyncing(true);
    try {
      const c = await fetchSubmissions(cfg);
      const warn = c.validation?.warnings?.length ?? 0;
      toast({
        title: "Sync complete",
        description: warn > 0
          ? `${c.count} submissions loaded · ${warn} schema warning${warn === 1 ? "" : "s"} — see banner above.`
          : `${c.count} submissions loaded from KoboToolbox.`,
      });
      onSynced?.();
    } catch (e: any) {
      const description = e?.hint ? `${e.message}. ${e.hint}` : (e?.message || "Check API token and asset UID.");
      toast({ title: "Sync failed", description, variant: "destructive" });
    } finally { setSyncing(false); }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Server className="h-5 w-5 text-primary" /> Kobo Sync — Integrated Supervisory</DialogTitle>
          <DialogDescription>Link a KoboToolbox form and stream supervisory submissions into the dashboard.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Webhook secret card */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Webhook Authorization Secret</div>
              <p className="text-xs text-muted-foreground">Paste this into Kobo → REST Services → Custom HTTP Headers as <code>Authorization: Bearer &lt;secret&gt;</code>.</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={secret ?? "••••••••••••••••"} type={showSecret ? "text" : "password"} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => setShowSecret(v => !v)} title="Toggle visibility">
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="outline" onClick={() => secret && copy(secret, "Secret")} disabled={!secret}><Copy className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          {/* Config */}
          <div className="grid gap-3">
            <div>
              <Label>Kobo Server URL</Label>
              <Input value={cfg.serverUrl} onChange={e => setCfg({ ...cfg, serverUrl: e.target.value })} placeholder="https://kf.kobotoolbox.org" />
            </div>
            <div>
              <Label>Kobo Asset UID</Label>
              <Input value={cfg.formUid} onChange={e => setCfg({ ...cfg, formUid: e.target.value })} placeholder="aXXXXXXXXXXXXXXXXXXXX" className="font-mono" />
            </div>
            <div>
              <Label>API Token</Label>
              <div className="flex gap-2">
                <Input type={showToken ? "text" : "password"} value={cfg.apiToken} onChange={e => setCfg({ ...cfg, apiToken: e.target.value })} placeholder="Kobo account token" className="font-mono" />
                <Button size="icon" variant="outline" onClick={() => setShowToken(v => !v)}>{showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Kobo → Account Settings → API Token.</p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Background auto-sync</div>
                <div className="text-xs text-muted-foreground">Poll KoboToolbox every {cfg.pollMinutes ?? 15} minutes while the dashboard is open.</div>
              </div>
              <Switch checked={!!cfg.autoSync} onCheckedChange={v => setCfg({ ...cfg, autoSync: v })} />
            </div>
          </div>

          {status && (
            <div className={`rounded-md border p-3 text-xs flex items-start gap-2 ${status.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"}`}>
              {status.ok ? <ShieldCheck className="h-4 w-4 mt-0.5" /> : <WifiOff className="h-4 w-4 mt-0.5" />}
              <span>{status.message}</span>
            </div>
          )}

          {cache && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs flex items-center gap-2">
              <Wifi className="h-4 w-4 text-emerald-600" />
              <span>Last synced <b>{new Date(cache.fetchedAt).toLocaleString()}</b> · <Badge variant="outline">{cache.count} records</Badge></span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={runTest} disabled={testing || !cfg.formUid || !cfg.apiToken}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />} Test connection
          </Button>
          <Button onClick={runSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />} Sync Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
