import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Activity, AlertTriangle, BadgeCheck, Ban, Bot, Brain, CheckCircle2, Droplets,
  Gauge, MapPin, Megaphone, Radio, Send, ShieldAlert, Siren, Sparkle, Truck, Zap,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ANOMALIES, COLDSPOTS, ML_HUB_RECORDS, REFUSAL_TOPICS, SAE_STREAM,
  WARD_NLP, WASH_HOTSPOTS, WASH_MATRIX, type AnomalyRow,
} from "./mlHubMockData";

/* Palette (explicit per design brief) */
const NAVY = "#0F172A";
const EMERALD = "#10B981";
const AMBER = "#F59E0B";
const CRIMSON = "#EF4444";

const surface = "rounded-xl border border-white/10 bg-[#111C31]";

/* ------------------------------------------------------------------ KPIs */

function KpiCard({
  label, value, sub, accent, icon: Icon, badge, action, onAction,
}: {
  label: string; value: string; sub: string; accent: string;
  icon: React.ElementType; badge?: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className={`${surface} p-4 flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
      </div>
      <p className="text-3xl font-bold tabular-nums text-slate-50">{value}</p>
      {badge && (
        <span
          className="w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${accent}22`, color: accent }}
        >
          {badge}
        </span>
      )}
      <p className="text-[11px] leading-snug text-slate-400">{sub}</p>
      {action && (
        <Button
          size="sm"
          variant="outline"
          className="mt-1 h-7 border-white/15 bg-white/5 text-[11px] text-slate-100 hover:bg-white/10"
          onClick={onAction}
        >
          {action}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------- Module A: spatial */

const statusDot = (r: (typeof ML_HUB_RECORDS)[number]) =>
  r["Did you SWALLOW the medicine(s)?"] === "Yes"
    ? EMERALD
    : r["Were you OFFERED the medicine(s)"] === "Yes"
      ? AMBER
      : CRIMSON;

function SpatialModule({ onDispatch }: { onDispatch: () => void }) {
  const pts = useMemo(() => {
    const lats = ML_HUB_RECORDS.map((r) => r["GPS of Household"].lat);
    const lngs = ML_HUB_RECORDS.map((r) => r["GPS of Household"].long);
    const [minLa, maxLa] = [Math.min(...lats), Math.max(...lats)];
    const [minLo, maxLo] = [Math.min(...lngs), Math.max(...lngs)];
    return ML_HUB_RECORDS.map((r) => ({
      r,
      x: ((r["GPS of Household"].long - minLo) / (maxLo - minLo || 1)) * 86 + 7,
      y: 93 - ((r["GPS of Household"].lat - minLa) / (maxLa - minLa || 1)) * 86,
    }));
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
      <div className={`${surface} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <MapPin className="h-4 w-4" style={{ color: EMERALD }} /> Household treatment map
          </p>
          <div className="flex items-center gap-2.5 text-[10px] text-slate-400">
            {[["Swallowed", EMERALD], ["Offered / refused", AMBER], ["Not started", CRIMSON]].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {l}
              </span>
            ))}
          </div>
        </div>
        <div
          className="relative h-[320px]"
          style={{
            background:
              `radial-gradient(circle at 30% 25%, #1B2A44 0%, ${NAVY} 70%),` +
              "repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0 1px,transparent 1px 40px)," +
              "repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 1px,transparent 1px 40px)",
          }}
        >
          {pts.map(({ r, x, y }) => (
            <button
              key={r["Parent Submission ID"]}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black/30 transition-transform hover:scale-150"
              style={{ left: `${x}%`, top: `${y}%`, width: 13, height: 13, background: statusDot(r) }}
              title={`${r.Community} · ${r.Ward}`}
              onClick={() =>
                toast({
                  title: `${r.Community} — ${r.Ward}`,
                  description: `${r["MDA Campaign Type"]} · offered ${r["Were you OFFERED the medicine(s)"]} · swallowed ${r["Did you SWALLOW the medicine(s)?"]} · GPS ±${r["GPS of Household"].accuracy} m`,
                })
              }
            />
          ))}
          <span className="absolute bottom-2 right-3 text-[10px] text-slate-500">
            DBSCAN ε = 1.2 km · minPts = 4 · {ML_HUB_RECORDS.length} geotagged households
          </span>
        </div>
      </div>

      <div className={`${surface} flex flex-col`}>
        <div className="border-b border-white/10 px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Brain className="h-4 w-4" style={{ color: AMBER }} /> Spatial cold-spot detection
          </p>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">LGA → Ward</th>
                <th className="px-3 py-2 text-right font-semibold">Progress</th>
                <th className="px-3 py-2 text-right font-semibold">HH</th>
                <th className="px-3 py-2 text-right font-semibold">Teams</th>
                <th className="px-3 py-2 text-left font-semibold">Risk</th>
              </tr>
            </thead>
            <tbody>
              {COLDSPOTS.map((c) => (
                <tr key={c.ward} className="border-t border-white/5 text-slate-200">
                  <td className="px-3 py-2">
                    <span className="font-medium">{c.lga}</span>
                    <span className="text-slate-500"> → {c.ward}</span>
                    <div className="text-[10px] text-slate-500">{c.state} State</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: c.progress < 40 ? CRIMSON : AMBER }}>
                    {c.progress}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.households}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.teams}</td>
                  <td className="px-3 py-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: c.risk === "Critical" ? `${CRIMSON}22` : c.risk === "High" ? `${AMBER}22` : "#94a3b822",
                        color: c.risk === "Critical" ? CRIMSON : c.risk === "High" ? AMBER : "#94a3b8",
                      }}
                    >
                      {c.risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/10 p-3">
          <Button className="w-full" style={{ background: EMERALD, color: NAVY }} onClick={onDispatch}>
            <Zap className="mr-1.5 h-4 w-4" /> Auto-Dispatch Field Teams
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Module B: NLP */

function NlpModule({ onBrief }: { onBrief: () => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div className={`${surface} p-4`}>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Bot className="h-4 w-4" style={{ color: AMBER }} /> Primary refusal drivers (NLP topic extraction)
        </p>
        <ResponsiveContainer width="100%" height={270}>
          <BarChart data={REFUSAL_TOPICS} layout="vertical" margin={{ left: 20, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis type="category" dataKey="topic" width={130} tick={{ fontSize: 11, fill: "#cbd5e1" }} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,.05)" }}
              contentStyle={{ background: NAVY, border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }}
            />
            <Bar dataKey="count" radius={[0, 5, 5, 0]}>
              {REFUSAL_TOPICS.map((t) => (
                <Cell key={t.topic} fill={t.sentiment < -0.5 ? CRIMSON : AMBER} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-1 text-[11px] text-slate-500">
          482 free-text responses vectorised · BERTopic clustering · polarity scored −1 → +1.
        </p>
      </div>

      <div className={`${surface} flex flex-col`}>
        <div className="border-b border-white/10 px-4 py-2.5">
          <p className="text-sm font-semibold text-slate-100">Ward-level topic &amp; sentiment</p>
        </div>
        <div className="flex-1 space-y-2 p-3">
          {WARD_NLP.map((w) => (
            <div key={w.ward} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-100">{w.ward}</p>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: w.sentiment < -0.5 ? `${CRIMSON}22` : `${AMBER}22`, color: w.sentiment < -0.5 ? CRIMSON : AMBER }}
                >
                  sentiment {w.sentiment.toFixed(2)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Dominant topic: <span className="text-slate-200">{w.dominant}</span> · {w.share}% of refusals
              </p>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${w.share}%`, background: AMBER }} />
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 p-3">
          <Button className="w-full" style={{ background: AMBER, color: NAVY }} onClick={onBrief}>
            <Megaphone className="mr-1.5 h-4 w-4" /> Generate Hyper-Local Advocacy Brief
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Module C: SAE */

function SaeModule({ onEmergency }: { onEmergency: () => void }) {
  const top = SAE_STREAM[0];
  const pct = Math.min(100, (top.oddsRatio / 5) * 100);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className={`${surface} flex flex-col`}>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Siren className="h-4 w-4" style={{ color: CRIMSON }} /> Real-time SAE anomaly stream
            </p>
            <Badge className="border-0" style={{ background: `${CRIMSON}22`, color: CRIMSON }}>
              <Radio className="mr-1 h-3 w-3 animate-pulse" /> live
            </Badge>
          </div>
          <div className="divide-y divide-white/5">
            {SAE_STREAM.map((s) => {
              const c = s.severity === "Critical" ? CRIMSON : s.severity === "High" ? AMBER : EMERALD;
              return (
                <div key={s.id} className="flex items-start gap-3 p-3">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-100">
                      {s.id} · {s.symptom}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {s.flhf} — {s.community} · {s.campaign} · batch {s.batch}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Bayesian OR {s.oddsRatio.toFixed(2)} (95% CI {s.ciLow.toFixed(2)}–{s.ciHigh.toFixed(2)}) ·{" "}
                      {new Date(s.at).toLocaleString()}
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
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Gauge className="h-4 w-4" style={{ color: CRIMSON }} /> Bayesian odds-ratio gauge
          </p>
          <p className="text-4xl font-bold tabular-nums text-slate-50">{top.oddsRatio.toFixed(2)}×</p>
          <p className="text-[11px] text-slate-400">
            vs. baseline safety threshold of 1.50× · {top.campaign} / batch {top.batch}
          </p>
          <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg,${EMERALD},${AMBER},${CRIMSON})` }} />
            <span className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: "30%" }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>0</span><span>threshold 1.5×</span><span>5.0×</span>
          </div>
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-2.5 text-[11px] text-slate-300">
            Posterior exceeds threshold with 97.3% probability — batch-level signal is unlikely to be chance.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
        style={{ borderColor: `${CRIMSON}55`, background: `${CRIMSON}14` }}>
        <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: CRIMSON }}>
          <ShieldAlert className="h-4 w-4" /> Emergency pharmacovigilance enforcement
        </p>
        <Button style={{ background: CRIMSON, color: "#fff" }} onClick={onEmergency}>
          <Siren className="mr-1.5 h-4 w-4" /> Trigger Emergency RRT &amp; Quarantine Drug Batch
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Module D: WASH */

const heat = (v: number) =>
  v >= 85 ? EMERALD : v >= 70 ? "#65A30D" : v >= 55 ? AMBER : CRIMSON;

function WashModule({ onExport }: { onExport: () => void }) {
  const cols: Array<keyof (typeof WASH_MATRIX)[number]> = ["Flush", "VIP", "Pit", "Open"];
  const colLabel: Record<string, string> = { Flush: "Flush toilet", VIP: "VIP latrine", Pit: "Pit latrine", Open: "Open defecation" };
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <div className={`${surface} p-4`}>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Droplets className="h-4 w-4" style={{ color: EMERALD }} /> WASH × swallowing-compliance risk grid
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400">
              <th className="px-2 py-1.5 text-left font-semibold">Water source</th>
              {cols.map((c) => (
                <th key={String(c)} className="px-2 py-1.5 text-center font-semibold">{colLabel[String(c)]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WASH_MATRIX.map((row) => (
              <tr key={row.source}>
                <td className="px-2 py-1.5 text-slate-200">{row.source}</td>
                {cols.map((c) => {
                  const v = row[c] as number;
                  return (
                    <td key={String(c)} className="p-1">
                      <div
                        className="rounded-md py-2 text-center text-[11px] font-semibold"
                        style={{ background: `${heat(v)}2b`, color: heat(v) }}
                        title={`${row.source} × ${colLabel[String(c)]}: ${v}% compliance`}
                      >
                        {v}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-500">
          Cell = % of households that swallowed, stratified by water source and latrine type.
        </p>
      </div>

      <div className={`${surface} flex flex-col`}>
        <div className="border-b border-white/10 px-4 py-2.5">
          <p className="text-sm font-semibold text-slate-100">Re-infection hotspots (low compliance + open water)</p>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">LGA → Community</th>
                <th className="px-3 py-2 text-left font-semibold">Water</th>
                <th className="px-3 py-2 text-left font-semibold">Latrine</th>
                <th className="px-3 py-2 text-right font-semibold">Compliance</th>
              </tr>
            </thead>
            <tbody>
              {WASH_HOTSPOTS.map((h) => (
                <tr key={h.community} className="border-t border-white/5 text-slate-200">
                  <td className="px-3 py-2">
                    {h.lga} → {h.community}
                    <div className="text-[10px] text-slate-500">{h.state} · {h.ward}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{h.water}</td>
                  <td className="px-3 py-2 text-slate-400">{h.latrine}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: heat(h.compliance) }}>
                    {h.compliance}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/10 p-3">
          <Button className="w-full" style={{ background: EMERALD, color: NAVY }} onClick={onExport}>
            <Droplets className="mr-1.5 h-4 w-4" /> Export WASH Priority List
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Module E: integrity */

function IntegrityModule({
  rows, onDecide,
}: { rows: AnomalyRow[]; onDecide: (id: string, status: "Approved" | "Quarantined") => void }) {
  return (
    <div className={`${surface} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <ShieldAlert className="h-4 w-4" style={{ color: AMBER }} /> Isolation Forest anomaly log
        </p>
        <span className="text-[11px] text-slate-400">
          {rows.filter((r) => r.status === "Pending").length} awaiting supervisor validation
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-white/5 text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Submission</th>
              <th className="px-3 py-2 text-left font-semibold">Enumerator</th>
              <th className="px-3 py-2 text-left font-semibold">Ward</th>
              <th className="px-3 py-2 text-left font-semibold">Anomaly reason</th>
              <th className="px-3 py-2 text-right font-semibold">Score</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const c = a.status === "Approved" ? EMERALD : a.status === "Quarantined" ? CRIMSON : AMBER;
              return (
                <tr key={a.id} className="border-t border-white/5 text-slate-200">
                  <td className="px-3 py-2 font-medium">{a.submission}</td>
                  <td className="px-3 py-2 text-slate-400">{a.enumerator}</td>
                  <td className="px-3 py-2 text-slate-400">{a.ward}</td>
                  <td className="px-3 py-2">{a.reason}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: a.score > 0.85 ? CRIMSON : AMBER }}>
                    {a.score.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${c}22`, color: c }}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm" variant="outline"
                        className="h-7 border-white/15 bg-white/5 text-[11px] text-slate-100 hover:bg-white/10"
                        disabled={a.status !== "Pending"}
                        onClick={() => onDecide(a.id, "Approved")}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" style={{ color: EMERALD }} /> Approve
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className="h-7 border-white/15 bg-white/5 text-[11px] text-slate-100 hover:bg-white/10"
                        disabled={a.status !== "Pending"}
                        onClick={() => onDecide(a.id, "Quarantined")}
                      >
                        <Ban className="mr-1 h-3.5 w-3.5" style={{ color: CRIMSON }} /> Quarantine
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- main hub */

export default function MlIntelligenceHub() {
  const [stateF, setStateF] = useState("__all__");
  const [lgaF, setLgaF] = useState("__all__");
  const [from, setFrom] = useState("2026-07-01");
  const [to, setTo] = useState("2026-07-31");

  const [anomalies, setAnomalies] = useState<AnomalyRow[]>(ANOMALIES);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [saeOpen, setSaeOpen] = useState(false);
  const [coldspotOpen, setColdspotOpen] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState(
    "URGENT: DBSCAN coverage cold-spot detected in your ward. Redirect 2 CDD teams to the flagged settlements today and confirm arrival on Amehnities.",
  );

  const states = useMemo(() => [...new Set(ML_HUB_RECORDS.map((r) => r.State))].sort(), []);
  const lgas = useMemo(
    () => [...new Set(ML_HUB_RECORDS.filter((r) => stateF === "__all__" || r.State === stateF).map((r) => r.LGA))].sort(),
    [stateF],
  );

  const quarantined = anomalies.filter((a) => a.status === "Quarantined").length;
  const integrity = (94.2 - quarantined * 0.8).toFixed(1);

  const decide = (id: string, status: "Approved" | "Quarantined") => {
    setAnomalies((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    toast({
      title: status === "Approved" ? "Submission approved" : "Form quarantined",
      description:
        status === "Approved"
          ? `${id} released back into the analytical dataset and the Isolation Forest was retrained on the correction.`
          : `${id} removed from all dashboards. Enumerator flagged for supervisory review.`,
      variant: status === "Quarantined" ? "destructive" : undefined,
    });
  };

  return (
    <div className="rounded-2xl p-4 text-slate-100" style={{ background: NAVY }}>
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkle className="h-5 w-5" style={{ color: EMERALD }} />
            Integrated Supervisory Checklist · ML Intelligence Dashboard
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="flex h-2 w-2 rounded-full" style={{ background: EMERALD, boxShadow: `0 0 0 3px ${EMERALD}33` }} />
            Live KoboSync: 2 records synced just now
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-slate-400">State</Label>
            <Select value={stateF} onValueChange={(v) => { setStateF(v); setLgaF("__all__"); }}>
              <SelectTrigger className="h-9 w-[150px] border-white/15 bg-white/5 text-xs text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All States</SelectItem>
                {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-slate-400">LGA</Label>
            <Select value={lgaF} onValueChange={setLgaF}>
              <SelectTrigger className="h-9 w-[150px] border-white/15 bg-white/5 text-xs text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All LGAs</SelectItem>
                {lgas.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-slate-400">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-[140px] border-white/15 bg-white/5 text-xs text-slate-100" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-slate-400">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-9 w-[140px] border-white/15 bg-white/5 text-xs text-slate-100" />
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Overall Treatment Coverage Rate" value="78.4%" accent={EMERALD} icon={Activity}
          badge="Offered vs. Swallowed ratio"
          sub="1,842 offered · 1,444 swallowed across synced households."
        />
        <KpiCard
          label="Predicted Coverage Deficit Wards" value="4 Wards" accent={AMBER} icon={MapPin}
          badge="DBSCAN spatial clustering"
          sub="Flagged from geotagged household density vs. distribution velocity."
          action="View Coldspots" onAction={() => setColdspotOpen(true)}
        />
        <KpiCard
          label="Active SAE Alerts" value="2 Flags" accent={CRIMSON} icon={ShieldAlert}
          badge="RRT Notified"
          sub="Schistosomiasis (PZQ-B2291) and Lymphatic Filariasis (IVM-A1180)."
        />
        <KpiCard
          label="Data Integrity Score" value={`${integrity}%`} accent={EMERALD} icon={BadgeCheck}
          badge={`Isolation Forest · ${quarantined || 1} quarantined`}
          sub="Velocity, GPS accuracy and pattern-repetition anomaly screening."
        />
      </div>

      {/* Modules */}
      <Tabs defaultValue="a" className="mt-4">
        <TabsList className="h-auto flex-wrap border border-white/10 bg-white/5">
          <TabsTrigger value="a" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-slate-50">
            <MapPin className="mr-1 h-3.5 w-3.5" /> A · Spatial &amp; Rerouting
          </TabsTrigger>
          <TabsTrigger value="b" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-slate-50">
            <Bot className="mr-1 h-3.5 w-3.5" /> B · Refusal NLP
          </TabsTrigger>
          <TabsTrigger value="c" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-slate-50">
            <Siren className="mr-1 h-3.5 w-3.5" /> C · Pharmacovigilance
          </TabsTrigger>
          <TabsTrigger value="d" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-slate-50">
            <Droplets className="mr-1 h-3.5 w-3.5" /> D · WASH Risk Matrix
          </TabsTrigger>
          <TabsTrigger value="e" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-slate-50">
            <ShieldAlert className="mr-1 h-3.5 w-3.5" /> E · Enumerator Integrity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="mt-4"><SpatialModule onDispatch={() => setDispatchOpen(true)} /></TabsContent>
        <TabsContent value="b" className="mt-4"><NlpModule onBrief={() => setBriefOpen(true)} /></TabsContent>
        <TabsContent value="c" className="mt-4"><SaeModule onEmergency={() => setSaeOpen(true)} /></TabsContent>
        <TabsContent value="d" className="mt-4">
          <WashModule
            onExport={() =>
              toast({
                title: "WASH priority list exported",
                description: `${WASH_HOTSPOTS.length} geo-targeted communities pushed to the Ministry of Water Resources partner queue.`,
              })
            }
          />
        </TabsContent>
        <TabsContent value="e" className="mt-4"><IntegrityModule rows={anomalies} onDecide={decide} /></TabsContent>
      </Tabs>

      {/* Coldspot dialog */}
      <Dialog open={coldspotOpen} onOpenChange={setColdspotOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Predicted coverage-deficit wards</DialogTitle>
            <DialogDescription>DBSCAN density clusters with Bayesian coverage posterior below the campaign target.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {COLDSPOTS.map((c) => (
              <div key={c.ward} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                <div>
                  <p className="font-medium">{c.lga} → {c.ward}</p>
                  <p className="text-xs text-muted-foreground">{c.state} State · {c.households} households · {c.teams} team(s)</p>
                </div>
                <Badge variant={c.progress < 40 ? "destructive" : "secondary"}>{c.progress}% progress</Badge>
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
              SMS + push instruction to {COLDSPOTS.length} ward supervisors covering {COLDSPOTS.reduce((s, c) => s + c.households, 0)} households.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Instruction message</Label>
            <Textarea rows={4} value={dispatchMsg} onChange={(e) => setDispatchMsg(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Recipients: {COLDSPOTS.map((c) => `${c.ward} (${c.teams})`).join(" · ")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setDispatchOpen(false);
                toast({
                  title: "Field teams dispatched",
                  description: `${COLDSPOTS.length} supervisors notified by SMS and push. Rerouting acknowledgements will stream into the map.`,
                });
              }}
            >
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
            <DialogDescription>Auto-generated from ward-level NLP topic and sentiment distribution.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[45vh] space-y-3 overflow-y-auto text-sm">
            {WARD_NLP.map((w) => (
              <div key={w.ward} className="rounded-lg border p-3">
                <p className="text-xs font-semibold">{w.ward} — counter "{w.dominant}"</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Radio spot (Hausa/local):</span>{" "}
                  {w.dominant === "Fear of side effects"
                    ? "Explain that mild, short-lived reactions mean the medicine is working; name a trusted local survivor."
                    : w.dominant === "Religious / Mistrust"
                      ? "Feature the district imam/pastor endorsing the campaign alongside the FLHF officer-in-charge."
                      : w.dominant === "No breakfast"
                        ? "Announce that CDDs will distribute after the morning meal; advise households to eat before 9am."
                        : "Announce a revised evening distribution window after farm hours."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Village-head mobilisation:</span> convene ward heads 24h before the
                  re-sweep; target {w.share}% of refusals attributable to this driver.
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setBriefOpen(false);
                toast({ title: "Advocacy brief generated", description: `${WARD_NLP.length} ward-specific communication packs queued for the SBC team.` });
              }}
            >
              <Megaphone className="mr-1.5 h-4 w-4" /> Publish to SBC team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Emergency SAE dialog */}
      <Dialog open={saeOpen} onOpenChange={setSaeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Siren className="h-4 w-4" /> Trigger emergency RRT &amp; quarantine batch
            </DialogTitle>
            <DialogDescription>
              This halts distribution of batch {SAE_STREAM[0].batch} across all linked FLHFs and pages the Rapid Response Team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <p className="font-semibold">Emergency dispatch list</p>
            {[
              "State Epidemiologist — +234 803 000 1122",
              "NTD Programme Manager — +234 805 442 9910",
              "RRT Clinical Lead, Sugum PHC — +234 811 220 7741",
              "NAFDAC Pharmacovigilance Desk — +234 700 623 3221",
            ].map((c) => <p key={c} className="text-muted-foreground">{c}</p>)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaeOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setSaeOpen(false);
                toast({
                  variant: "destructive",
                  title: "RRT triggered · batch quarantined",
                  description: `Batch ${SAE_STREAM[0].batch} locked at 4 FLHFs. 4 emergency contacts paged; incident SAE-1042 escalated.`,
                });
              }}
            >
              <AlertTriangle className="mr-1.5 h-4 w-4" /> Confirm emergency action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
