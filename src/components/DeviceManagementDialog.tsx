import { useState, useEffect } from "react";
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Clock,
  MapPin,
  ShieldX,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useAdminSurveillance } from "@/hooks/useAdminSurveillance";

interface DeviceSession {
  id: string;
  user_id: string;
  session_id: string | null;
  device_type: string;
  device_description: string;
  ip_address: string | null;
  browser: string | null;
  os: string | null;
  screen_resolution: string | null;
  is_active: boolean;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
}

interface DeviceManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

function getDeviceIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("mobile") || t.includes("phone")) return Smartphone;
  if (t.includes("tablet")) return Tablet;
  return Monitor;
}

export function DeviceManagementDialog({
  isOpen,
  onClose,
  userId,
  userName,
}: DeviceManagementDialogProps) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const { logAction } = useAdminSurveillance();
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<DeviceSession | null>(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("device_sessions" as any)
        .select("*")
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false });

      if (error) throw error;
      setSessions((data as any[]) || []);
    } catch (err) {
      console.error("Error fetching device sessions:", err);
      toast({ title: "Error", description: "Failed to load device sessions.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId) fetchSessions();
  }, [isOpen, userId]);

  const handleRevoke = async (session: DeviceSession) => {
    setRevoking(session.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("device_sessions" as any)
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_by: user?.id,
        })
        .eq("id", session.id);

      if (error) throw error;

      // Send in-app notification to the affected user
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "Session Revoked",
        message: `Your session on "${session.device_description}" (IP: ${session.ip_address || "unknown"}) was terminated by an administrator. If this was unexpected, please change your password immediately.`,
        type: "warning",
        category: "security",
        related_id: session.id,
      });

      toast({ title: "Session Revoked", description: `Device session has been revoked and user notified.` });
      fetchSessions();
    } catch (err) {
      toast({ title: "Error", description: "Failed to revoke session.", variant: "destructive" });
    } finally {
      setRevoking(null);
      setConfirmRevoke(null);
    }
  };

  const handleRevokeAll = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("device_sessions" as any)
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_by: user?.id,
        })
        .eq("user_id", userId)
        .eq("is_active", true);

      if (error) throw error;

      // Send in-app notification
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "All Sessions Revoked",
        message: `All your active device sessions were terminated by an administrator. If this was unexpected, please change your password immediately.`,
        type: "warning",
        category: "security",
      });

      toast({ title: "All Sessions Revoked", description: `All sessions revoked and user notified.` });
      fetchSessions();
    } catch (err) {
      toast({ title: "Error", description: "Failed to revoke sessions.", variant: "destructive" });
    } finally {
      setConfirmRevokeAll(false);
    }
  };

  const activeSessions = sessions.filter((s) => s.is_active && !s.revoked_at);
  const revokedSessions = sessions.filter((s) => !s.is_active || s.revoked_at);

  const getTimeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Device Sessions — {userName}
            </DialogTitle>
            <DialogDescription>
              View all devices this user has logged in from and manage active sessions.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">
                {activeSessions.length} Active
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {revokedSessions.length} Revoked
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {activeSessions.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmRevokeAll(true)}
                >
                  <ShieldX className="h-3.5 w-3.5 mr-1.5" />
                  Revoke All
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="max-h-[55vh] pr-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Monitor className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No device sessions recorded yet.</p>
                <p className="text-xs mt-1">Sessions will appear once the user logs in.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Active Sessions */}
                {activeSessions.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Sessions</p>
                    {activeSessions.map((session) => {
                      const DevIcon = getDeviceIcon(session.device_type);
                      return (
                        <div
                          key={session.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <DevIcon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">
                                {session.device_description}
                              </p>
                              <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                              {session.ip_address && (
                                <span className="flex items-center gap-1">
                                  <Globe className="h-3 w-3" />
                                  {session.ip_address}
                                </span>
                              )}
                              {session.screen_resolution && (
                                <span className="flex items-center gap-1">
                                  <Monitor className="h-3 w-3" />
                                  {session.screen_resolution}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Last seen {getTimeSince(session.last_seen_at)}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              First seen: {format(new Date(session.first_seen_at), "MMM d, yyyy h:mm a")}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                            onClick={() => setConfirmRevoke(session)}
                            disabled={revoking === session.id}
                          >
                            {revoking === session.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <ShieldX className="h-3.5 w-3.5 mr-1" />
                                Revoke
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Revoked Sessions */}
                {revokedSessions.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-4">
                      Revoked / Inactive Sessions
                    </p>
                    {revokedSessions.map((session) => {
                      const DevIcon = getDeviceIcon(session.device_type);
                      return (
                        <div
                          key={session.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 opacity-60"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <DevIcon className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">
                                {session.device_description}
                              </p>
                              <Badge variant="secondary" className="text-[10px] h-4">Revoked</Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                              {session.ip_address && (
                                <span className="flex items-center gap-1">
                                  <Globe className="h-3 w-3" />
                                  {session.ip_address}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Last active {getTimeSince(session.last_seen_at)}
                              </span>
                            </div>
                            {session.revoked_at && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                Revoked: {format(new Date(session.revoked_at), "MMM d, yyyy h:mm a")}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Revoke single session confirmation */}
      <AlertDialog open={!!confirmRevoke} onOpenChange={() => setConfirmRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Revoke Session?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke the session on <strong>{confirmRevoke?.device_description}</strong>.
              The user will need to log in again on that device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRevoke && handleRevoke(confirmRevoke)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke all confirmation */}
      <AlertDialog open={confirmRevokeAll} onOpenChange={setConfirmRevokeAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Revoke All Sessions?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke all {activeSessions.length} active sessions for <strong>{userName}</strong>.
              They will need to log in again on all devices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke All Sessions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
