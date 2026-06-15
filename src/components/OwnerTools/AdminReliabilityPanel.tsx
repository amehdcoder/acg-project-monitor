// Admin Reliability Panel — surfaces the account-integrity backend to Owners,
// Co-owners and Admins:
//   • Account audit log (creation / approval / repair / retry events)
//   • Account-creation retry queue with a "Retry now" action
//   • Orphaned-account repair scan ("Run scan now")
//
// Read access is gated by RLS (is_owner_or_co_owner / is_admin). The two
// background jobs (account-retry-worker, repair-orphaned-accounts) also run on
// cron; this panel lets admins trigger them on demand and see the results.

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Loader2,
  Wrench,
  History,
  ListChecks,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface AuditRow {
  id: string;
  event_type: string;
  actor_email: string | null;
  target_email: string | null;
  success: boolean | null;
  details: any;
  created_at: string;
}

interface RetryRow {
  id: string;
  email: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  processing: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  succeeded: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  abandoned: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

export default function AdminReliabilityPanel() {
  const [open, setOpen] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [queue, setQueue] = useState<RetryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: a }, { data: q }] = await Promise.all([
        supabase
          .from("account_audit_log")
          .select("id,event_type,actor_email,target_email,success,details,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("account_creation_retry_queue")
          .select("id,email,status,attempts,max_attempts,last_error,next_retry_at,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      setAudit((a as AuditRow[]) ?? []);
      setQueue((q as RetryRow[]) ?? []);
    } catch (e: any) {
      toast({ title: "Could not load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const retry = async (id?: string) => {
    setRetrying(id ?? "all");
    try {
      const { data, error } = await supabase.functions.invoke("account-retry-worker", {
        body: id ? { id } : {},
      });
      if (error) throw error;
      toast({ title: "Retry triggered", description: `Processed ${data?.processed ?? 0} item(s).` });
      await load();
    } catch (e: any) {
      toast({ title: "Retry failed", description: e.message, variant: "destructive" });
    } finally {
      setRetrying(null);
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("repair-orphaned-accounts", { body: {} });
      if (error) throw error;
      toast({
        title: "Orphan scan complete",
        description: `Scanned ${data?.scanned ?? 0}, repaired ${data?.repaired ?? 0}, flagged ${data?.flagged ?? 0}.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const pendingCount = queue.filter((q) => q.status === "pending").length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ShieldCheck className="h-4 w-4" />
          Reliability
          {pendingCount > 0 && (
            <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
              {pendingCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Account Reliability
          </DialogTitle>
          <DialogDescription>
            Audit trail, automatic retry queue, and orphaned-account repair.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={runScan} disabled={scanning}>
              {scanning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wrench className="mr-1 h-4 w-4" />}
              Run orphan scan
            </Button>
          </div>
          {pendingCount > 0 && (
            <Button size="sm" onClick={() => retry()} disabled={retrying !== null}>
              {retrying === "all" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
              Retry all pending ({pendingCount})
            </Button>
          )}
        </div>

        <Tabs defaultValue="queue" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="queue" className="gap-1.5">
              <ListChecks className="h-4 w-4" /> Retry Queue
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <History className="h-4 w-4" /> Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <ScrollArea className="h-[55vh] pr-3">
              {queue.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No failed account creations — everything is healthy.
                </p>
              ) : (
                <div className="space-y-2">
                  {queue.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{q.email}</span>
                          <Badge variant="outline" className={STATUS_TONE[q.status] ?? ""}>
                            {q.status}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Attempt {q.attempts}/{q.max_attempts}
                          {q.next_retry_at && (
                            <>
                              {" · "}
                              <Clock className="inline h-3 w-3" /> next{" "}
                              {formatDistanceToNow(new Date(q.next_retry_at), { addSuffix: true })}
                            </>
                          )}
                        </p>
                        {q.last_error && (
                          <p className="mt-1 break-words text-xs text-rose-600">{q.last_error}</p>
                        )}
                      </div>
                      {(q.status === "pending" || q.status === "abandoned") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retry(q.id)}
                          disabled={retrying !== null}
                        >
                          {retrying === q.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          <span className="ml-1">Retry now</span>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="audit">
            <ScrollArea className="h-[55vh] pr-3">
              {audit.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No audit events yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {audit.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
                    >
                      {a.success === false ? (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <span className="font-medium">{a.event_type}</span>
                          {a.target_email && (
                            <span className="truncate text-muted-foreground">{a.target_email}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {a.actor_email ? `by ${a.actor_email} · ` : ""}
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
