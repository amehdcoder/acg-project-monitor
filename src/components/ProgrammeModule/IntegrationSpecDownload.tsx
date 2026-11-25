import { useEffect, useState } from "react";
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
import type { SpecFormat } from "@/lib/integrations/lbrApiExport";

const FORMATS: { id: SpecFormat; label: string }[] = [
  { id: "pdf", label: "PDF document" }, { id: "docx", label: "Microsoft Word (.docx)" },
  { id: "pptx", label: "PowerPoint (.pptx)" }, { id: "txt", label: "Plain text (.txt)" }, { id: "json", label: "Machine-readable JSON" },
];

/** Owner-only download of the LBR API & webhook integration specification. */
export default function IntegrationSpecDownload({ config, moduleName, projectId, moduleId }: { config: ProgrammeModuleConfig; moduleName: string; projectId?: string | null; moduleId?: string | null }) {
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

  if (!owner) return null;

  const download = async () => {
    setBusy(format);
    try {
      let projectName = "Project";
      if (projectId) { const { data } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle(); if (data?.name) projectName = data.name; }
      const [{ buildLbrApiSpec }, { buildSpecFile, downloadBlob }] = await Promise.all([import("@/lib/integrations/lbrApiSpec"), import("@/lib/integrations/lbrApiExport")]);
      const spec = buildLbrApiSpec({ config, moduleName, projectName, supabaseUrl: import.meta.env.VITE_SUPABASE_URL, components: allOn ? [] : picked, moduleId: moduleId || undefined });
      const { blob, filename } = await buildSpecFile(spec, format);
      downloadBlob(blob, filename);
      setOpen(false);
    } catch (e) {
      toast({ title: "Could not create the document", description: String((e as Error)?.message || e).slice(0, 160), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const selLabel = allOn ? "All components" : picked.length === 1 ? "Single component" : `${picked.length} components`;
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1" disabled={busy !== null} onClick={() => setOpen(true)} aria-label="Download API integration document">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />} API spec
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="z-[1200] max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Integration requirements</DialogTitle>
            <DialogDescription>Choose the components to document. The file only contains requirements for your selection.</DialogDescription>
          </DialogHeader>
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
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy !== null}>Cancel</Button>
            <Button onClick={() => void download()} disabled={busy !== null}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
