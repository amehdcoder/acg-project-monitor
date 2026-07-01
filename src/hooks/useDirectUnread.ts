import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface UseDirectUnreadOptions {
  /** When true, show an in-app toast whenever a new 1:1 message arrives. */
  withToast?: boolean;
}

/**
 * Tracks unread direct (1:1) messages for the signed-in user, grouped by the
 * person who sent them. Powers the per-peer unread badges on the "Active now"
 * roster and the real-time toast/notification when someone replies.
 *
 * One instance can opt into toasts (`withToast`) so the notification only fires
 * once even if several components subscribe for badge counts.
 */
export function useDirectUnread({ withToast = false }: UseDirectUnreadOptions = {}) {
  const { user } = useAuth();
  const [byUser, setByUser] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const nameCacheRef = useRef<Record<string, string>>({});

  const refetch = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.rpc("get_direct_unread_by_user");
    if (error || !data) return;
    const map: Record<string, number> = {};
    let sum = 0;
    for (const row of data as Array<{ sender_id: string; unread_count: number }>) {
      map[row.sender_id] = row.unread_count;
      sum += row.unread_count;
    }
    setByUser(map);
    setTotal(sum);
  }, [user?.id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const ownerLevelCacheRef = useRef<Record<string, boolean>>({});
  const resolveName = useCallback(async (senderId: string): Promise<string> => {
    if (nameCacheRef.current[senderId]) return nameCacheRef.current[senderId];
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name, email, is_owner, is_co_owner")
      .eq("user_id", senderId)
      .maybeSingle();
    const name =
      [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim() ||
      data?.email ||
      "Someone";
    nameCacheRef.current[senderId] = name;
    ownerLevelCacheRef.current[senderId] =
      !!data?.is_owner || !!data?.is_co_owner || data?.email === "amehjoey1@gmail.com";
    return name;
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`direct-unread-${user.id}${withToast ? "-toast" : ""}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "proximity_messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          const msg = payload.new as { sender_id: string; body: string; message_type?: string };
          refetch();
          if (withToast && msg.sender_id !== user.id) {
            const name = await resolveName(msg.sender_id);
            const preview =
              msg.message_type && msg.message_type !== "text"
                ? `Sent a ${msg.message_type}`
                : (msg.body || "").slice(0, 80);
            toast.message(`New message from ${name}`, {
              description: preview,
              action: {
                label: "Open",
                onClick: () =>
                  window.dispatchEvent(
                    new CustomEvent("amehnities:open-direct-chat", {
                      detail: { userId: msg.sender_id, userName: name },
                    }),
                  ),
              },
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "proximity_messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => refetch(),
      )
      .subscribe();
    // Refetch the moment a thread is opened/read so the global badge clears
    // instantly without waiting for the realtime UPDATE round-trip.
    const onRead = () => refetch();
    window.addEventListener("amehnities:direct-read", onRead as EventListener);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("amehnities:direct-read", onRead as EventListener);
    };
  }, [user?.id, withToast, refetch, resolveName]);

  return { byUser, total, refetch };
}
