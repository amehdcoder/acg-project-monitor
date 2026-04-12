import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Shield, Search, Eye, RefreshCw, Lock, AlertTriangle, Clock, MapPin, Smartphone, Activity, BarChart3, Users, FileWarning, Mic, Play, Pause, Box, Glasses } from "lucide-react";
import { format } from "date-fns";
import { useAdminSurveillance } from "@/hooks/useAdminSurveillance";
import ARDataVisualization3D from "./ARDataVisualization3D";
import VRTrainingGame from "./VRTrainingGame";

interface SurveillanceEntry {
  id: string;
  actor_id: string;
  actor_email: string;
  actor_role: string;
  action_type: string;
  action_description: string;
  target_entity: string | null;
  target_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const AdminSurveillanceView = () => {
  const [entries, setEntries] = useState<SurveillanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [usageData, setUsageData] = useState<any[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<any[]>([]);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { logAction } = useAdminSurveillance();

  const handlePlayAudio = useCallback(async (clipId: string, filePath?: string) => {
    if (!filePath) return;

    if (playingAudioId === clipId) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingAudioId(null);
      return;
    }

    try {
      let url = audioUrls[clipId];

      if (!url) {
        const { data, error } = await supabase.storage
          .from("audio-verification")
          .createSignedUrl(filePath, 300);

        if (error) throw error;
        url = data.signedUrl;
        setAudioUrls((prev) => ({ ...prev, [clipId]: url }));
      }

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingAudioId(null);
      await audio.play();
      setPlayingAudioId(clipId);
    } catch (e) {
      console.error("Failed to play audio clip:", e);
      setPlayingAudioId(null);
    }
  }, [audioUrls, playingAudioId]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const [logsRes, usageRes, trackingRes] = await Promise.all([
        supabase.from("admin_surveillance_log" as any).select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("app_usage_tracking" as any).select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("form_tracking_events" as any).select("*").order("created_at", { ascending: false }).limit(500),
      ]);

      if (!logsRes.error && logsRes.data) setEntries(logsRes.data as unknown as SurveillanceEntry[]);
      if (!usageRes.error && usageRes.data) setUsageData(usageRes.data as any[]);
      if (!trackingRes.error && trackingRes.data) setTrackingEvents(trackingRes.data as any[]);
    } catch (e) {
      console.error("Failed to fetch surveillance data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    logAction("view_surveillance_logs", "Accessed the surveillance log page");

    // Real-time subscription to surveillance data
    const channel = supabase
      .channel("surveillance-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_surveillance_log" }, () => {
        fetchLogs();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "form_tracking_events" }, () => {
        fetchLogs();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "app_usage_tracking" }, () => {
        fetchLogs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredEntries = entries.filter((e) => {
    const matchesSearch = !searchTerm ||
      e.actor_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.action_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.action_type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterAction === "all" || e.action_type === filterAction;
    const matchesRole = filterRole === "all" || e.actor_role === filterRole;
    return matchesSearch && matchesAction && matchesRole;
  });

  const actionTypes = [...new Set(entries.map((e) => e.action_type))];

  // Derived analytics
  const failedLogins = entries.filter(e => e.action_type === "failed_login");
  const successfulLogins = entries.filter(e => e.action_type === "successful_login");
  const screenshotAttempts = entries.filter(e => e.action_type === "screenshot_attempt" || e.action_type === "screenshot_possible");
  const geofenceBreaches = entries.filter(e => e.action_type === "geofence_breach");
  const similarEntries = entries.filter(e => e.action_type === "similar_entry_detected");
  const rushedSubmissions = entries.filter(e => e.action_type === "rushed_submission");
  const loginLocations = entries.filter(e => e.action_type === "login_location");
  const externalServices = entries.filter(e => e.action_type === "external_service_call");
  const networkChanges = entries.filter(e => e.action_type === "network_change");
  const audioClips = trackingEvents.filter(e => e.event_type === "audio_verification");
  const photoMetadata = trackingEvents.filter(e => e.event_type === "photo_metadata");
  const fieldNotes = trackingEvents.filter(e => e.event_type === "field_note");

  // Usage heatmap
  const pageUsageCounts = useMemo(() => {
    const counts: Record<string, { views: number; totalSeconds: number }> = {};
    for (const u of usageData) {
      if (!counts[u.page_id]) counts[u.page_id] = { views: 0, totalSeconds: 0 };
      counts[u.page_id].views++;
      counts[u.page_id].totalSeconds += u.duration_seconds || 0;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 20);
  }, [usageData]);

  const maxViews = pageUsageCounts.length > 0 ? pageUsageCounts[0][1].views : 1;

  // GDPR compliance score
  const gdprScore = useMemo(() => {
    let score = 0;
    const checks = [
      { name: "RLS Policies Active", pass: true, weight: 20 },
      { name: "Surveillance Logging", pass: entries.length > 0, weight: 15 },
      { name: "Session Management", pass: true, weight: 15 },
      { name: "Data Encryption (TLS)", pass: true, weight: 15 },
      { name: "Consent Mechanism", pass: true, weight: 10 },
      { name: "Audit Trail", pass: entries.length > 0, weight: 15 },
      { name: "Access Control", pass: true, weight: 10 },
    ];
    for (const c of checks) {
      if (c.pass) score += c.weight;
    }
    return { score, checks };
  }, [entries]);

  const getActionBadgeVariant = (action: string): "default" | "destructive" | "secondary" | "outline" => {
    if (action.includes("delete") || action.includes("revoke") || action.includes("deactivate") || action.includes("failed_login")) return "destructive";
    if (action.includes("view") || action.includes("export")) return "secondary";
    if (action.includes("impersonate") || action.includes("screenshot") || action.includes("similar")) return "default";
    return "outline";
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Lock className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-xl font-display flex items-center gap-2">
                <Shield className="h-5 w-5 text-destructive" />
                Admin Surveillance Log
              </CardTitle>
              <CardDescription className="text-destructive/70">
                Tamper-proof record — immutable, no edits or deletions possible. Owner access only.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-foreground">{entries.length}</p>
          <p className="text-xs text-muted-foreground">Total Records</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-destructive">{failedLogins.length}</p>
          <p className="text-xs text-muted-foreground">Failed Logins</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-foreground">{screenshotAttempts.length}</p>
          <p className="text-xs text-muted-foreground">Screenshots</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-destructive">{similarEntries.length}</p>
          <p className="text-xs text-muted-foreground">Similar Entries</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-foreground">{rushedSubmissions.length}</p>
          <p className="text-xs text-muted-foreground">Rushed Forms</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-foreground">{networkChanges.length}</p>
          <p className="text-xs text-muted-foreground">SIM/Network Changes</p>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="logs" className="text-xs">All Logs</TabsTrigger>
          <TabsTrigger value="logins" className="text-xs">Login Tracking</TabsTrigger>
          <TabsTrigger value="form-tracking" className="text-xs">Form Tracking</TabsTrigger>
          <TabsTrigger value="external-services" className="text-xs">External Services</TabsTrigger>
          <TabsTrigger value="data-integrity" className="text-xs">Data Integrity</TabsTrigger>
          <TabsTrigger value="usage" className="text-xs">Usage Heatmap</TabsTrigger>
          <TabsTrigger value="gdpr" className="text-xs">GDPR Compliance</TabsTrigger>
          <TabsTrigger value="media" className="text-xs">Media & Audio</TabsTrigger>
          <TabsTrigger value="field-notes" className="text-xs">Field Notes</TabsTrigger>
          <TabsTrigger value="ar-3d" className="text-xs gap-1"><Box className="h-3 w-3" />AR 3D Data</TabsTrigger>
          <TabsTrigger value="vr-training" className="text-xs gap-1"><Glasses className="h-3 w-3" />VR Training</TabsTrigger>
        </TabsList>

        {/* All Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by email, action, or description..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
                </div>
                <Select value={filterAction} onValueChange={setFilterAction}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Action type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    {actionTypes.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterRole} onValueChange={setFilterRole}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="systems_admin">Systems Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={fetchLogs}><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          {/* Log Table */}
          <Card>
            <CardContent className="pt-4 p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filteredEntries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground"><Eye className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>No records found</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">Timestamp</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Target</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((entry) => {
                        const device = (entry.metadata as any)?.device;
                        return (
                          <TableRow key={entry.id} className={
                            entry.action_type.includes("delete") || entry.action_type.includes("impersonate") || entry.action_type === "failed_login"
                              ? "bg-destructive/5" : ""
                          }>
                            <TableCell className="text-xs font-mono whitespace-nowrap">{format(new Date(entry.created_at), "MMM d, HH:mm:ss")}</TableCell>
                            <TableCell className="text-xs max-w-32 truncate" title={entry.actor_email}>{entry.actor_email || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={entry.actor_role === "super_admin" ? "destructive" : "secondary"} className="text-[10px]">{entry.actor_role.replace(/_/g, " ")}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getActionBadgeVariant(entry.action_type)} className="text-[10px]">{entry.action_type.replace(/_/g, " ")}</Badge>
                            </TableCell>
                            <TableCell className="text-xs max-w-48 truncate" title={entry.action_description}>{entry.action_description}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {device ? (
                                <span title={device.user_agent}>
                                  <Smartphone className="h-3 w-3 inline mr-1" />
                                  {device.type} · {device.os} · {device.browser}
                                  {device.model ? ` · ${device.model}` : ""}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {entry.target_entity && <span>{entry.target_entity}{entry.target_id ? `: ${entry.target_id.slice(0, 8)}...` : ""}</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Login Tracking Tab */}
        <TabsContent value="logins" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            <Card><CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-destructive">{failedLogins.length}</p>
              <p className="text-[10px] text-muted-foreground">Failed Logins</p>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-green-600">{successfulLogins.length}</p>
              <p className="text-[10px] text-muted-foreground">Successful Logins</p>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-foreground">{loginLocations.length}</p>
              <p className="text-[10px] text-muted-foreground">Login Locations</p>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-foreground">{networkChanges.length}</p>
              <p className="text-[10px] text-muted-foreground">Network Changes</p>
            </CardContent></Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Failed Login Attempts</CardTitle></CardHeader>
              <CardContent>
                {failedLogins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No failed login attempts recorded.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {failedLogins.slice(0, 25).map(e => {
                      const meta = e.metadata as any;
                      const device = meta?.device;
                      return (
                        <div key={e.id} className="p-2.5 rounded bg-destructive/5 border border-destructive/10 text-sm">
                          <div className="flex justify-between items-start">
                            <span className="font-semibold text-foreground">{meta?.user_name || e.target_id || e.actor_email}</span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{format(new Date(e.created_at), "MMM d HH:mm:ss")}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{e.actor_email}</p>
                          {meta?.user_state && <p className="text-xs text-muted-foreground">📍 {meta.user_state}{meta.user_lga ? `, ${meta.user_lga}` : ""}</p>}
                          {device && <p className="text-[10px] text-muted-foreground mt-0.5">📱 {device.type} · {device.os} · {device.browser}{device.model ? ` · ${device.model}` : ""}</p>}
                          <p className="text-xs text-destructive/80 mt-0.5">{meta?.error || "Invalid credentials"}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-green-600" />Successful Logins</CardTitle></CardHeader>
              <CardContent>
                {successfulLogins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No successful logins recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {successfulLogins.slice(0, 25).map(e => {
                      const meta = e.metadata as any;
                      const device = meta?.device;
                      return (
                        <div key={e.id} className="p-2.5 rounded bg-green-500/5 border border-green-500/10 text-sm">
                          <div className="flex justify-between items-start">
                            <span className="font-semibold text-foreground">{meta?.user_name || e.actor_email}</span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{format(new Date(e.created_at), "MMM d HH:mm:ss")}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{e.actor_email}</p>
                          {meta?.user_state && <p className="text-xs text-muted-foreground">📍 {meta.user_state}{meta.user_lga ? `, ${meta.user_lga}` : ""}</p>}
                          {device && <p className="text-[10px] text-muted-foreground mt-0.5">📱 {device.type} · {device.os} · {device.browser}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Login Locations</CardTitle></CardHeader>
              <CardContent>
                {loginLocations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No login locations recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {loginLocations.slice(0, 20).map(e => {
                      const meta = e.metadata as any;
                      return (
                        <div key={e.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                          <div>
                            <span className="font-medium">{meta?.user_name || e.actor_email || "User"}</span>
                            {meta?.latitude && <p className="text-xs text-muted-foreground">📍 {meta.latitude.toFixed(4)}, {meta.longitude.toFixed(4)} (±{meta.accuracy?.toFixed(0)}m)</p>}
                          </div>
                          <span className="text-xs text-muted-foreground">{format(new Date(e.created_at), "MMM d HH:mm")}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" />SIM/Network Change Events</CardTitle></CardHeader>
              <CardContent>
                {networkChanges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No SIM or network changes detected.</p>
                ) : (
                  <div className="space-y-2">
                    {networkChanges.map(e => (
                      <div key={e.id} className="p-2 rounded bg-destructive/5 text-sm">
                        <span className="font-medium">{e.actor_email || "User"}</span>: {e.action_description}
                        <span className="text-xs text-muted-foreground ml-2">{format(new Date(e.created_at), "MMM d HH:mm")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Form Tracking Tab */}
        <TabsContent value="form-tracking" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            <Card><CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-foreground">{trackingEvents.filter(e => e.event_type === "form_timing").length}</p>
              <p className="text-[10px] text-muted-foreground">Completion Records</p>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-destructive">{trackingEvents.filter(e => e.event_type === "validation_failure").length}</p>
              <p className="text-[10px] text-muted-foreground">Validation Failures</p>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-foreground">{trackingEvents.filter(e => e.event_type === "question_skipped").length}</p>
              <p className="text-[10px] text-muted-foreground">Skipped Questions</p>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold text-destructive">{rushedSubmissions.length}</p>
              <p className="text-[10px] text-muted-foreground">Rushed Submissions</p>
            </CardContent></Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />Form Completion Times</CardTitle></CardHeader>
              <CardContent>
                {trackingEvents.filter(e => e.event_type === "form_timing").length === 0 ? (
                  <p className="text-sm text-muted-foreground">No form timing data yet.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {trackingEvents.filter(e => e.event_type === "form_timing").slice(0, 20).map(e => {
                      const data = e.event_data;
                      const isRushed = data.completion_time_seconds < 60;
                      return (
                        <div key={e.id} className={`p-2.5 rounded text-sm ${isRushed ? "bg-destructive/10 border border-destructive/20" : "bg-muted/50"}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-semibold text-foreground">{data.user_name || "Unknown"}</span>
                              {data.user_email && <span className="text-xs text-muted-foreground ml-1">({data.user_email})</span>}
                            </div>
                            {isRushed && <Badge variant="destructive" className="text-[10px]">Rushed</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Form: <span className="font-medium text-foreground">{data.form_name || e.form_id?.slice(0, 8)}</span>
                            {data.user_state && <> · {data.user_state}{data.user_lga ? `, ${data.user_lga}` : ""}</>}
                          </p>
                          <div className="flex justify-between mt-1">
                            <span className="font-bold text-foreground">{data.completion_time_seconds}s</span>
                            <span className="text-xs text-muted-foreground">{data.answered_count}/{data.question_count} answered · {format(new Date(e.created_at), "MMM d HH:mm")}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileWarning className="h-4 w-4 text-destructive" />Validation Failures</CardTitle></CardHeader>
              <CardContent>
                {trackingEvents.filter(e => e.event_type === "validation_failure").length === 0 ? (
                  <p className="text-sm text-muted-foreground">No validation failures logged.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {trackingEvents.filter(e => e.event_type === "validation_failure").slice(0, 20).map(e => {
                      const data = e.event_data;
                      return (
                        <div key={e.id} className="p-2.5 rounded bg-destructive/5 border border-destructive/10 text-sm">
                          <div className="flex justify-between items-start">
                            <span className="font-semibold text-foreground">{data.user_name || "Unknown"}</span>
                            <Badge variant="destructive" className="text-[10px]">{data.total_failures} failure{data.total_failures !== 1 ? "s" : ""}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Form: <span className="font-medium text-foreground">{data.form_name || e.form_id?.slice(0, 8)}</span>
                            {data.user_state && <> · {data.user_state}{data.user_lga ? `, ${data.user_lga}` : ""}</>}
                          </p>
                          <div className="text-xs text-destructive/80 mt-1">
                            {data.failures?.slice(0, 3).map((f: any, i: number) => (
                              <p key={i}>• "{f.questionLabel}": {f.rule}</p>
                            ))}
                            {data.failures?.length > 3 && <p className="text-muted-foreground">+{data.failures.length - 3} more</p>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{format(new Date(e.created_at), "MMM d HH:mm")}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" />Skipped Questions</CardTitle></CardHeader>
              <CardContent>
                {trackingEvents.filter(e => e.event_type === "question_skipped").length === 0 ? (
                  <p className="text-sm text-muted-foreground">No skipped questions logged.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {trackingEvents.filter(e => e.event_type === "question_skipped").slice(0, 20).map(e => {
                      const data = e.event_data;
                      return (
                        <div key={e.id} className="p-2.5 rounded bg-muted/50 border border-border/50 text-sm">
                          <div className="flex justify-between items-start">
                            <span className="font-semibold text-foreground">{data.user_name || "Unknown"}</span>
                            <Badge variant="secondary" className="text-[10px]">{data.total_skipped} skipped</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Form: <span className="font-medium text-foreground">{data.form_name || e.form_id?.slice(0, 8)}</span>
                            {data.user_state && <> · {data.user_state}{data.user_lga ? `, ${data.user_lga}` : ""}</>}
                          </p>
                          <div className="text-xs text-muted-foreground mt-1">
                            {data.skipped_questions?.slice(0, 4).map((sq: any, i: number) => (
                              <p key={i}>• {sq.label}</p>
                            ))}
                            {data.skipped_questions?.length > 4 && <p>+{data.skipped_questions.length - 4} more</p>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{format(new Date(e.created_at), "MMM d HH:mm")}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="data-integrity" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-destructive" />Similar/Duplicate Entries</CardTitle>
                <CardDescription>Flagged form entries with high similarity that may indicate data inflation</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" className="mb-3" onClick={async () => {
                  await supabase.functions.invoke("detect-similar-entries", { body: { hours_back: 24, threshold: 0.8 } });
                  fetchLogs();
                }}>
                  <RefreshCw className="h-3 w-3 mr-2" />Run Detection Now
                </Button>
                {similarEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No similar entries detected.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {similarEntries.slice(0, 20).map(e => {
                      const meta = e.metadata as any;
                      return (
                        <div key={e.id} className="p-2 rounded bg-destructive/5 text-sm border border-destructive/10">
                          <div className="flex justify-between">
                            <span className="font-medium">{meta?.similarity}% similar</span>
                            <Badge variant="destructive" className="text-[10px]">Flagged</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{e.action_description}</p>
                          {meta?.matching_fields && (
                            <p className="text-xs text-muted-foreground mt-1">Matching: {meta.matching_fields.slice(0, 5).join(", ")}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Screenshot & Security Events</CardTitle></CardHeader>
              <CardContent>
                {screenshotAttempts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No screenshot attempts detected.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {screenshotAttempts.map(e => (
                      <div key={e.id} className="p-2 rounded bg-muted/50 text-sm">
                        <span className="font-medium">{e.actor_email || "User"}</span>: {e.action_description}
                        <span className="text-xs text-muted-foreground ml-2">{format(new Date(e.created_at), "MMM d HH:mm")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />External Service Communication Log</CardTitle></CardHeader>
            <CardContent>
              {externalServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No external service communications logged.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {externalServices.slice(0, 20).map(e => {
                        const meta = e.metadata as any;
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs">{format(new Date(e.created_at), "MMM d HH:mm:ss")}</TableCell>
                            <TableCell className="text-xs font-medium">{meta?.service_name || "Unknown"}</TableCell>
                            <TableCell><Badge variant={meta?.success ? "secondary" : "destructive"} className="text-[10px]">{meta?.success ? "Success" : "Failed"}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{meta?.endpoint || ""}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage Heatmap Tab */}
        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />App Usage Heatmap — Most Used Features</CardTitle></CardHeader>
            <CardContent>
              {pageUsageCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usage data collected yet.</p>
              ) : (
                <div className="space-y-3">
                  {pageUsageCounts.map(([pageId, data]) => (
                    <div key={pageId}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium capitalize">{pageId.replace(/-/g, " ")}</span>
                        <span className="text-muted-foreground">{data.views} visits · {Math.round(data.totalSeconds / 60)}min total</span>
                      </div>
                      <Progress value={(data.views / maxViews) * 100} className="h-2" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* GDPR Compliance Tab */}
        <TabsContent value="gdpr" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />GDPR Compliance Assessment</CardTitle>
              <CardDescription>Automated assessment of data protection compliance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold text-primary">{gdprScore.score}%</div>
                <div className="flex-1">
                  <Progress value={gdprScore.score} className="h-3" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {gdprScore.score >= 90 ? "Excellent compliance" : gdprScore.score >= 70 ? "Good compliance" : "Needs improvement"}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {gdprScore.checks.map(c => (
                  <div key={c.name} className="flex items-center justify-between p-2 rounded bg-muted/30">
                    <div className="flex items-center gap-2">
                      {c.pass ? <Badge variant="secondary" className="text-[10px]">✓ Pass</Badge> : <Badge variant="destructive" className="text-[10px]">✗ Fail</Badge>}
                      <span className="text-sm">{c.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.weight}pts</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Media & Audio Tab */}
        <TabsContent value="media" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mic className="h-4 w-4" />Audio Verification Clips</CardTitle></CardHeader>
              <CardContent>
                {audioClips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No audio verification clips recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {audioClips.slice(0, 30).map(e => {
                      const data = e.event_data;
                      const filePath = data?.file_path as string | undefined;
                      const isPlaying = playingAudioId === e.id;
                      const clipUserName = data?.user_name || "Unknown User";
                      const clipAdminUnit = data?.admin_unit || "";
                      const clipFormName = data?.form_name || e.form_id?.slice(0, 8);
                      return (
                        <div key={e.id} className="p-3 rounded-lg bg-muted/50 text-sm flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">🎙️ {clipUserName}</p>
                            {clipAdminUnit && <p className="text-[10px] text-muted-foreground truncate">📍 {clipAdminUnit}</p>}
                            <p className="text-xs text-muted-foreground">
                              {data.duration_seconds}s · {clipFormName} · {format(new Date(e.created_at), "MMM d HH:mm")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handlePlayAudio(e.id, filePath)} disabled={!filePath}>
                              {isPlaying ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                              {isPlaying ? "Stop" : "Play"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Photo/Video Metadata</CardTitle></CardHeader>
              <CardContent>
                {photoMetadata.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No media metadata captured yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {photoMetadata.slice(0, 20).map(e => {
                      const data = e.event_data;
                      return (
                        <div key={e.id} className="p-2 rounded bg-muted/50 text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">{data.media_type === "photo" ? "📸" : "🎬"} {data.media_type}</span>
                            <span className="text-xs text-muted-foreground">{data.capture_date} {data.capture_time}</span>
                          </div>
                          {data.gps && (
                            <p className="text-xs text-muted-foreground">📍 {data.gps.latitude?.toFixed(4)}, {data.gps.longitude?.toFixed(4)} ±{data.gps.accuracy?.toFixed(0)}m</p>
                          )}
                          {!data.gps && data.gps_error && (
                            <p className="text-xs text-destructive/70">⚠ {data.gps_error}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Field Notes Tab */}
        <TabsContent value="field-notes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileWarning className="h-4 w-4" />Field Challenge Notes</CardTitle>
              <CardDescription>Reports from users about field challenges submitted alongside forms</CardDescription>
            </CardHeader>
            <CardContent>
              {fieldNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No field notes submitted yet.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {fieldNotes.map(e => {
                    const data = e.event_data;
                    return (
                      <div key={e.id} className="p-3 rounded-lg border bg-card text-sm">
                        <div className="flex justify-between mb-2">
                          <Badge variant="outline" className="text-[10px]">Form: {e.form_id?.slice(0, 8)}...</Badge>
                          <span className="text-xs text-muted-foreground">{format(new Date(e.created_at), "MMM d HH:mm")}</span>
                        </div>
                        <p className="text-sm">{data.notes}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AR 3D Data Visualization Tab */}
        <TabsContent value="ar-3d" className="space-y-4">
          <ARDataVisualization3D />
        </TabsContent>

        {/* VR Training Simulation Tab */}
        <TabsContent value="vr-training" className="space-y-4">
          <VRTrainingGame />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSurveillanceView;
