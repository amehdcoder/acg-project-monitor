import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Tracks unread messages in the single canonical, cross-project
 * "HANDS Staff - Official" group so the badge stays visible no matter which
 * project area the user is currently browsing.
 *
 * The group can live under a project the user isn't assigned to, so the normal
 * per-project unread loop can miss it — this hook resolves the group via
 * `get_my_chat_groups` (which includes protected groups across projects) and
 * counts unread directly.
 */
export function useHandsStaffUnread(anyProjectId: string | null | undefined) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [groupId, setGroupId] = useState<string | null>(null);
  const groupIdRef = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user?.id || !anyProjectId) return;
    try {
      const { data: groups } = await (supabase as any).rpc("get_my_chat_groups", {
        _project_id: anyProjectId,
      });
      const staff = (groups as any[] | null)?.find(
        (g) => g?.name === "HANDS Staff - Official",
      );
      if (!staff) {
        setGroupId(null);
        groupIdRef.current = null;
        setUnread(0);
        return;
      }
      setGroupId(staff.id);
      groupIdRef.current = staff.id;
      const { data: cnt } = await supabase.rpc("get_unread_count", {
        p_user_id: user.id,
        p_chat_group_id: staff.id,
      });
      setUnread(Number(cnt ?? 0));
    } catch {
      /* keep last value on transient errors */
    }
  }, [user?.id, anyProjectId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Live updates: any new message in the staff group bumps the badge; reading
  // the group (chat-read event) clears it immediately.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`hands-staff-unread-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const row = payload.new as { chat_group_id?: string; sender_id?: string };
          if (
            row?.chat_group_id &&
            row.chat_group_id === groupIdRef.current &&
            row.sender_id !== user.id
          ) {
            refetch();
          }
        },
      )
      .subscribe();

    const onRead = (e: Event) => {
      const id = (e as CustomEvent).detail?.groupId as string | undefined;
      if (id && id === groupIdRef.current) setUnread(0);
      else refetch();
    };
    window.addEventListener("amehnities:chat-read", onRead as EventListener);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("amehnities:chat-read", onRead as EventListener);
    };
  }, [user?.id, refetch]);

  return { unread, groupId, refetch };
}
