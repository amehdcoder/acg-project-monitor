import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ClipboardCheck, Download, FileSpreadsheet, Loader2, ShieldAlert, Target, Copy } from "lucide-react";
import { aggregateCoverage, buildPlan, decisionRule, DEFAULT_SAMPLE, EU_LEVELS, euKey, lotDecision, type EuLevel, type PlanEntry } from "@/lib/lqas/lqas";
import LqasRounds from "./LqasRounds";
import type { RoundEntry } from "@/lib/lqas/rounds";
import { buildLqasXlsForm, buildPaperPack, downloadBlob } from "@/lib/lqas/forms";

interface ResultRow { id: string; eu_level: string; eu_name: string; state: string | null; lga: string | null; ward: string | null; flhf_name: string | null; community_name: string | null; sampled: number; covered: number; team: string | null; security_mode: boolean; submitted_at: string | null; created_at: string }

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function LqasView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState("");
  const [entries, setEntries] = useState<RoundEntry[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState<EuLevel>("lga");
  const [target, setTarget] = useState(80);
  const [stateFilter, setStateFilter] = useState("all");
  const [indicator, setIndicator] = useState("Did this person swallow the medicine during the recent MDA?");

  useEffect(() => {
    supabase.from("projects").select("id, name").order("name").then(({ data }) => {
      const list = (data ?? []) as { id: string; name: string }[];
      setProjects(list);
      if (list.length && !projectId) setProjectId(list[0].id);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows: RoundEntry[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("microplan_entries")
          .select("state, lga, ward, flhf_name, community_name, estimated_total_population, number_of_households, security_clearance, accessibility, community_latitude, community_longitude")
          .eq("project_id", projectId).order("id").range(from, from + 999);
        if (error || !data?.length) break;
        rows.push(...(data as RoundEntry[]));
        if (data.length < 1000) break;
      }
      if (!cancelled) { setEntries(rows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const loadResults = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("lqas_results").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(5000);
    setResults((data ?? []) as ResultRow[]);
  }, [projectId]);

  useEffect(() => {
    loadResults();
    if (!projectId) return;
    const ch = supabase.channel(`lqas-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lqas_results", filter: `project_id=eq.${projectId}` }, () => loadResults())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, loadResults]);

  const states = useMemo(() => [...new Set(entries.map((e) => e.state).filter(Boolean))].sort(), [entries]);
  const scoped = useMemo(() => stateFilter === "all" ? entries : entries.filter((e) => e.state === stateFilter), [entries, stateFilter]);
  const plans = useMemo(() => buildPlan(scoped, level, DEFAULT_SAMPLE, projectId), [scoped, level, projectId]);
  const t = target / 100;
  const d = decisionRule(DEFAULT_SAMPLE, t);
  const projectName = projects.find((p) => p.id === projectId)?.name ?? "Project";
  const ctx = { projectName, level, target: t, sample: DEFAULT_SAMPLE, indicator };

  const lots = useMemo(() => {
    const popByKey = new Map(plans.map((p) => [p.key, p.population]));
    return results.filter((r) => r.eu_level === level && (stateFilter === "all" || r.state === stateFilter)).map((r) => {
      const key = euKey({ state: r.state ?? "", lga: r.lga ?? "", ward: r.ward ?? "", flhf_name: r.flhf_name ?? "", community_name: r.community_name ?? "" }, level);
      return { ...r, key, population: popByKey.get(key) ?? 0 };
    });
  }, [results, plans, level, stateFilter]);
  const agg = aggregateCoverage(lots, t);
  const previousFails = useMemo(() => new Set(results.filter((r) => r.sampled > 0 && lotDecision(r.covered, r.sampled, t) === "mop_up").flatMap((r) => [r.eu_name, r.ward, r.community_name, r.lga].filter(Boolean).map((v) => String(v).trim().replace(/\s+/g, " ").toUpperCase()))), [results, t]);
  const insecure = plans.filter((p) => p.securityMode).length;

  const webhook = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kobo-webhook?form_type=lqas&project_id=${projectId}${user ? `&submitted_by=${user.id}` : ""}`;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="rounded-2xl bg-gradient-to-r from-primary to-accent p-6 text-primary-foreground shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <ClipboardCheck className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-bold">LQAS Coverage Evaluation</h1>
            <p className="text-sm opacity-90">Plan lots from Geo Microplanning, print paper forms, enter in KoboCollect and get mop-up decisions live.</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1 · Plan the survey</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          <div><Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder="Choose project" /></SelectTrigger>
              <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>State</Label>
            <Select value={stateFilter} onValueChange={setStateFilter}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All states</SelectItem>{states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Evaluation Unit</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as EuLevel)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EU_LEVELS.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Coverage target (%)</Label>
            <Input type="number" min={10} max={95} step={5} value={target} onChange={(e) => setTarget(Math.min(95, Math.max(10, Number(e.target.value) || 80)))} /></div>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-primary" />Decision rule</div>
            <div>n = {DEFAULT_SAMPLE} per lot · pass if ≥ <b>{d}</b> covered</div>
          </div>
          <div className="md:col-span-5"><Label>Survey question (indicator)</Label><Input value={indicator} onChange={(e) => setIndicator(e.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Evaluation Units", value: plans.length.toLocaleString() },
          { label: "Households to sample", value: (plans.length * DEFAULT_SAMPLE).toLocaleString() },
          { label: "Security-restricted lots", value: insecure.toLocaleString(), warn: insecure > 0 },
          { label: "Communities in plan", value: scoped.length.toLocaleString() },
        ].map((k) => (
          <Card key={k.label} className={k.warn ? "border-destructive/50" : ""}><CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className={`text-2xl font-bold ${k.warn ? "text-destructive" : "text-primary"}`}>{loading ? "…" : k.value}</div>
          </CardContent></Card>
        ))}
      </div>

      <LqasRounds projectId={projectId} entries={entries} previousFails={previousFails} />

      <Card>
        <CardHeader><CardTitle className="text-base">2 · Download forms for the teams</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button disabled={!plans.length} onClick={() => downloadBlob(buildPaperPack(plans, ctx), `LQAS_paper_forms_${level}.pdf`)}><Download className="mr-2 h-4 w-4" />All paper forms (PDF)</Button>
          <Button variant="destructive" disabled={!insecure} onClick={() => downloadBlob(buildPaperPack(plans, ctx, { securityOnly: true }), `LQAS_security_restricted_${level}.pdf`)}><ShieldAlert className="mr-2 h-4 w-4" />Security-restricted area pack</Button>
          <Button variant="outline" onClick={() => downloadBlob(buildLqasXlsForm(ctx), `LQAS_KoboCollect_form.xlsx`)}><FileSpreadsheet className="mr-2 h-4 w-4" />KoboCollect form (XLSForm)</Button>
          <div className="w-full rounded-lg border bg-muted/40 p-3 text-xs">
            <div className="mb-1 font-semibold">Kobo REST Service link (paste in KoboToolbox → Settings → REST Services):</div>
            <div className="flex items-center gap-2"><code className="break-all">{webhook}</code>
              <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(webhook); toast.success("Link copied"); }}><Copy className="h-4 w-4" /></Button></div>
            <div className="mt-1 text-muted-foreground">Use the same secret header as your other Kobo forms. Each submission appears below instantly.</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">3 · Results &amp; mop-up decisions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl bg-primary/10 p-4"><div className="text-xs text-muted-foreground">Inferred coverage</div><div className="text-2xl font-bold text-primary">{agg.lots ? pct(agg.coverage) : "—"}</div><div className="text-xs">{agg.lots ? `95% CI ${pct(agg.lower)}–${pct(agg.upper)}` : "No lots reported"}</div></div>
            <div className="rounded-xl bg-muted p-4"><div className="text-xs text-muted-foreground">Lots reported</div><div className="text-2xl font-bold">{agg.lots} / {plans.length}</div></div>
            <div className="rounded-xl bg-accent/20 p-4"><div className="text-xs text-muted-foreground">Passed</div><div className="text-2xl font-bold">{agg.passed}</div></div>
            <div className="rounded-xl bg-destructive/10 p-4"><div className="text-xs text-muted-foreground">Mop-up required</div><div className="text-2xl font-bold text-destructive">{agg.mopUp}</div></div>
          </div>
          <div className="max-h-[480px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>Evaluation Unit</TableHead><TableHead>LGA</TableHead><TableHead>Team</TableHead><TableHead>Covered / sampled</TableHead><TableHead>Coverage</TableHead><TableHead>Decision</TableHead></TableRow></TableHeader>
              <TableBody>
                {lots.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Results appear here as soon as teams submit in KoboCollect.</TableCell></TableRow>}
                {lots.map((r) => {
                  const dec = lotDecision(r.covered, r.sampled, t);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.eu_name}{r.security_mode && <Badge variant="outline" className="ml-2 border-destructive text-destructive">Restricted</Badge>}</TableCell>
                      <TableCell>{r.lga}</TableCell><TableCell>{r.team}</TableCell>
                      <TableCell>{r.covered} / {r.sampled}</TableCell><TableCell>{pct(r.covered / r.sampled)}</TableCell>
                      <TableCell>{dec === "pass" ? <Badge className="bg-primary">Pass</Badge> : <Badge variant="destructive">Mop-up</Badge>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">Method: WHO/ESPEN LQAS — {DEFAULT_SAMPLE} respondents per lot, decision rule from the binomial distribution (≤10% risk of wrongly failing a lot at target). Area coverage is the population-weighted average of lots.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sampling plan preview</CardTitle></CardHeader>
        <CardContent className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Evaluation Unit</TableHead><TableHead>LGA</TableHead><TableHead>Communities</TableHead><TableHead>Population</TableHead><TableHead>Security</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5}><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>}
              {plans.slice(0, 300).map((p) => (
                <TableRow key={p.key}><TableCell className="font-medium">{p.name}</TableCell><TableCell>{p.lga}</TableCell><TableCell>{p.communities}</TableCell><TableCell>{p.population.toLocaleString()}</TableCell>
                  <TableCell>{p.securityMode ? <Badge variant="destructive">Paper-only</Badge> : <Badge variant="secondary">Cleared</Badge>}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
