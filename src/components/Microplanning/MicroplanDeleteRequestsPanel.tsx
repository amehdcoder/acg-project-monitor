import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, Clock, CheckCircle2, XCircle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** When true, admin can approve/reject any request. When false, only own history is shown. */
  isAdmin: boolean;
}

interface RequestRow {
  id: string;
  entry_id: string;
  project_id: string | null;
  requester_id: string;
  requester_reason: string;
  status: "pending" | "approved" | "rejected";
  decided_by: string | null;
  decider_reason: string | null;
  decided_at: string | null;
  created_at: string;
}

const statusBadge = (s: string) => {
  if (s === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
  if (s === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
  return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
};

const MicroplanDeleteRequestsPanel = ({ open, onClose, isAdmin }: Props) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, { name: string; email: string }>>(new Map());
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("microplan_delete_requests" as any)
        .select("id, entry_id, project_id, requester_id, requester_reason, status, decided_by, decider_reason, decided_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const list = (data || []) as unknown as RequestRow[];
      setRows(list);
      const ids = Array.from(new Set(list.flatMap(r => [r.requester_id, r.decided_by].filter(Boolean) as string[])));
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", ids);
        const m = new Map<string, { name: string; email: string }>();
        (profs || []).forEach((p: any) => {
          m.set(p.user_id, { name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown", email: p.email ?? "" });
        });
        setProfiles(m);
      }
    } catch (e: any) {
      toast({ title: "Failed to load requests", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const decide = async (row: RequestRow, next: "approved" | "rejected") => {
    if (!user?.id) return;
    const reason = (decisionReason[row.id] || "").trim();
    if (reason.length < 5) {
      toast({ title: "Reason required", description: "Provide at least 5 characters.", variant: "destructive" });
      return;
    }
    setBusyId(row.id);
    try {
      const { error } = await supabase
        .from("microplan_delete_requests" as any)
        .update({
          status: next,
          decided_by: user.id,
          decider_reason: reason,
          decided_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "pending");
      if (error) throw error;
      toast({
        title: next === "approved" ? "✅ Approved & entry deleted" : "❌ Request rejected",
        description: next === "approved" ? "The microplan entry has been removed." : "The requester will see your reason.",
      });
      load();
    } catch (e: any) {
      toast({ title: "Decision failed", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const pending = useMemo(() => rows.filter(r => r.status === "pending"), [rows]);
  const decided = useMemo(() => rows.filter(r => r.status !== "pending"), [rows]);

  const renderRow = (r: RequestRow) => {
    const requester = profiles.get(r.requester_id);
    const decider = r.decided_by ? profiles.get(r.decided_by) : null;
    return (
      <div key={r.id} className="border rounded-lg p-3 space-y-2 bg-card">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="text-xs">
            <div className="font-medium text-foreground">{requester?.name || "Unknown user"}</div>
            <div className="text-muted-foreground">{requester?.email}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Requested {new Date(r.created_at).toLocaleString()}
            </div>
          </div>
          {statusBadge(r.status)}
        </div>
        <div className="text-xs">
          <span className="font-semibold text-foreground">Reason: </span>
          <span className="text-muted-foreground whitespace-pre-wrap">{r.requester_reason}</span>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">Entry ID: {r.entry_id}</div>

        {r.status === "pending" && isAdmin && (
          <div className="space-y-2 pt-1 border-t">
            <Textarea
              rows={2}
              placeholder="Admin decision reason (required, audited)…"
              value={decisionReason[r.id] || ""}
              onChange={(e) => setDecisionReason(prev => ({ ...prev, [r.id]: e.target.value }))}
              className="text-xs"
              maxLength={1000}
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => decide(r, "rejected")}
                disabled={busyId === r.id}
              >
                {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
                Reject
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => decide(r, "approved")}
                disabled={busyId === r.id}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" /> Approve & Delete
              </Button>
            </div>
          </div>
        )}

        {r.status !== "pending" && (
          <div className="text-xs bg-muted/40 rounded p-2 space-y-0.5">
            <div>
              <span className="font-semibold">Decision by: </span>
              {decider?.name || "Admin"} <span className="text-muted-foreground">{decider?.email}</span>
            </div>
            <div>
              <span className="font-semibold">Reason: </span>
              <span className="text-muted-foreground whitespace-pre-wrap">{r.decider_reason || "—"}</span>
            </div>
            {r.decided_at && (
              <div className="text-[10px] text-muted-foreground">On {new Date(r.decided_at).toLocaleString()}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {isAdmin ? "Deletion Requests (Admin Review)" : "My Deletion Requests"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="pending" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
              <TabsTrigger value="decided">Decided ({decided.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="flex-1 overflow-y-auto space-y-2 pt-3">
              {pending.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No pending requests.</p>
              ) : pending.map(renderRow)}
            </TabsContent>
            <TabsContent value="decided" className="flex-1 overflow-y-auto space-y-2 pt-3">
              {decided.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No decisions yet.</p>
              ) : decided.map(renderRow)}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MicroplanDeleteRequestsPanel;
