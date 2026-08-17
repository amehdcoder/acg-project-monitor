/**
 * Human Patterns & Social Networks — Medicine Allocation & Accountability.
 *
 * Renders the fuzzy-joined intelligence produced by `@/lib/isc/humanPatterns`:
 * actor/handover network, brokerage & clique risk, work rhythms (chronotypes),
 * community failure diagnosis (non-distribution, poor coverage, late start)
 * and an answer bank of "rare intelligence" questions.
 */
import { useDeferredValue, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, Brain, Clock, Download, GitBranch, Info, Lightbulb, Loader2, Network, Search, Users,
} from "lucide-react";
import { ROLE_SHORT, ROLE_LABEL, type FailureKind, type HumanPatternsResult } from "@/lib/isc/humanPatterns";
import type { LogisticsDataset } from "@/lib/isc/medicineAccountability";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useMicroplanProjectEntries, useMicroplanProjects } from "@/hooks/useMicroplanProjectData";
import { useTargetPopFields } from "@/hooks/useTargetPopFields";
import useHumanPatternsEngine from "@/hooks/useHumanPatternsEngine";
import DecisionIntelligencePanel from "./DecisionIntelligencePanel";
import MicroplanBindingCard from "./MicroplanBindingCard";
import PlanningLinkagePanel from "./PlanningLinkagePanel";


