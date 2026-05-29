import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  X,
  Activity,
  Search,
  Loader2,
  Layers,
  TrendingUp,
  CalendarCheck,
  Users,
  CheckCircle2,
  ArrowRight,
  Repeat,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface AnalysisCase {
  id: string;
  name: string;
  status: "open" | "closed";
  openedAt: string;
  caseTypeLabel: string;
  caseTypeId: string;
  properties: Record<string, any>;
}

interface FollowUpActivity {
  id: string;
  case_id: string;
  performed_at: string;
  activity_type: string;
  changes: any;
  notes: string | null;
}

interface CaseLongitudinalAnalysisProps {
  cases: AnalysisCase[];
  onClose: () => void;
}

const prettify = (key: string) =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const extractChanges = (changes: any): Record<string, any> => {
  if (!changes || typeof changes !== "object") return {};
  // useCaseManagement stores { action, changes: {...} }
  if (changes.changes && typeof changes.changes === "object") return changes.changes;
  const { action, ...rest } = changes;
  return rest;
};

const CaseLongitudinalAnalysis = ({ cases, onClose }: CaseLongitudinalAnalysisProps) => {
  const [activities, setActivities] = useState<FollowUpActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      const ids = cases.map((c) => c.id);
      if (ids.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }
      const collected: FollowUpActivity[] = [];
      // Chunk to respect IN limits
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data } = await supabase
          .from("case_activities")
          .select("id, case_id, performed_at, activity_type, changes, notes")
          .in("case_id", chunk)
          .in("activity_type", ["follow_up", "closure"])
          .order("performed_at", { ascending: true });
        if (data) collected.push(...(data as any));
      }
      setActivities(collected);
      setLoading(false);
    };
    fetchActivities();
  }, [cases]);

  const caseMap = useMemo(() => {
    const m = new Map<string, AnalysisCase>();
    cases.forEach((c) => m.set(c.id, c));
    return m;
  }, [cases]);

  // Group activities by case
  const byCase = useMemo(() => {
    const m = new Map<string, FollowUpActivity[]>();
    activities.forEach((a) => {
      const list = m.get(a.case_id) || [];
      list.push(a);
      m.set(a.case_id, list);
    });
    return m;
  }, [activities]);

  // Summary metrics
  const totalFollowUps = activities.filter((a) => a.activity_type === "follow_up").length;
  const casesWithFollowUp = byCase.size;
  const avgPerCase = cases.length ? (totalFollowUps / cases.length).toFixed(1) : "0";
  const coverage = cases.length ? Math.round((casesWithFollowUp / cases.length) * 100) : 0;

  // Follow-ups over time (by month)
  const timeline = useMemo(() => {
    const buckets = new Map<string, number>();
    activities
      .filter((a) => a.activity_type === "follow_up")
      .forEach((a) => {
        const key = format(new Date(a.performed_at), "MMM yyyy");
        buckets.set(key, (buckets.get(key) || 0) + 1);
      });
    return Array.from(buckets.entries()).map(([month, count]) => ({ month, count }));
  }, [activities]);

  // Distribution of follow-up counts per case
  const distribution = useMemo(() => {
    const counts = new Map<number, number>();
    cases.forEach((c) => {
      const n = (byCase.get(c.id) || []).filter((a) => a.activity_type === "follow_up").length;
      counts.set(n, (counts.get(n) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([visits, cnt]) => ({ visits: `${visits} visit${visits === 1 ? "" : "s"}`, cnt }));
  }, [cases, byCase]);

  // Flattened table rows
  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = cases.filter((c) =>
      !q || c.name.toLowerCase().includes(q) || c.caseTypeLabel.toLowerCase().includes(q)
    );
    // Show cases with most follow-ups first
    return list.sort(
      (a, b) => (byCase.get(b.id)?.length || 0) - (byCase.get(a.id)?.length || 0)
    );
  }, [cases, search, byCase]);

  const maxVisits = useMemo(
    () =>
      Math.max(
        1,
        ...cases.map((c) => (byCase.get(c.id) || []).filter((a) => a.activity_type === "follow_up").length)
      ),
    [cases, byCase]
  );

  const selectedCase = selectedCaseId ? caseMap.get(selectedCaseId) : null;
  const selectedActivities = selectedCaseId ? byCase.get(selectedCaseId) || [] : [];

  const BAR_COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--destructive))",
    "hsl(var(--accent))",
    "hsl(var(--primary) / 0.6)",
  ];

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col bg-background">
      {/* Flowery header */}
      <header className="relative overflow-hidden border-b border-border/60 bg-gradient-to-r from-primary/10 via-card to-destructive/10 px-4 py-3 sm:px-6">
        <span className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_8%_30%,hsl(var(--destructive)/.18)_0_10px,transparent_11px),radial-gradient(circle_at_30%_80%,hsl(var(--primary)/.16)_0_9px,transparent_10px),radial-gradient(circle_at_92%_20%,hsl(var(--accent)/.2)_0_11px,transparent_12px)]" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-destructive/30 text-primary ring-1 ring-primary/25">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground sm:text-xl">
                Longitudinal Case Analysis
              </h2>
              <p className="text-xs text-muted-foreground">
                Follow-up tracking flattened across {cases.length} case{cases.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onClose}>
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Close</span>
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { icon: CalendarCheck, label: "Total Follow-ups", value: totalFollowUps, tone: "primary" },
                { icon: Users, label: "Cases Followed", value: `${casesWithFollowUp}/${cases.length}`, tone: "accent" },
                { icon: Repeat, label: "Avg / Case", value: avgPerCase, tone: "primary" },
                { icon: CheckCircle2, label: "Coverage", value: `${coverage}%`, tone: "destructive" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-4 shadow-soft"
                >
                  <span className={`absolute left-0 top-0 h-full w-1 bg-${kpi.tone}`} style={{ background: `hsl(var(--${kpi.tone}))` }} />
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <kpi.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-display text-2xl font-bold text-foreground">{kpi.value}</p>
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-card/90 p-4 shadow-soft">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Follow-up Activity Over Time
                </h3>
                {timeline.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No follow-up activity recorded yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={timeline}>
                      <defs>
                        <linearGradient id="luGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#luGrad)" name="Follow-ups" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/90 p-4 shadow-soft">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Layers className="h-4 w-4 text-destructive" />
                  Visits per Case Distribution
                </h3>
                {distribution.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No cases to analyse.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={distribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="visits" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="cnt" radius={[4, 4, 0, 0]} name="Cases">
                        {distribution.map((_, i) => (
                          <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Flattened longitudinal table */}
            <div className="rounded-2xl border border-border/60 bg-card/90 shadow-soft">
              <div className="flex flex-col gap-2 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Layers className="h-4 w-4 text-primary" />
                  Case Follow-up Timeline (flattened)
                </h3>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search case or type..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              {filteredCases.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No cases match your search.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">Case</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-center">Visits</TableHead>
                        <TableHead className="min-w-[260px]">Visit progression</TableHead>
                        <TableHead className="text-right">Last visit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCases.map((c) => {
                        const acts = (byCase.get(c.id) || []).filter((a) => a.activity_type === "follow_up");
                        const last = acts[acts.length - 1];
                        return (
                          <TableRow
                            key={c.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedCaseId(c.id)}
                          >
                            <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{c.caseTypeLabel}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={acts.length ? "secondary" : "outline"} className="text-[10px]">
                                {acts.length}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {Array.from({ length: maxVisits }).map((_, i) => (
                                  <span
                                    key={i}
                                    className={`h-2.5 w-2.5 rounded-full ${
                                      i < acts.length
                                        ? i === acts.length - 1
                                          ? "bg-destructive"
                                          : "bg-primary"
                                        : "bg-muted"
                                    }`}
                                    title={acts[i] ? format(new Date(acts[i].performed_at), "MMM d, yyyy") : ""}
                                  />
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {last ? format(new Date(last.performed_at), "MMM d, yyyy") : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      )}

      {/* Case timeline drawer */}
      {selectedCase && (
        <div className="fixed inset-0 z-[1300] flex justify-end bg-black/50" onClick={() => setSelectedCaseId(null)}>
          <div
            className="h-full w-full max-w-md overflow-hidden border-l border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-r from-primary/10 to-destructive/10 p-4">
              <span className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_15%_30%,hsl(var(--destructive)/.18)_0_8px,transparent_9px),radial-gradient(circle_at_85%_70%,hsl(var(--primary)/.16)_0_9px,transparent_10px)]" />
              <div className="relative flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-semibold text-foreground">{selectedCase.name}</h3>
                  <p className="text-xs text-muted-foreground">{selectedCase.caseTypeLabel} · opened {format(new Date(selectedCase.openedAt), "MMM d, yyyy")}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedCaseId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[calc(100%-72px)]">
              <div className="space-y-4 p-4">
                {selectedActivities.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No follow-up visits recorded for this case yet.</p>
                ) : (
                  <ol className="relative space-y-4 border-l-2 border-primary/30 pl-5">
                    {selectedActivities.map((a, idx) => {
                      const changes = extractChanges(a.changes);
                      const entries = Object.entries(changes).filter(([k]) => k !== "action");
                      const prev = selectedActivities[idx - 1];
                      const gap = prev ? differenceInDays(new Date(a.performed_at), new Date(prev.performed_at)) : null;
                      const isClose = a.activity_type === "closure";
                      return (
                        <li key={a.id} className="relative">
                          <span className={`absolute -left-[27px] top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-primary-foreground ${isClose ? "bg-destructive" : "bg-primary"}`}>
                            {isClose ? "✓" : idx + 1}
                          </span>
                          <div className="rounded-xl border border-border/60 bg-card/80 p-3 shadow-soft">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-foreground">
                                {isClose ? "Case closed" : `Visit ${idx + 1}`}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(a.performed_at), "MMM d, yyyy")}
                              </span>
                            </div>
                            {gap != null && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {gap} day{gap === 1 ? "" : "s"} since previous visit
                              </p>
                            )}
                            {entries.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {entries.map(([k, v]) => {
                                  const val = v && typeof v === "object" && "to" in (v as any)
                                    ? (v as any).to
                                    : v;
                                  const from = v && typeof v === "object" && "from" in (v as any)
                                    ? (v as any).from
                                    : undefined;
                                  return (
                                    <div key={k} className="flex items-start gap-1.5 text-xs">
                                      <span className="font-medium text-muted-foreground">{prettify(k)}:</span>
                                      {from !== undefined && from !== "" && (
                                        <>
                                          <span className="text-muted-foreground line-through">{String(from)}</span>
                                          <ArrowRight className="mt-0.5 h-3 w-3 text-muted-foreground" />
                                        </>
                                      )}
                                      <span className="font-medium text-foreground">{String(val ?? "—")}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {a.notes && entries.length === 0 && (
                              <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
};

export default CaseLongitudinalAnalysis;
