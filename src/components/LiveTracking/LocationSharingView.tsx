/**
 * LocationSharingView — the opt-in surface for any user.
 *
 * Users explicitly accept to be tracked here. Toggling the switch flips the
 * `location_tracking_enabled` flag on their profile; the app-shell
 * BackgroundLocationTracker reacts and begins/stops tracing the device path.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { MapPin, ShieldCheck, Satellite, WifiOff, Loader2 } from "lucide-react";

const LocationSharingView = () => {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("location_tracking_enabled")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setEnabled(!!(data as any)?.location_tracking_enabled);
        setLoading(false);
      });
  }, [user?.id]);

  const toggle = async (next: boolean) => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ location_tracking_enabled: next } as any)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    setEnabled(next);
    toast({
      title: next ? "Location sharing on" : "Location sharing off",
      description: next
        ? "Your device path is now being traced for your supervisors."
        : "Tracking has stopped on this device.",
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary">
          <MapPin className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">My Location Sharing</h1>
          <p className="text-sm text-muted-foreground">Choose whether your field movement is shared with administrators.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Satellite className="h-5 w-5 text-primary" /> Share my live location
              </CardTitle>
              <CardDescription>
                When enabled, your route is traced continuously (even offline) until you turn it off.
              </CardDescription>
            </div>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Switch checked={enabled} disabled={saving} onCheckedChange={toggle} />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Only the Owner, Co-owners and Super Admins can see your path. It is never public.</span>
          </div>
          <div className="flex items-start gap-2">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Works offline — points are cached on your device and synced automatically when you reconnect.</span>
          </div>
          <div className="pt-1">
            <Badge variant={enabled ? "default" : "secondary"}>
              {enabled ? "Tracking active" : "Not tracking"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationSharingView;
