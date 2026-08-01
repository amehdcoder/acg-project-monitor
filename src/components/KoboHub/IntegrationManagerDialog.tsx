/**
 * Universal Kobo Hub — "Add / edit Kobo integration" drawer.
 * Zero-config: paste a server URL, API token and asset UID, then sync.
 */
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, PlugZap, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  newId, saveConnection, setActiveId, syncConnection, testConnection,
  type HubConnection, type SyncStage,
} from "@/lib/koboHub/client";

const SERVERS = [
  "https://kf.kobotoolbox.org",
  "https://eu.kobotoolbox.org",
  "https://kobo.humanitarianresponse.info",
];

const STAGES: { key: SyncStage; label: string }[] = [
  { key: "schema", label: "Syncing schema" },
  { key: "normalizing", label: "Normalizing repeat groups" },
  { key: "widgets", label: "Building dashboard widgets" },
  { key: "ready", label: "Ready" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  connection: HubConnection | null;
  onSaved: (id: string) => void;
}

export default function IntegrationManagerDialog({ open, onOpenChange, connection, onSaved }: Props) {
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState(SERVERS[0]);
  const [formUid, setFormUid] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [cadence, setCadence] = useState(60);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<SyncStage | null>(null);
  const [stageDetail, setStageDetail] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(connection?.name ?? "");
    setServerUrl(connection?.serverUrl ?? SERVERS[0]);
    setFormUid(connection?.formUid ?? "");
    setApiToken(connection?.apiToken ?? "");
    setCadence(connection?.autoRefreshSeconds ?? 60);
    setStage(null); setStageDetail("");
  }, [open, connection]);

  const build = (): HubConnection => ({
    id: connection?.id ?? newId(),
    name: name.trim() || formUid.trim() || "Kobo form",
    serverUrl: serverUrl.trim().replace(/\/$/, ""),
    formUid: formUid.trim(),
    apiToken: apiToken.trim(),
    autoRefreshSeconds: cadence,
    createdAt: connection?.createdAt ?? new Date().toISOString(),
  });

  const valid = formUid.trim().length > 3 && apiToken.trim().length > 8;

  const handleTest = async () => {
    setBusy(true);
    try {
      const res = await testConnection(build());
      toast({ title: "Connection OK", description: res?.form_title ? `Reached “${res.form_title}”.` : "KoboToolbox responded successfully." });
    } catch (e: any) {
      toast({ title: "Connection failed", description: e?.message ?? "Unable to reach KoboToolbox.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const handleSync = async () => {
    const conn = build();
    setBusy(true);
    try {
      saveConnection(conn);
      const cache = await syncConnection(conn, (st, detail) => { setStage(st); setStageDetail(detail ?? ""); });
      if (!conn.name || conn.name === conn.formUid) {
        conn.name = cache.formTitle || conn.formUid;
        saveConnection(conn);
      }
      setActiveId(conn.id);
      toast({ title: "Dashboard generated", description: `${cache.count} submissions · ${cache.schema.fields.length} fields · ${cache.schema.repeats.length} repeat block(s).` });
      onSaved(conn.id);
      onOpenChange(false);
    } catch (e: any) {
      setStage(null);
      toast({ title: "Sync failed", description: e?.message ?? "Unable to sync this form.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-cyan-400" />
            {connection ? "Edit Kobo integration" : "Add new Kobo integration"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Connect any KoboToolbox form. The schema, choice labels, geography and repeat
            groups are detected automatically — no XLSForm upload needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-slate-300">Dashboard name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kano Coverage Survey"
              className="bg-slate-950 border-slate-700" />
          </div>
          <div>
            <Label className="text-slate-300">Kobo server</Label>
            <Select value={SERVERS.includes(serverUrl) ? serverUrl : "custom"} onValueChange={(v) => setServerUrl(v === "custom" ? "" : v)}>
              <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVERS.map((s) => <SelectItem key={s} value={s}>{s.replace("https://", "")}</SelectItem>)}
                <SelectItem value="custom">Custom server…</SelectItem>
              </SelectContent>
            </Select>
            {!SERVERS.includes(serverUrl) && (
              <Input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://your-kobo-server.org"
                className="mt-2 bg-slate-950 border-slate-700" />
            )}
          </div>
          <div>
            <Label className="text-slate-300">Form asset UID</Label>
            <Input value={formUid} onChange={(e) => setFormUid(e.target.value)} placeholder="aBcDeFgH12345"
              className="bg-slate-950 border-slate-700 font-mono" />
          </div>
          <div>
            <Label className="text-slate-300">API token</Label>
            <Input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)}
              placeholder="Kobo → Account Settings → API" className="bg-slate-950 border-slate-700 font-mono" />
            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
              <ShieldCheck className="h-3 w-3" /> Sent only to the Amehnities sync proxy — never to a third party.
            </p>
          </div>
          <div>
            <Label className="text-slate-300">Auto-refresh cadence</Label>
            <Select value={String(cadence)} onValueChange={(v) => setCadence(Number(v))}>
              <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[30, 60, 120, 300, 900].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n < 60 ? `${n} seconds` : `${n / 60} minute${n === 60 ? "" : "s"}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {stage && (
            <div className="rounded-md border border-slate-800 bg-slate-950 p-3 space-y-1.5">
              {STAGES.map((s, i) => {
                const currentIdx = STAGES.findIndex((x) => x.key === stage);
                const done = i < currentIdx || stage === "ready";
                const now = i === currentIdx && stage !== "ready";
                return (
                  <div key={s.key} className={`flex items-center gap-2 text-xs ${done ? "text-emerald-400" : now ? "text-cyan-300" : "text-slate-500"}`}>
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : now ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-700" />}
                    {s.label}
                  </div>
                );
              })}
              {stageDetail && <p className="text-[11px] text-slate-500 pt-1">{stageDetail}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="border-slate-700 text-slate-200" disabled={!valid || busy} onClick={handleTest}>
            Test connection
          </Button>
          <Button className="bg-cyan-600 hover:bg-cyan-500" disabled={!valid || busy} onClick={handleSync}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlugZap className="h-4 w-4 mr-2" />}
            Sync &amp; auto-generate dashboard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
