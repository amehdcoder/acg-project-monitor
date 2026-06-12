import { useEffect, useState, useCallback } from "react";
import { Check } from "lucide-react";
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
}

export function PollMessage({
  messageId,
  poll,
  currentUserId,
  isOwn,
  nameFor,
}: PollMessageProps) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [showVoters, setShowVoters] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadVotes = useCallback(async () => {
    const { data } = await supabase
      .from("chat_poll_votes")
      .select("user_id, option_index")
      .eq("message_id", messageId);
    setVotes((data as Vote[]) || []);
  }, [messageId]);

  useEffect(() => {
    loadVotes();
    const channel = supabase
      .channel(`poll-${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_poll_votes",
          filter: `message_id=eq.${messageId}`,
        },
        () => loadVotes(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, loadVotes]);

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
        await supabase
          .from("chat_poll_votes")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId)
          .eq("option_index", optionIndex);
      } else {
        if (!poll.allowMultiple && myVotes.length > 0) {
          await supabase
            .from("chat_poll_votes")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", currentUserId);
        }
        await supabase.from("chat_poll_votes").insert({
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

  return (
    <div className="min-w-[220px] sm:min-w-[260px]">
      <p className="text-sm font-semibold leading-snug break-words">
        {poll.question}
      </p>
      <p className="text-[11px] mt-0.5 opacity-60">
        {poll.allowMultiple ? "Select one or more" : "Select one"}
      </p>

      <div className="mt-3 space-y-3">
        {poll.options.map((opt, idx) => {
          const c = countFor(idx);
          const pct = total > 0 ? Math.round((c / total) * 100) : 0;
          const chosen = myVotes.includes(idx);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => toggleVote(idx)}
              disabled={busy}
              className="w-full text-left group"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    chosen
                      ? "bg-[hsl(var(--wa-accent))] border-[hsl(var(--wa-accent))] text-white"
                      : poll.allowMultiple
                        ? "border-current opacity-50 rounded-md"
                        : "border-current opacity-50",
                  )}
                >
                  {chosen && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="flex-1 text-sm break-words">{opt}</span>
                <span className="text-xs tabular-nums opacity-70">{c}</span>
              </div>
              <div className="mt-1.5 ml-7 h-1.5 rounded-full bg-black/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[hsl(var(--wa-accent))] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowVoters(true)}
        className="mt-3 w-full border-t border-black/10 pt-2 text-center text-sm font-medium text-[hsl(var(--wa-accent))]"
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
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{opt}</span>
                    <span className="text-xs text-muted-foreground">
                      {voters.length} vote{voters.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {voters.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-1">No votes</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1">
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
