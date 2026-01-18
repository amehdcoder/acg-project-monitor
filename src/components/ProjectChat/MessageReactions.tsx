import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
}

export function MessageReactions({ messageId, currentUserId, isOwn }: MessageReactionsProps) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    // Fetch initial reactions
    const fetchReactions = async () => {
      const { data } = await supabase
        .from("message_reactions")
        .select("id, emoji, user_id")
        .eq("message_id", messageId);
      
      setReactions(data || []);
    };

    fetchReactions();

    // Subscribe to reaction changes
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId]);

  const addReaction = async (emoji: string) => {
    const existingReaction = reactions.find(
      (r) => r.emoji === emoji && r.user_id === currentUserId
    );

    if (existingReaction) {
      // Remove reaction
      await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existingReaction.id);
    } else {
      // Add reaction
      await supabase
        .from("message_reactions")
        .insert({
          message_id: messageId,
          user_id: currentUserId,
          emoji,
        });
    }

    setShowPicker(false);
  };

  // Group reactions by emoji
  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = { count: 0, hasUserReacted: false };
    }
    acc[reaction.emoji].count++;
    if (reaction.user_id === currentUserId) {
      acc[reaction.emoji].hasUserReacted = true;
    }
    return acc;
  }, {} as Record<string, { count: number; hasUserReacted: boolean }>);

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", isOwn ? "justify-end" : "justify-start")}>
      {/* Display existing reactions */}
      {Object.entries(groupedReactions).map(([emoji, { count, hasUserReacted }]) => (
        <button
          key={emoji}
          onClick={() => addReaction(emoji)}
          className={cn(
            "flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full transition-colors",
            hasUserReacted
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-muted/50 hover:bg-muted border border-transparent"
          )}
        >
          <span>{emoji}</span>
          <span className="font-medium">{count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <Popover open={showPicker} onOpenChange={setShowPicker}>
        <PopoverTrigger asChild>
          <button
            className="p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
          >
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
    </div>
  );
}
