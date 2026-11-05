import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, MapPin } from "lucide-react";
import { summariseRound } from "@/lib/lqas/roundForms";

interface R { id: string; disease: string; eu_name: string; eu_level: string; decision_rule: number; sample_n: number; upper_threshold: number; status: string; verification_date: string | null }
interface L { id: string; round_id: string; lot_name: string; population: number; status: string; covered_count: number | null; sampled_count: number | null; mop_up_due: string | null }

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default function LqasReports({ projectId }: { projectId: string }) {
  const [rounds, setRounds] = useState<R[]>([]);
  const [lots, setLots] = useState<L[]>([]);
  const load = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("lqas_rounds").select("id, disease, eu_name, eu_level, decision_rule, sample_n, upper_threshold, status, verification_date").eq("project_id", projectId).order("created_at", { ascending: false });
    const rs = (data ?? []) as R[];
    setRounds(rs);
    if (!rs.length) return setLots([]);
    const { data: l } = await supabase.from("lqas_lots").select("id, round_id, lot_name, population, status, covered_count, sampled_count, mop_up_due").in("round_id", rs.map((r) => r.id));
    setLots((l ?? []) as L[]);
  }, [projectId]);
  useEffect(() => {
    load();
    if (!projectId) return;
    const ch = supabase.channel(`lqas-reports-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lqas_lots" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, projectId]);

  const rows = useMemo(() => rounds.map((r) => ({ r, s: summariseRound(lots.filter((l) => l.round_id === r.id)) })), [rounds, lots]);
  const total = summariseRound(lots);
  const mopUps = lots.filter((l) => l.status === "FAIL");
  const chart = rows.map(({ r, s }) => ({ name: `${r.eu_name} · ${r.disease}`, Passed: s.passed, "Mop-up": s.failed, Pending: s.lots - s.reported }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Rounds", value: rounds.length },
          { label: "Lots reported", value: `${total.reported} / ${total.lots}` },
          { label: "Lot pass rate", value: pct(total.passRate) },
          { label: "Lots needing mop-up", value: total.failed, warn: total.failed > 0 },
        ].map((k) => (
          <Card key={k.label} className={k.warn ? "border-destructive/50" : ""}><CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className={`text-2xl font-bold ${k.warn ? "text-destructive" : "text-primary"}`}>{k.value}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-5 w-5 text-primary" /> Lot decisions by round</CardTitle>
          <Button size="sm" variant="outline" onClick={() => window.dispatchEvent(new CustomEvent("amehnities:navigate-tab", { detail: { tab: "microplanning" } }))}><MapPin className="mr-1 h-4 w-4" /> Open Geo Microplanning dashboard</Button>
        </CardHeader>
        <CardContent className="h-72">
          {chart.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                <Bar dataKey="Passed" stackId="a" fill="hsl(var(--success))" /><Bar dataKey="Mop-up" stackId="a" fill="hsl(var(--destructive))" /><Bar dataKey="Pending" stackId="a" fill="hsl(var(--muted-foreground))" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground">Save a round to see its report.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Coverage by round</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Round</TableHead><TableHead>Disease</TableHead><TableHead>Pass mark</TableHead><TableHead>Reported</TableHead><TableHead>Coverage (weighted)</TableHead><TableHead>Pass rate</TableHead><TableHead>Mop-up</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map(({ r, s }) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.eu_name}</TableCell><TableCell>{r.disease}</TableCell>
                  <TableCell>{r.decision_rule}/{r.sample_n} · {r.upper_threshold}%</TableCell>
                  <TableCell>{s.reported}/{s.lots}</TableCell><TableCell>{pct(s.coverage)}</TableCell><TableCell>{pct(s.passRate)}</TableCell>
                  <TableCell>{s.failed ? <Badge variant="destructive">{s.failed}</Badge> : "0"}</TableCell>
                  <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">Coverage is the population-weighted average of reported lots; it is indicative, LQAS decisions are made per lot.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Mop-up decisions</CardTitle></CardHeader>
        <CardContent>
          {mopUps.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>Lot</TableHead><TableHead>Round</TableHead><TableHead>Covered</TableHead><TableHead>Revisit by</TableHead></TableRow></TableHeader>
              <TableBody>{mopUps.map((l) => { const r = rounds.find((x) => x.id === l.round_id); return (
                <TableRow key={l.id}><TableCell className="font-medium">{l.lot_name}</TableCell><TableCell>{r?.eu_name} · {r?.disease}</TableCell><TableCell>{l.covered_count}/{l.sampled_count}</TableCell><TableCell>{l.mop_up_due ?? "—"}</TableCell></TableRow>
              ); })}</TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No failed lots so far.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
