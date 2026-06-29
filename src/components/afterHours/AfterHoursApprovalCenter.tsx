import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, Check, X, Loader2, Clock, FileText, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface PendingRequest {
  id: string;
  requested_by: string;
  requested_by_name: string | null;
  target_table: string;
  form_label: string | null;
  reason: string;
  project_id: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleString();
}

/**
 * Centered approval center shown to Systems Admins, Super Admins and
 * Owners/Co-owners when there are pending after-hours submission requests for
 * forms within their project scope. RLS guarantees they only ever receive
 * rows they are allowed to review.
 */
const AfterHoursApprovalCenter = () => {
  const { user, role, isOwnerLevel } = useAuth();
  const canReview = isOwnerLevel || role === "super_admin" || role === "systems_admin";
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!user || !canReview) return;
    const { data, error } = await supabase
      .from("after_hours_submission_requests")
      .select(
        "id, requested_by, requested_by_name, target_table, form_label, reason, project_id, created_at",
      )
      .eq("status", "pending")
      .neq("requested_by", user.id)
      .order("created_at", { ascending: false });
    if (error) return;
    const rows = (data ?? []) as PendingRequest[];
    setRequests(rows);
    setOpen((prev) => prev || rows.length > 0);
  }, [user, canReview]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user || !canReview) return;
    const ch = supabase.channel(`after-hours-${user.id}-${Math.random().toString(36).slice(2, 8)}`);
    ch.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "after_hours_submission_requests" },
      () => load(),
    ).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, canReview, load]);

  const approve = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const { error } = await supabase.rpc("approve_after_hours_request", { p_id: id } as any);
        if (error) throw error;
        toast.success("Submission approved and saved.");
        setRequests((r) => r.filter((x) => x.id !== id));
      } catch (err: any) {
        toast.error(err?.message || "Could not approve.");
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const reject = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const { error } = await supabase.rpc("reject_after_hours_request", {
          p_id: id,
          p_note: note.trim() || null,
        } as any);
        if (error) throw error;
        toast.success("Submission rejected and discarded.");
        setRequests((r) => r.filter((x) => x.id !== id));
        setRejecting(null);
        setNote("");
      } catch (err: any) {
        toast.error(err?.message || "Could not reject.");
      } finally {
        setBusyId(null);
      }
    },
    [note],
  );

  if (!canReview || requests.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0 overflow-hidden border-0 shadow-2xl">
        <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-800 px-6 py-5 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-white">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                <ShieldCheck className="h-4 w-4 text-indigo-200" />
              </div>
              After-hours approvals
              <Badge className="ml-1 bg-amber-400 text-amber-950 hover:bg-amber-400">
                {requests.length}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <p className="mt-1 text-xs text-slate-300">
            Approve to save the submission and reflect it on the dashboard. Reject to discard it
            permanently.
          </p>
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 p-5">
            {requests.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <FileText className="h-3.5 w-3.5 text-indigo-500" />
                      {r.form_label || r.target_table}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {r.requested_by_name || "Unknown user"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(r.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Reason
                  </span>
                  <p className="mt-0.5 leading-relaxed">{r.reason}</p>
                </div>

                {rejecting === r.id ? (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional note to the submitter…"
                      className="min-h-[70px] resize-none text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setRejecting(null);
                          setNote("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                        disabled={busyId === r.id}
                        onClick={() => reject(r.id)}
                      >
                        {busyId === r.id ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <X className="mr-1.5 h-4 w-4" />
                        )}
                        Confirm reject
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={busyId === r.id}
                      onClick={() => setRejecting(r.id)}
                    >
                      <X className="mr-1.5 h-4 w-4" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={busyId === r.id}
                      onClick={() => approve(r.id)}
                    >
                      {busyId === r.id ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-1.5 h-4 w-4" />
                      )}
                      Approve
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-border p-3">
          <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AfterHoursApprovalCenter;
