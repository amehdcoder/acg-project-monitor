import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Moon, Clock, FileText, CheckCircle2, XCircle, Loader2, Hourglass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { OPEN_AFTER_HOURS_STATUS } from "@/lib/afterHours/events";

interface MyRequest {
  id: string;
  target_table: string;
  form_label: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STATUS_META: Record<
  MyRequest["status"],
  { label: string; icon: typeof Hourglass; className: string }
> = {
  pending: {
    label: "Pending approval",
    icon: Hourglass,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
};

/**
 * Lets a submitter see the approval status of every after-hours submission
 * they have requested. Opened on demand via the OPEN_AFTER_HOURS_STATUS event
 * (e.g. from a notification or the request-sent screen).
 */
const MyAfterHoursRequests = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MyRequest[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("after_hours_submission_requests")
        .select(
          "id, target_table, form_label, reason, status, review_note, created_at, reviewed_at",
        )
        .eq("requested_by", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setRows((data ?? []) as MyRequest[]);
    } catch {
      /* no-op */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const handler = () => {
      setOpen(true);
      load();
    };
    window.addEventListener(OPEN_AFTER_HOURS_STATUS, handler);
    return () => window.removeEventListener(OPEN_AFTER_HOURS_STATUS, handler);
  }, [load]);

  useEffect(() => {
    if (!open || !user) return;
    const ch = supabase.channel(
      `my-after-hours-${user.id}-${Math.random().toString(36).slice(2, 8)}`,
    );
    ch.on(
      "postgres_changes" as any,
      {
        event: "*",
        schema: "public",
        table: "after_hours_submission_requests",
        filter: `requested_by=eq.${user.id}`,
      },
      () => load(),
    ).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [open, user, load]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0 overflow-hidden border-0 shadow-2xl">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-6 py-5 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-white">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                <Moon className="h-4 w-4 text-indigo-200" />
              </div>
              My after-hours requests
            </DialogTitle>
          </DialogHeader>
          <p className="mt-1 text-xs text-slate-300">
            Track whether your after-hours submissions are pending, approved, or rejected.
          </p>
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 p-5">
            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <Moon className="h-10 w-10 opacity-30" />
                <p className="mt-2 text-sm">No after-hours requests yet.</p>
              </div>
            ) : (
              rows.map((r) => {
                const meta = STATUS_META[r.status];
                const Icon = meta.icon;
                return (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <FileText className="h-3.5 w-3.5 text-indigo-500" />
                        {r.form_label || r.target_table}
                      </div>
                      <Badge className={`${meta.className} gap-1 hover:${meta.className}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Reason
                      </span>
                      <p className="mt-0.5 leading-relaxed">{r.reason}</p>
                    </div>
                    {r.status === "rejected" && r.review_note && (
                      <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-300">
                        <span className="text-xs font-medium uppercase tracking-wide">Reviewer note</span>
                        <p className="mt-0.5 leading-relaxed">{r.review_note}</p>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Requested {fmt(r.created_at)}
                      </span>
                      {r.reviewed_at && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Reviewed {fmt(r.reviewed_at)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
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

export default MyAfterHoursRequests;
