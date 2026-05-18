import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Link2, Loader2, LogOut, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface OAuthStatus {
  connected: boolean;
  google_email: string | null;
  expires_at: string | null;
  scope: string | null;
  updated_at: string | null;
  oauth_configured: boolean;
}

export function GoogleAccountConnect() {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-oauth-status", {
        body: { action: "status" },
      });
      if (error) throw error;
      setStatus(data as OAuthStatus);
    } catch (e: any) {
      console.warn("google-oauth-status failed", e);
      setStatus({
        connected: false,
        google_email: null,
        expires_at: null,
        scope: null,
        updated_at: null,
        oauth_configured: false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const onMsg = (ev: MessageEvent) => {
      if (ev?.data?.type === "google-oauth") refresh();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-oauth-initiate", {
        body: { return_to: window.location.href },
      });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error || "No authorization URL returned");
      const popup = window.open(
        data.url,
        "google-oauth",
        "width=520,height=640,menubar=no,toolbar=no",
      );
      if (!popup) {
        // Popup blocked — fall back to full redirect
        window.location.href = data.url;
        return;
      }
      // Poll for popup close to refresh status
      const t = setInterval(() => {
        if (popup.closed) {
          clearInterval(t);
          refresh();
        }
      }, 800);
    } catch (e: any) {
      toast({
        title: "Could not start Google sign-in",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await supabase.functions.invoke("google-oauth-status", {
        body: { action: "disconnect" },
      });
      toast({ title: "Google account disconnected" });
      refresh();
    } catch (e: any) {
      toast({
        title: "Disconnect failed",
        description: e?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-[hsl(174_72%_28%/0.08)] text-[hsl(174_72%_22%)] flex items-center justify-center shrink-0">
          <Link2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">Connect your Google account</p>
            {loading ? (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking…
              </Badge>
            ) : status?.connected ? (
              <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">Not connected</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Sync exports to <strong>your own</strong> Google Sheets — separate from the
            shared service account. Tokens are stored securely and only used on your behalf.
          </p>
          {status?.connected && status.google_email && (
            <p className="text-xs mt-1">
              Signed in as <span className="font-medium">{status.google_email}</span>
            </p>
          )}
          {!loading && status && !status.oauth_configured && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Google OAuth is not configured on the server. An administrator must add
                <code className="mx-1">GOOGLE_OAUTH_CLIENT_ID</code> and
                <code className="mx-1">GOOGLE_OAUTH_CLIENT_SECRET</code>.
              </span>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {status?.connected ? (
              <>
                <Button size="sm" variant="outline" onClick={handleConnect} disabled={connecting}>
                  {connecting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Re-authorize
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDisconnect}>
                  <LogOut className="h-3 w-3 mr-1" />
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={connecting || loading || (status ? !status.oauth_configured : false)}
              >
                {connecting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Connect Google
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default GoogleAccountConnect;
