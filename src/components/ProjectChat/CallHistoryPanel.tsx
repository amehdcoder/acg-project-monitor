import { useCallback, useEffect, useState } from "react";
import { Phone, Video, PhoneMissed, PhoneOutgoing, PhoneIncoming, RotateCcw, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  deriveCallOutcome,
  callDurationSeconds,
  formatCallDuration,
  formatRelativeTime,
  sortCallsNewestFirst,
  type CallHistoryRow,
} from "@/lib/calls/callHistory";

interface CallHistoryGroup {
  id: string;
  name: string;
}

interface CallHistoryPanelProps {
  groups: CallHistoryGroup[];
  /** Rejoin or call back — opens the call UI for the given group + type. */
  onAction: (groupId: string, callType: "voice" | "video") => void;
}

export function CallHistoryPanel({ groups, onAction }: CallHistoryPanelProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<CallHistoryRow[]>([]);
  const [callers, setCallers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const groupNames = new Map(groups.map((g) => [g.id, g.name]));
  const groupIds = groups.map((g) => g.id);

  const fetchHistory = useCallback(async () => {
    if (groupIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("active_calls" as any)
      .select("id, chat_group_id, started_by, call_type, started_at, ended_at, is_active")
      .in("chat_group_id", groupIds)
      .order("started_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      const list = sortCallsNewestFirst(data as unknown as CallHistoryRow[]);
      setRows(list);

      // Resolve caller display names.
      const ids = Array.from(new Set(list.map((r) => r.started_by)));
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", ids);
        const map: Record<string, string> = {};
        (profiles || []).forEach((p: any) => {
          map[p.user_id] = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Someone";
        });
        setCallers(map);
      }
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(groupIds)]);

  useEffect(() => {
    fetchHistory();
    if (groupIds.length === 0) return;
    const channel = supabase
      .channel("call-history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "active_calls" },
        () => fetchHistory(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading call history…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 rounded-full bg-primary/5 flex items-center justify-center mb-3">
          <History className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground">No recent calls</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Voice and video calls in this project will appear here.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[60vh]">
      <div className="divide-y divide-border">
        {rows.map((row) => {
          const outcome = deriveCallOutcome(row, user?.id);
          const isVideo = row.call_type === "video";
          const durationSecs = callDurationSeconds(row);
          const callerName =
            row.started_by === user?.id ? "You" : callers[row.started_by] || "Someone";
          const groupName = groupNames.get(row.chat_group_id) || "Group";

          const OutcomeIcon =
            outcome.tone === "missed"
              ? PhoneMissed
              : row.started_by === user?.id
                ? PhoneOutgoing
                : PhoneIncoming;

          return (
            <div key={row.id} className="flex items-center gap-3 px-3 py-3">
              <div
                className={cn(
                  "h-10 w-10 shrink-0 rounded-full flex items-center justify-center",
                  outcome.tone === "missed"
                    ? "bg-destructive/10 text-destructive"
                    : outcome.tone === "ongoing"
                      ? "bg-green-500/10 text-green-600"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {isVideo ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">{callerName}</span>
                  <OutcomeIcon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      outcome.tone === "missed" ? "text-destructive" : "text-muted-foreground",
                    )}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                  <span className="truncate">{groupName}</span>
                  <span>·</span>
                  <span className="shrink-0">{formatRelativeTime(row.started_at)}</span>
                  {!outcome.canRejoin && (
                    <>
                      <span>·</span>
                      <span className="shrink-0">{formatCallDuration(durationSecs)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    outcome.tone === "missed" && "border-destructive/40 text-destructive",
                    outcome.tone === "ongoing" && "border-green-500/40 text-green-600",
                  )}
                >
                  {outcome.label}
                </Badge>
                <Button
                  size="sm"
                  variant={outcome.canRejoin ? "default" : "secondary"}
                  className="h-8 gap-1.5"
                  onClick={() => onAction(row.chat_group_id, isVideo ? "video" : "voice")}
                >
                  {outcome.canRejoin ? (
                    <>
                      <Phone className="h-3.5 w-3.5" />
                      Rejoin
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Call back
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
