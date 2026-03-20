import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePageAccess } from "@/hooks/usePageAccess";
import { toast } from "@/hooks/use-toast";

/**
 * Listens for app update notifications in real-time.
 * When an admin publishes an update notification for a page,
 * all users who have access to that page get notified.
 */
export function useAppUpdateNotifications() {
  const { user, isOwner } = useAuth();
  const { canAccessPage } = usePageAccess();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("app-update-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "app_update_notifications",
        },
        (payload) => {
          const update = payload.new as any;
          // Only show if user can access the page
          if (canAccessPage(update.page_id) || isOwner) {
            toast({
              title: `🆕 ${update.title}`,
              description: update.description,
              duration: 8000,
            });

            // Also persist as a notification
            supabase.from("notifications").insert({
              user_id: user.id,
              title: `🆕 ${update.title}`,
              message: update.description,
              type: "info",
              category: "app_update",
              related_id: update.page_id,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isOwner, canAccessPage]);

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
