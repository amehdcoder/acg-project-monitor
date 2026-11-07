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
import { CalendarClock, Download, FileSpreadsheet, Loader2, Plus, RotateCcw, ShieldAlert, Target, Trash2 } from "lucide-react";
import { buildRoundPaperPack, buildRoundXlsForm, mopUpCommunities, mopUpWindow } from "@/lib/lqas/roundForms";
import { downloadBlob } from "@/lib/lqas/forms";
import { buildLots, DISEASES, evaluationUnits, ROUND_EU_LEVELS, roundDesign, type RoundEntry, type RoundEuLevel } from "@/lib/lqas/rounds";
import { assessDesign } from "@/lib/lqas/quality";
import { buildPlan } from "@/lib/lqas/lqas";
import { CHILD_OF } from "@/lib/lqas/roundForms";

interface Round { id: string; disease: string; drug: string | null; eu_level: string; eu_key: string | null; eu_name: string; upper_threshold: number; lower_threshold: number; sample_n: number; decision_rule: number; verification_date: string | null; status: string; created_at: string; indicator?: string | null; eligibility?: string | null; campaign_reference?: string | null; sampling_snapshot?: unknown }
interface Lot { id: string; round_id: string; lot_name: string; lot_type: string; population: number; households: number; lat: number | null; lng: number | null; security_status: string; risk_flags: string[]; status: string; supervisor_id: string | null; lot_key: string; covered_count: number | null; sampled_count: number | null; mop_up_required: boolean; mop_up_due: string | null; result_at: string | null }

const secTone: Record<string, string> = { Red: "bg-destructive text-destructive-foreground", Yellow: "bg-accent text-accent-foreground", Green: "bg-primary text-primary-foreground" };

