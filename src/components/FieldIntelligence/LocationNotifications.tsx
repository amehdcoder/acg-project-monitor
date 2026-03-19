import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Send, MapPin, Users, Target, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface Props {
  projectId: string;
}

interface LocationAlert {
  id: string;
  title: string;
  message: string;
  targetType: "all" | "near_geofence" | "outside_geofence" | "idle";
  radius?: number;
  sentAt?: string;
  recipientCount?: number;
}

const LocationNotifications = ({ projectId }: Props) => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<LocationAlert[]>([]);
  const [newAlert, setNewAlert] = useState({ title: "", message: "", targetType: "all" as string });
  const [sending, setSending] = useState(false);
  const [sentAlerts, setSentAlerts] = useState<LocationAlert[]>([]);

  const sendLocationAlert = useCallback(async () => {
    if (!newAlert.title || !newAlert.message) {
      toast({ title: "Missing fields", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      let targetUsers: string[];
      if (projectId) {
        const { data: assignments } = await supabase
          .from("user_project_assignments")
          .select("user_id")
          .eq("project_id", projectId);
        if (!assignments?.length) {
          toast({ title: "No users found", variant: "destructive" });
          setSending(false);
          return;
        }
        targetUsers = assignments.map(a => a.user_id);
      } else {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("is_active", true)
          .limit(500);
        if (!profiles?.length) {
          toast({ title: "No users found", variant: "destructive" });
          setSending(false);
          return;
        }
        targetUsers = profiles.map(p => p.user_id);
      }

      // Filter by target type
      if (newAlert.targetType === "idle") {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, last_seen_at")
          .in("user_id", targetUsers);
        targetUsers = profiles
          ?.filter(p => !p.last_seen_at || Date.now() - new Date(p.last_seen_at).getTime() > 30 * 60000)
          .map(p => p.user_id) || [];
      }

      // Insert notifications for each user
      const notifications = targetUsers.map(uid => ({
        user_id: uid,
        title: `📍 ${newAlert.title}`,
        message: newAlert.message,
        type: "info" as const,
        category: "location_alert" as const,
      }));

      const { error } = await supabase.from("notifications").insert(notifications);
      if (error) throw error;

      const sent: LocationAlert = {
        id: crypto.randomUUID(),
        ...newAlert,
        targetType: newAlert.targetType as any,
        sentAt: new Date().toISOString(),
        recipientCount: targetUsers.length,
      };
      setSentAlerts(prev => [sent, ...prev]);
      setNewAlert({ title: "", message: "", targetType: "all" });
      toast({ title: "Alerts Sent!", description: `Notified ${targetUsers.length} data collector${targetUsers.length !== 1 ? "s" : ""}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [projectId, newAlert]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />Send Location-Based Alert
          </CardTitle>
          <CardDescription>Target data collectors based on their location status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!projectId ? (
            <p className="text-sm text-muted-foreground">Select a project first</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Alert Title</Label>
                  <Input
                    placeholder="e.g. Return to assigned area"
                    value={newAlert.title}
                    onChange={e => setNewAlert(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target Audience</Label>
                  <Select value={newAlert.targetType} onValueChange={v => setNewAlert(prev => ({ ...prev, targetType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Collectors</SelectItem>
                      <SelectItem value="near_geofence">Near Geofence Boundary</SelectItem>
                      <SelectItem value="outside_geofence">Outside Geofence</SelectItem>
                      <SelectItem value="idle">Idle Collectors (30+ min)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  placeholder="Enter the notification message..."
                  value={newAlert.message}
                  onChange={e => setNewAlert(prev => ({ ...prev, message: e.target.value }))}
                  rows={3}
                />
              </div>
              <Button onClick={sendLocationAlert} disabled={sending} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Alert
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {sentAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently Sent Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sentAlerts.map(a => (
              <div key={a.id} className="border rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{a.title}</span>
                  <Badge variant="secondary">{a.recipientCount} recipients</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{a.message}</p>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {a.targetType === "all" ? "All" : a.targetType === "idle" ? "Idle" : a.targetType}
                  </Badge>
                  {a.sentAt && <span>{new Date(a.sentAt).toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LocationNotifications;
