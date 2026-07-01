import { useEffect, useState } from "react";
import { History, Plus, Minus, Pencil, Settings2, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import type { StudioChange } from "@/lib/specialStudio/audit";

interface AuditRow {
  id: string;
  action: string;
  summary: string | null;
  changes: StudioChange[];
  changed_by_name: string | null;
  changed_by_email: string | null;
  created_at: string;
}

const KIND_ICON: Record<string, typeof Plus> = {
  added: Plus,
  removed: Minus,
  modified: Pencil,
  meta: Settings2,
};

const KIND_COLOR: Record<string, string> = {
  added: "text-emerald-500",
  removed: "text-red-500",
  modified: "text-amber-500",
  meta: "text-indigo-500",
};

export default function StudioHistoryPanel({
  formId,
  open,
  onOpenChange,
}: {
  formId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !formId) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("special_form_studio_audit")
        .select("*")
        .eq("form_id", formId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (active) {
        setRows((data || []) as unknown as AuditRow[]);
        setLoading(false);
      }
    };
    load();
    const channel = supabase
      .channel(`studio-audit-${formId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "special_form_studio_audit", filter: `form_id=eq.${formId}` },
        (payload) => setRows((prev) => [payload.new as unknown as AuditRow, ...prev]),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [open, formId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-indigo-500" /> Change history
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-3">
          {loading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {!loading && rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No changes recorded yet.</p>
          )}
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {r.action}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs font-medium">
                  {r.changed_by_name || r.changed_by_email || "Unknown user"}
                </p>
                <div className="mt-2 space-y-1">
                  {(r.changes || []).map((c, i) => {
                    const Icon = KIND_ICON[c.kind] || Pencil;
                    return (
                      <div key={i} className="flex items-start gap-1.5 text-[11px]">
                        <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${KIND_COLOR[c.kind] || ""}`} />
                        <span>
                          <span className="font-semibold">{c.field}</span>{" "}
                          <span className="text-muted-foreground">{c.detail}</span>
                        </span>
                      </div>
                    );
                  })}
                  {(!r.changes || r.changes.length === 0) && (
                    <p className="text-[11px] text-muted-foreground">{r.summary}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
