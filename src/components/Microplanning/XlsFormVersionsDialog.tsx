// XLSForm Versions — Super Admin only.
//
// Lists every stored XLSForm export tied to the microplanning form, shows
// the changelog + validation summary, and lets admins download any past
// version or make it the active/rollback target.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, Download, History, Loader2, RotateCw, XCircle, AlertTriangle } from "lucide-react";

interface VersionRow {
  id: string;
  version_number: number;
  changelog: string;
  notes: string | null;
  size_bytes: number;
  sha256: string | null;
  survey_row_count: number;
  choices_row_count: number;
  validation_report: { ok?: boolean; errors?: any[]; warnings?: any[] } | null;
  kobo_asset_uid: string | null;
  kobo_version_id: string | null;
  kobo_server_url: string | null;
  kobo_deployed_at: string | null;
  is_active: boolean;
  created_by_email: string | null;
  created_at: string;
}

interface Props { open: boolean; onClose: () => void; }

const humanSize = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

const XlsFormVersionsDialog = ({ open, onClose }: Props) => {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: { action: "list_xlsform_versions" },
      });
      if (error) throw error;
      setVersions((data?.versions ?? []) as VersionRow[]);
    } catch (e: any) {
      toast({ title: "Failed to load versions", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const download = async (v: VersionRow) => {
    setBusyId(v.id);
    try {
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: { action: "get_xlsform_version", id: v.id },
      });
      if (error) throw error;
      const b64 = data?.version?.xlsx_base64;
      if (!b64) throw new Error("Version payload missing");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf = bytes.slice().buffer as ArrayBuffer;
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `amehnities_geo_microplanning_v${v.version_number}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: `Downloaded v${v.version_number}` });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const rollback = async (v: VersionRow) => {
    if (!confirm(`Roll back to Version ${v.version_number}? This becomes the active XLSForm.`)) return;
    setBusyId(v.id);
    try {
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: { action: "rollback_xlsform_version", id: v.id },
      });
      if (error) throw error;
      toast({ title: `Rolled back to v${data?.active_version?.version_number ?? v.version_number}` });
      load();
    } catch (e: any) {
      toast({ title: "Rollback failed", description: e.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> XLSForm Version History
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading versions…
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No versions saved yet. Build & save an XLSForm to start tracking history.
            </div>
          ) : versions.map((v) => {
            const vr = v.validation_report || {};
            const errCount = (vr.errors?.length ?? 0);
            const warnCount = (vr.warnings?.length ?? 0);
            const isBusy = busyId === v.id;
            return (
              <div key={v.id} className="border rounded-lg p-3 bg-card space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">Version {v.version_number}</span>
                      {v.is_active && <Badge className="bg-emerald-600 hover:bg-emerald-700">Active</Badge>}
                      {vr.ok
                        ? <Badge variant="outline" className="text-emerald-700 border-emerald-500"><CheckCircle2 className="h-3 w-3 mr-1" />Valid</Badge>
                        : errCount > 0
                          ? <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{errCount} error{errCount === 1 ? "" : "s"}</Badge>
                          : <Badge variant="outline" className="text-amber-700 border-amber-500"><AlertTriangle className="h-3 w-3 mr-1" />Unvalidated</Badge>}
                      {warnCount > 0 && (
                        <Badge variant="outline" className="text-amber-700 border-amber-500">{warnCount} warning{warnCount === 1 ? "" : "s"}</Badge>
                      )}
                      {v.kobo_asset_uid && (
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          Kobo · {v.kobo_asset_uid.slice(0, 10)}… {v.kobo_version_id ? `· ${v.kobo_version_id.slice(0, 6)}…` : ""}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(v.created_at).toLocaleString()} · {v.created_by_email ?? "—"} · {humanSize(v.size_bytes)} · {v.survey_row_count} survey rows · {v.choices_row_count} choice rows
                    </div>
                    <div className="text-sm mt-1.5">{v.changelog}</div>
                    {v.notes && <div className="text-xs text-muted-foreground italic mt-0.5">{v.notes}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => download(v)} disabled={isBusy}>
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                      Download
                    </Button>
                    {!v.is_active && (
                      <Button size="sm" variant="secondary" onClick={() => rollback(v)} disabled={isBusy}>
                        <RotateCw className="h-3.5 w-3.5 mr-1.5" /> Roll back
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default XlsFormVersionsDialog;
