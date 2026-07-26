// Versioned mapping history & rollback UI for a single Kobo form config.
//
// Shows the immutable timeline of mapping revisions, lets an admin compare
// any historical revision against the currently active one, and roll back
// with one click (which itself is logged as a fresh version).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, History, GitCompare, RotateCcw, CheckCircle2, ArrowRight,
  Plus, Minus, ArrowLeftRight,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  configId: string | null;
  formTitle?: string | null;
  onRolledBack?: () => void;
}

interface Version {
  id: string;
  config_id: string;
  version_number: number;
  field_mappings: Record<string, string>;
  change_summary: string;
  created_by: string;
  created_at: string;
  author: { first_name: string | null; last_name: string | null; email: string | null; avatar_url: string | null } | null;
}

const invoke = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("kobo-form-manager", { body });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
};

const authorLabel = (v: Version) => {
  const a = v.author;
  if (!a) return "Unknown";
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
  return name || a.email || "Unknown";
};

const initials = (v: Version) => {
  const a = v.author;
  const s = [a?.first_name?.[0], a?.last_name?.[0]].filter(Boolean).join("");
  return (s || (a?.email?.[0] ?? "?")).toUpperCase();
};

export default function KoboMappingHistoryDialog({ open, onClose, configId, formTitle, onRolledBack }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

  const load = async () => {
    if (!configId) return;
    setLoading(true);
    try {
      const res: any = await invoke({ action: "list_mapping_versions", config_id: configId });
      setVersions((res?.versions ?? []) as Version[]);
      setActiveVersion(res?.active_version_number ?? null);
    } catch (e: any) {
      toast({ title: "Failed to load history", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && configId) { setCompareId(null); load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, configId]);

  const activeVersionRow = useMemo(
    () => versions.find((v) => v.version_number === activeVersion) ?? null,
    [versions, activeVersion],
  );

  const compareRow = useMemo(
    () => versions.find((v) => v.id === compareId) ?? null,
    [versions, compareId],
  );

  const diffRows = useMemo(() => {
    if (!activeVersionRow || !compareRow) return [];
    const a = compareRow.field_mappings ?? {};
    const b = activeVersionRow.field_mappings ?? {};
    const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
    return keys.map((k) => {
      const from = a[k];
      const to = b[k];
      let kind: "same" | "added" | "removed" | "changed" = "same";
      if (from && !to) kind = "removed";
      else if (!from && to) kind = "added";
      else if (from !== to) kind = "changed";
      return { key: k, from: from ?? null, to: to ?? null, kind };
    });
  }, [activeVersionRow, compareRow]);

  const rollback = async (v: Version) => {
    if (!configId) return;
    if (!confirm(
      `Rolling back will restore field mappings to version v${v.version_number} and apply to all future incoming Kobo webhooks.\n\nProceed?`
    )) return;
    setRollingBack(v.version_number);
    try {
      await invoke({
        action: "rollback_mapping_version",
        config_id: configId,
        target_version_number: v.version_number,
      });
      toast({ title: `Rolled back to v${v.version_number}` });
      await load();
      onRolledBack?.();
    } catch (e: any) {
      toast({ title: "Rollback failed", description: e.message, variant: "destructive" });
    } finally {
      setRollingBack(null);
    }
  };

  const diffChip = (kind: "same" | "added" | "removed" | "changed") => {
    if (kind === "added") return <span className="inline-flex items-center gap-0.5 text-emerald-600"><Plus className="h-3 w-3" />Added</span>;
    if (kind === "removed") return <span className="inline-flex items-center gap-0.5 text-destructive"><Minus className="h-3 w-3" />Removed</span>;
    if (kind === "changed") return <span className="inline-flex items-center gap-0.5 text-amber-600"><ArrowLeftRight className="h-3 w-3" />Reassigned</span>;
    return <span className="text-muted-foreground">Same</span>;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Mapping History &amp; Versioning
            {formTitle && <span className="text-xs text-muted-foreground font-normal">· {formTitle}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {loading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : versions.length === 0 ? (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-3 text-center">
              No mapping revisions yet. Every save from the config panel is logged here.
            </div>
          ) : (
            <ol className="space-y-2">
              {versions.map((v) => {
                const isActive = v.version_number === activeVersion;
                return (
                  <li key={v.id} className={`border rounded-lg p-3 ${isActive ? "border-emerald-500 bg-emerald-500/5" : "bg-card"}`}>
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0">
                        {initials(v)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">v{v.version_number}</span>
                          {isActive && (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px] h-4">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" />ACTIVE
                            </Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            by {authorLabel(v)} · {new Date(v.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs mt-1">{v.change_summary}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {Object.keys(v.field_mappings ?? {}).length} field(s) mapped
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!isActive && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setCompareId(v.id)}>
                              <GitCompare className="h-3 w-3 mr-1" /> Compare with Active
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 text-[11px]"
                              onClick={() => rollback(v)}
                              disabled={rollingBack === v.version_number}
                            >
                              {rollingBack === v.version_number
                                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                : <RotateCcw className="h-3 w-3 mr-1" />}
                              Roll Back to This Version
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Diff modal */}
        <Dialog open={!!compareRow} onOpenChange={(v) => { if (!v) setCompareId(null); }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <GitCompare className="h-4 w-4 text-primary" />
                Diff: v{compareRow?.version_number} <ArrowRight className="h-3 w-3" /> v{activeVersionRow?.version_number} (Active)
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto text-xs">
              <table className="w-full">
                <thead className="bg-muted text-left sticky top-0">
                  <tr>
                    <th className="p-2 w-1/4">Microplan field</th>
                    <th className="p-2 w-1/3">v{compareRow?.version_number} (compared)</th>
                    <th className="p-2 w-1/3">v{activeVersionRow?.version_number} (active)</th>
                    <th className="p-2">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {diffRows.length === 0 ? (
                    <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">No fields to compare.</td></tr>
                  ) : diffRows.map((r) => (
                    <tr
                      key={r.key}
                      className={`border-t ${
                        r.kind === "added" ? "bg-emerald-500/10"
                        : r.kind === "removed" ? "bg-destructive/10"
                        : r.kind === "changed" ? "bg-amber-500/10"
                        : ""
                      }`}
                    >
                      <td className="p-2 font-mono text-[11px]">{r.key}</td>
                      <td className="p-2 font-mono text-[11px]">{r.from ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2 font-mono text-[11px]">{r.to ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2">{diffChip(r.kind)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-muted-foreground border-t pt-2 flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><Plus className="h-3 w-3 text-emerald-600" /> Added</span>
              <span className="inline-flex items-center gap-1"><Minus className="h-3 w-3 text-destructive" /> Removed</span>
              <span className="inline-flex items-center gap-1"><ArrowLeftRight className="h-3 w-3 text-amber-600" /> Reassigned</span>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
