/**
 * Medicine Offered — by State & by LGA.
 *
 * Poster-style geography breakdown of household/class respondents who were
 * offered the MDA medicine(s), with the swallow-confirmation rate layered on
 * top so gaps between "offered" and "swallowed" are immediately visible.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill, MapPin } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { resolveChecklistValue, type RespondentRow } from "./checklistSchema";

const nf = (n: number) => Number(n || 0).toLocaleString();
const OFFERED = "#128B5B";
const NOT_OFFERED = "#DC2626";
const SWALLOW = "#1668DC";

interface GeoRow {
  key: string;
  name: string;
  parent?: string;
  offered: number;
  notOffered: number;
  total: number;
  swallowed: number;
  swallowAnswered: number;
  offeredPct: number;
  swallowPct: number;
}

function aggregate(rows: RespondentRow[], level: "State" | "LGA"): GeoRow[] {
  const m = new Map<string, GeoRow>();
  for (const r of rows) {
    const name = String(r[level] ?? "").trim();
    if (!name) continue;
    const parent = level === "LGA" ? String(r.State ?? "").trim() : undefined;
    const key = parent ? `${parent}|${name}` : name;
    if (!m.has(key)) {
      m.set(key, {
        key, name, parent, offered: 0, notOffered: 0, total: 0,
        swallowed: 0, swallowAnswered: 0, offeredPct: 0, swallowPct: 0,
      });
    }
    const g = m.get(key)!;
    const o = resolveChecklistValue("Were_you_OFFERED_the_medicine_s", r.Were_you_OFFERED_the_medicine_s).toLowerCase();
    if (o) {
      g.total += 1;
      if (o.startsWith("offered")) g.offered += 1; else g.notOffered += 1;
    }
    const s = resolveChecklistValue("swallow", r.swallow).toLowerCase();
    if (s) {
      g.swallowAnswered += 1;
      if (s.startsWith("swallowed")) g.swallowed += 1;
    }
  }
  return [...m.values()]
    .filter((g) => g.total > 0)
    .map((g) => ({
      ...g,
      offeredPct: g.total ? (g.offered / g.total) * 100 : 0,
      swallowPct: g.swallowAnswered ? (g.swallowed / g.swallowAnswered) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function GeoChart({ rows, level }: { rows: GeoRow[]; level: "State" | "LGA" }) {
  const shown = rows.slice(0, level === "State" ? 12 : 15);
  if (!shown.length) {
    return <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">No medicine responses yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, shown.length * 40 + 50)}>
      <BarChart data={shown} layout="vertical" margin={{ left: 4, right: 68, top: 6, bottom: 22 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 10 }}
          label={{ value: "Households / classes interviewed", position: "insideBottom", offset: -14, fontSize: 10, fontWeight: 700 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fontSize: 10, fontWeight: 600 }}
          tickFormatter={(v: string) => (String(v).length > 22 ? `${String(v).slice(0, 21)}…` : String(v))}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted)/.4)" }}
          contentStyle={{
            background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
            borderRadius: 10, fontSize: 11,
          }}
          formatter={(v: any, n: any) => [nf(Number(v)), n === "offered" ? "Offered" : "Not offered"]}
          labelFormatter={(l: any, p: any) => {
            const row = p?.[0]?.payload as GeoRow | undefined;
            return row ? `${row.parent ? `${row.parent} · ` : ""}${l} — ${row.offeredPct.toFixed(1)}% offered, ${row.swallowPct.toFixed(1)}% swallowed` : String(l);
          }}
        />
        <Bar dataKey="offered" stackId="a" fill={OFFERED} radius={[0, 0, 0, 0]} maxBarSize={22}>
          {shown.map((r) => <Cell key={r.key} fill={OFFERED} />)}
        </Bar>
        <Bar dataKey="notOffered" stackId="a" fill={NOT_OFFERED} radius={[0, 5, 5, 0]} maxBarSize={22}>
          <LabelList
            dataKey="offeredPct"
            position="right"
            formatter={(v: any) => `${Number(v).toFixed(0)}% offered`}
            style={{ fontSize: 10, fontWeight: 800, fill: "hsl(var(--foreground))" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function GeoTable({ rows }: { rows: GeoRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="max-h-[300px] overflow-auto rounded-md border">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="sticky top-0 bg-muted/60">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold">Area</th>
            <th className="px-2 py-1.5 text-right font-semibold">Interviewed</th>
            <th className="px-2 py-1.5 text-right font-semibold">Offered</th>
            <th className="px-2 py-1.5 text-right font-semibold">% Offered</th>
            <th className="px-2 py-1.5 text-right font-semibold">% Swallowed</th>
            <th className="px-2 py-1.5 text-right font-semibold">Gap to 100%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <td className="px-2 py-1.5">
                <span className="font-medium">{r.name}</span>
                {r.parent && <span className="ml-1 text-muted-foreground">· {r.parent}</span>}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{nf(r.total)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{nf(r.offered)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: r.offeredPct >= 90 ? OFFERED : r.offeredPct >= 75 ? "#B45309" : NOT_OFFERED }}>
                {r.offeredPct.toFixed(1)}%
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: SWALLOW }}>{r.swallowPct.toFixed(1)}%</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{nf(r.notOffered)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MedicineOfferedGeo({ respondents }: { respondents: RespondentRow[] }) {
  const byState = useMemo(() => aggregate(respondents, "State"), [respondents]);
  const byLga = useMemo(() => aggregate(respondents, "LGA"), [respondents]);

  const totals = useMemo(() => {
    const t = byState.reduce(
      (a, r) => ({
        total: a.total + r.total,
        offered: a.offered + r.offered,
        swallowed: a.swallowed + r.swallowed,
        swallowAnswered: a.swallowAnswered + r.swallowAnswered,
      }),
      { total: 0, offered: 0, swallowed: 0, swallowAnswered: 0 },
    );
    return {
      ...t,
      notOffered: t.total - t.offered,
      offeredPct: t.total ? (t.offered / t.total) * 100 : 0,
      swallowPct: t.swallowAnswered ? (t.swallowed / t.swallowAnswered) * 100 : 0,
    };
  }, [byState]);

  const worstLga = useMemo(
    () => [...byLga].filter((r) => r.total >= 5).sort((a, b) => a.offeredPct - b.offeredPct)[0] ?? null,
    [byLga],
  );
  const bestLga = useMemo(
    () => [...byLga].filter((r) => r.total >= 5).sort((a, b) => b.offeredPct - a.offeredPct)[0] ?? null,
    [byLga],
  );

  const [tab, setTab] = useState<"State" | "LGA">("State");

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b bg-muted/40 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Pill className="h-4 w-4 text-primary" /> Medicine Offered — by State &amp; by LGA
        </CardTitle>
        <Badge variant="outline" className="tabular-nums">
          {nf(totals.total)} households / classes
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {/* Poster-style KPI strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Offered medicine", value: nf(totals.offered), sub: `${totals.offeredPct.toFixed(1)}% of interviewed`, color: OFFERED },
            { label: "Not offered", value: nf(totals.notOffered), sub: `${(100 - totals.offeredPct).toFixed(1)}% coverage gap`, color: NOT_OFFERED },
            { label: "Confirmed swallowed", value: nf(totals.swallowed), sub: `${totals.swallowPct.toFixed(1)}% of those answering`, color: SWALLOW },
            { label: "Areas with data", value: `${byState.length} / ${byLga.length}`, sub: "States / LGAs reporting", color: "#7C3AED" },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border bg-card p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
              <p className="font-display text-2xl font-bold leading-none tabular-nums" style={{ color: k.color }}>{k.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{k.sub}</p>
            </div>
          ))}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "State" | "LGA")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="State"><MapPin className="mr-1 h-3.5 w-3.5" /> By State</TabsTrigger>
              <TabsTrigger value="LGA"><MapPin className="mr-1 h-3.5 w-3.5" /> By LGA</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-3 text-[10px] font-semibold">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OFFERED }} /> Offered</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: NOT_OFFERED }} /> Not offered</span>
            </div>
          </div>

          <TabsContent value="State" className="mt-3 space-y-3">
            <GeoChart rows={byState} level="State" />
            <GeoTable rows={byState} />
          </TabsContent>
          <TabsContent value="LGA" className="mt-3 space-y-3">
            <GeoChart rows={byLga} level="LGA" />
            <GeoTable rows={byLga} />
          </TabsContent>
        </Tabs>

        {(bestLga || worstLga) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {bestLga && (
              <p className="rounded-lg border-l-4 bg-emerald-50/70 p-2.5 text-[11px]" style={{ borderColor: OFFERED }}>
                <strong>Best coverage:</strong> {bestLga.name}{bestLga.parent ? ` (${bestLga.parent})` : ""} —{" "}
                {bestLga.offeredPct.toFixed(1)}% of {nf(bestLga.total)} interviewed were offered medicine.
              </p>
            )}
            {worstLga && (
              <p className="rounded-lg border-l-4 bg-rose-50/70 p-2.5 text-[11px]" style={{ borderColor: NOT_OFFERED }}>
                <strong>Priority LGA:</strong> {worstLga.name}{worstLga.parent ? ` (${worstLga.parent})` : ""} —{" "}
                only {worstLga.offeredPct.toFixed(1)}% offered; {nf(worstLga.notOffered)} missed in the sample.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
