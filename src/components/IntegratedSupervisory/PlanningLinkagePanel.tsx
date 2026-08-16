/**
 * Planning ↔ Distribution linkage — the end-to-end cycle.
 *
 * Lets the analyst bind a Geo-enabled Microplanning project (the planned
 * denominator) to the Supervisory Checklist and the Medicine Accountability
 * ledger, then reports expected treatment coverage by Community / Ward / LGA /
 * State with confidence intervals, the cascade funnel, equity gradients,
 * distributor workload and a ranked, near-real-time action list.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, Download, Layers, MapPinned, Radar, Scale, Target, TrendingUp, Users2,
} from "lucide-react";
import {
  answerLinkedQuestions, computePlanningLinkage,
  type CoverageMethod, type CoverageStatus, type GeoLevel, type PlanRow,
} from "@/lib/isc/planningLinkage";

import type { LogisticsDataset } from "@/lib/isc/medicineAccountability";
import type { ChecklistSite, CommunityDiagnosis, NetworkStats } from "@/lib/isc/humanPatterns";
import { toast } from "@/hooks/use-toast";

interface Props {
  dataset: LogisticsDataset;
  sites: ChecklistSite[];
  network: NetworkStats;
  diagnoses: CommunityDiagnosis[];
  /** Planned denominators from the bound Geo-enabled Microplanning project. */
  plan: PlanRow[];
  projectId: string;
  projectName: string;
  /** Human label of the saved target-population definition. */
  targetLabel: string;
  canExport?: boolean;
}


const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const int = (n: number) => Math.round(n).toLocaleString();

