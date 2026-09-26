import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Cpu, Gauge, Pause, Play, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCleanerBrain } from "@/hooks/useCleanerBrain";
import type { ScoredRow } from "@/lib/dataCleaner/neural/protocol";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";

/**
 * Runs the on-device Data Cleaner brain (autoencoder + transformer, in a web
 * worker — no AI gateway, no credits) over the module's real beneficiary
 * records and flags the ones it cannot reconstruct.
 */
type Col = { key: string; type: "text" | "num" | "int" | "date" };
const SKIP = /phone|tel|mobile|nin|uuid|photo|image|url|signature|name|email|address|note|comment|^id$|_id$|password|code$/i;
const ISO = /^\d{4}-\d{2}-\d{2}/;

function flatten(b: BeneficiaryRow): Record<string, any> {
  const r: Record<string, any> = {
    State: b.state ?? "", LGA: b.lga ?? "", Ward: b.ward ?? "", Village: b.village ?? "",
    Status: b.status ?? "", "Risk level": b.risk_level ?? "",
    Latitude: b.latitude, Longitude: b.longitude,
    "Registered on": b.created_at?.slice(0, 10), "Next follow-up": b.next_follow_up_date,
  };
  for (const [k, v] of Object.entries(b.profile || {})) {
    if (v === null || v === undefined || typeof v === "object" || SKIP.test(k)) continue;
    r[`p:${k}`] = v;
  }
  return r;
}

function inferSchema(rows: Record<string, any>[]): Col[] {
  const fixed: Col[] = [
    { key: "State", type: "text" }, { key: "LGA", type: "text" }, { key: "Ward", type: "text" },
    { key: "Status", type: "text" }, { key: "Risk level", type: "text" },
    { key: "Latitude", type: "num" }, { key: "Longitude", type: "num" },
    { key: "Registered on", type: "date" }, { key: "Next follow-up", type: "date" },
  ];
  const keys = new Map<string, any[]>();
  for (const r of rows) for (const k of Object.keys(r)) if (k.startsWith("p:")) { const a = keys.get(k) ?? []; a.push(r[k]); keys.set(k, a); }
  const extra: Col[] = [];
  for (const k of [...keys.keys()].sort()) {
    const vals = keys.get(k)!.filter((v) => String(v).trim() !== "");
    if (vals.length < Math.max(5, rows.length * 0.2)) continue;
    const nums = vals.filter((v) => typeof v === "number" || (/^-?\d+(\.\d+)?$/.test(String(v).trim())));
    const dates = vals.filter((v) => ISO.test(String(v)));
    const distinct = new Set(vals.map(String)).size;
    if (nums.length / vals.length > 0.8) extra.push({ key: k, type: nums.every((n) => Number.isInteger(+n)) ? "int" : "num" });
    else if (dates.length / vals.length > 0.8) extra.push({ key: k, type: "date" });
    else if (distinct <= Math.max(12, vals.length * 0.3)) extra.push({ key: k, type: "text" });
  }
  return [...fixed, ...extra.slice(0, 40)];
}
const label = (k: string) => (k.startsWith("p:") ? k.slice(2).replace(/_/g, " ") : k);

