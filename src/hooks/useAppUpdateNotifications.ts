import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePageAccess } from "@/hooks/usePageAccess";
import { toast } from "@/hooks/use-toast";

/**
 * Listens for app update notifications in real-time.
 * Hardened: uses a unique channel name per mount and refs for unstable
 * callbacks so the channel is created exactly once and `postgres_changes`
 * callbacks are never re-registered after `subscribe()` (the source of
 * the "cannot add postgres_changes callbacks ... after subscribe()" crash).
 */
export function useAppUpdateNotifications() {
  const { user, isOwner } = useAuth();
  const { canAccessPage } = usePageAccess();

  // Keep the latest values without re-subscribing
  const canAccessPageRef = useRef(canAccessPage);
  const isOwnerRef = useRef(isOwner);
  const userIdRef = useRef<string | undefined>(user?.id);
  useEffect(() => { canAccessPageRef.current = canAccessPage; }, [canAccessPage]);
  useEffect(() => { isOwnerRef.current = isOwner; }, [isOwner]);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    // Unique per-mount channel name avoids "channel already exists" collisions
    // under React StrictMode / fast refresh / double-effect scenarios.
    const channelName = `app-update-notifications:${user.id}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "app_update_notifications" },
      (payload) => {
        try {
          const update = payload.new as any;
          const allowed = canAccessPageRef.current?.(update.page_id) || isOwnerRef.current;
          if (!allowed) return;
          toast({
            title: `🆕 ${update.title}`,
            description: update.description,
            duration: 8000,
          });
          const uid = userIdRef.current;
          if (uid) {
            void supabase.from("notifications").insert({
              user_id: uid,
              title: `🆕 ${update.title}`,
              message: update.description,
              type: "info",
              category: "app_update",
              related_id: update.page_id,
            });
          }
        } catch (err) {
          console.warn("[useAppUpdateNotifications] handler error", err);
        }
      }
    );

    channel.subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
    // Only re-subscribe when the user identity actually changes.
  }, [user?.id]);

  const sendUpdateNotification = useCallback(
    async (pageId: string, title: string, description: string, updateType: string = "feature") => {
      if (!user) return;
      const { error } = await supabase.from("app_update_notifications").insert({
        page_id: pageId,
        title,
        description,
        update_type: updateType,
        created_by: user.id,
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Update Sent", description: "Users with access will be notified." });
      }
    },
    [user]
  );

  return { sendUpdateNotification };
}
