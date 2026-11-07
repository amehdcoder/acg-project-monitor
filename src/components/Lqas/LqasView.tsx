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
import { buildPlan, decisionRule, DEFAULT_SAMPLE, EU_LEVELS, euKey, type EuLevel } from "@/lib/lqas/lqas";
import LqasRounds from "./LqasRounds";
import LqasReports from "./LqasReports";
import LqasKoboCard from "./LqasKoboCard";
import LqasStandards from "./LqasStandards";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RoundEntry } from "@/lib/lqas/rounds";
import { buildLqasXlsForm, buildPaperPack, downloadBlob } from "@/lib/lqas/forms";

interface ResultRow { id: string; round_id: string | null; lot_id: string | null; payload: unknown; eu_level: string; eu_name: string; state: string | null; lga: string | null; ward: string | null; flhf_name: string | null; community_name: string | null; sampled: number; covered: number; team: string | null; security_mode: boolean; submitted_at: string | null; created_at: string }

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
  const [entriesRevision, setEntriesRevision] = useState(0);
  const [resultPage, setResultPage] = useState(0);
  const [previousFails, setPreviousFails] = useState(new Set<string>());

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
        if (cancelled) return;
        if (error) { if (!cancelled) { toast.error("Microplanning data could not be refreshed. Previous data is retained."); setLoading(false); } return; }
        if (!data?.length) break;
        rows.push(...(data as RoundEntry[]));
        if (data.length < 1000) break;
      }
      if (!cancelled) { setEntries(rows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [projectId, entriesRevision]);

  useEffect(() => {
    setEntries([]); setResults([]); setStateFilter("all"); setResultPage(0);
    if (!projectId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => setEntriesRevision((v) => v + 1), 800); };
    const ch = supabase.channel(`lqas-frame-${projectId}`).on("postgres_changes", { event: "*", schema: "public", table: "microplan_entries", filter: `project_id=eq.${projectId}` }, refresh).subscribe();
    window.addEventListener("online", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("online", refresh); supabase.removeChannel(ch); };
  }, [projectId]);

  const loadResults = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("lqas_results").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(5000);
    if (data) setResults(data as ResultRow[]);
    const { data: failed } = await supabase.from("lqas_lots").select("lot_key,lqas_rounds!inner(project_id)").eq("status", "FAIL").eq("lqas_rounds.project_id", projectId);
    if (failed) setPreviousFails(new Set(failed.map((l) => l.lot_key)));
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
    return results.filter((r) => !r.round_id && r.eu_level === level && (stateFilter === "all" || r.state === stateFilter)).map((r) => {
      const key = euKey({ state: r.state ?? "", lga: r.lga ?? "", ward: r.ward ?? "", flhf_name: r.flhf_name ?? "", community_name: r.community_name ?? "" }, level);
      return { ...r, key, population: popByKey.get(key) ?? 0 };
    });
  }, [results, plans, level, stateFilter]);
  const insecure = plans.filter((p) => p.securityMode).length;
  const frameMissing = plans.reduce((s, p) => s + p.frameMissing, 0);
  const download = (make: () => Blob, name: string) => { try { downloadBlob(make(), name); } catch (e) { toast.error((e as Error).message); } };

  const webhook = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kobo-webhook?form_type=lqas&project_id=${projectId}${user ? `&submitted_by=${user.id}` : ""}`;

  return (
    <div className="geo-workspace space-y-5 p-4 md:p-6">
      <div className="geo-command">
        <div className="flex flex-wrap items-center gap-3">
          <div className="geo-command-icon rounded-lg p-3"><ClipboardCheck className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold">LQAS Coverage Evaluation</h1>
            <p className="text-sm text-muted-foreground">{projectName} · Survey planning &amp; operational lot classification</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="plan">
      <TabsList className="h-auto flex flex-wrap justify-start gap-1"><TabsTrigger value="plan">Plan &amp; rounds</TabsTrigger><TabsTrigger value="reports">LQAS reports</TabsTrigger><TabsTrigger value="standards">WHO guidance</TabsTrigger></TabsList>
      <TabsContent value="standards"><LqasStandards /></TabsContent>
      <TabsContent value="reports" className="mt-4"><LqasReports projectId={projectId} /></TabsContent>
      <TabsContent value="plan" className="mt-4 space-y-6">
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
          { label: "Eligible-person sample slots", value: plans.reduce((s, p) => s + p.sample.length, 0).toLocaleString() },
          { label: "Security-restricted lots", value: insecure.toLocaleString(), warn: insecure > 0 },
          { label: "Communities in plan", value: scoped.length.toLocaleString() },
        ].map((k) => (
          <Card key={k.label} className={k.warn ? "border-destructive/50" : ""}><CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className={`text-2xl font-bold ${k.warn ? "text-destructive" : "text-primary"}`}>{loading ? "…" : k.value}</div>
          </CardContent></Card>
        ))}
      </div>
      <div className={`border-l-4 p-3 text-sm ${frameMissing ? "border-destructive bg-destructive/5" : "border-primary bg-primary/5"}`}><strong>{frameMissing ? `${frameMissing} entries need sampling-frame corrections` : "Probability sampling frame"}</strong><p className="mt-1 text-xs text-muted-foreground">Recorded population weights only · fixed round samples · one randomly selected eligible person per household. A 19-person design is configurable, not a universal WHO protocol.</p></div>

      <LqasRounds projectId={projectId} entries={entries} previousFails={previousFails} projectName={projectName} indicator={indicator} />

      {projectId && <LqasKoboCard projectId={projectId} projectName={projectName} ctx={ctx} webhook={webhook} />}

      <Card>
        <CardHeader><CardTitle className="text-base">2 · Download forms for the teams</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button disabled={!plans.length || frameMissing > 0} onClick={() => download(() => buildPaperPack(plans, ctx), `LQAS_paper_forms_${level}.pdf`)}><Download className="mr-2 h-4 w-4" />All paper forms (PDF)</Button>
          <Button variant="destructive" disabled={!insecure || frameMissing > 0} onClick={() => download(() => buildPaperPack(plans, ctx, { securityOnly: true }), `LQAS_security_restricted_${level}.pdf`)}><ShieldAlert className="mr-2 h-4 w-4" />Security-restricted area pack</Button>
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
        <CardHeader><CardTitle className="text-base">3 · Unlinked submission review</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{lots.length} unlinked submissions. Historical submissions are not pooled across campaigns. Authoritative saved-design decisions appear in LQAS reports; unlinked records require supervisor review.</p>
          <div className="max-h-[480px] overflow-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>Evaluation Unit</TableHead><TableHead>LGA</TableHead><TableHead>Team</TableHead><TableHead>Covered / sampled</TableHead><TableHead>Coverage</TableHead><TableHead>Decision</TableHead></TableRow></TableHeader>
              <TableBody>
                {lots.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Results appear here as soon as teams submit in KoboCollect.</TableCell></TableRow>}
                {lots.slice(resultPage * 20, (resultPage + 1) * 20).map((r) => {
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.eu_name}{r.security_mode && <Badge variant="outline" className="ml-2 border-destructive text-destructive">Restricted</Badge>}</TableCell>
                      <TableCell>{r.lga}</TableCell><TableCell>{r.team}</TableCell>
                      <TableCell>{r.covered} / {r.sampled}</TableCell><TableCell>{pct(r.covered / r.sampled)}</TableCell>
                      <TableCell><Badge variant="outline">Unlinked · review</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {lots.length > 20 && <div className="flex items-center justify-end gap-3"><Button variant="outline" size="sm" disabled={resultPage === 0} onClick={() => setResultPage((p) => p - 1)}>Previous</Button><span className="text-xs">Page {resultPage + 1} / {Math.ceil(lots.length / 20)}</span><Button variant="outline" size="sm" disabled={(resultPage + 1) * 20 >= lots.length} onClick={() => setResultPage((p) => p + 1)}>Next</Button></div>}
          <p className="text-xs text-muted-foreground">Sample proportions are not certified population coverage. No confidence interval is asserted without the approved survey’s selection weights and clustering information.</p>
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
      </TabsContent>
      </Tabs>
    </div>
  );
}
