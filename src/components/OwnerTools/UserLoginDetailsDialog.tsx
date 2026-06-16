/**
 * Owner / Co-owner "Login Details" monitor.
 *
 * Securely surfaces the current login / device session details for every user:
 *   - Username (login email / ID) and current online status
 *   - Device, browser, OS, screen resolution
 *   - IP address (masked by default, revealed on demand)
 *   - First seen / last seen timestamps
 *
 * SECURITY NOTE: Passwords are intentionally NOT shown. They are stored only as
 * irreversible salted hashes (auth provider + offline PBKDF2 cache), so plaintext
 * does not exist and could never be displayed. The "username" is the login email.
 *
 * Access is strictly limited to the Owner and Co-owners. To avoid loading every
 * record at once, data is fetched server-side with debounced search and
 * pagination (device_sessions RLS already restricts reads to admins/co-owners).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, MonitorSmartphone, RefreshCw, Eye, EyeOff, Circle, Wifi, Clock,
  ChevronLeft, ChevronRight,
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
const PAGE_SIZE = 25;

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

const isOnline = (s: SessionRow) =>
  !!s.is_active && Date.now() - new Date(s.last_seen_at).getTime() < ONLINE_WINDOW_MS;

export default function UserLoginDetailsDialog() {
  const { isOwner, isCoOwner } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [revealIps, setRevealIps] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [onlineOnly, setOnlineOnly] = useState(false);

  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Debounce the search box -> server query
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // When searching, first resolve matching users by name / email so we can
      // scope the session query to just those user_ids (no full-table load).
      let matchedUserIds: string[] | null = null;
      if (search) {
        const term = `%${search}%`;
        const { data: matchProfs, error: pErr } = await supabase
          .from("profiles")
          .select("user_id")
          .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
          .limit(500);
        if (pErr) throw pErr;
        matchedUserIds = (matchProfs ?? []).map((r: any) => r.user_id);
        // Also allow matching by IP / device directly on sessions below.
      }

      let query = supabase
        .from("device_sessions")
        .select(
          "id, user_id, device_type, device_description, ip_address, browser, os, screen_resolution, is_active, first_seen_at, last_seen_at",
          { count: "exact" },
        );

      if (onlineOnly) {
        const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
        query = query.eq("is_active", true).gte("last_seen_at", cutoff);
      }

      if (search) {
        const term = `%${search}%`;
        const ids = matchedUserIds && matchedUserIds.length
          ? `user_id.in.(${matchedUserIds.join(",")}),`
          : "";
        query = query.or(`${ids}ip_address.ilike.${term},device_description.ilike.${term}`);
      }

      const { data: sess, error, count } = await query
        .order("last_seen_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      const rows = (sess ?? []) as SessionRow[];
      setSessions(rows);
      setTotal(count ?? 0);

      // Fetch only the profiles needed for this page.
      const pageUserIds = Array.from(new Set(rows.map((r) => r.user_id)));
      if (pageUserIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email, designation, avatar_url")
          .in("user_id", pageUserIds);
        setProfiles(new Map(((profs ?? []) as ProfileRow[]).map((p) => [p.user_id, p])));
      } else {
        setProfiles(new Map());
      }
    } catch (e: any) {
      toast({ title: "Could not load login details", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, search, onlineOnly]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Auto-refresh every 60s while open for a near-live view
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => loadRef.current(), 60_000);
    return () => clearInterval(t);
  }, [open]);

  const onlineCountPage = useMemo(() => sessions.filter(isOnline).length, [sessions]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
            Live login &amp; device sessions per user. Owner / Co-owner only. The
            username is each user's login email — passwords are never shown (stored
            as irreversible hashes). IP addresses are masked by default.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 py-2">
          <Input
            placeholder="Search by name, email, IP or device…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 min-w-[200px]"
          />
          <Button variant="ghost" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-4 pb-2 text-sm">
          <Badge variant="secondary" className="gap-1">
            <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500" />
            {onlineCountPage} online (this page)
          </Badge>
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={onlineOnly} onCheckedChange={(v) => { setOnlineOnly(v); setPage(0); }} />
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
              {sessions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">No matching sessions.</p>
              )}
              {sessions.map((s) => {
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
                        <p className="text-xs text-muted-foreground truncate ml-4.5">
                          <span className="font-medium">Username:</span> {p?.email || "—"}
                        </p>
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

        <div className="flex items-center justify-between border-t pt-3 mt-1 text-sm">
          <span className="text-muted-foreground">
            {total === 0 ? "0 sessions" : `Page ${page + 1} of ${pageCount} · ${total} session${total > 1 ? "s" : ""}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setPage((p) => (p + 1 < pageCount ? p + 1 : p))}
              disabled={page + 1 >= pageCount || loading}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
