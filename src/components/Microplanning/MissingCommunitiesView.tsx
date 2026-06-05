import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getCommunitiesByWard, getSettlements } from "@/lib/grid3NigeriaData";
import {
  MapPinned, Building2, Home, AlertTriangle, BellRing, Trash2, Copy,
  Loader2, RefreshCw, CheckCircle2, Search, Layers, ListChecks, Bell,
} from "lucide-react";

interface Entry {
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
  community_name?: string | null;
  settlement_name?: string | null;
  created_by?: string | null;
}

interface Props {
  entries: Entry[];
  projectId?: string | null;
}

type GapLevel = "community" | "settlement";
type GapStatus = "pending" | "awaiting_capture" | "deleted_not_exist" | "deleted_duplicate" | "captured";

interface PersistedRow {
  id: string;
  state: string;
  lga: string;
  ward: string;
  flhf_name: string | null;
  community_name: string;
  settlement_name: string | null;
  status: GapStatus;
}

interface Gap {
  key: string;
  level: GapLevel;
  state: string;
  lga: string;
  ward: string;
  flhf_name: string;
  community_name: string;
  settlement_name: string | null;
  status: GapStatus;
  persistedId?: string;
}

const norm = (s?: string | null) => (s || "").trim().toLowerCase();
const gapKey = (state: string, lga: string, ward: string, community: string, settlement?: string | null) =>
  [norm(state), norm(lga), norm(ward), norm(community), norm(settlement)].join("|||");

