import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { History, Plus, Pencil, Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

interface HistoryRow {
  id: string;
  state: string | null;
  lga: string;
  year: number | null;
  campaign_type: string | null;
  medicine_name: string | null;
  old_amount: number | null;
  new_amount: number | null;
  action: "create" | "update" | "delete" | string;
  changed_by: string;
  changed_at: string;
}

const AllocationHistoryDialog = ({ open, onClose, projectId }: Props) => {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open || !projectId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("microplan_allocation_history")
        .select("*")
        .eq("project_id", projectId)
        .order("changed_at", { ascending: false })
        .limit(200);
      const list = (data as HistoryRow[]) || [];
      setRows(list);
      const ids = [...new Set(list.map(r => r.changed_by))];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", ids);
        const m = new Map<string, string>();
        (profs || []).forEach((p: any) =>
          m.set(p.user_id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email)
        );
        setUsers(m);
      }
      setLoading(false);
    })();
  }, [open, projectId]);

  const actionMeta: Record<string, { icon: any; cls: string; label: string }> = {
    create: { icon: Plus, cls: "bg-emerald-100 text-emerald-700 border-emerald-300", label: "Created" },
    update: { icon: Pencil, cls: "bg-amber-100 text-amber-700 border-amber-300", label: "Updated" },
    delete: { icon: Trash2, cls: "bg-red-100 text-red-700 border-red-300", label: "Deleted" },
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Medicine Allocation History
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No allocation changes yet.</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map(r => {
                const meta = actionMeta[r.action] || actionMeta.update;
                const Icon = meta.icon;
                const delta =
                  r.old_amount != null && r.new_amount != null
                    ? r.new_amount - r.old_amount
                    : null;
                return (
                  <div key={r.id} className="border border-border rounded-md p-2 bg-muted/10 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] gap-1 ${meta.cls}`}>
                          <Icon className="h-3 w-3" /> {meta.label}
                        </Badge>
                        <span className="font-semibold">{r.lga}</span>
                        {r.state && <span className="text-muted-foreground">· {r.state}</span>}
                        {r.year && <Badge variant="outline" className="text-[9px]">Year {r.year}</Badge>}
                        {r.medicine_name && <Badge variant="outline" className="text-[9px]">{r.medicine_name}</Badge>}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(r.changed_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground">
                        by <strong className="text-foreground">{users.get(r.changed_by) || "user"}</strong>
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="tabular-nums">
                        {r.old_amount != null ? r.old_amount.toLocaleString() : "—"} →{" "}
                        <strong>{r.new_amount != null ? r.new_amount.toLocaleString() : "—"}</strong>
                      </span>
                      {delta !== null && delta !== 0 && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${delta > 0 ? "text-emerald-700 border-emerald-300" : "text-red-700 border-red-300"}`}
                        >
                          {delta > 0 ? "+" : ""}{delta.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AllocationHistoryDialog;