export default function BeneficiaryBrainPanel({ moduleId }: { moduleId?: string }) {
  const [records, setRecords] = useState<BeneficiaryRow[] | null>(null);
  const [scored, setScored] = useState<ScoredRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedAt, setScannedAt] = useState<Date | null>(null);
  const [q, setQ] = useState("");
  const fed = useRef<string | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      if (!moduleId) return;
      setRecords(null); setScored(null); fed.current = null;
      const all: BeneficiaryRow[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const { data, error } = await supabase.from("beneficiaries").select("*").eq("module_id", moduleId)
          .order("created_at", { ascending: true }).range(from, from + 999);
        if (error || !data?.length) break;
        all.push(...(data as unknown as BeneficiaryRow[]));
        if (data.length < 1000) break;
      }
      if (!off) setRecords(all);
    })();
    return () => { off = true; };
  }, [moduleId]);

  const flat = useMemo(() => (records ?? []).map(flatten), [records]);
  const config = useMemo(() => (records ? { columns: inferSchema(flat) } : null), [records, flat]);
  const brain = useCleanerBrain(`BENEFICIARY:${moduleId ?? "none"}`, config);
  const { stats } = brain;

  const scan = async () => {
    if (!flat.length) return;
    setScanning(true);
    try {
      if (fed.current !== moduleId) { brain.addCorpus(flat, "Beneficiary records"); fed.current = moduleId ?? null; }
      const res = await brain.score(flat);
      setScored(res); setScannedAt(new Date());
    } finally { setScanning(false); }
  };
  // First scan once the brain has loaded; re-scan every 3 minutes while open so flags track what it learns.
  useEffect(() => { if (stats && records && !scored && !scanning) void scan(); /* eslint-disable-next-line */ }, [stats?.mda, records]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) void scan(); }, 180000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [flat]);

  const flagged = useMemo(() => {
    if (!scored || !records) return [];
    return scored.map((s, i) => {
      const crit = s.cells.some((c) => c.severity === "critical") || s.rowScore > s.rowQ995;
      const review = crit || s.rowScore > s.rowQ95 || s.cells.some((c) => c.severity === "high");
      return { s, b: records[i], level: crit ? "critical" : review ? "review" : s.cells.length ? "minor" : "ok" };
    }).filter((x) => x.level === "critical" || x.level === "review")
      .sort((a, b) => b.s.rowScore - a.s.rowScore);
  }, [scored, records]);

  const shown = flagged.filter((f) => !q || `${f.b.case_id} ${f.b.full_name} ${f.b.lga ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const n = records?.length ?? 0;
  const cellsFlagged = scored?.reduce((a, s) => a + s.cells.length, 0) ?? 0;
  const cols = config?.columns.length ?? 0;
  const confidence = stats?.ready ? Math.round(100 * Math.exp(-Math.max(0, stats.valLoss)) * Math.min(1, (stats.corpusRows || stats.bootstrapRows) / 300 + 0.4)) : 0;
  const learned = stats ? Math.min(100, Math.round(100 * (Math.min(1, stats.corpusRows / 1000) * 0.5 + Math.min(1, stats.steps / 20000) * 0.5))) : 0;
  const colRates = useMemo(() => {
    if (!scored?.length) return [];
    const m = new Map<string, number>();
    for (const s of scored) for (const c of new Set(s.cells.map((x) => x.col))) m.set(c, (m.get(c) ?? 0) + 1);
    return [...m.entries()].map(([c, v]) => ({ col: label(c), rate: +(100 * v / scored.length).toFixed(1) })).sort((a, b) => b.rate - a.rate).slice(0, 10);
  }, [scored]);
  const loss = (stats?.lossHistory ?? []).map((h, i) => ({ i, train: +h.train.toFixed(3), val: +h.val.toFixed(3) }));

  if (!moduleId) return <p className="text-sm text-muted-foreground">Choose a module first.</p>;

  const kpis = [
    { icon: Gauge, label: "Brain confidence", value: `${confidence}%`, sub: stats?.ready ? `Held-out error ${stats.valLoss.toFixed(3)}` : "Warming up" },
    { icon: TriangleAlert, label: "Row error rate", value: n ? `${(100 * flagged.length / n).toFixed(1)}%` : "—", sub: `${flagged.length} of ${n} records flagged` },
    { icon: Cpu, label: "Cell error rate", value: n && cols ? `${(100 * cellsFlagged / (n * cols)).toFixed(2)}%` : "—", sub: `${cellsFlagged} values questioned` },
    { icon: Brain, label: "Learned so far", value: `${learned}%`, sub: `${(stats?.steps ?? 0).toLocaleString()} steps · ${(stats?.corpusRows ?? 0).toLocaleString()} rows remembered` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Record quality brain</h2>
          <p className="text-sm text-muted-foreground">Two models run on this device (no AI credits) and flag records they can't rebuild from what normal records look like.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${stats?.running ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
            {stats ? stats.state : "loading"}
          </span>
          <Button size="sm" variant="outline" onClick={() => brain.setRunning(!stats?.running)} disabled={!stats}>
            {stats?.running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{stats?.running ? "Pause" : "Resume"}
          </Button>
          <Button size="sm" onClick={scan} disabled={scanning || !n}><RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />Re-scan</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}><CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><k.icon className="h-4 w-4 text-primary" />{k.label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.sub}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Learning curve</CardTitle></CardHeader><CardContent className="h-56">
          {loss.length ? <ResponsiveContainer><AreaChart data={loss}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="i" hide /><YAxis width={40} tick={{ fontSize: 11 }} /><Tooltip />
            <Area dataKey="train" name="Training error" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" />
            <Area dataKey="val" name="Held-out error" stroke="hsl(var(--chart-secondary))" fill="hsl(var(--chart-secondary) / 0.15)" />
          </AreaChart></ResponsiveContainer> : <p className="text-sm text-muted-foreground">The curve appears after the first minute of learning.</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Error rate by field</CardTitle></CardHeader><CardContent className="h-56">
          {colRates.length ? <ResponsiveContainer><BarChart data={colRates} layout="vertical" margin={{ left: 20 }}>
            <XAxis type="number" unit="%" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="col" width={110} tick={{ fontSize: 11 }} /><Tooltip />
            <Bar dataKey="rate" name="% of records" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
          </BarChart></ResponsiveContainer> : <p className="text-sm text-muted-foreground">No field has been questioned yet.</p>}
        </CardContent></Card>
      </div>

      <Card><CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {[["Fields watched", cols], ["Records scanned", n], ["Held-out test rows", stats?.valRows ?? 0], ["Overfit guards fired", stats?.overfitEvents ?? 0],
          ["Doubtful rows trusted less", stats?.distrustedRows ?? 0], ["Last saved", stats?.lastCheckpointAt ? new Date(stats.lastCheckpointAt).toLocaleTimeString() : "—"]].map(([a, b]) => (
          <div key={a as string}><div className="text-xs text-muted-foreground">{a}</div><div className="font-semibold">{b}</div></div>
        ))}
      </CardContent></Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Records it can't reconstruct ({flagged.length})</CardTitle>
          <Input className="h-8 max-w-xs" placeholder="Search Case ID, name, LGA" value={q} onChange={(e) => setQ(e.target.value)} />
        </CardHeader>
        <CardContent className="p-0">
          {records === null ? <p className="p-4 text-sm text-muted-foreground">Loading records…</p>
            : !scored ? <p className="p-4 text-sm text-muted-foreground">{scanning ? "Scanning records…" : "Waiting for the brain to wake up…"}</p>
            : !shown.length ? <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Every record reconstructs within normal range.</p>
            : <div className="max-h-[560px] overflow-auto divide-y divide-border/60">
              {shown.slice(0, 200).map(({ s, b, level }) => (
                <div key={b.id} className={`border-l-2 p-3 hover:bg-muted/40 ${level === "critical" ? "border-l-destructive" : "border-l-primary"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{b.case_id}</span>
                      <span className="text-sm font-medium">{b.full_name}</span>
                      <span className="text-xs text-muted-foreground">{[b.lga, b.ward].filter(Boolean).join(" · ")}</span>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className={`h-2 w-2 rounded-full ${level === "critical" ? "bg-destructive" : "bg-primary"}`} />
                      {level === "critical" ? "Critical" : "Needs review"} · score {s.rowScore.toFixed(2)}
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {s.cells.slice(0, 6).map((c, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{label(c.col)}</span>: {String(c.original ?? "blank")}
                        {c.suggested !== undefined && <> → expected ≈ <span className="font-medium text-foreground">{String(c.suggested)}</span></>}
                        {c.kind === "category" && <> — {c.message.replace(/p:/g, "")}</>}
                      </li>
                    ))}
                    {!s.cells.length && <li className="text-xs text-muted-foreground">The whole record is unusual compared with normal records.</li>}
                  </ul>
                </div>
              ))}
            </div>}
          {scannedAt && <p className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">Last scanned {scannedAt.toLocaleTimeString()} · re-scans every 3 minutes while this page is open.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
