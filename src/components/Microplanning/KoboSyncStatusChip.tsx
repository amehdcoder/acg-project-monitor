import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Clock, Radio, History as HistoryIcon, RefreshCw, Loader2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

type SyncEvent = {
  id: string;
  project_id: string | null;
  kobo_uuid: string | null;
  entry_id: string | null;
  status: string;
  message: string | null;
  created_at: string;
};

interface Props {
  projectId: string | null;
  /** Called when a new success event lands so the parent can refresh entries. */
  onNewSuccess?: () => void;
}

/**
 * Live status chip that subscribes to `kobo_sync_events` for the active
 * project and shows the most recent Kobo webhook outcome. Clicking it
 * opens a slide-over audit log of the last 50 events.
 */
const KoboSyncStatusChip = ({ projectId, onNewSuccess }: Props) => {
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [latest, setLatest] = useState<SyncEvent | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const retry = async (uuid: string) => {
    setRetrying(uuid);
    try {
      const { data, error } = await supabase.functions.invoke("kobo-form-manager", {
        body: { action: "retry_submission", kobo_uuid: uuid },
      });
      if (error) throw error;
      if ((data as any)?.ok) {
        toast({ title: "Re-sync succeeded", description: `Submission ${uuid.slice(0, 8)}… ingested.` });
        onNewSuccess?.();
      } else {
        toast({
          title: "Re-sync failed",
          description: (data as any)?.result?.hint ?? (data as any)?.result?.error ?? "Unknown error",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Re-sync failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRetrying(null);
    }
  };
  const [latest, setLatest] = useState<SyncEvent | null>(null);

  // Initial fetch of the most recent 50 events for this project.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let q = supabase
        .from("kobo_sync_events")
        .select("id,project_id,kobo_uuid,entry_id,status,message,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q;
      if (cancelled || error) return;
      setEvents((data as SyncEvent[]) ?? []);
      setLatest(((data as SyncEvent[]) ?? [])[0] ?? null);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Realtime subscription.
  useEffect(() => {
    const channel = supabase
      .channel(`kobo_sync_events_${projectId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "kobo_sync_events",
          ...(projectId ? { filter: `project_id=eq.${projectId}` } : {}),
        },
        (payload) => {
          const row = payload.new as SyncEvent;
          setEvents((prev) => [row, ...prev].slice(0, 50));
          setLatest(row);
          if (row.status === "success") onNewSuccess?.();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, onNewSuccess]);

  const chip = useMemo(() => {
    if (!latest) {
      return {
        icon: <Radio className="h-3 w-3" />,
        label: "Awaiting Kobo",
        cls: "bg-slate-100 text-slate-700 border-slate-200",
      };
    }
    const ago = formatDistanceToNow(new Date(latest.created_at), { addSuffix: true });
    if (latest.status === "success") {
      return {
        icon: <CheckCircle2 className="h-3 w-3" />,
        label: `Synced ${ago}`,
        cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    }
    if (latest.status === "pending") {
      return {
        icon: <Clock className="h-3 w-3 animate-pulse" />,
        label: `Sync pending ${ago}`,
        cls: "bg-amber-50 text-amber-800 border-amber-200",
      };
    }
    return {
      icon: <AlertTriangle className="h-3 w-3" />,
      label: `Validation failed ${ago}`,
      cls: "bg-rose-50 text-rose-700 border-rose-200",
    };
  }, [latest]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm transition hover:brightness-95 ${chip.cls}`}
          aria-label="Kobo sync status"
        >
          {chip.icon}
          <span>{chip.label}</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="h-4 w-4" /> Kobo Sync Audit Log
          </SheetTitle>
        </SheetHeader>
        <div className="mt-3 flex-1 overflow-y-auto pr-1 space-y-2">
          {events.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No Kobo webhook events yet. Submissions from KoboToolbox will appear here in real time.
            </p>
          )}
          {events.map((e) => {
            const isOk = e.status === "success";
            const isPending = e.status === "pending";
            const tone = isOk
              ? "border-emerald-200 bg-emerald-50/40"
              : isPending
              ? "border-amber-200 bg-amber-50/40"
              : "border-rose-200 bg-rose-50/40";
            return (
              <div key={e.id} className={`rounded-xl border ${tone} p-3 text-xs`}>
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={
                      isOk
                        ? "border-emerald-300 text-emerald-700"
                        : isPending
                        ? "border-amber-300 text-amber-800"
                        : "border-rose-300 text-rose-700"
                    }
                  >
                    {e.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </span>
                </div>
                {e.kobo_uuid && (
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    uuid: {e.kobo_uuid}
                  </p>
                )}
                {e.message && (
                  <p className="mt-1 text-[11px] leading-snug text-foreground/80">{e.message}</p>
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t pt-2 mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-[11px]"
            onClick={async () => {
              let q = supabase
                .from("kobo_sync_events")
                .select("id,project_id,kobo_uuid,entry_id,status,message,created_at")
                .order("created_at", { ascending: false })
                .limit(50);
              if (projectId) q = q.eq("project_id", projectId);
              const { data } = await q;
              setEvents((data as SyncEvent[]) ?? []);
            }}
          >
            Refresh
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default KoboSyncStatusChip;