const MissingCommunitiesView = ({ entries, projectId }: Props) => {
  const { user } = useAuth();
  const [persisted, setPersisted] = useState<PersistedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [filterState, setFilterState] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"open" | "awaiting" | "removed" | "all">("open");
  const [search, setSearch] = useState("");

  const loadPersisted = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("microplan_missing_communities")
        .select("id,state,lga,ward,flhf_name,community_name,settlement_name,status")
        .limit(5000);
      q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
      const { data, error } = await q;
      if (error) throw error;
      setPersisted((data as PersistedRow[]) || []);
    } catch (e: any) {
      toast({ title: "Could not load tracker", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadPersisted(); }, [loadPersisted]);

  const persistedByKey = useMemo(() => {
    const m = new Map<string, PersistedRow>();
    for (const r of persisted) {
      m.set(gapKey(r.state, r.lga, r.ward, r.community_name, r.settlement_name), r);
    }
    return m;
  }, [persisted]);

  // Map of present (already-captured) communities + settlements, and ward metadata
  const present = useMemo(() => {
    const communities = new Set<string>();
    const settlements = new Set<string>();
    const wards = new Map<string, { state: string; lga: string; ward: string; flhf: Map<string, number>; creators: Set<string> }>();
    const presentCommByWard = new Map<string, Set<string>>(); // ward -> set(community norms)
    for (const e of entries) {
      if (!e.state || !e.lga || !e.ward) continue;
      const wKey = gapKey(e.state, e.lga, e.ward, "", "");
      if (!wards.has(wKey)) wards.set(wKey, { state: e.state, lga: e.lga, ward: e.ward, flhf: new Map(), creators: new Set() });
      const w = wards.get(wKey)!;
      if (e.flhf_name) w.flhf.set(e.flhf_name, (w.flhf.get(e.flhf_name) || 0) + 1);
      if (e.created_by) w.creators.add(e.created_by);
      if (e.community_name) {
        communities.add(gapKey(e.state, e.lga, e.ward, e.community_name));
        if (!presentCommByWard.has(wKey)) presentCommByWard.set(wKey, new Set());
        presentCommByWard.get(wKey)!.add(norm(e.community_name));
      }
      if (e.community_name && e.settlement_name) {
        settlements.add(gapKey(e.state, e.lga, e.ward, e.community_name, e.settlement_name));
      }
    }
    return { communities, settlements, wards, presentCommByWard };
  }, [entries]);

  const topFlhf = (wKey: string) => {
    const w = present.wards.get(wKey);
    if (!w || w.flhf.size === 0) return "";
    return [...w.flhf.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  // Compute live gaps from GRID3 reference vs captured entries
  const gaps = useMemo<Gap[]>(() => {
    const out: Gap[] = [];
    const seen = new Set<string>();

    for (const [wKey, w] of present.wards.entries()) {
      const flhf = topFlhf(wKey);
      // Community-level expected
      const expectedComms = getCommunitiesByWard(w.state, w.lga, w.ward);
      const presentComms = present.presentCommByWard.get(wKey) || new Set<string>();
      for (const comm of expectedComms) {
        if (presentComms.has(norm(comm))) continue; // captured
        const k = gapKey(w.state, w.lga, w.ward, comm);
        if (seen.has(k)) continue;
        seen.add(k);
        const p = persistedByKey.get(k);
        if (p && (p.status === "deleted_not_exist" || p.status === "deleted_duplicate")) continue;
        out.push({
          key: k, level: "community", state: w.state, lga: w.lga, ward: w.ward,
          flhf_name: flhf, community_name: comm, settlement_name: null,
          status: p?.status ?? "pending", persistedId: p?.id,
        });
      }
    }

    // Settlement-level expected for communities that DO have an entry
    for (const e of entries) {
      if (!e.state || !e.lga || !e.ward || !e.community_name) continue;
      const wKey = gapKey(e.state, e.lga, e.ward, "", "");
      const flhf = topFlhf(wKey) || e.flhf_name || "";
      const expectedSetts = getSettlements(e.community_name);
      for (const sett of expectedSetts) {
        const k = gapKey(e.state, e.lga, e.ward, e.community_name, sett);
        if (present.settlements.has(k)) continue; // captured
        if (seen.has(k)) continue;
        seen.add(k);
        const p = persistedByKey.get(k);
        if (p && (p.status === "deleted_not_exist" || p.status === "deleted_duplicate")) continue;
        out.push({
          key: k, level: "settlement", state: e.state, lga: e.lga, ward: e.ward,
          flhf_name: flhf, community_name: e.community_name, settlement_name: sett,
          status: p?.status ?? "pending", persistedId: p?.id,
        });
      }
    }

    return out;
  }, [present, entries, persistedByKey]);

  const states = useMemo(() => [...new Set(gaps.map((g) => g.state))].sort(), [gaps]);

  const visible = useMemo(() => {
    return gaps.filter((g) => {
      if (filterState !== "all" && g.state !== filterState) return false;
      if (filterStatus === "open" && g.status !== "pending") return false;
      if (filterStatus === "awaiting" && g.status !== "awaiting_capture") return false;
      if (filterStatus === "removed") return false; // removed are excluded from live gaps already
      if (search) {
        const q = search.toLowerCase();
        if (![g.community_name, g.settlement_name, g.ward, g.lga].some((v) => (v || "").toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [gaps, filterState, filterStatus, search]);

  // Group visible by state > lga > ward
  const grouped = useMemo(() => {
    const m = new Map<string, Gap[]>();
    for (const g of visible) {
      const k = `${g.state} › ${g.lga} › ${g.ward}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(g);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  const counts = useMemo(() => ({
    pending: gaps.filter((g) => g.status === "pending").length,
    awaiting: gaps.filter((g) => g.status === "awaiting_capture").length,
    wards: present.wards.size,
  }), [gaps, present.wards.size]);

  const upsertDecision = async (g: Gap, status: GapStatus): Promise<string | null> => {
    const payload: any = {
      project_id: projectId ?? null,
      state: g.state, lga: g.lga, ward: g.ward,
      flhf_name: g.flhf_name || null,
      community_name: g.community_name,
      settlement_name: g.settlement_name,
      source: "grid3",
      status,
      resolved_by: user?.id ?? null,
      resolved_at: new Date().toISOString(),
    };
    if (g.persistedId) {
      const { error } = await supabase.from("microplan_missing_communities").update(payload).eq("id", g.persistedId);
      if (error) throw error;
      return g.persistedId;
    }
    payload.flagged_by = user?.id ?? null;
    const { data, error } = await supabase.from("microplan_missing_communities").insert(payload).select("id").single();
    if (error) throw error;
    return (data as any)?.id ?? null;
  };

  const notifyCapture = async (g: Gap, relatedId: string | null) => {
    // Recipients: entry creators in this ward, fallback to super admins + owner
    const wKey = gapKey(g.state, g.lga, g.ward, "", "");
    let recipients = [...(present.wards.get(wKey)?.creators ?? new Set<string>())].filter(Boolean);
    if (recipients.length === 0) {
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
      recipients = (admins || []).map((a: any) => a.user_id);
    }
    if (user?.id && !recipients.includes(user.id)) recipients.push(user.id);
    recipients = [...new Set(recipients)];
    if (recipients.length === 0) return;
    const targetLabel = g.level === "settlement"
      ? `${g.settlement_name} (settlement in ${g.community_name})`
      : g.community_name;
    const rows = recipients.map((uid) => ({
      user_id: uid,
      type: "warning",
      category: "microplanning",
      title: "📋 Microplan data capture needed",
      message: `${targetLabel} under ${g.flhf_name || "the FLHF"} in ${g.ward}, ${g.lga}, ${g.state} exists but has no microplan entry yet. Please capture its data.`,
      related_id: relatedId,
    }));
    await supabase.from("notifications").insert(rows);
  };

  const decide = async (g: Gap, status: GapStatus) => {
    if (!user) { toast({ title: "Sign in required", variant: "destructive" }); return; }
    setActingKey(g.key);
    try {
      const id = await upsertDecision(g, status);
      if (status === "awaiting_capture") {
        await notifyCapture(g, id);
        toast({ title: "Capture requested", description: "Responsible users have been notified to capture this entry." });
      } else if (status === "deleted_not_exist") {
        toast({ title: "Removed", description: "Marked as not existing under this FLHF and removed from the tracker." });
      } else if (status === "deleted_duplicate") {
        toast({ title: "Removed", description: "Marked as a duplicate and removed from the tracker." });
      }
      await loadPersisted();
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setActingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="border-border/50 bg-gradient-to-br from-amber-50 to-background dark:from-amber-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Unreported Gaps</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-amber-700 dark:text-amber-400">{counts.pending.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-sky-50 to-background dark:from-sky-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <BellRing className="h-4 w-4 text-sky-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Awaiting Capture</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-sky-700 dark:text-sky-400">{counts.awaiting.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-emerald-50 to-background dark:from-emerald-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPinned className="h-4 w-4 text-emerald-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Wards Analysed</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">{counts.wards.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Explainer */}
      <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 p-3">
        <Layers className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Communities &amp; settlements below are listed in the <strong>GRID3 / Nigeria reference</strong> for the wards you are
          working in, but have <strong>no microplan entry yet</strong>. Decide on each: confirm it doesn&apos;t exist under the
          FLHF, request data capture, or mark it as a duplicate.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search community / settlement…"
            className="h-8 w-[220px] rounded-md border border-input bg-background pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Select value={filterState} onValueChange={setFilterState}>
          <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="All States" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
          <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Unreported gaps</SelectItem>
            <SelectItem value="awaiting">Awaiting capture</SelectItem>
            <SelectItem value="all">All active</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={loadPersisted} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analysing coverage gaps…
        </div>
      ) : grouped.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500/70" />
            <p className="text-sm font-medium text-foreground">No outstanding coverage gaps</p>
            <p className="text-xs mt-1">Every reference community &amp; settlement in your wards has been captured or resolved.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([groupKey, items]) => (
            <Card key={groupKey} className="border-border/50 overflow-hidden">
              <div className="flex items-center justify-between gap-2 bg-primary/5 px-3 py-2 border-b border-border/50">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPinned className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-semibold truncate">{groupKey}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">{items.length} gap{items.length === 1 ? "" : "s"}</Badge>
              </div>
              <CardContent className="p-0 divide-y divide-border/40">
                {items.map((g) => {
                  const busy = actingKey === g.key;
                  const awaiting = g.status === "awaiting_capture";
                  return (
                    <div key={g.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${g.level === "settlement" ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
                          {g.level === "settlement" ? <Home className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                            {g.level === "settlement" ? g.settlement_name : g.community_name}
                            <Badge variant="outline" className="text-[9px] font-normal">
                              {g.level === "settlement" ? "Settlement" : "Community"}
                            </Badge>
                            {awaiting && (
                              <Badge className="text-[9px] bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300">
                                <Bell className="h-2.5 w-2.5 mr-0.5" /> Awaiting capture
                              </Badge>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {g.level === "settlement" && <>in {g.community_name} · </>}
                            {g.flhf_name ? <>FLHF: {g.flhf_name}</> : "FLHF: —"}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-[11px] gap-1 border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300"
                          disabled={busy} onClick={() => decide(g, "awaiting_capture")}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellRing className="h-3 w-3" />}
                          {awaiting ? "Notify again" : "Exists – request capture"}
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-[11px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300"
                          disabled={busy} onClick={() => decide(g, "deleted_duplicate")}
                        >
                          <Copy className="h-3 w-3" /> Duplicate – remove
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-[11px] gap-1 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                          disabled={busy} onClick={() => decide(g, "deleted_not_exist")}
                        >
                          <Trash2 className="h-3 w-3" /> Doesn&apos;t exist – remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MissingCommunitiesView;
