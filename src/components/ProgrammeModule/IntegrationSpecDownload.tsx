import { useEffect, useState } from "react";
import { FileCode2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
export default function IntegrationSpecDownload({ config, moduleName, projectId }: { config: ProgrammeModuleConfig; moduleName: string; projectId?: string | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [owner, setOwner] = useState(false);
  const [busy, setBusy] = useState<SpecFormat | null>(null);

  useEffect(() => {
    let live = true;
    if (!user?.id) { setOwner(false); return; }
    supabase.rpc("is_owner_level", { _user_id: user.id }).then(({ data }) => { if (live) setOwner(data === true); });
    return () => { live = false; };
  }, [user?.id]);

  if (!owner) return null;

  const download = async (format: SpecFormat) => {
    setBusy(format);
    try {
      let projectName = "Project";
      if (projectId) { const { data } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle(); if (data?.name) projectName = data.name; }
      const [{ buildLbrApiSpec }, { buildSpecFile, downloadBlob }] = await Promise.all([import("@/lib/integrations/lbrApiSpec"), import("@/lib/integrations/lbrApiExport")]);
      const spec = buildLbrApiSpec({ config, moduleName, projectName, supabaseUrl: import.meta.env.VITE_SUPABASE_URL });
      const { blob, filename } = await buildSpecFile(spec, format);
      downloadBlob(blob, filename);
    } catch (e) {
      toast({ title: "Could not create the document", description: String((e as Error)?.message || e).slice(0, 160), variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1" disabled={busy !== null} aria-label="Download API integration document">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />} API spec
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[1200] w-60 bg-popover">
        <DropdownMenuLabel className="text-xs">Integration document (Owner only)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMATS.map((f) => <DropdownMenuItem key={f.id} onSelect={() => void download(f.id)}>{f.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
