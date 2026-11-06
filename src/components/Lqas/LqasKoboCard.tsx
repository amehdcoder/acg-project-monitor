import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Clock, Copy, Download, Eye, EyeOff, FileSpreadsheet, Link2, Loader2, Lock, Radio, Settings2, UploadCloud } from "lucide-react";
import { buildLqasXlsForm, downloadBlob, type FormContext } from "@/lib/lqas/forms";
import { buildRoundXlsForm, type LotInfo, type RoundInfo } from "@/lib/lqas/roundForms";

interface Latest { created_at: string; eu_name: string; covered: number; sampled: number }

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export default function LqasKoboCard({ projectId, projectName, ctx, webhook }: { projectId: string; projectName: string; ctx: FormContext; webhook: string }) {
  const { isAdmin, isOwner, isSuperAdmin } = useAuth();
  const canUse = !!(isAdmin || isOwner || isSuperAdmin);
  const [open, setOpen] = useState(false);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [today, setToday] = useState(0);

  const loadStatus = useCallback(async () => {
    if (!projectId) return;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const [{ data }, { count }] = await Promise.all([
      supabase.from("lqas_results").select("created_at, eu_name, covered, sampled").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1),
      supabase.from("lqas_results").select("id", { count: "exact", head: true }).eq("project_id", projectId).gte("created_at", since.toISOString()),
    ]);
    setLatest(((data ?? [])[0] as Latest) ?? null);
    setToday(count ?? 0);
  }, [projectId]);

  useEffect(() => {
    loadStatus();
    if (!projectId) return;
    const ch = supabase.channel(`lqas-kobo-${projectId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lqas_results", filter: `project_id=eq.${projectId}` }, () => loadStatus())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, loadStatus]);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-0.5 h-5 w-5 text-primary" strokeWidth={1.5} />
        <div>
          <h3 className="text-sm font-semibold text-foreground">KoboToolbox</h3>
          <p className="text-xs text-muted-foreground">LQAS submissions from KoboCollect flow into lots, coverage and mop-up decisions in real time.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {latest ? (
          <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3 text-primary" />Last: {latest.eu_name} · {latest.covered}/{latest.sampled} · {formatDistanceToNow(new Date(latest.created_at), { addSuffix: true })}</Badge>
        ) : (
          <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Waiting for first submission</Badge>
        )}
        <Badge variant="outline" className="gap-1"><Radio className="h-3 w-3 text-primary" />{today} today</Badge>
        <Button size="sm" variant="outline" disabled={!canUse || !projectId} onClick={() => setOpen(true)}><Settings2 className="mr-1 h-3.5 w-3.5" />Sync settings</Button>
      </div>
      {!canUse && <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" />Only Admins can manage KoboToolbox</p>}
      {canUse && <LqasKoboDialog open={open} onClose={() => setOpen(false)} projectId={projectId} projectName={projectName} ctx={ctx} webhook={webhook} />}
    </Card>
  );
}

function LqasKoboDialog({ open, onClose, projectId, projectName, ctx, webhook }: { open: boolean; onClose: () => void; projectId: string; projectName: string; ctx: FormContext; webhook: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [rounds, setRounds] = useState<(RoundInfo & { status?: string })[]>([]);
  const [formChoice, setFormChoice] = useState("general");
  const [server, setServer] = useState("https://kf.kobotoolbox.org");
  const [token, setToken] = useState("");
  const [formUid, setFormUid] = useState("");
  const [busy, setBusy] = useState<"" | "upload" | "link">("");

  useEffect(() => {
    if (!open || !projectId) return;
    supabase.functions.invoke("kobo-form-manager", { body: { action: "get_webhook_secret" } })
      .then(({ data }) => setSecret((data as { secret?: string } | null)?.secret ?? null));
    supabase.from("lqas_rounds").select("*").eq("project_id", projectId).order("created_at", { ascending: false })
      .then(({ data }) => setRounds((data ?? []) as unknown as RoundInfo[]));
  }, [open, projectId]);

  const label = useMemo(() => {
    const r = rounds.find((x) => x.id === formChoice);
    return r ? `${r.disease} · ${r.eu_name}` : "General LQAS form";
  }, [rounds, formChoice]);

  const buildForm = async () => {
    if (formChoice === "general") return buildLqasXlsForm(ctx);
    const round = rounds.find((r) => r.id === formChoice)!;
    const { data } = await supabase.from("lqas_lots").select("id, lot_key, lot_name, security_status").eq("round_id", round.id);
    return buildRoundXlsForm(round, (data ?? []) as LotInfo[], projectName, ctx.indicator);
  };

  const fileName = `LQAS_${label.replace(/[^a-z0-9]+/gi, "_")}.xlsx`;

  const upload = async () => {
    if (!token.trim()) return toast.error("Enter your KoboToolbox API token");
    setBusy("upload");
    try {
      const blob = await buildForm();
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: { action: "upload_xlsform_to_kobo", server_url: server.trim(), api_token: token.trim(), xlsx_base64: await blobToBase64(blob), form_uid: formUid.trim() || undefined, asset_name: `${projectName} LQAS ${label}` },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || data?.error || "Upload failed");
      if (data.form_uid) setFormUid(data.form_uid);
      toast.success(`Uploaded and deployed: ${data.form_title ?? data.form_uid}`);
    } catch (e) { toast.error(`Upload failed: ${(e as Error).message}`); } finally { setBusy(""); }
  };

  const link = async () => {
    if (!token.trim() || !formUid.trim()) return toast.error("API token and form ID are both needed");
    setBusy("link");
    try {
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: { action: "register_webhook", target: "lqas", server_url: server.trim(), api_token: token.trim(), form_uid: formUid.trim(), project_id: projectId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || data?.error || "Link failed");
      toast.success("KoboToolbox will now send every submission to this project's LQAS results");
    } catch (e) { toast.error(`Link failed: ${(e as Error).message}`); } finally { setBusy(""); }
  };

  const copy = (v: string, what: string) => { navigator.clipboard.writeText(v); toast.success(`${what} copied`); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" />KoboToolbox · LQAS sync</DialogTitle>
          <DialogDescription>Deploy the LQAS phone form and link it so results land in this project instantly.</DialogDescription>
        </DialogHeader>

        <section className="space-y-2 rounded-lg border p-3">
          <h4 className="text-sm font-semibold">1 · Choose the form</h4>
          <Select value={formChoice} onValueChange={setFormChoice}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General LQAS form (any area)</SelectItem>
              {rounds.map((r) => <SelectItem key={r.id} value={r.id}>Round: {r.disease} · {r.eu_name} (links to lots)</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={async () => downloadBlob(await buildForm(), fileName)}><Download className="mr-1 h-3.5 w-3.5" />Download XLSForm</Button>
        </section>

        <section className="space-y-2 rounded-lg border p-3">
          <h4 className="text-sm font-semibold">2 · Deploy to KoboToolbox</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><Label className="text-xs">Server</Label><Input value={server} onChange={(e) => setServer(e.target.value)} /></div>
            <div><Label className="text-xs">Form ID (leave blank to create new)</Label><Input value={formUid} onChange={(e) => setFormUid(e.target.value)} placeholder="aBcD123…" /></div>
          </div>
          <div><Label className="text-xs">API token (Account settings → Security; not stored)</Label><Input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" /></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={upload} disabled={!!busy}>{busy === "upload" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="mr-1 h-3.5 w-3.5" />}Upload &amp; deploy</Button>
            <Button size="sm" variant="secondary" onClick={link} disabled={!!busy}>{busy === "link" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}Link submissions automatically</Button>
          </div>
        </section>

        <section className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs">
          <h4 className="text-sm font-semibold">Or link by hand (KoboToolbox → Settings → REST Services)</h4>
          <div className="flex items-center gap-2"><span className="w-20 shrink-0 font-medium">Endpoint</span><code className="flex-1 break-all">{webhook}</code><Button size="icon" variant="ghost" onClick={() => copy(webhook, "Link")}><Copy className="h-4 w-4" /></Button></div>
          <div className="flex items-center gap-2"><span className="w-20 shrink-0 font-medium">Header</span><code>x-kobo-secret</code></div>
          <div className="flex items-center gap-2"><span className="w-20 shrink-0 font-medium">Secret</span>
            <code className="flex-1 break-all">{secret ? (showSecret ? secret : "•".repeat(24)) : "Not available"}</code>
            {secret && <><Button size="icon" variant="ghost" onClick={() => setShowSecret((s) => !s)}>{showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
              <Button size="icon" variant="ghost" onClick={() => copy(secret, "Secret")}><Copy className="h-4 w-4" /></Button></>}
          </div>
          <p className="text-muted-foreground">This is the same secret used by Geo Microplanning; rotate it there.</p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