export default function LqasRounds({ projectId, entries, previousFails, projectName, indicator }: { projectId: string; entries: RoundEntry[]; previousFails: Set<string>; projectName: string; indicator: string }) {
  const { user } = useAuth();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [openRound, setOpenRound] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  // form
  const [disease, setDisease] = useState(DISEASES[0].id);
  const [level, setLevel] = useState<RoundEuLevel>("lga");
  const [eu, setEu] = useState("");
  const [upper, setUpper] = useState(80);
  const [lower, setLower] = useState(50);
  const [n, setN] = useState(19);
  const [date, setDate] = useState("");
  const [eligibility, setEligibility] = useState("");
  const [campaign, setCampaign] = useState("");
  const [supervisors, setSupervisors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.from("lqas_rounds").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    const list = (data ?? []) as Round[];
    setRounds(list);
    if (list.length) {
      const { data: l } = await supabase.from("lqas_lots").select("*").in("round_id", list.map((r) => r.id));
      setLots((l ?? []) as Lot[]);
    } else setLots([]);
  }, [projectId]);
  useEffect(() => {
    load();
    if (!projectId) return;
    const ch = supabase.channel(`lqas-rounds-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lqas_lots" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "lqas_rounds", filter: `project_id=eq.${projectId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, projectId]);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data: a } = await supabase.from("user_project_assignments").select("user_id").eq("project_id", projectId);
      const ids = [...new Set((a ?? []).map((r: { user_id: string }) => r.user_id))];
      if (!ids.length) return setPeople([]);
      const { data: p } = await supabase.from("profiles").select("user_id, first_name, last_name, email").in("user_id", ids);
      setPeople(((p ?? []) as { user_id: string; first_name: string | null; last_name: string | null; email: string | null }[])
        .map((r) => ({ id: r.user_id, name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Member" }))
        .sort((x, y) => x.name.localeCompare(y.name)));
    })();
  }, [projectId]);

  const eus = useMemo(() => evaluationUnits(entries, level), [entries, level]);
  const draft = useMemo(() => (eu ? buildLots(entries, level, eu, previousFails) : []), [entries, level, eu, previousFails]);
  const design = assessDesign(n, upper, lower);
  const validDesign = design.acceptable;
  const childLabel = ROUND_EU_LEVELS.find((l) => l.id === level)?.child ?? "Community";
  const frame = useMemo(() => eu ? buildPlan(entries.filter((e) => evaluationUnits([e], level)[0]?.key === eu), CHILD_OF[level], Number.isInteger(n) && n >= 10 && n <= 30 ? n : 19, "preview") : [], [entries, level, eu, n]);
  const frameMissing = frame.reduce((s, p) => s + p.frameMissing, 0);
  const peopleName = (id: string | null) => people.find((p) => p.id === id)?.name ?? "—";

  const save = async () => {
    if (!user || !eu || !draft.length || !validDesign || frameMissing || !eligibility.trim() || !campaign.trim() || !indicator.trim()) return;
    setSaving(true);
    const roundId = crypto.randomUUID();
    const snapshot = buildPlan(entries.filter((e) => evaluationUnits([e], level)[0]?.key === eu), CHILD_OF[level], n, roundId);
    const { data: r, error } = await supabase.from("lqas_rounds").insert({
      id: roundId, indicator: indicator.trim(), eligibility: eligibility.trim(), campaign_reference: campaign.trim(), sampling_snapshot: JSON.parse(JSON.stringify(snapshot)),
      project_id: projectId, disease, drug: DISEASES.find((x) => x.id === disease)?.drug ?? null,
      eu_level: level, eu_key: eu, eu_name: eus.find((x) => x.key === eu)?.name ?? eu,
      upper_threshold: upper, lower_threshold: lower, sample_n: n, decision_rule: design.d,
      verification_date: date || null, created_by: user.id,
    }).select("id").single();
    if (error || !r) { setSaving(false); return toast.error(error?.message ?? "Round not saved"); }
    const { error: le } = await supabase.from("lqas_lots").insert(draft.map((l) => ({ ...l, round_id: r.id, supervisor_id: supervisors[l.lot_key] || null })));
    setSaving(false);
    if (le) { await supabase.from("lqas_rounds").delete().eq("id", r.id); return toast.error(`Lots not saved: ${le.message}`); }
    toast.success(`Round saved with ${draft.length} lots`);
    setCreating(false); setEu(""); setSupervisors({}); setOpenRound(r.id);
    load();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this round, its lots and linked assessments? This cannot be undone.")) return;
    const { error } = await supabase.from("lqas_rounds").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Round deleted"); load();
  };

  const LotTable = ({ rows, editable }: { rows: (Lot | (ReturnType<typeof buildLots>[number] & { id?: string; supervisor_id?: string | null; status?: string }))[]; editable: boolean }) => (
    <div className="max-h-[480px] overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="bg-primary">
          <TableRow className="hover:bg-primary">
            {["Lot", "Population", "Households", "GPS", "Security", "Risk flags", "Supervisor", ...(editable ? [] : ["Status"])].map((h) => <TableHead key={h} className="text-primary-foreground">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((l, i) => {
            const key = "lot_key" in l ? (l as { lot_key: string }).lot_key : (l as Lot).id;
            return (
              <TableRow key={key} className={i % 2 ? "bg-muted/40" : ""}>
                <TableCell className="font-medium">{l.lot_name}</TableCell>
                <TableCell>{l.population.toLocaleString()}</TableCell>
                <TableCell>{l.households.toLocaleString()}</TableCell>
                <TableCell className="text-xs">{l.lat != null && l.lng != null ? `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}` : "Not recorded"}</TableCell>
                <TableCell><Badge className={secTone[l.security_status]}>{l.security_status}</Badge></TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{l.risk_flags.length ? l.risk_flags.map((f) => <Badge key={f} variant="outline" className="border-destructive/50 text-destructive">{f}</Badge>) : <span className="text-xs text-muted-foreground">None</span>}</div></TableCell>
                <TableCell>
                  {editable ? (
                    <Select value={supervisors[key] ?? ""} onValueChange={(v) => setSupervisors((s) => ({ ...s, [key]: v }))}>
                      <SelectTrigger className="h-9 w-44"><SelectValue placeholder={people.length ? "Assign" : "No members"} /></SelectTrigger>
                      <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : peopleName(l.supervisor_id ?? null)}
                </TableCell>
                {!editable && <TableCell>{(() => { const x = l as Lot; return x.status === "PASS" ? <Badge className="bg-primary text-primary-foreground">PASS {x.covered_count}/{x.sampled_count}</Badge> : x.status === "FAIL" ? <Badge variant="destructive">MOP-UP {x.covered_count}/{x.sampled_count}</Badge> : <Badge variant="secondary">{x.status}</Badge>; })()}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> LQAS rounds</CardTitle>
        {!creating && <Button onClick={() => setCreating(true)} disabled={!entries.length}><Plus className="mr-1 h-4 w-4" /> Create new LQAS round</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        {creating && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label>Disease / intervention</Label>
                <Select value={disease} onValueChange={setDisease}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DISEASES.map((d) => <SelectItem key={d.id} value={d.id}>{d.id} – {d.drug}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Evaluation unit level</Label>
                <Select value={level} onValueChange={(v) => { setLevel(v as RoundEuLevel); setEu(""); setSupervisors({}); }}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROUND_EU_LEVELS.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="lg:col-span-2"><Label>Evaluation unit</Label>
                <Select value={eu} onValueChange={(v) => { setEu(v); setSupervisors({}); }}><SelectTrigger><SelectValue placeholder="Choose from the microplan" /></SelectTrigger>
                  <SelectContent>{eus.map((e) => <SelectItem key={e.key} value={e.key}>{e.key}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Upper threshold %</Label><Input type="number" min={1} max={100} value={upper} onChange={(e) => setUpper(Number(e.target.value))} /></div>
              <div><Label>Lower threshold %</Label><Input type="number" min={0} max={99} value={lower} onChange={(e) => setLower(Number(e.target.value))} /></div>
              <div><Label>Sample n (10–30)</Label><Input type="number" min={10} max={30} value={n} onChange={(e) => setN(Number(e.target.value))} /></div>
              <div><Label>Date of verification</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="lg:col-span-2"><Label>Campaign / medicine distribution reference period</Label><Input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Campaign name and distribution dates" /></div>
              <div className="lg:col-span-2"><Label>Eligible population definition</Label><Input value={eligibility} onChange={(e) => setEligibility(e.target.value)} placeholder="Age range, medicine eligibility and exclusions" /></div>
            </div>
            <div className={`rounded-xl border-2 p-3 ${validDesign ? "border-primary/40 bg-primary/5" : "border-destructive/50 bg-destructive/5"}`}>
              {design.valid ? (
                <p className="text-sm"><span className="text-lg font-bold text-primary">PASS if covered ≥ {design.d}</span> of {n} · FAIL if ≤ {design.d - 1}
                  <span className="ml-2 text-muted-foreground">Risk of failing a lot at {upper}%: {((design.alpha ?? 0) * 100).toFixed(1)}% · risk of passing a lot at {lower}%: {((design.beta ?? 0) * 100).toFixed(1)}%</span></p>
              ) : <p className="text-sm text-destructive">Upper threshold must exceed lower, and n must be between 10 and 30.</p>}
            </div>
            {design.valid && !validDesign && <p className="text-sm text-destructive">This design exceeds the 10% risk limit at one threshold. Widen the threshold gap or change the sample size before saving.</p>}
            {frameMissing > 0 && <p className="text-sm text-destructive">{frameMissing} sampling-frame entries need a community name and positive recorded population. No assumed household size or equal-weight substitute is used.</p>}
            <p className="text-xs text-muted-foreground">Programme-specific thresholds need approval. PASS is a classification, not proof of target coverage. The saved campaign, question and sampling points remain fixed for paper and phone forms.</p>
            {eu && <div className="space-y-2">
              <p className="text-sm font-medium">{draft.length} lots ({childLabel}s) — high-risk first</p>
              <LotTable rows={draft} editable />
            </div>}
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !eu || !draft.length || !validDesign || frameMissing > 0 || !eligibility.trim() || !campaign.trim() || !indicator.trim()}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save round</Button>
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {!rounds.length && !creating && <p className="text-sm text-muted-foreground">No rounds yet for this project.</p>}
        {rounds.map((r) => {
          const rl = lots.filter((l) => l.round_id === r.id);
          const open = openRound === r.id;
          return (
            <div key={r.id} className="rounded-xl border">
              <Button variant="ghost" className="flex h-auto w-full flex-wrap justify-start whitespace-normal items-center gap-2 p-3 text-left" aria-expanded={open} onClick={() => setOpenRound(open ? null : r.id)}>
                <span className="font-semibold">{r.eu_name}</span>
                <Badge variant="outline">{ROUND_EU_LEVELS.find((l) => l.id === r.eu_level)?.label}</Badge>
                <span className="text-sm text-muted-foreground">{r.disease}{r.drug ? ` – ${r.drug}` : ""}</span>
                <span className="text-sm">{rl.length} lots · n={r.sample_n} · PASS ≥ {r.decision_rule} · {r.upper_threshold}/{r.lower_threshold}%</span>
                {r.verification_date && <span className="text-sm text-muted-foreground">{r.verification_date}</span>}
                <Badge className="ml-auto">{r.status}</Badge>
              </Button>
              {open && <div className="space-y-2 border-t p-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => downloadBlob(buildRoundXlsForm(r, rl, projectName, indicator), `LQAS_${r.eu_name}_phone_form.xlsx`)}><FileSpreadsheet className="mr-1 h-4 w-4" /> {r.sample_n}-household KoboCollect form</Button>
                  <Button size="sm" variant="outline" onClick={() => downloadBlob(buildRoundPaperPack(r, entries, projectName, indicator).blob, `LQAS_${r.eu_name}_paper_pack.pdf`)}><Download className="mr-1 h-4 w-4" /> Printed pack (PDF)</Button>
                  {rl.some((l) => l.security_status !== "Green") && <Button size="sm" variant="destructive" onClick={() => downloadBlob(buildRoundPaperPack(r, entries, projectName, indicator, true).blob, `LQAS_${r.eu_name}_security_pack.pdf`)}><ShieldAlert className="mr-1 h-4 w-4" /> Security-restricted pack</Button>}
                </div>
                <p className="text-xs text-muted-foreground">{r.campaign_reference ?? "Legacy round: campaign reference not saved"} · {r.eligibility ?? "Eligibility requires programme confirmation"}. Only complete, unchanged probability samples receive a decision; others remain In Progress.</p>
                <LotTable rows={rl} editable={false} />
                {rl.filter((l) => l.status === "FAIL").map((l) => {
                  const comm = mopUpCommunities(entries, r, l.lot_key);
                  const w = mopUpWindow(l.result_at, l.mop_up_due);
                  return (
                    <div key={l.id} className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <RotateCcw className="h-4 w-4 text-destructive" />
                        <span className="font-semibold">Mop-up: {l.lot_name}</span>
                        <span className="text-sm">{l.covered_count}/{l.sampled_count} covered (pass mark {r.decision_rule})</span>
                        <Badge variant="outline" className="ml-auto gap-1 border-destructive text-destructive"><CalendarClock className="h-3 w-3" /> Revisit {w.start ?? "now"} → {w.end ?? "within 7 days"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Supervisor review required: investigate missed treatment across these communities, approve safe corrective action, then verify with a newly randomized sample. The 7-day review deadline is an app operational default, not a universal WHO mop-up mandate. Never enter an uncleared area.</p>
                      <div className="mt-2 flex flex-wrap gap-1">{comm.length ? comm.map((c) => <Badge key={c.ward + c.community} variant="outline" className={c.restricted ? "border-destructive text-destructive" : ""}>{c.community}{c.ward && c.ward !== l.lot_name ? ` · ${c.ward}` : ""} · {c.population.toLocaleString()}</Badge>) : <span className="text-xs">No communities listed in the microplan for this lot.</span>}</div>
                    </div>
                  );
                })}
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(r.id)}><Trash2 className="mr-1 h-4 w-4" /> Delete round</Button>
              </div>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
