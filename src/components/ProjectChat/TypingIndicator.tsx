import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TypingUser {
  user_id: string;
  first_name: string;
  last_name: string;
}

interface TypingIndicatorProps {
  chatGroupId: string;
  currentUserId: string;
}

export function TypingIndicator({ chatGroupId, currentUserId }: TypingIndicatorProps) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  useEffect(() => {
    // Fetch initial typing indicators
    const fetchTyping = async () => {
      const { data } = await supabase
        .from("typing_indicators")
        .select("user_id")
        .eq("chat_group_id", chatGroupId)
        .neq("user_id", currentUserId);

      if (data && data.length > 0) {
        const userIds = data.map((t) => t.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", userIds);

        setTypingUsers(profiles || []);
      } else {
        setTypingUsers([]);
      }
    };

    fetchTyping();

    // Subscribe to typing indicator changes
    const channel = supabase
      .channel(`typing-${chatGroupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "typing_indicators",
          filter: `chat_group_id=eq.${chatGroupId}`,
        },
        () => {
          fetchTyping();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatGroupId, currentUserId]);

  if (typingUsers.length === 0) return null;

  const getTypingText = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0].first_name} is typing`;
    }
    if (typingUsers.length === 2) {
      return `${typingUsers[0].first_name} and ${typingUsers[1].first_name} are typing`;
    }
    return `${typingUsers[0].first_name} and ${typingUsers.length - 1} others are typing`;
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <span>{getTypingText()}</span>
    </div>
  );
}

// Hook for sending typing indicators
export function useTypingIndicator(chatGroupId: string | null, userId: string | null) {
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!chatGroupId || !userId || !isTyping) return;

    // Set typing indicator
    const setTyping = async () => {
      await supabase
        .from("typing_indicators")
        .upsert({
          chat_group_id: chatGroupId,
          user_id: userId,
          started_at: new Date().toISOString(),
        }, { onConflict: "chat_group_id,user_id" });
    };

    setTyping();

    // Clear after 3 seconds of inactivity
    const timeout = setTimeout(async () => {
      await supabase
        .from("typing_indicators")
        .delete()
        .eq("chat_group_id", chatGroupId)
        .eq("user_id", userId);
      setIsTyping(false);
    }, 3000);

    return () => clearTimeout(timeout);
  }, [chatGroupId, userId, isTyping]);

  const startTyping = () => setIsTyping(true);
  const stopTyping = async () => {
    if (chatGroupId && userId) {
      await supabase
        .from("typing_indicators")
        .delete()
        .eq("chat_group_id", chatGroupId)
        .eq("user_id", userId);
    }
    setIsTyping(false);
  };

  return { startTyping, stopTyping };
}
