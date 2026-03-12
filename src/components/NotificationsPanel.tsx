import { useState, useEffect, useCallback } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Bell,
  CheckCheck,
  Trash2,
  AlertCircle,
  CheckCircle,
  Info,
  Clock,
  CalendarClock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  category: string;
  related_id: string | null;
}

const NotificationsPanel = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(
        (data || []).map((n: any) => ({
          id: n.id,
          type: n.type as Notification["type"],
          title: n.title,
          message: n.message,
          created_at: n.created_at,
          read: n.read,
          category: n.category,
          related_id: n.related_id,
        }))
      );
    } catch (e) {
      console.error("Error fetching notifications:", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Fetch on mount and when opened
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Poll every 60s for new notifications
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Also trigger the reminder check when panel opens (lightweight call)
  useEffect(() => {
    if (open && user?.id) {
      supabase.functions.invoke("check-follow-up-reminders").catch(() => {
        // Silent fail — edge function may not be deployed yet
      });
    }
  }, [open, user?.id]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (user?.id) {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
    }
  };

  const deleteNotification = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  };

  const clearAll = async () => {
    setNotifications([]);
    if (user?.id) {
      await supabase.from("notifications").delete().eq("user_id", user.id);
    }
  };

  const getIcon = (type: Notification["type"], category?: string) => {
    if (category === "follow_up_reminder") {
      return <CalendarClock className="h-4 w-4 text-amber-500" />;
    }
    switch (type) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getBgColor = (type: Notification["type"], read: boolean) => {
    if (read) return "bg-card";
    switch (type) {
      case "success":
        return "bg-green-50 dark:bg-green-950/20";
      case "warning":
        return "bg-amber-50 dark:bg-amber-950/20";
      case "error":
        return "bg-red-50 dark:bg-red-950/20";
      default:
        return "bg-blue-50 dark:bg-blue-950/20";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h4 className="font-medium">Notifications</h4>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-7 text-xs">
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">
                {loading ? "Loading..." : "No notifications yet"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`group relative p-3 transition-colors hover:bg-muted/50 cursor-pointer ${getBgColor(
                    notification.type,
                    notification.read
                  )}`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5 shrink-0">
                      {getIcon(notification.type, notification.category)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h5 className={`text-sm ${!notification.read ? "font-medium" : ""}`}>
                          {notification.title}
                        </h5>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                        {notification.message}
                      </p>
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                  </div>
                  {!notification.read && (
                    <div className="absolute left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={clearAll}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear all notifications
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationsPanel;