const STATUS_STYLE: Record<CoverageStatus, { label: string; cls: string; fill: string }> = {
  on_target: { label: "On target", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", fill: "hsl(152 60% 40%)" },
  acceptable: { label: "Acceptable", cls: "border-sky-300 bg-sky-50 text-sky-700", fill: "hsl(205 80% 48%)" },
  sub_optimal: { label: "Sub-optimal", cls: "border-amber-300 bg-amber-50 text-amber-700", fill: "hsl(45 93% 47%)" },
  critical: { label: "Critical", cls: "border-destructive/40 bg-destructive/10 text-destructive", fill: "hsl(0 72% 51%)" },
  no_data: { label: "No activity", cls: "border-muted-foreground/30 bg-muted text-muted-foreground", fill: "hsl(215 16% 70%)" },
};
const TONE: Record<string, string> = {
  info: "border-sky-300 bg-sky-50 text-sky-800",
  warn: "border-amber-300 bg-amber-50 text-amber-800",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  success: "border-emerald-300 bg-emerald-50 text-emerald-800",
};
const PRIORITY: Record<string, string> = {
  immediate: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-amber-300 bg-amber-50 text-amber-800",
  watch: "border-sky-300 bg-sky-50 text-sky-800",
};

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function PlanningLinkagePanel({ dataset, sites, network, diagnoses, canExport = true }: Props) {
  const { projects, loading: projectsLoading } = useMicroplanProjects();
  const [projectId, setProjectId] = useState<string>("");
  const { entries, loading, fromCache, syncedAt, refresh } = useMicroplanProjectEntries(projectId || null);
  const { calcTargetPop, label: targetLabel } = useTargetPopFields();

  const [unitsPerPerson, setUnitsPerPerson] = useState(1);
  const [popPerDistributor, setPopPerDistributor] = useState(500);
  const [level, setLevel] = useState<GeoLevel>("LGA");

  const plan = useMemo(
    () => normalizePlanRows(entries, (e) => calcTargetPop(e as Record<string, any>)),
    [entries, calcTargetPop],
  );

  const link = useMemo(
    () => computePlanningLinkage(plan, dataset, sites, { unitsPerPerson, popPerDistributor }),
    [plan, dataset, sites, unitsPerPerson, popPerDistributor],
  );

  const answers = useMemo(
    () => answerLinkedQuestions(link, network, diagnoses, sites),
    [link, network, diagnoses, sites],
  );

  const rows = useMemo(() => link.nodes[level].slice(0, 300), [link, level]);
  const chartData = useMemo(
    () => link.nodes[level].slice(0, 15).map((n) => ({
      name: n.name, coverage: Number((n.coverage * 100).toFixed(1)), status: n.status,
    })),
    [link, level],
  );

  const projectName = projects.find((p) => p.id === projectId)?.name ?? "";

  const exportCsv = () => {
    const head = ["Level", "Name", "Parent", "Planned communities", "Served", "Supervised", "Target population",
      "Units issued", "Units returned", "Estimated treated", "Coverage %", "CI low %", "CI high %", "Untreated", "Status"];
    const lines = [head.map(csvCell).join(",")];
    (["State", "LGA", "Ward", "Community"] as GeoLevel[]).forEach((lv) => {
      for (const n of link.nodes[lv]) {
        lines.push([
          lv, n.name, n.parent, n.plannedCommunities, n.servedCommunities, n.visitedCommunities,
          Math.round(n.targetPop), Math.round(n.issuedUnits), Math.round(n.returnedUnits), Math.round(n.treated),
          (n.coverage * 100).toFixed(1), (n.ciLow * 100).toFixed(1), (n.ciHigh * 100).toFixed(1),
          Math.round(n.untreated), STATUS_STYLE[n.status].label,
        ].map(csvCell).join(","));
      }
    });
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `planning-coverage-${(projectName || "project").replace(/\W+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "Coverage cascade exported", description: `${link.plan.length.toLocaleString()} planned communities across four geographic levels.` });
  };

  return (
    <div className="space-y-4">
      {/* ── estimation assumptions ──────────────────────────────────────── */}
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" />
            Plan-to-household linkage{projectName ? ` — ${projectName}` : ""}
            <Badge variant="outline" className="text-[10px] font-normal">Triangulated estimate</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Coverage is estimated by pooling the household coverage observed in the Supervisory Checklist with the
            allocation-based coverage from the Medicine Accountability ledger, each weighted by its precision, against
            the planned eligible population from the bound microplan ({targetLabel}).
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Units per person treated</p>
            <Input type="number" min={0.1} step={0.1} className="h-9" value={unitsPerPerson}
              onChange={(e) => setUnitsPerPerson(Math.max(0.1, Number(e.target.value) || 1))} />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Population per distributor (norm)</p>
            <Input type="number" min={50} step={50} className="h-9" value={popPerDistributor}
              onChange={(e) => setPopPerDistributor(Math.max(50, Number(e.target.value) || 500))} />
          </div>
          <div className="flex items-end md:col-span-2">
            {canExport && !!projectId && (
              <Button size="sm" variant="outline" className="h-9 gap-1 text-xs ml-auto" onClick={exportCsv} disabled={!link.plan.length}>
                <Download className="h-3.5 w-3.5" /> Export coverage cascade
              </Button>
            )}
          </div>
        </CardContent>
      </Card>


      {!projectId ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <MapPinned className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">Select a microplanning project above</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Once a project is bound, this section reports what treatment coverage should be by Community, Ward, LGA
              and State, where the cycle leaks between planning and the household, and what to correct next.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── headline coverage ──────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Target, label: "Planned eligible population", value: int(link.totals.targetPop), sub: `${int(link.totals.plannedCommunities)} planned communities · ${targetLabel}` },
              { icon: TrendingUp, label: "Estimated treatment coverage", value: pct(link.totals.coverage), sub: `95% CI ${pct(link.totals.ciLow)} – ${pct(link.totals.ciHigh)} · ${METHOD[link.totals.method].label}` },
              { icon: Scale, label: "Triangulation inputs", value: link.totals.surveyCoverage != null ? pct(link.totals.surveyCoverage) : "—",
                sub: `Household survey ${link.totals.surveyEligible.toLocaleString()} eligible · allocation-based ${link.totals.adminCoverage != null ? pct(link.totals.adminCoverage) : "—"}` },
              { icon: Users2, label: "Still untreated", value: int(link.totals.untreated), sub: `${int(link.totals.treated)} people estimated treated` },
              { icon: Radar, label: "Geography match rate", value: pct(link.totals.matchRate), sub: `${link.unplanned.length.toLocaleString()} served communities absent from the plan` },

            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <k.icon className="h-3.5 w-3.5" /> {k.label}
                  </div>
                  <p className="mt-1 font-display text-2xl font-bold">{k.value}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── linked intelligence answers ────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-primary" /> End-to-end intelligence — planning to household
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {answers.map((a) => (
                <div key={a.id} className={`rounded-lg border p-3 ${TONE[a.tone] ?? TONE.info}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold">{a.question}</p>
                    {a.metric && <Badge variant="outline" className="shrink-0 bg-background/70 text-[10px]">{a.metric}</Badge>}
                  </div>
                  <p className="mt-1 text-sm">{a.answer}</p>
                  {!!a.detail.length && (
                    <ul className="mt-1.5 space-y-0.5 text-[11px] opacity-90">
                      {a.detail.map((d, i) => <li key={i}>• {d}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── cascade funnel + equity ────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><Layers className="h-4 w-4" /> Cascade funnel — where the cycle leaks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {link.funnel.map((f) => (
                  <div key={f.stage}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">{f.stage}</span>
                      <span className="text-muted-foreground">{int(f.population)} people · {f.communities.toLocaleString()} communities · {pct(f.rate)}</span>
                    </div>
                    <Progress value={f.rate * 100} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Equity gradient — coverage by access conditions</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Dimension</TableHead>
                    <TableHead className="text-xs">Band</TableHead>
                    <TableHead className="text-xs text-right">Communities</TableHead>
                    <TableHead className="text-xs text-right">Eligible</TableHead>
                    <TableHead className="text-xs text-right">Coverage</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {link.equity.slice(0, 14).map((e, i) => (
                      <TableRow key={`${e.dimension}-${e.band}-${i}`}>
                        <TableCell className="text-xs text-muted-foreground">{e.dimension}</TableCell>
                        <TableCell className="text-xs font-medium">{e.band}</TableCell>
                        <TableCell className="text-xs text-right">{e.communities.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right">{int(e.targetPop)}</TableCell>
                        <TableCell className={`text-xs text-right font-semibold ${e.coverage < 0.5 ? "text-destructive" : ""}`}>{pct(e.coverage)}</TableCell>
                      </TableRow>
                    ))}
                    {!link.equity.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No access attributes recorded in this microplan.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* ── coverage by level ──────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Target className="h-4 w-4" /> Expected treatment coverage by geography
                <Select value={level} onValueChange={(v) => setLevel(v as GeoLevel)}>
                  <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["State", "LGA", "Ward", "Community"] as GeoLevel[]).map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-[10px]">{link.nodes[level].length.toLocaleString()} {level.toLowerCase()}s</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis unit="%" tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Bar dataKey="coverage" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={STATUS_STYLE[d.status as CoverageStatus].fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">State</TableHead>
                    <TableHead className="text-xs">LGA</TableHead>
                    <TableHead className="text-xs">Ward</TableHead>
                    <TableHead className="text-xs">Community</TableHead>
                    <TableHead className="text-xs text-right">Eligible</TableHead>
                    <TableHead className="text-xs text-right">Treated (est.)</TableHead>
                    <TableHead className="text-xs text-right">Coverage</TableHead>
                    <TableHead className="text-xs text-right">95% CI</TableHead>
                    <TableHead className="text-xs">Basis</TableHead>
                    <TableHead className="text-xs text-right">Reach</TableHead>
                    <TableHead className="text-xs text-right">Untreated</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {rows.map((n) => (
                      <TableRow key={`${n.level}-${n.id}`}>
                        <TableCell className="text-xs font-medium">{n.state || "—"}</TableCell>
                        <TableCell className="text-xs">{n.lga || "—"}</TableCell>
                        <TableCell className="text-xs">{n.ward || "—"}</TableCell>
                        <TableCell className="text-xs">{n.community || "—"}</TableCell>
                        <TableCell className="text-xs text-right">{int(n.targetPop)}</TableCell>
                        <TableCell className="text-xs text-right">{int(n.treated)}</TableCell>
                        <TableCell className="text-xs text-right font-semibold">{pct(n.coverage)}</TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">{pct(n.ciLow)}–{pct(n.ciHigh)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${METHOD[n.method].cls}`}>{METHOD[n.method].label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right">{n.servedCommunities}/{n.plannedCommunities}</TableCell>
                        <TableCell className="text-xs text-right">{int(n.untreated)}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[n.status].cls}`}>{STATUS_STYLE[n.status].label}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {!rows.length && <TableRow><TableCell colSpan={12} className="py-6 text-center text-xs text-muted-foreground">This project's microplan has no entries at this level yet.</TableCell></TableRow>}

                  </TableBody>
                </Table>
                {link.nodes[level].length > rows.length && (
                  <p className="mt-2 text-[11px] text-muted-foreground">Showing the {rows.length} largest gaps — export for the full cascade.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── actions ────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Act now — corrections ranked by population still at risk</CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Recomputed on every microplan, checklist and ledger sync, so the list reflects the field as it stands today.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {link.actions.map((a) => (
                <div key={a.id} className={`rounded-lg border p-3 ${PRIORITY[a.priority]}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold">{a.title}</p>
                    <Badge variant="outline" className="shrink-0 bg-background/70 text-[10px] capitalize">{a.priority}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] opacity-90">{a.rationale}</p>
                  <ul className="mt-1.5 space-y-0.5 text-[11px] opacity-90">
                    {a.where.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                  <p className="mt-1.5 text-[11px] font-medium">
                    {a.populationAtRisk > 0 ? `${int(a.populationAtRisk)} people at risk · ` : ""}Owner: {a.owner}
                  </p>
                </div>
              ))}
              {!link.actions.length && (
                <p className="py-6 text-center text-xs text-muted-foreground lg:col-span-2">
                  No corrective action outstanding — every planned community has been reached and supervised.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
