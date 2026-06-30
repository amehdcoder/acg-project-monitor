import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck,
  Check,
  X,
  Loader2,
  Clock,
  FileText,
  User,
  History,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { OPEN_AFTER_HOURS_APPROVALS } from "@/lib/afterHours/events";

interface RequestRow {
  id: string;
  requested_by: string;
  requested_by_name: string | null;
  target_table: string;
  form_label: string | null;
  reason: string;
  project_id: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
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

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Approval center shown to Systems Admins, Super Admins and Owners/Co-owners.
 * "Pending" tab lets them approve/reject. "History" tab is an audit log of
 * who requested, the reason, timestamps, and who approved or rejected.
 * RLS guarantees they only ever receive rows they are allowed to review.
 */
const AfterHoursApprovalCenter = () => {
  const { user, role, isOwnerLevel } = useAuth();
  const canReview = isOwnerLevel || role === "super_admin" || role === "systems_admin";
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [history, setHistory] = useState<RequestRow[]>([]);
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!user || !canReview) return;
    const { data, error } = await (supabase as any)
      .from("after_hours_submission_requests")
      .select(
        "id, requested_by, requested_by_name, target_table, form_label, reason, project_id, status, review_note, reviewed_at, reviewed_by, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return;
    const rows = (data ?? []) as RequestRow[];
    const pending = rows.filter((r) => r.status === "pending" && r.requested_by !== user.id);
    const reviewed = rows.filter((r) => r.status !== "pending");

    // Resolve display names from profiles (auth id is stored in profiles.user_id).
    // This covers both reviewers (audit log) and any requester whose stored
    // name is missing, so the UI never falls back to "Unknown user".
    const nameIds = Array.from(
      new Set(
        [
          ...reviewed.map((r) => r.reviewed_by),
          ...rows.filter((r) => !r.requested_by_name?.trim()).map((r) => r.requested_by),
        ].filter(Boolean),
      ),
    ) as string[];
    if (nameIds.length) {
      const { data: profs } = await (supabase as any)
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", nameIds);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => {
        map[p.user_id] =
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "";
      });
      const fill = (r: RequestRow): RequestRow =>
        r.requested_by_name?.trim()
          ? r
          : { ...r, requested_by_name: map[r.requested_by] || r.requested_by_name };
      pending.forEach((r, i) => (pending[i] = fill(r)));
      reviewed.forEach((r, i) => (reviewed[i] = fill(r)));
      setReviewerNames(map);
    }

    setRequests(pending);
    setHistory(reviewed);
    setOpen((prev) => prev || pending.length > 0);
  }, [user, canReview]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canReview) return;
    const handler = () => {
      setOpen(true);
      setTab("pending");
      load();
    };
    window.addEventListener(OPEN_AFTER_HOURS_APPROVALS, handler);
    return () => window.removeEventListener(OPEN_AFTER_HOURS_APPROVALS, handler);
  }, [canReview, load]);

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

  const approve = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await (supabase as any).rpc("approve_after_hours_request", { p_id: id } as any);
      if (error) throw error;
      toast.success("Submission approved and saved.");
      setRequests((r) => r.filter((x) => x.id !== id));
      load();
    } catch (err: any) {
      toast.error(err?.message || "Could not approve.");
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const reject = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const { error } = await (supabase as any).rpc("reject_after_hours_request", {
          p_id: id,
          p_note: note.trim() || null,
        } as any);
        if (error) throw error;
        toast.success("Submission rejected and discarded.");
        setRequests((r) => r.filter((x) => x.id !== id));
        setRejecting(null);
        setNote("");
        load();
      } catch (err: any) {
        toast.error(err?.message || "Could not reject.");
      } finally {
        setBusyId(null);
      }
    },
    [note, load],
  );

  if (!canReview) return null;

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
              {requests.length > 0 && (
                <Badge className="ml-1 bg-amber-400 text-amber-950 hover:bg-amber-400">
                  {requests.length}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <p className="mt-1 text-xs text-slate-300">
            Approve to save the submission and reflect it on the dashboard. Reject to discard it
            permanently.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="px-5 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pending" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Pending
                {requests.length > 0 && (
                  <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-semibold text-amber-950">
                    {requests.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5">
                <History className="h-3.5 w-3.5" /> Audit log
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pending" className="mt-0">
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-3 p-5">
                {requests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                    <ShieldCheck className="h-10 w-10 opacity-30" />
                    <p className="mt-2 text-sm">No pending after-hours requests.</p>
                  </div>
                ) : (
                  requests.map((r) => (
                    <div key={r.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
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
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-3 p-5">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                    <History className="h-10 w-10 opacity-30" />
                    <p className="mt-2 text-sm">No reviewed requests yet.</p>
                  </div>
                ) : (
                  history.map((r) => {
                    const approved = r.status === "approved";
                    return (
                      <div key={r.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <FileText className="h-3.5 w-3.5 text-indigo-500" />
                            {r.form_label || r.target_table}
                          </div>
                          <Badge
                            className={
                              approved
                                ? "gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "gap-1 bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                            }
                          >
                            {approved ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {approved ? "Approved" : "Rejected"}
                          </Badge>
                        </div>
                        <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Reason
                          </span>
                          <p className="mt-0.5 leading-relaxed">{r.reason}</p>
                        </div>
                        {!approved && r.review_note && (
                          <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-300">
                            <span className="text-xs font-medium uppercase tracking-wide">Reviewer note</span>
                            <p className="mt-0.5 leading-relaxed">{r.review_note}</p>
                          </div>
                        )}
                        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" /> Requested by {r.requested_by_name || "Unknown"}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Requested {fmt(r.created_at)}
                          </div>
                          {r.reviewed_at && (
                            <div className="flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              {approved ? "Approved" : "Rejected"} by{" "}
                              {(r.reviewed_by && reviewerNames[r.reviewed_by]) || "a reviewer"} ·{" "}
                              {fmt(r.reviewed_at)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

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
