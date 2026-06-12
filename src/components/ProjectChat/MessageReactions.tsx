import { useState, useEffect } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SmilePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const EMOJI_LIST = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "👏"];

interface Reaction {
  id: string;
  emoji: string;
  user_id: string;
}

interface MessageReactionsProps {
  messageId: string;
  currentUserId: string;
  isOwn: boolean;
  nameFor?: (uid: string) => string;
}

export function MessageReactions({ messageId, currentUserId, isOwn, nameFor }: MessageReactionsProps) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const fetchReactions = async () => {
      const { data } = await supabase
        .from("message_reactions")
        .select("id, emoji, user_id")
        .eq("message_id", messageId);
      setReactions(data || []);
    };

    fetchReactions();

    const channel = supabase
      .channel(`reactions-${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `message_id=eq.${messageId}`,
        },
        () => {
          fetchReactions();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId]);

  const addReaction = async (emoji: string) => {
    const existingReaction = reactions.find((r) => r.emoji === emoji && r.user_id === currentUserId);
    if (existingReaction) {
      await supabase.from("message_reactions").delete().eq("id", existingReaction.id);
    } else {
      await supabase.from("message_reactions").insert({ message_id: messageId, user_id: currentUserId, emoji });
    }
    setShowPicker(false);
  };

  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) acc[reaction.emoji] = { count: 0, hasUserReacted: false };
    acc[reaction.emoji].count++;
    if (reaction.user_id === currentUserId) acc[reaction.emoji].hasUserReacted = true;
    return acc;
  }, {} as Record<string, { count: number; hasUserReacted: boolean }>);

  const label = (uid: string) => (nameFor ? nameFor(uid) : uid === currentUserId ? "You" : "Member");

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", isOwn ? "justify-end" : "justify-start")}>
      {Object.entries(groupedReactions).map(([emoji, { count, hasUserReacted }]) => (
        <button
          key={emoji}
          onClick={() => setDetailsOpen(true)}
          onDoubleClick={() => addReaction(emoji)}
          className={cn(
            "flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full transition-colors",
            hasUserReacted
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-muted/50 hover:bg-muted border border-transparent",
          )}
          title="Tap to see who reacted"
        >
          <span>{emoji}</span>
          <span className="font-medium">{count}</span>
        </button>
      ))}

      <Popover open={showPicker} onOpenChange={setShowPicker}>
        <PopoverTrigger asChild>
          <button className="p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted">
            <SmilePlus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align={isOwn ? "end" : "start"}>
          <div className="flex gap-1">
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                onClick={() => addReaction(emoji)}
                className="text-lg p-1.5 hover:bg-muted rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Who reacted — mirrors WhatsApp's reactions sheet (attachment 3) */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{reactions.length} reaction{reactions.length === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 pb-1">
            {Object.entries(groupedReactions).map(([emoji, { count }]) => (
              <span
                key={emoji}
                className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-sm"
              >
                <span className="text-base">{emoji}</span>
                <span className="font-medium">{count}</span>
              </span>
            ))}
          </div>
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {reactions.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5",
                  r.user_id === currentUserId && "bg-primary/5",
                )}
              >
                <span className="text-sm">
                  {label(r.user_id)}
                  {r.user_id === currentUserId && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">(tap reaction to remove)</span>
                  )}
                </span>
                <span className="text-lg leading-none">{r.emoji}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
