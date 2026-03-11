import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

/**
 * Global listener for incoming calls across all chat groups the user belongs to.
 * Shows a push-style toast banner when someone starts a call, even outside the chat view.
 */
export function useCallNotifications(onJoinCall?: (groupId: string, callType: "voice" | "video") => void) {
  const { user } = useAuth();
  const notifiedCalls = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("global-call-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "active_calls",
        },
        async (payload: any) => {
          const call = payload.new;
          if (!call || call.started_by === user.id || notifiedCalls.current.has(call.id)) return;
          notifiedCalls.current.add(call.id);

          // Check if user is a member of this chat group
          const { data: membership } = await supabase
            .from("chat_group_members")
            .select("id")
            .eq("chat_group_id", call.chat_group_id)
            .eq("user_id", user.id)
            .maybeSingle();

          if (!membership) return;

          // Get caller name and group name
          const [callerRes, groupRes] = await Promise.all([
            supabase
              .from("profiles")
              .select("first_name, last_name")
              .eq("user_id", call.started_by)
              .single(),
            supabase
              .from("chat_groups")
              .select("name")
              .eq("id", call.chat_group_id)
              .single(),
          ]);

          const callerName = callerRes.data
            ? `${callerRes.data.first_name} ${callerRes.data.last_name}`.trim()
            : "Someone";
          const groupName = groupRes.data?.name || "a group";
          const callType = call.call_type as "voice" | "video";

          // Show push-style toast
          toast({
            title: `📞 Incoming ${callType === "video" ? "Video" : "Voice"} Call`,
            description: `${callerName} started a ${callType} call in "${groupName}"`,
            duration: 15000,
          });

          // Also insert a persistent notification
          await supabase.from("notifications").insert({
            user_id: user.id,
            type: "info",
            title: `${callType === "video" ? "Video" : "Voice"} Call Started`,
            message: `${callerName} started a ${callType} call in "${groupName}"`,
            category: "call",
            related_id: call.chat_group_id,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, onJoinCall]);
}
