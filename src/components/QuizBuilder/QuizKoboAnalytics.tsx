/**
 * Realtime KoboToolbox Pre/Post-test analytics for a quiz.
 *
 * Data arrives through the `kobo-quiz-webhook` edge function and is streamed
 * here by `useQuizKobo` (Supabase Realtime) — the dashboard recalculates the
 * paired t-test, participant comparison, improvement breakdown and score-band
 * petal pies the instant a submission lands, with no page refresh.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, ArrowDownRight, ArrowUpRight, FileSpreadsheet, FileText, Minus, Radio, Sigma, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import jsPDF from "jspdf";
import PetalDonutChart from "@/components/charts/PetalDonutChart";
import { useQuizKobo } from "@/hooks/useQuizKobo";
import {
  bandBreakdown, filterByGroup, improvementSummary, pairedTTest, pairParticipants,
} from "@/lib/quizKobo/analytics";
import { groupsOf } from "@/lib/quizKobo/scoring";

interface Props {
  quizId: string;
  passingScore: number;
}

const fmtP = (p: number) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);

export default function QuizKoboAnalytics({ quizId, passingScore }: Props) {
  const { config, submissions, loading, live, lastEventAt } = useQuizKobo(quizId);
  const [group, setGroup] = useState("all");

  const groups = useMemo(() => {
    const fromConfig = groupsOf(config?.question_config ?? []);
    if (fromConfig.length) return fromConfig;
    const codes = new Map<string, number>();
    submissions.forEach((s) => {
      if (s.intervention_group) codes.set(s.intervention_group, (codes.get(s.intervention_group) ?? 0) + 1);
    });
    return [...codes.entries()].map(([code, count]) => ({ code, label: code, count }));
  }, [config, submissions]);

  const rows = useMemo(() => filterByGroup(submissions, group), [submissions, group]);
  const pairs = useMemo(() => pairParticipants(rows), [rows]);
  const stats = useMemo(() => pairedTTest(pairs), [pairs]);
  const bands = useMemo(() => bandBreakdown(rows), [rows]);
  const preBands = useMemo(() => bandBreakdown(rows.filter((r) => r.assessment_type === "pre")), [rows]);
  const postBands = useMemo(() => bandBreakdown(rows.filter((r) => r.assessment_type === "post")), [rows]);
  const summary = useMemo(() => improvementSummary(pairs, rows, passingScore), [pairs, rows, passingScore]);

  const maxScore = useMemo(
    () => rows.reduce((m, r) => Math.max(m, Number(r.max_score) || 0), 0),
    [rows],
  );

  const comparisonData = useMemo(
    () => pairs.map((p) => ({ name: p.name, Pre: p.pre ?? 0, Post: p.post ?? 0, delta: p.delta ?? 0 })),
    [pairs],
  );

  if (!config) {
    return (
      <Card className="form-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No KoboToolbox form is linked to this quiz yet. Open <strong>KoboToolbox Sync</strong> in the Quiz Manager to
          connect one and stream Pre/Post-test submissions here in real time.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header / live state / group filter */}
      <Card className="form-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Radio className={`h-4 w-4 ${live ? "text-emerald-500 animate-pulse" : "text-muted-foreground"}`} />
                Realtime Kobo analytics
              </CardTitle>
              <CardDescription>
                {config.form_title ?? config.form_uid} · {submissions.length.toLocaleString()} submissions ingested
                {lastEventAt && ` · last update ${lastEventAt.toLocaleTimeString()}`}
              </CardDescription>
            </div>
            <div className="w-64">
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Questions</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.code} value={g.code}>{g.label} MDA</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <Badge variant="secondary">Max score: {maxScore || "—"} pts</Badge>
          <Badge variant="secondary">Pre-tests: {summary.preCount}</Badge>
          <Badge variant="secondary">Post-tests: {summary.postCount}</Badge>
          <Badge variant="outline">Paired participants: {stats?.n ?? 0}</Badge>
          {loading && <Badge variant="outline">Loading…</Badge>}
        </CardContent>
      </Card>

      {/* Statistical summary */}
      <Card className="form-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Sigma className="h-4 w-4 text-primary" /> Statistical summary — paired t-test</CardTitle>
          <CardDescription>Pre vs Post percentage scores for participants with both records</CardDescription>
        </CardHeader>
        <CardContent>
          {!stats ? (
            <p className="text-sm text-muted-foreground">Awaiting paired Pre/Post submissions.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "t-statistic", value: stats.t.toFixed(3) },
                { label: "df", value: String(stats.df) },
                { label: "p-value", value: fmtP(stats.p) },
                { label: "Cohen's d", value: stats.cohensD.toFixed(3) },
                { label: "Mean gain Δ%", value: `${stats.meanGain > 0 ? "+" : ""}${stats.meanGain.toFixed(1)}%` },
                { label: "Pre → Post", value: `${stats.meanPre.toFixed(1)}% → ${stats.meanPost.toFixed(1)}%` },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{m.value}</p>
                </div>
              ))}
              <div className="sm:col-span-3 lg:col-span-6">
                <Badge variant={stats.significant ? "default" : "secondary"}>
                  {stats.significant
                    ? `Statistically significant improvement (${fmtP(stats.p)}, n = ${stats.n})`
                    : `No statistically significant change (${fmtP(stats.p)}, n = ${stats.n})`}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Participant comparison */}
      <Card className="form-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Pre vs Post by Independent Monitor</CardTitle>
        </CardHeader>
        <CardContent>
          {!comparisonData.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No submissions for this group yet.</p>
          ) : (
            <div style={{ height: Math.max(280, Math.min(720, comparisonData.length * 26 + 60)) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} layout="vertical" margin={{ left: 16, right: 24, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} interval={0} />
                  <Tooltip
                    formatter={(v: any, n: any) => [`${Number(v).toFixed(1)}%`, n]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Pre" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Post" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Improvement + pass rates */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="form-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Improvement breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Improved", value: summary.improved, icon: ArrowUpRight, cls: "text-emerald-600" },
                { label: "Declined", value: summary.declined, icon: ArrowDownRight, cls: "text-rose-600" },
                { label: "Unchanged", value: summary.unchanged, icon: Minus, cls: "text-amber-600" },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border bg-muted/30 p-3 text-center">
                  <m.icon className={`mx-auto h-4 w-4 ${m.cls}`} />
                  <p className="mt-1 text-2xl font-bold tabular-nums">{m.value}</p>
                  <p className="text-[11px] text-muted-foreground">{m.label}</p>
                </div>
              ))}
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Pre-Test", rate: summary.prePassRate },
                    { name: "Post-Test", rate: summary.postPassRate },
                  ]}
                  margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: any) => [`${Number(v).toFixed(1)}%`, `Pass rate (≥ ${passingScore}%)`]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 11 }}
                  />
                  <Bar dataKey="rate" radius={[6, 6, 0, 0]}>
                    <Cell fill="#f59e0b" />
                    <Cell fill="#10b981" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="form-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Score bands — all submissions</CardTitle>
            <CardDescription>Excellent ≥ 80% · Good ≥ 70% · Moderate ≥ 60% · below 60% needs additional training</CardDescription>
          </CardHeader>
          <CardContent>
            <PetalDonutChart data={bands} unitLabel="submissions" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="form-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Pre-Test score bands</CardTitle></CardHeader>
          <CardContent><PetalDonutChart data={preBands} unitLabel="pre-tests" /></CardContent>
        </Card>
        <Card className="form-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Post-Test score bands</CardTitle></CardHeader>
          <CardContent><PetalDonutChart data={postBands} unitLabel="post-tests" /></CardContent>
        </Card>
      </div>

      {/* Participant table */}
      <Card className="form-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Independent Monitor results</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name of Independent Monitor</TableHead>
                <TableHead>MDA group</TableHead>
                <TableHead className="text-right">Pre %</TableHead>
                <TableHead className="text-right">Post %</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((p) => (
                <TableRow key={p.key}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.group ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.pre != null ? `${p.pre.toFixed(1)}%` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.post != null ? `${p.post.toFixed(1)}%` : "—"}</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${
                    (p.delta ?? 0) > 0 ? "text-emerald-600" : (p.delta ?? 0) < 0 ? "text-rose-600" : "text-muted-foreground"
                  }`}>
                    {p.delta == null ? "—" : `${p.delta > 0 ? "+" : ""}${p.delta.toFixed(1)}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.trend === "improved" ? "default" : p.trend === "declined" ? "destructive" : "secondary"}>
                      {p.trend === "incomplete" ? "Awaiting pair" : p.trend}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!pairs.length && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No submissions yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