interface Props {
  dataset: LogisticsDataset;
  checklistRows?: Record<string, unknown>[] | null;
  scopeLabel?: string;
  canExport?: boolean;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const KIND_LABEL: Record<FailureKind, string> = {
  not_distributed: "Not distributed",
  poor_coverage: "Poor coverage",
  late_start: "Late commencement",
  healthy: "On track",
};
const KIND_TONE: Record<FailureKind, string> = {
  not_distributed: "border-destructive/40 bg-destructive/10 text-destructive",
  poor_coverage: "border-amber-300 bg-amber-50 text-amber-700",
  late_start: "border-sky-300 bg-sky-50 text-sky-700",
  healthy: "border-emerald-300 bg-emerald-50 text-emerald-700",
};
const TONE: Record<string, string> = {
  info: "border-sky-300 bg-sky-50 text-sky-800",
  warn: "border-amber-300 bg-amber-50 text-amber-800",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  success: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const PROJECT_BINDING_KEY = "isc-human-patterns-microplan-project";

const EMPTY_PATTERNS = {
  network: { actors: [], ties: [], density: 0, components: 0, largestComponent: 0, isolates: [], brokers: [], cliques: [] },
  sites: [],
  diagnoses: [],
  rhythms: {
    hours: Array.from({ length: 24 }, (_, h) => ({ name: `${String(h).padStart(2, "0")}h`, value: 0 })),
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => ({ name, value: 0 })),
    nightRate: 0,
    weekendRate: 0,
  },
  answers: [],
  identityMerges: [],
} as unknown as HumanPatternsResult;

export default function HumanPatternsPanel({ dataset, checklistRows, scopeLabel, canExport = true }: Props) {
  const [lateStartDays, setLateStartDays] = useState(3);
  const [coverageFloor, setCoverageFloor] = useState(70);
  const [kindFilter, setKindFilter] = useState<"all" | FailureKind>("all");
  const [q, setQ] = useState("");
  /* linkage assumptions live here so the worker can fold them into one pass */
  const [unitsPerPerson, setUnitsPerPerson] = useState(1);
  const [popPerDistributor, setPopPerDistributor] = useState(500);

  /* Bound microplanning project — saved once, restored on every visit. */
  const [projectId, setProjectId] = useState<string>(() => {
    try { return localStorage.getItem(PROJECT_BINDING_KEY) ?? ""; } catch { return ""; }
  });
  const bindProject = (id: string) => {
    setProjectId(id);
    try { localStorage.setItem(PROJECT_BINDING_KEY, id); } catch { /* private mode */ }
  };
  const { projects, loading: projectsLoading } = useMicroplanProjects();
  const { entries, loading: planLoading, fromCache, syncedAt, refresh } = useMicroplanProjectEntries(projectId || null);
  const { fields, setFields, label: targetLabel, options } = useTargetPopFields();

  const targetColumns = useMemo(
    () => fields.map((k) => options.find((o) => o.key === k)?.field).filter((f): f is string => !!f),
    [fields, options],
  );

  const { profile } = useAuth();
  const excludePeople = useMemo(() => {
    const me = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
    return [me, "Ameh Joseph", "Joseph Ameh"].filter(Boolean);
  }, [profile?.first_name, profile?.last_name]);

  const rows = useMemo(() => checklistRows ?? [], [checklistRows]);

  /* Everything heavy runs in a worker — the tab never blocks. */
  const engine = useHumanPatternsEngine({
    dataset,
    checklistRows: rows,
    entries,
    targetColumns,
    hasProject: !!projectId,
    lateStartDays,
    coverageFloor,
    excludePeople,
    unitsPerPerson,
    popPerDistributor,
  });

  const result = engine.patterns ?? EMPTY_PATTERNS;
  const { network, diagnoses, rhythms, answers, sites, identityMerges } = result;
  const busy = engine.computing && !engine.patterns;

  /* the search box types freely; filtering follows at low priority */
  const deferredQ = useDeferredValue(q);

  const diag = useMemo(() => {
    const needle = deferredQ.trim().toLowerCase();
    return diagnoses.filter((d) =>
      (kindFilter === "all" || d.kind === kindFilter) &&
      (!needle || `${d.lga} ${d.facility} ${d.community} ${d.cdds.join(" ")}`.toLowerCase().includes(needle)));
  }, [diagnoses, kindFilter, deferredQ]);

  const causeRanking = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of diagnoses) for (const c of d.causes) m.set(c.cause, (m.get(c.cause) ?? 0) + 1);
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [diagnoses]);

  const topActors = useMemo(() => network.actors.slice(0, 12), [network.actors]);


  const exportCsv = () => {
    const head = ["LGA", "Facility", "Community", "Diagnosis", "Severity", "Coverage %", "Lag days", "Units to CDDs", "Facility supplied", "Returned", "CDDs", "Match score", "Causes"];
    const lines = [head.map(csvCell).join(",")];
    for (const d of diagnoses) {
      lines.push([
        d.lga, d.facility, d.community, KIND_LABEL[d.kind], d.severity, (d.coverage * 100).toFixed(1),
        d.lagDays, d.received, d.facilityIssued, d.returned, d.cdds.join(" | "),
        d.matchScore.toFixed(2), d.causes.map((c) => `${c.cause}: ${c.label}`).join(" | "),
      ].map(csvCell).join(","));
    }
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `human-patterns-diagnosis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "Diagnosis exported", description: `${diagnoses.length} community rows.` });
  };

  const ledgerTx =
    (dataset?.dispatches?.length ?? 0) + (dataset?.receipts?.length ?? 0) +
    (dataset?.issues?.length ?? 0) + (dataset?.cddIssues?.length ?? 0) + (dataset?.returns?.length ?? 0);
  const checklistCount = checklistRows?.length ?? 0;
  const noSources = ledgerTx === 0 && checklistCount === 0;


  return (
    <div className="space-y-4">
      {/* controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" /> Human patterns & social networks
            <Badge variant="outline" className="text-[10px] font-normal">Fuzzy join · Sørensen–Dice</Badge>
            {scopeLabel && <span className="text-xs font-normal text-muted-foreground">{scopeLabel}</span>}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            The logistics ledger (Levels 0–4) is read as a social dataset — who handles medicines, who they hand over
            to, when they work and which communities depend on a single person. Supervisory Checklist submissions
            ({sites.length.toLocaleString()} sites) are fuzzy-matched on LGA / Ward / Facility / Community so
            behavioural evidence explains logistics failures.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Badge variant="outline" className="text-[10px] font-normal">
              Identity resolution: {network.actors.length} unique people
            </Badge>
            {identityMerges.length > 0 && (
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-50 text-[10px] font-normal text-emerald-700"
                title={identityMerges.slice(0, 25).map((m) => `${m.name} ← ${m.variants.join(" | ")}`).join("\n")}
              >
                {identityMerges.length} name{identityMerges.length === 1 ? "" : "s"} auto-merged from spelling variants
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Late-start threshold (days)</p>
            <Input type="number" min={1} className="h-8 w-24" value={lateStartDays}
              onChange={(e) => setLateStartDays(Math.max(1, Number(e.target.value) || 3))} />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Poor-coverage floor (%)</p>
            <Input type="number" min={1} max={100} className="h-8 w-24" value={coverageFloor}
              onChange={(e) => setCoverageFloor(Math.min(100, Math.max(1, Number(e.target.value) || 70)))} />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Diagnosis</p>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
              <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All communities</SelectItem>
                {(Object.keys(KIND_LABEL) as FailureKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[180px]">
            <p className="text-[11px] text-muted-foreground">Search person / community</p>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-8 pl-7" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kano, Danladi, Gwale…" />
            </div>
          </div>
          {canExport && (
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!diagnoses.length}>
              <Download className="h-4 w-4 mr-1" /> Export diagnosis
            </Button>
          )}
        </CardContent>
      </Card>

      {/* data-source transparency — always visible so an empty section is explainable */}
      <Card className={noSources ? "border-amber-300 bg-amber-50/60" : "border-muted"}>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-xs">
          <span className="flex items-center gap-1.5 font-medium"><Info className="h-3.5 w-3.5" /> Data sources</span>
          <span>Logistics ledger: <strong>{ledgerTx.toLocaleString()}</strong> transactions</span>
          <span>Supervisory checklist: <strong>{checklistCount.toLocaleString()}</strong> submissions · <strong>{sites.length.toLocaleString()}</strong> with usable geography</span>
          <span>Actors: <strong>{network.actors.length.toLocaleString()}</strong> · Communities diagnosed: <strong>{diagnoses.length.toLocaleString()}</strong></span>
          {noSources && (
            <span className="text-amber-800">
              Nothing cached on this device yet — sync the medicine logistics Kobo form and the supervisory checklist, then reopen this tab.
            </span>
          )}
        </CardContent>
      </Card>

      {/* plan → checklist → ledger linkage (project-bound, saved) */}
      <MicroplanBindingCard
        projects={projects}
        projectsLoading={projectsLoading}
        projectId={projectId}
        onProjectId={bindProject}
        entryCount={entries.length}
        plannedCommunities={engine.planCount}
        loading={planLoading}
        fromCache={fromCache}
        syncedAt={syncedAt}
        onRefresh={() => void refresh()}
        fields={fields}
        onFields={setFields}
        options={options}
        targetLabel={targetLabel}
      />

      {projectId ? (
        <PlanningLinkagePanel
          link={engine.link}
          answers={engine.linkAnswers}
          computing={engine.computing}
          unitsPerPerson={unitsPerPerson}
          onUnitsPerPerson={setUnitsPerPerson}
          popPerDistributor={popPerDistributor}
          onPopPerDistributor={setPopPerDistributor}
          projectName={projects.find((p) => p.id === projectId)?.name ?? ""}
          targetLabel={targetLabel}
          canExport={canExport}
        />

      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            Bind a microplanning project above to bring the planned eligible population into this analysis — coverage is
            then estimated by Community, Ward, LGA and State from the microplan, the checklist and the ledger together.
          </CardContent>
        </Card>
      )}



      {(
        <>

          {/* network KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Users, label: "Actors in the chain", value: network.actors.length.toLocaleString(), sub: `${network.isolates.length} isolated (no verified handover partner)` },
              { icon: Network, label: "Network density", value: pct(network.density), sub: `${network.ties.length.toLocaleString()} handover ties · ${network.components} components` },
              { icon: GitBranch, label: "Largest connected group", value: network.largestComponent.toLocaleString(), sub: "Actors reachable through shared handovers" },
              { icon: Clock, label: "Off-hours activity", value: pct(rhythms.nightRate), sub: `${pct(rhythms.weekendRate)} of transactions on weekends` },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><k.icon className="h-3.5 w-3.5" /> {k.label}</div>
                  <p className="mt-1 text-2xl font-bold">{k.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* rare intelligence answers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><Lightbulb className="h-4 w-4 text-amber-500" /> Rare intelligence — what the data quietly reveals</CardTitle>
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

          {/* brokers, cliques, rhythms */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><GitBranch className="h-4 w-4" /> Brokers & structural holes</CardTitle></CardHeader>
              <CardContent>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Actors whose removal disconnects communities from supply — single points of failure and the highest-leverage people to supervise.
                </p>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Actor</TableHead>
                    <TableHead className="text-xs text-right">Brokerage</TableHead>
                    <TableHead className="text-xs text-right">Bridges</TableHead>
                    <TableHead className="text-xs text-right">Communities</TableHead>
                    <TableHead className="text-xs text-right">POD</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {network.brokers.slice(0, 8).map((b) => (
                      <TableRow key={b.actor.id}>
                        <TableCell className="text-xs font-medium">{b.actor.name}
                          <span className="ml-1 text-[10px] text-muted-foreground">{b.actor.roles.map((r) => ROLE_SHORT[r] ?? r).join(" / ")}</span></TableCell>
                        <TableCell className="text-xs text-right">{b.brokerage.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right">{b.bridges}</TableCell>
                        <TableCell className="text-xs text-right">{b.actor.communities.length}</TableCell>
                        <TableCell className="text-xs text-right">{pct(b.actor.signatureRate)}</TableCell>
                      </TableRow>
                    ))}
                    {!network.brokers.length && <TableRow><TableCell colSpan={5} className="text-xs text-center text-muted-foreground py-6">No brokerage detected.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Documentation-poor cliques (collusion risk)</CardTitle></CardHeader>
              <CardContent>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Tight groups repeatedly transacting with each other while signatures / proof-of-delivery are missing.
                </p>
                <div className="space-y-2">
                  {network.cliques.slice(0, 8).map((c, i) => (
                    <div key={i} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium">{c.members.join(" ↔ ")}</p>
                        <Badge variant="outline" className="text-[10px]">{c.weight} shared handovers</Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Progress value={c.signatureRate * 100} className="h-1.5" />
                        <span className="text-[10px] text-muted-foreground w-20 text-right">POD {pct(c.signatureRate)}</span>
                      </div>
                    </div>
                  ))}
                  {!network.cliques.length && <p className="py-6 text-center text-xs text-muted-foreground">No high-risk cliques detected.</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Work rhythms (chronotypes)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={rhythms.hours}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={1} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {rhythms.hours.map((h, i) => (
                        <Cell key={i} fill={i < 7 || i >= 18 ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="value" stroke="hsl(var(--muted-foreground))" dot={false} strokeWidth={1} />
                  </ComposedChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={rhythms.weekdays}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Dominant causes across diagnosed communities</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={causeRanking} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* actors table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Actor profiles — workload, reach & accountability</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Actor</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs text-right">Transactions</TableHead>
                  <TableHead className="text-xs text-right">Units</TableHead>
                  <TableHead className="text-xs text-right">Communities</TableHead>
                  <TableHead className="text-xs text-right">Partners</TableHead>
                  <TableHead className="text-xs text-right">Intensity/day</TableHead>
                  <TableHead className="text-xs text-right">Off-hours</TableHead>
                  <TableHead className="text-xs text-right">POD</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {topActors.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs font-medium">{a.name}</TableCell>
                      <TableCell className="text-xs">{a.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}</TableCell>
                      <TableCell className="text-xs text-right">{a.transactions.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{Math.round(a.quantity).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{a.communities.length}</TableCell>
                      <TableCell className="text-xs text-right">{a.partners.length}</TableCell>
                      <TableCell className="text-xs text-right">{a.intensity.toFixed(1)}</TableCell>
                      <TableCell className="text-xs text-right">{pct(a.nightShare)}</TableCell>
                      <TableCell className={`text-xs text-right ${a.signatureRate < 0.6 ? "text-destructive font-semibold" : ""}`}>{pct(a.signatureRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* decision intelligence */}
          <DecisionIntelligencePanel
            dataset={dataset}
            network={network}
            diagnoses={diagnoses}
            sites={sites}
            coverageFloor={coverageFloor}
            lateStartDays={lateStartDays}
          />

          {/* diagnosis table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Why medicines were not distributed, coverage was poor, or distribution started late
                <Badge variant="outline" className="text-[10px]">{diag.length.toLocaleString()} communities</Badge>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Ledger evidence (supply lag, single-CDD dependency, returns, zero issue) is combined with fuzzy-matched
                checklist evidence (training, mobilisation, refusals, stipends, supervision, insecurity, leaders).
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Community</TableHead>
                  <TableHead className="text-xs">Facility · LGA</TableHead>
                  <TableHead className="text-xs">Diagnosis</TableHead>
                  <TableHead className="text-xs text-right">Severity</TableHead>
                  <TableHead className="text-xs text-right">Coverage</TableHead>
                  <TableHead className="text-xs text-right">Lag (d)</TableHead>
                  <TableHead className="text-xs">CDDs</TableHead>
                  <TableHead className="text-xs">Attributed causes</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {diag.slice(0, 200).map((d) => (
                    <TableRow key={d.key}>
                      <TableCell className="text-xs font-medium">{d.community || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{[d.facility, d.lga].filter(Boolean).join(" · ") || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className={`text-[10px] ${KIND_TONE[d.kind]}`}>{KIND_LABEL[d.kind]}</Badge></TableCell>
                      <TableCell className="text-xs text-right font-semibold">{d.severity}</TableCell>
                      <TableCell className="text-xs text-right">{pct(d.coverage)}</TableCell>
                      <TableCell className="text-xs text-right">{d.lagDays > 0 && d.lagDays < 900 ? d.lagDays : "—"}</TableCell>
                      <TableCell className="text-xs">{d.cdds.length ? d.cdds.join(", ") : <span className="text-destructive">none recorded</span>}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {d.causes.slice(0, 4).map((c, i) => (
                            <Badge key={i} variant="outline"
                              className={`text-[10px] ${c.source === "checklist" ? "border-sky-300 bg-sky-50 text-sky-700" : "border-muted-foreground/30"}`}>
                              {c.label}
                            </Badge>
                          ))}
                          {d.causes.length > 4 && <span className="text-[10px] text-muted-foreground">+{d.causes.length - 4}</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!diag.length && <TableRow><TableCell colSpan={8} className="py-6 text-center text-xs text-muted-foreground">No communities match this filter.</TableCell></TableRow>}
                </TableBody>
              </Table>
              {diag.length > 200 && <p className="mt-2 text-[11px] text-muted-foreground">Showing the 200 most severe — export for the full list.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
