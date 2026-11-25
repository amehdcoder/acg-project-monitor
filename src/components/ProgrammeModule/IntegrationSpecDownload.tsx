import { useEffect, useRef, useState } from "react";
import { FileCode2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { ProgrammeModuleConfig } from "@/lib/programmeModule/types";
import { normalizeConfig } from "@/lib/programmeModule/defaults";
import type { SpecFormat } from "@/lib/integrations/lbrApiExport";

const FORMATS: { id: SpecFormat; label: string }[] = [
  { id: "pdf", label: "PDF document" }, { id: "docx", label: "Microsoft Word (.docx)" },
  { id: "pptx", label: "PowerPoint (.pptx)" }, { id: "txt", label: "Plain text (.txt)" }, { id: "json", label: "Machine-readable JSON" },
];

/** Owner-only download of the LBR API & webhook integration specification. */
export default function IntegrationSpecDownload({ config: initialConfig, moduleName: initialName, projectId, moduleId }: { config: ProgrammeModuleConfig; moduleName: string; projectId?: string | null; moduleId?: string | null }) {
  // Living document: track the records setup live so every download reflects the latest changes.
  const [liveSetup, setLiveSetup] = useState<{ config: ProgrammeModuleConfig; name: string; changedAt: string | null; sig: string }>(() => ({ config: initialConfig, name: initialName, changedAt: null, sig: JSON.stringify(initialConfig) }));
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const applySetup = (cfg: unknown, name: string | undefined, changedAt: string | null, announce: boolean) => {
    const config = normalizeConfig(cfg as ProgrammeModuleConfig);
    const sig = JSON.stringify(config) + "|" + (name || "");
    setLiveSetup((prev) => {
      if (prev.sig === sig && prev.changedAt === changedAt) return prev;
      if (announce && prev.sig !== sig) setLiveNotice(`Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — the document now includes the latest records changes.`);
      return { config, name: name || prev.name, changedAt: changedAt ?? prev.changedAt, sig };
    });
  };
  useEffect(() => { applySetup(initialConfig, initialName, null, true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [JSON.stringify(initialConfig), initialName]);
  const config = liveSetup.config, moduleName = liveSetup.name;
  const { user } = useAuth();
  const { toast } = useToast();
  const [owner, setOwner] = useState(false);
  const [busy, setBusy] = useState<SpecFormat | null>(null);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<SpecFormat>("pdf");
  const comps = (config.components || []).filter((c) => !c.hidden).sort((a, b) => a.order - b.order);
  const [picked, setPicked] = useState<string[]>([]);
  const allOn = picked.length === 0 || picked.length === comps.length;
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  useEffect(() => {
    let live = true;
    if (!user?.id) { setOwner(false); return; }
    supabase.rpc("is_owner_level", { _user_id: user.id }).then(({ data }) => { if (live) setOwner(data === true); });
    return () => { live = false; };
  }, [user?.id]);

  // Prepare the file in the background as soon as the window opens or the choice changes,
  // so clicking Download saves it instantly (browsers block downloads after long waits).
  const selKey = `${format}|${allOn ? "*" : [...picked].sort().join(",")}|${liveSetup.changedAt || ""}|${simpleHash(liveSetup.sig)}`;
  const [ready, setReady] = useState<{ key: string; blob: Blob; filename: string } | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const projectNameRef = useRef<Promise<string> | null>(null);
  const pendingClick = useRef(false);
  const [nonce, setNonce] = useState(0);
  const [revision, setRevision] = useState<string | null>(null);
  const doSave = (f: { blob: Blob; filename: string }) => {
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement("a"); a.href = url; a.download = f.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    toast({ title: "Download started", description: f.filename });
    setOpen(false);
  };

  useEffect(() => {
    if (!owner || !open) return;
    let live = true;
    setPrepError(null);
    if (ready?.key === selKey) return;
    setBusy(format);
    (async () => {
      projectNameRef.current ??= (async () => {
        if (!projectId) return "Project";
        const { data } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
        return data?.name || "Project";
      })();
      const [projectName, { buildLbrApiSpec }, { buildSpecFile }] = await Promise.all([projectNameRef.current, import("@/lib/integrations/lbrApiSpec"), import("@/lib/integrations/lbrApiExport")]);
      const spec = buildLbrApiSpec({ config, moduleName, projectName, supabaseUrl: import.meta.env.VITE_SUPABASE_URL, components: allOn ? [] : picked, moduleId: moduleId || undefined, lastChanged: liveSetup.changedAt });
      setRevision(spec.revision);
      const file = await buildSpecFile(spec, format);
      if (!live) return;
      setReady({ key: selKey, ...file });
      if (pendingClick.current) { pendingClick.current = false; doSave(file); }
    })().catch((e) => { if (live) { pendingClick.current = false; const msg = String((e as Error)?.message || e).slice(0, 160); setPrepError(msg); toast({ title: "Could not create the document", description: msg, variant: "destructive" }); } })
      .finally(() => { if (live) setBusy(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, open, selKey, nonce]);

  // Warm the generators and logos before the window is even opened.
  useEffect(() => {
    if (!owner) return;
    const t = setTimeout(() => { void import("@/lib/integrations/lbrApiSpec"); void import("@/lib/integrations/lbrApiExport").then((m) => m.loadLogos()); void import("jspdf"); void import("jspdf-autotable"); }, 1500);
    return () => clearTimeout(t);
  }, [owner]);

  // Realtime + focus/reconnect refresh of the records setup while the owner can download.
  useEffect(() => {
    if (!owner || !moduleId) return;
    let live = true;
    const refetch = async (announce: boolean) => {
      const { data } = await supabase.from("programme_modules").select("config,name,updated_at").eq("id", moduleId).maybeSingle();
      if (live && data) applySetup((data as unknown as { config: unknown }).config, (data as unknown as { name?: string }).name, (data as unknown as { updated_at?: string }).updated_at || null, announce);
    };
    void refetch(false);
    const channel = supabase.channel(`spec-module-${moduleId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "programme_modules", filter: `id=eq.${moduleId}` }, (p) => {
        const row = p.new as { config?: unknown; name?: string; updated_at?: string };
        if (row?.config) applySetup(row.config, row.name, row.updated_at || null, true); else void refetch(true);
      })
      .subscribe((status) => { if (status === "SUBSCRIBED") void refetch(true); });
    const onFocus = () => { if (document.visibilityState === "visible") void refetch(true); };
    window.addEventListener("focus", onFocus); window.addEventListener("online", onFocus); document.addEventListener("visibilitychange", onFocus);
    return () => { live = false; void supabase.removeChannel(channel); window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus); document.removeEventListener("visibilitychange", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, moduleId]);

  if (!owner) return null;

  const isReady = ready?.key === selKey;
  const download = () => {
    if (prepError) { pendingClick.current = true; setNonce((n) => n + 1); return; }
    if (isReady && ready) { doSave(ready); return; }
    pendingClick.current = true; // saves automatically the moment preparation finishes
  };

  const selLabel = allOn ? "All components" : picked.length === 1 ? "Single component" : `${picked.length} components`;
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setOpen(true)} aria-label="Download API integration document">
        <FileCode2 className="h-4 w-4" /> API spec
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) pendingClick.current = false; setOpen(o); }}>
        <DialogContent className="z-[1200] max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Integration requirements</DialogTitle>
            <DialogDescription>Choose the components to document. The file only contains requirements for your selection.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs" role="status" aria-live="polite">
            <div className="flex items-center gap-2 font-medium text-primary">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>
              Living document{revision ? ` · rev ${revision}` : ""}
            </div>
            <p className="mt-1 text-muted-foreground">{liveNotice || "Updates automatically as components, services and fields change in Beneficiary Records."}{liveSetup.changedAt ? ` Setup last changed ${new Date(liveSetup.changedAt).toLocaleString()}.` : ""}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Components</span>
              <span className="text-xs text-muted-foreground">{selLabel}</span>
            </div>
            <label className="flex items-center gap-2 rounded-md border p-2 text-sm font-medium">
              <Checkbox checked={allOn} onCheckedChange={() => setPicked([])} aria-label="All components" /> All components
            </label>
            <div className="grid gap-1 sm:grid-cols-2">
              {comps.map((c) => (
                <label key={c.key} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                  <Checkbox className="mt-0.5" checked={!allOn && picked.includes(c.key)} onCheckedChange={() => toggle(c.key)} aria-label={c.label} />
                  <span className="break-words">{c.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">Format</span>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as SpecFormat)} className="grid gap-1 sm:grid-cols-2">
              {FORMATS.map((f) => (
                <Label key={f.id} className="flex items-center gap-2 rounded-md border p-2 font-normal"><RadioGroupItem value={f.id} />{f.label}</Label>
              ))}
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={download} aria-label="Download document">{!isReady && busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isReady ? "Download" : prepError ? "Retry" : "Preparing…"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function simpleHash(t: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
