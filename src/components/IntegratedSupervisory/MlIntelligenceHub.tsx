import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Activity, BadgeCheck, Ban, Bot, Brain, CheckCircle2, Droplets,
  Gauge, MapPin, Megaphone, Radio, Send, ShieldAlert, Siren, Sparkle, Truck, Zap,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  anomalies as buildAnomalies, coldspots as buildColdspots, coverage, mapPoints,
  refusalTopics, saeStream, wardRefusalTopics, washHotspots, washMatrix,
  type AnomalyRow, type Coldspot, type Row,
} from "@/lib/isc/mlHubAnalytics";

/* Palette */
const NAVY = "#0F172A";
const EMERALD = "#10B981";
const AMBER = "#F59E0B";
const CRIMSON = "#EF4444";

const surface = "rounded-xl border border-white/10 bg-[#111C31]";

const EmptyBlock = ({ label }: { label: string }) => (
  <div className="flex h-[220px] items-center justify-center px-6 text-center text-xs text-slate-400">
    {label}
  </div>
);

/* ------------------------------------------------------------------ KPIs */

function KpiCard({
  label, value, sub, accent, icon: Icon, badge, action, onAction,
}: {
  label: string; value: string; sub: string; accent: string;
  icon: React.ElementType; badge?: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className={`${surface} flex flex-col gap-2 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{label}</p>
        <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
      </div>
      <p className="text-3xl font-bold tabular-nums text-slate-50">{value}</p>
      {badge && (
        <span className="w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${accent}22`, color: accent }}>{badge}</span>
      )}
      <p className="text-[11px] leading-snug text-slate-300">{sub}</p>
      {action && (
        <Button size="sm" variant="outline"
          className="mt-1 h-7 border-white/20 bg-white/10 text-[11px] text-slate-50 hover:bg-white/20 hover:text-white"
          onClick={onAction}>{action}</Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------- Module A: spatial */

function SpatialModule({
  points, spots, onDispatch,
}: { points: ReturnType<typeof mapPoints>; spots: Coldspot[]; onDispatch: () => void }) {
  const pts = useMemo(() => {
    if (points.length === 0) return [];
    const lats = points.map((r) => r.lat), lngs = points.map((r) => r.long);
    const [minLa, maxLa] = [Math.min(...lats), Math.max(...lats)];
    const [minLo, maxLo] = [Math.min(...lngs), Math.max(...lngs)];
    return points.map((r) => ({
      r,
      x: ((r.long - minLo) / (maxLo - minLo || 1)) * 86 + 7,
      y: 93 - ((r.lat - minLa) / (maxLa - minLa || 1)) * 86,
    }));
  }, [points]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
      <div className={`${surface} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-50">
            <MapPin className="h-4 w-4" style={{ color: EMERALD }} /> Household treatment map
          </p>
          <div className="flex items-center gap-2.5 text-[10px] text-slate-300">
            {[["Swallowed", EMERALD], ["Offered / refused", AMBER], ["Not offered", CRIMSON]].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {l}
              </span>
            ))}
          </div>
        </div>
        <div className="relative h-[320px]" style={{
          background:
            `radial-gradient(circle at 30% 25%, #1B2A44 0%, ${NAVY} 70%),` +
            "repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0 1px,transparent 1px 40px)," +
            "repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 1px,transparent 1px 40px)",
        }}>
          {pts.length === 0 && (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-slate-400">
              No geotagged household records in the current filter selection.
            </div>
          )}
          {pts.map(({ r, x, y }) => (
            <button
              key={r.key}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black/30 transition-transform hover:scale-150"
              style={{
                left: `${x}%`, top: `${y}%`, width: 13, height: 13,
                background: r.swallowed ? EMERALD : r.offered ? AMBER : CRIMSON,
              }}
              title={`${r.community} · ${r.ward}`}
              onClick={() => toast({
                title: `${r.community} — ${r.ward}`,
                description: `${r.campaign} · offered ${r.offered ? "Yes" : "No"} · swallowed ${r.swallowed ? "Yes" : "No"}${r.accuracy ? ` · GPS ±${Math.round(r.accuracy)} m` : ""}`,
              })}
            />
          ))}
          {pts.length > 0 && (
            <span className="absolute bottom-2 right-3 text-[10px] text-slate-400">
              {pts.length} geotagged households · live Kobo dataset
            </span>
          )}
        </div>
      </div>

      <div className={`${surface} flex flex-col`}>
        <div className="border-b border-white/10 px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-50">
            <Brain className="h-4 w-4" style={{ color: AMBER }} /> Ward coverage cold-spots
          </p>
        </div>
        <div className="max-h-[300px] flex-1 overflow-auto">
          {spots.length === 0 ? <EmptyBlock label="No ward-level respondent data yet." /> : (
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">LGA → Ward</th>
                  <th className="px-3 py-2 text-right font-semibold">Swallow&nbsp;%</th>
                  <th className="px-3 py-2 text-right font-semibold">HH</th>
                  <th className="px-3 py-2 text-right font-semibold">Teams</th>
                  <th className="px-3 py-2 text-left font-semibold">Risk</th>
                </tr>
              </thead>
              <tbody>
                {spots.slice(0, 12).map((c) => (
                  <tr key={c.key} className="border-t border-white/5 text-slate-100">
                    <td className="px-3 py-2">
                      <span className="font-medium">{c.lga}</span>
                      <span className="text-slate-400"> → {c.ward}</span>
                      <div className="text-[10px] text-slate-400">{c.state}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: c.progress < 40 ? CRIMSON : c.progress < 80 ? AMBER : EMERALD }}>
                      {c.progress}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.households}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.teams}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: c.risk === "Critical" ? `${CRIMSON}22` : c.risk === "High" ? `${AMBER}22` : "#94a3b822",
                          color: c.risk === "Critical" ? CRIMSON : c.risk === "High" ? AMBER : "#cbd5e1",
                        }}>{c.risk}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-white/10 p-3">
          <Button className="w-full" style={{ background: EMERALD, color: NAVY }} disabled={spots.length === 0} onClick={onDispatch}>
            <Zap className="mr-1.5 h-4 w-4" /> Auto-Dispatch Field Teams
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Module B: NLP */

function NlpModule({
  topics, analysed, wards, onBrief,
}: {
  topics: { topic: string; count: number; sentiment: number }[];
  analysed: number;
  wards: ReturnType<typeof wardRefusalTopics>;
  onBrief: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div className={`${surface} p-4`}>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-50">
          <Bot className="h-4 w-4" style={{ color: AMBER }} /> Primary refusal drivers (rule-based topic extraction)
        </p>
        {topics.length === 0 ? <EmptyBlock label="No non-swallow reasons captured in the current selection." /> : (
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={topics} layout="vertical" margin={{ left: 20, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#cbd5e1" }} />
              <YAxis type="category" dataKey="topic" width={150} tick={{ fontSize: 11, fill: "#e2e8f0" }} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,.05)" }}
                contentStyle={{ background: NAVY, border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }} />
              <Bar dataKey="count" radius={[0, 5, 5, 0]}>
                {topics.map((t) => <Cell key={t.topic} fill={t.sentiment < -0.5 ? CRIMSON : AMBER} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="mt-1 text-[11px] text-slate-400">
          {analysed.toLocaleString()} free-text / coded refusal responses classified · polarity scored −1 → +1.
        </p>
      </div>

      <div className={`${surface} flex flex-col`}>
        <div className="border-b border-white/10 px-4 py-2.5">
          <p className="text-sm font-semibold text-slate-50">Ward-level topic &amp; sentiment</p>
        </div>
        <div className="max-h-[320px] flex-1 space-y-2 overflow-auto p-3">
          {wards.length === 0 ? <EmptyBlock label="No ward refusal signal yet." /> : wards.map((w) => (
            <div key={w.ward} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-50">{w.ward}</p>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: w.sentiment < -0.5 ? `${CRIMSON}22` : `${AMBER}22`, color: w.sentiment < -0.5 ? CRIMSON : AMBER }}>
                  sentiment {w.sentiment.toFixed(2)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-300">
                Dominant topic: <span className="text-slate-50">{w.dominant}</span> · {w.share}% of {w.total} refusals
              </p>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${w.share}%`, background: AMBER }} />
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 p-3">
          <Button className="w-full" style={{ background: AMBER, color: NAVY }} disabled={wards.length === 0} onClick={onBrief}>
            <Megaphone className="mr-1.5 h-4 w-4" /> Generate Hyper-Local Advocacy Brief
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Module C: SAE */

function SaeModule({ rows, onEmergency }: { rows: ReturnType<typeof saeStream>; onEmergency: () => void }) {
  const top = rows[0];
  const pct = top ? Math.min(100, (top.oddsRatio / 5) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className={`${surface} flex flex-col`}>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-50">
              <Siren className="h-4 w-4" style={{ color: CRIMSON }} /> Real-time SAE stream
            </p>
            <Badge className="border-0" style={{ background: `${CRIMSON}22`, color: CRIMSON }}>
              <Radio className="mr-1 h-3 w-3 animate-pulse" /> live
            </Badge>
          </div>
          <div className="max-h-[340px] divide-y divide-white/5 overflow-auto">
            {rows.length === 0 ? <EmptyBlock label="No SAE complaints reported in the current selection." /> : rows.map((s) => {
              const c = s.severity === "Critical" ? CRIMSON : s.severity === "High" ? AMBER : EMERALD;
              return (
                <div key={s.id} className="flex items-start gap-3 p-3">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-50">{s.id} · {s.symptom}</p>
                    <p className="mt-0.5 text-[11px] text-slate-300">{s.flhf} — {s.community} · {s.lga} · {s.campaign}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Odds ratio {s.oddsRatio.toFixed(2)} (95% CI {s.ciLow.toFixed(2)}–{s.ciHigh.toFixed(2)})
                      {s.at ? ` · ${new Date(s.at).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${c}22`, color: c }}>
                    {s.severity}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`${surface} p-4`}>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-50">
            <Gauge className="h-4 w-4" style={{ color: CRIMSON }} /> Campaign odds-ratio gauge
          </p>
          <p className="text-4xl font-bold tabular-nums text-slate-50">{top ? `${top.oddsRatio.toFixed(2)}×` : "—"}</p>
          <p className="text-[11px] text-slate-300">
            {top ? `vs. baseline safety threshold of 1.50× · ${top.campaign}` : "No adverse-event signal to score."}
          </p>
          <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg,${EMERALD},${AMBER},${CRIMSON})` }} />
            <span className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: "30%" }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>0</span><span>threshold 1.5×</span><span>5.0×</span>
          </div>
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-2.5 text-[11px] text-slate-200">
            {top
              ? top.ciLow > 1
                ? "The 95% confidence interval excludes 1.0 — the campaign-level signal is unlikely to be chance."
                : "The 95% confidence interval still includes 1.0 — continue monitoring before escalating."
              : "Signal detection resumes as soon as an SAE is reported."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
        style={{ borderColor: `${CRIMSON}55`, background: `${CRIMSON}14` }}>
        <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: CRIMSON }}>
          <ShieldAlert className="h-4 w-4" /> Emergency pharmacovigilance enforcement
        </p>
        <Button style={{ background: CRIMSON, color: "#fff" }} disabled={rows.length === 0} onClick={onEmergency}>
          <Siren className="mr-1.5 h-4 w-4" /> Trigger Emergency RRT &amp; Quarantine Drug Batch
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Module D: WASH */

const heat = (v: number) => (v >= 85 ? EMERALD : v >= 70 ? "#65A30D" : v >= 55 ? AMBER : CRIMSON);

function WashModule({
  matrix, hotspots, onExport,
}: {
  matrix: ReturnType<typeof washMatrix>;
  hotspots: ReturnType<typeof washHotspots>;
  onExport: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <div className={`${surface} p-4`}>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-50">
          <Droplets className="h-4 w-4" style={{ color: EMERALD }} /> WASH × swallowing-compliance risk grid
        </p>
        {matrix.rows.length === 0 ? <EmptyBlock label="No respondent WASH answers in the current selection." /> : (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-300">
                  <th className="px-2 py-1.5 text-left font-semibold">Water source</th>
                  {matrix.columns.map((c) => (
                    <th key={c} className="px-2 py-1.5 text-center font-semibold">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.source}>
                    <td className="px-2 py-1.5 text-slate-100">{row.source}</td>
                    {row.cells.map((cell) => (
                      <td key={cell.latrine} className="p-1">
                        <div className="rounded-md py-2 text-center text-[11px] font-semibold"
                          style={cell.pct == null
                            ? { background: "rgba(255,255,255,.05)", color: "#94a3b8" }
                            : { background: `${heat(cell.pct)}2b`, color: heat(cell.pct) }}
                          title={`${row.source} × ${cell.latrine}: ${cell.pct ?? "no"} data (${cell.n} households)`}>
                          {cell.pct == null ? "—" : `${cell.pct}%`}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          Cell = % of respondents that swallowed, stratified by main water source and latrine type.
        </p>
      </div>

      <div className={`${surface} flex flex-col`}>
        <div className="border-b border-white/10 px-4 py-2.5">
          <p className="text-sm font-semibold text-slate-50">Re-infection hotspots (lowest compliance)</p>
        </div>
        <div className="max-h-[320px] flex-1 overflow-auto">
          {hotspots.length === 0 ? <EmptyBlock label="No community-level WASH data yet." /> : (
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">LGA → Community</th>
                  <th className="px-3 py-2 text-left font-semibold">Water</th>
                  <th className="px-3 py-2 text-left font-semibold">Latrine</th>
                  <th className="px-3 py-2 text-right font-semibold">Compliance</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.map((h) => (
                  <tr key={`${h.lga}-${h.ward}-${h.community}`} className="border-t border-white/5 text-slate-100">
                    <td className="px-3 py-2">
                      {h.lga} → {h.community}
                      <div className="text-[10px] text-slate-400">{h.state} · {h.ward} · {h.households} HH</div>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{h.water}</td>
                    <td className="px-3 py-2 text-slate-300">{h.latrine}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: heat(h.compliance) }}>
                      {h.compliance}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-white/10 p-3">
          <Button className="w-full" style={{ background: EMERALD, color: NAVY }} disabled={hotspots.length === 0} onClick={onExport}>
            <Droplets className="mr-1.5 h-4 w-4" /> Export WASH Priority List
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Module E: integrity */

function IntegrityModule({
  rows, decisions, onDecide,
}: {
  rows: AnomalyRow[];
  decisions: Record<string, "Approved" | "Quarantined">;
  onDecide: (id: string, status: "Approved" | "Quarantined") => void;
}) {
  const pending = rows.filter((r) => !decisions[r.id]).length;
  return (
    <div className={`${surface} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-50">
          <ShieldAlert className="h-4 w-4" style={{ color: AMBER }} /> Data-integrity anomaly log
        </p>
        <span className="text-[11px] text-slate-300">{pending} awaiting supervisor validation</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {rows.length === 0 ? <EmptyBlock label="No anomalies detected in the current selection." /> : (
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Submission</th>
                <th className="px-3 py-2 text-left font-semibold">Monitor</th>
                <th className="px-3 py-2 text-left font-semibold">Ward</th>
                <th className="px-3 py-2 text-left font-semibold">Anomaly reason</th>
                <th className="px-3 py-2 text-right font-semibold">Score</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const status = decisions[a.id] ?? "Pending";
                const c = status === "Approved" ? EMERALD : status === "Quarantined" ? CRIMSON : AMBER;
                return (
                  <tr key={a.id} className="border-t border-white/5 text-slate-100">
                    <td className="px-3 py-2 font-medium">{a.submission}</td>
                    <td className="px-3 py-2 text-slate-300">{a.enumerator}</td>
                    <td className="px-3 py-2 text-slate-300">{a.ward}</td>
                    <td className="px-3 py-2">{a.reason}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: a.score > 0.85 ? CRIMSON : AMBER }}>
                      {a.score.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${c}22`, color: c }}>{status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline"
                          className="h-7 border-white/20 bg-white/10 text-[11px] text-slate-50 hover:bg-white/20 hover:text-white"
                          disabled={status !== "Pending"} onClick={() => onDecide(a.id, "Approved")}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" style={{ color: EMERALD }} /> Approve
                        </Button>
                        <Button size="sm" variant="outline"
                          className="h-7 border-white/20 bg-white/10 text-[11px] text-slate-50 hover:bg-white/20 hover:text-white"
                          disabled={status !== "Pending"} onClick={() => onDecide(a.id, "Quarantined")}>
                          <Ban className="mr-1 h-3.5 w-3.5" style={{ color: CRIMSON }} /> Quarantine
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- main hub */

const tabClass =
  "text-xs font-semibold text-slate-100 data-[state=active]:bg-white/15 data-[state=active]:text-white";

export default function MlIntelligenceHub({
  parents, respondents, lastSyncLabel, filterSummary,
}: {
  parents: Row[];
  respondents: Row[];
  lastSyncLabel?: string;
  filterSummary?: string;
}) {
  const cov = useMemo(() => coverage(respondents), [respondents]);
  const points = useMemo(() => mapPoints(respondents), [respondents]);
  const spots = useMemo(() => buildColdspots(parents, respondents), [parents, respondents]);
  const { topics, analysed } = useMemo(() => refusalTopics(respondents), [respondents]);
  const wards = useMemo(() => wardRefusalTopics(respondents), [respondents]);
  const sae = useMemo(() => saeStream(parents), [parents]);
  const matrix = useMemo(() => washMatrix(respondents), [respondents]);
  const hotspots = useMemo(() => washHotspots(respondents), [respondents]);
  const anomalyRows = useMemo(() => buildAnomalies(parents, respondents), [parents, respondents]);

  const [decisions, setDecisions] = useState<Record<string, "Approved" | "Quarantined">>({});
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [saeOpen, setSaeOpen] = useState(false);
  const [coldspotOpen, setColdspotOpen] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState("");

  const critical = useMemo(() => spots.filter((c) => c.risk === "Critical" || c.risk === "High"), [spots]);

  useEffect(() => {
    if (!dispatchOpen) return;
    setDispatchMsg(
      `URGENT: Coverage cold-spot detected in ${critical.slice(0, 3).map((c) => c.ward).join(", ") || "your ward"}. ` +
      "Redirect CDD teams to the flagged settlements today and confirm arrival on Amehnities.",
    );
  }, [dispatchOpen, critical]);

  const quarantined = Object.values(decisions).filter((v) => v === "Quarantined").length;
  const integrity = parents.length
    ? Math.max(0, 100 - (anomalyRows.length / parents.length) * 100 - quarantined * 0.5)
    : 0;

  const decide = (id: string, status: "Approved" | "Quarantined") => {
    setDecisions((prev) => ({ ...prev, [id]: status }));
    toast({
      title: status === "Approved" ? "Submission approved" : "Form quarantined",
      description: status === "Approved"
        ? `${id} released back into the analytical dataset.`
        : `${id} flagged for supervisory review and excluded from validated analysis.`,
      variant: status === "Quarantined" ? "destructive" : undefined,
    });
  };

  return (
    <div className="rounded-2xl p-4 text-slate-100" style={{ background: NAVY }}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-50">
            <Sparkle className="h-5 w-5" style={{ color: EMERALD }} />
            Integrated Supervisory Checklist · ML Intelligence Dashboard
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
            <span className="flex h-2 w-2 rounded-full" style={{ background: EMERALD, boxShadow: `0 0 0 3px ${EMERALD}33` }} />
            {lastSyncLabel ?? "Awaiting first Kobo sync"} · {parents.length.toLocaleString()} checklists ·{" "}
            {respondents.length.toLocaleString()} respondents
          </p>
        </div>
        <p className="max-w-[420px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
          Reads the same live, filtered dataset as the dashboard above{filterSummary ? ` · ${filterSummary}` : ""}.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Overall Treatment Coverage Rate" value={cov.offered ? `${cov.rate.toFixed(1)}%` : "—"}
          accent={EMERALD} icon={Activity} badge="Offered vs. Swallowed ratio"
          sub={`${cov.offered.toLocaleString()} offered · ${cov.swallowed.toLocaleString()} swallowed across synced households.`}
        />
        <KpiCard
          label="Predicted Coverage Deficit Wards" value={`${critical.length} Ward${critical.length === 1 ? "" : "s"}`}
          accent={AMBER} icon={MapPin} badge="Ward compliance clustering"
          sub="Wards below the 60% swallow-rate threshold in the current filter."
          action={critical.length ? "View Coldspots" : undefined} onAction={() => setColdspotOpen(true)}
        />
        <KpiCard
          label="Active SAE Alerts" value={`${sae.length} Flag${sae.length === 1 ? "" : "s"}`}
          accent={CRIMSON} icon={ShieldAlert}
          badge={sae.length ? `${sae.filter((x) => x.severity !== "Low").length} above threshold` : "None reported"}
          sub={sae.length ? [...new Set(sae.map((x) => x.campaign))].join(", ") : "No adverse events in the filtered dataset."}
        />
        <KpiCard
          label="Data Integrity Score" value={parents.length ? `${integrity.toFixed(1)}%` : "—"}
          accent={EMERALD} icon={BadgeCheck}
          badge={`${anomalyRows.length} anomaly flag${anomalyRows.length === 1 ? "" : "s"} · ${quarantined} quarantined`}
          sub="GPS accuracy, pattern-repetition and volume-outlier screening."
        />
      </div>

      {/* Modules */}
      <Tabs defaultValue="a" className="mt-4">
        <TabsList className="h-auto flex-wrap border border-white/10 bg-white/5">
          <TabsTrigger value="a" className={tabClass}><MapPin className="mr-1 h-3.5 w-3.5" /> A · Spatial &amp; Routing</TabsTrigger>
          <TabsTrigger value="b" className={tabClass}><Bot className="mr-1 h-3.5 w-3.5" /> B · Refusal NLP</TabsTrigger>
          <TabsTrigger value="c" className={tabClass}><Siren className="mr-1 h-3.5 w-3.5" /> C · Pharmacovigilance</TabsTrigger>
          <TabsTrigger value="d" className={tabClass}><Droplets className="mr-1 h-3.5 w-3.5" /> D · WASH Risk Matrix</TabsTrigger>
          <TabsTrigger value="e" className={tabClass}><ShieldAlert className="mr-1 h-3.5 w-3.5" /> E · Enumerator Integrity</TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="mt-4">
          <SpatialModule points={points} spots={spots} onDispatch={() => setDispatchOpen(true)} />
        </TabsContent>
        <TabsContent value="b" className="mt-4">
          <NlpModule topics={topics} analysed={analysed} wards={wards} onBrief={() => setBriefOpen(true)} />
        </TabsContent>
        <TabsContent value="c" className="mt-4">
          <SaeModule rows={sae} onEmergency={() => setSaeOpen(true)} />
        </TabsContent>
        <TabsContent value="d" className="mt-4">
          <WashModule matrix={matrix} hotspots={hotspots}
            onExport={() => toast({
              title: "WASH priority list exported",
              description: `${hotspots.length} geo-targeted communities pushed to the partner queue.`,
            })} />
        </TabsContent>
        <TabsContent value="e" className="mt-4">
          <IntegrityModule rows={anomalyRows} decisions={decisions} onDecide={decide} />
        </TabsContent>
      </Tabs>

      {/* Coldspot dialog */}
      <Dialog open={coldspotOpen} onOpenChange={setColdspotOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Coverage-deficit wards</DialogTitle>
            <DialogDescription>Wards whose observed swallow rate falls below the campaign target.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {critical.map((c) => (
              <div key={c.key} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                <div>
                  <p className="font-medium">{c.lga} → {c.ward}</p>
                  <p className="text-xs text-muted-foreground">{c.state} · {c.households} households · {c.teams} team(s)</p>
                </div>
                <Badge variant={c.progress < 40 ? "destructive" : "secondary"}>{c.progress}% swallowed</Badge>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => { setColdspotOpen(false); setDispatchOpen(true); }}>
              <Truck className="mr-1.5 h-4 w-4" /> Dispatch teams to all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch dialog */}
      <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="h-4 w-4" /> Auto-dispatch field teams</DialogTitle>
            <DialogDescription>
              SMS + push instruction to {critical.length} ward supervisor(s) covering{" "}
              {critical.reduce((s, c) => s + c.households, 0)} surveyed households.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Instruction message</Label>
            <Textarea rows={4} value={dispatchMsg} onChange={(e) => setDispatchMsg(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Recipients: {critical.slice(0, 8).map((c) => `${c.ward} (${c.teams})`).join(" · ") || "—"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              setDispatchOpen(false);
              toast({
                title: "Field teams dispatched",
                description: `${critical.length} supervisors notified. Rerouting acknowledgements will stream into the map.`,
              });
            }}>
              <Send className="mr-1.5 h-4 w-4" /> Send dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advocacy brief dialog */}
      <Dialog open={briefOpen} onOpenChange={setBriefOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4" /> Hyper-local advocacy brief</DialogTitle>
            <DialogDescription>Auto-generated from ward-level refusal topics in the current filter.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[45vh] space-y-3 overflow-y-auto text-sm">
            {wards.map((w) => (
              <div key={w.ward} className="rounded-lg border p-3">
                <p className="text-xs font-semibold">{w.ward} — counter "{w.dominant}"</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Radio spot:</span>{" "}
                  {w.dominant.startsWith("Fear")
                    ? "Explain that mild, short-lived reactions mean the medicine is working; name a trusted local survivor."
                    : w.dominant.startsWith("Religious")
                      ? "Feature the district imam/pastor endorsing the campaign alongside the FLHF officer-in-charge."
                      : w.dominant.startsWith("Ate nothing")
                        ? "Announce that CDDs will distribute after the morning meal; advise households to eat before 9am."
                        : w.dominant.startsWith("Team never")
                          ? "Publish the revised distribution calendar and a hotline for uncovered settlements."
                          : "Announce a revised evening distribution window after farm hours."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Mobilisation:</span> convene ward heads 24h before the
                  revisit; {w.share}% of {w.total} refusals in this ward share this driver.
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => {
              setBriefOpen(false);
              toast({ title: "Advocacy brief queued", description: `${wards.length} ward briefs sent to the social mobilisation team.` });
            }}>
              <Send className="mr-1.5 h-4 w-4" /> Send to mobilisation team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SAE emergency dialog */}
      <Dialog open={saeOpen} onOpenChange={setSaeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Siren className="h-4 w-4" /> Emergency RRT &amp; batch quarantine
            </DialogTitle>
            <DialogDescription>
              This notifies the Rapid Response Team and suspends distribution for the affected campaign(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {sae.slice(0, 5).map((x) => (
              <div key={x.id} className="rounded-lg border p-2.5">
                <p className="text-xs font-semibold">{x.id} · {x.campaign}</p>
                <p className="text-xs text-muted-foreground">{x.community} — {x.flhf} · {x.symptom}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaeOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              setSaeOpen(false);
              toast({
                variant: "destructive",
                title: "RRT activated · distribution suspended",
                description: `${sae.length} adverse-event report(s) escalated to the pharmacovigilance desk.`,
              });
            }}>
              <Siren className="mr-1.5 h-4 w-4" /> Confirm emergency action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
