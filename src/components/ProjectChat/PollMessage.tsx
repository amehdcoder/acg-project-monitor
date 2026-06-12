import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PollPayload } from "./specialMessages";

interface Vote {
  user_id: string;
  option_index: number;
}

interface PollMessageProps {
  messageId: string;
  poll: PollPayload;
  currentUserId?: string;
  isOwn: boolean;
  nameFor: (uid: string) => string;
  /** Poll-votes table to use. Defaults to group-chat poll votes. */
  votesTable?: string;
}

/** Data-for-Progress inspired palette (navy, gray, red, yellow, sage…) */
const SERIES_COLORS = [
  "#0a3161", // democrat navy
  "#cfd3d6", // not sure gray
  "#fb4d2a", // republican red
  "#f4c534", // independent yellow
  "#9caf88", // other third party sage
  "#2f6f8f", // teal
  "#b5651d", // sienna
  "#7d6699", // muted purple
];

export function PollMessage({
  messageId,
  poll,
  currentUserId,
  nameFor,
  votesTable = "chat_poll_votes",
}: PollMessageProps) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [showVoters, setShowVoters] = useState(false);
  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const loadVotes = useCallback(async () => {
    const { data } = await db
      .from(votesTable)
      .select("user_id, option_index")
      .eq("message_id", messageId);
    setVotes((data as Vote[]) || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, votesTable]);

  useEffect(() => {
    loadVotes();
    const channel = supabase
      .channel(`poll-${votesTable}-${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: votesTable,
          filter: `message_id=eq.${messageId}`,
        },
        () => loadVotes(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, loadVotes, votesTable]);

  const total = votes.length;
  const myVotes = currentUserId
    ? votes.filter((v) => v.user_id === currentUserId).map((v) => v.option_index)
    : [];

  const toggleVote = async (optionIndex: number) => {
    if (!currentUserId || busy) return;
    setBusy(true);
    const hasVoted = myVotes.includes(optionIndex);
    try {
      if (hasVoted) {
        await db
          .from(votesTable)
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId)
          .eq("option_index", optionIndex);
      } else {
        if (!poll.allowMultiple && myVotes.length > 0) {
          await db
            .from(votesTable)
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", currentUserId);
        }
        await db.from(votesTable).insert({
          message_id: messageId,
          user_id: currentUserId,
          option_index: optionIndex,
        });
      }
      await loadVotes();
    } finally {
      setBusy(false);
    }
  };

  const countFor = (idx: number) =>
    votes.filter((v) => v.option_index === idx).length;
  const pctFor = (idx: number) =>
    total > 0 ? Math.round((countFor(idx) / total) * 100) : 0;
  const colorFor = (idx: number) => SERIES_COLORS[idx % SERIES_COLORS.length];

  return (
    <div className="w-[270px] sm:w-[320px] text-[#1a1a1a]">
      {/* Title + subtitle (Data for Progress header style) */}
      <h4 className="text-[15px] font-extrabold leading-tight tracking-tight break-words">
        {poll.question}
      </h4>
      <p className="mt-0.5 text-[11px] font-medium text-[#6b7280]">
        {total} {total === 1 ? "response" : "responses"} ·{" "}
        {poll.allowMultiple ? "select one or more" : "select one"}
      </p>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {poll.options.map((opt, idx) => (
          <div key={idx} className="min-w-0">
            <span
              className="block h-[3px] w-full rounded-full"
              style={{ backgroundColor: colorFor(idx) }}
            />
            <span className="mt-1 block truncate text-[11px] font-bold leading-tight">
              {opt}
            </span>
          </div>
        ))}
      </div>

      {/* Stacked horizontal bar */}
      <div className="mt-3">
        <div className="flex h-9 w-full overflow-hidden rounded-[3px] bg-[#eceff1]">
          {poll.options.map((opt, idx) => {
            const pct = pctFor(idx);
            if (pct === 0) return null;
            return (
              <div
                key={idx}
                className="flex items-center justify-center transition-all"
                style={{ width: `${pct}%`, backgroundColor: colorFor(idx) }}
                title={`${opt}: ${pct}%`}
              >
                {pct >= 10 && (
                  <span className="text-[11px] font-bold text-white drop-shadow-sm">
                    {pct}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-medium text-[#9ca3af]">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Vote controls */}
      <div className="mt-3 space-y-1.5">
        {poll.options.map((opt, idx) => {
          const chosen = myVotes.includes(idx);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => toggleVote(idx)}
              disabled={busy}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors",
                chosen
                  ? "border-transparent text-white"
                  : "border-black/10 hover:bg-black/5",
              )}
              style={chosen ? { backgroundColor: colorFor(idx) } : undefined}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: chosen ? "#fff" : colorFor(idx) }}
              />
              <span className="flex-1 truncate">{opt}</span>
              <span className="tabular-nums opacity-80">{countFor(idx)}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowVoters(true)}
        className="mt-2.5 w-full border-t border-black/10 pt-2 text-center text-[12px] font-semibold text-[#0a3161]"
      >
        View votes
      </button>

      <Dialog open={showVoters} onOpenChange={setShowVoters}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{poll.question}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {poll.options.map((opt, idx) => {
              const voters = votes.filter((v) => v.option_index === idx);
              return (
                <div key={idx}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: colorFor(idx) }}
                    />
                    <span className="text-sm font-semibold">{opt}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {voters.length} vote{voters.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {voters.length === 0 ? (
                    <p className="ml-5 mt-1 text-xs text-muted-foreground">
                      No votes
                    </p>
                  ) : (
                    <ul className="ml-5 mt-1.5 space-y-1">
                      {voters.map((v) => (
                        <li key={v.user_id} className="text-sm">
                          {nameFor(v.user_id)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
