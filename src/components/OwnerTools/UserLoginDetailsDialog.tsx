/**
 * Owner / Co-owner "Login Details" monitor.
 *
 * Securely surfaces the current login / device session details for every user:
 *   - Who is currently online (active sessions + recent heartbeat)
 *   - Device, browser, OS, screen resolution
 *   - IP address (masked by default, revealed on demand)
 *   - First seen / last seen timestamps
 *
 * Access is strictly limited to the Owner and Co-owners. Reads rely on the
 * existing `device_sessions` RLS (admins/co-owners only) so no data is exposed
 * to standard users. IPs are masked in the UI until the viewer explicitly
 * chooses to reveal them, keeping sensitive details protected by default.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, MonitorSmartphone, RefreshCw, Eye, EyeOff, Circle, Wifi, Clock,
} from "lucide-react";

interface ProfileRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  designation: string | null;
  avatar_url: string | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  device_type: string | null;
  device_description: string | null;
  ip_address: string | null;
  browser: string | null;
  os: string | null;
  screen_resolution: string | null;
  is_active: boolean | null;
  first_seen_at: string;
  last_seen_at: string;
}

const ONLINE_WINDOW_MS = 3 * 60_000; // active heartbeat within last 3 minutes

const displayName = (p?: ProfileRow) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Unknown user" : "Unknown user";

const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
};

const maskIp = (ip: string | null) => {
  if (!ip) return "—";
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts[0]}:${parts[1]}:••••`;
  }
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.•••.•••`;
  return "••••";
};

export default function UserLoginDetailsDialog() {
  const { isOwner, isCoOwner } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [search, setSearch] = useState("");
  const [revealIps, setRevealIps] = useState(false);
  const [onlineOnly, setOnlineOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: profs }, sess] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email, designation, avatar_url"),
        fetchAllRows<SessionRow>((from, to) =>
          supabase
            .from("device_sessions")
            .select("id, user_id, device_type, device_description, ip_address, browser, os, screen_resolution, is_active, first_seen_at, last_seen_at")
            .order("last_seen_at", { ascending: false })
            .range(from, to),
        ),
      ]);
      setProfiles(new Map(((profs ?? []) as ProfileRow[]).map((p) => [p.user_id, p])));
      setSessions(sess);
    } catch (e: any) {
      toast({ title: "Could not load login details", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-refresh every 60s while open for a near-live view
  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isOnline = (s: SessionRow) =>
    s.is_active && Date.now() - new Date(s.last_seen_at).getTime() < ONLINE_WINDOW_MS;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = sessions;
    if (onlineOnly) list = list.filter(isOnline);
    if (q) {
      list = list.filter((s) => {
        const p = profiles.get(s.user_id);
        return (
          displayName(p).toLowerCase().includes(q) ||
          (p?.email ?? "").toLowerCase().includes(q) ||
          (s.ip_address ?? "").toLowerCase().includes(q) ||
          (s.device_description ?? "").toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [sessions, profiles, search, onlineOnly]);

  const onlineCount = useMemo(() => sessions.filter(isOnline).length, [sessions]);

  if (!isOwner && !isCoOwner) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MonitorSmartphone className="h-4 w-4 mr-2" />
          Login Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5 text-primary" /> User Login Details
          </DialogTitle>
          <DialogDescription>
            Live login &amp; device sessions for every user. Owner / Co-owner only — IP addresses are masked by default for privacy.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 py-2">
          <Input
            placeholder="Search by name, email, IP or device…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px]"
          />
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-4 pb-2 text-sm">
          <Badge variant="secondary" className="gap-1">
            <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500" />
            {onlineCount} online
          </Badge>
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={onlineOnly} onCheckedChange={setOnlineOnly} />
            <span className="text-muted-foreground">Online only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={revealIps} onCheckedChange={setRevealIps} />
            <span className="text-muted-foreground flex items-center gap-1">
              {revealIps ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Reveal IPs
            </span>
          </label>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-2">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">No matching sessions.</p>
              )}
              {filtered.map((s) => {
                const p = profiles.get(s.user_id);
                const online = isOnline(s);
                return (
                  <div key={s.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Circle
                            className={`h-2.5 w-2.5 ${online ? "fill-green-500 text-green-500" : "fill-muted-foreground/40 text-muted-foreground/40"}`}
                          />
                          <p className="text-sm font-medium truncate">{displayName(p)}</p>
                          {p?.designation && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {p.designation.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate ml-4.5">{p?.email}</p>
                      </div>
                      <Badge variant={online ? "default" : "secondary"} className="shrink-0">
                        {online ? "Online" : "Offline"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 mt-3 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Device</span>
                        <span className="font-medium">{s.device_description || s.device_type || "Unknown"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Browser / OS</span>
                        <span className="font-medium">{[s.browser, s.os].filter(Boolean).join(" · ") || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block flex items-center gap-1">
                          <Wifi className="h-3 w-3" /> IP address
                        </span>
                        <span className="font-medium font-mono">
                          {revealIps ? (s.ip_address || "—") : maskIp(s.ip_address)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Screen</span>
                        <span className="font-medium">{s.screen_resolution || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Last active
                        </span>
                        <span className="font-medium">{relativeTime(s.last_seen_at)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">First seen</span>
                        <span className="font-medium">{new Date(s.first_seen_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
