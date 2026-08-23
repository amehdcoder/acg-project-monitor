/**
 * Evidence & Pattern Intelligence — Integrated MDA Supervisory Checklist.
 *
 * Four disciplined readings of the same synced KoboToolbox data:
 *   1. Daily new evidence, stacked until an identity becomes undeniable.
 *   2. Multiple (logistic) regression on why Status of MDA ≠ Completed.
 *   3. State / LGA / Ward post-mortem: what worked, what failed, why.
 *   4. Signal vs noise — decoys stripped, only defensible facts kept.
 */
import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, BellRing, BellOff, BrainCircuit, CheckCircle2, Columns3, Filter,
  FileSpreadsheet, FileText, Layers, Microscope, RefreshCw, Scale, ShieldCheck,
  Sparkles, TrendingDown, TrendingUp, XCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  buildEvidenceLedger, buildGeoVerdicts, compareUnits, distillFacts,
  geoUnitId, runCompletionRegression,
  type EvidenceFact, type GeoVerdict, type MdaClass, type Row,
} from "@/lib/isc/evidencePatterns";
import { exportEvidenceLedgerCSV, exportEvidenceLedgerPDF } from "@/lib/isc/evidenceLedgerExport";
import { useEvidenceWatch } from "@/hooks/useEvidenceWatch";
import ChartRecordsDialog, { type ChartDrillSpec } from "./ChartRecordsDialog";

/** Every tab receives this so any insight can open the records behind it. */
type Drill = (spec: ChartDrillSpec) => void;

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const pval = (p: number) => (p < 0.001 ? "p<0.001" : `p=${p.toFixed(3)}`);

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 11,
} as const;

const SectionNote = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
    {children}
  </p>
);

/* ------------------------------------------------------- 1. daily evidence */

function EvidenceLedgerTab({
  parents, drill, onRefresh,
}: { parents: Row[]; drill: Drill; onRefresh?: () => void | Promise<void> }) {
  const ledger = useMemo(() => buildEvidenceLedger(parents), [parents]);
  const [showAll, setShowAll] = useState(false);
  const watch = useEvidenceWatch(ledger, onRefresh);

  const openFact = (f: EvidenceFact) =>
    drill({
      title: f.theme,
      category: f.place,
      color: f.severity === "critical" ? "#DC2626" : f.severity === "positive" ? "#128B5B" : "#D97706",
      rows: f.rows,
      note: `${f.occurrences} sighting${f.occurrences === 1 ? "" : "s"} across ${f.days.length} field day${f.days.length === 1 ? "" : "s"} (${f.notes.map((n) => `${n.day} ×${n.count}`).join(", ")})`,
    });

  const openDay = (day: string) => {
    const rows = parents.filter((p) => String(p._end ?? p._submission_time ?? p.end ?? "").slice(0, 10) === day);
    drill({ title: "Checklists submitted", category: day, color: "#1668DC", rows, note: "All submissions logged on this field day" });
  };

  if (!ledger.days.length) {
    return <SectionNote>No dated checklists yet — the ledger builds itself as field days come in.</SectionNote>;
  }

  const chart = ledger.days.map((d) => ({
    day: d.day.slice(5),
    fullDay: d.day,
    "New evidence": d.newFacts,
    "Corroborations": d.repeatFacts,
    Cumulative: d.cumulative,
  }));
  const last = ledger.days[ledger.days.length - 1];
  const shown = showAll ? ledger.undeniable : ledger.undeniable.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => exportEvidenceLedgerCSV(ledger)}>
          <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Ledger CSV
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => exportEvidenceLedgerPDF(ledger)}>
          <FileText className="mr-1 h-3.5 w-3.5" /> Ledger PDF
        </Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <Switch id="ev-watch" checked={watch.enabled} onCheckedChange={watch.setEnabled} />
          <label htmlFor="ev-watch" className="flex items-center gap-1 text-[11px] font-medium">
            {watch.enabled ? <BellRing className="h-3.5 w-3.5 text-emerald-600" /> : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}
            Daily refresh &amp; new-evidence alerts
          </label>
        </div>
        {watch.enabled && !watch.notificationsGranted && (
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => void watch.requestNotifications()}>
            Enable device notifications
          </Button>
        )}
        {onRefresh && (
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => void watch.refreshNow()} disabled={watch.refreshing}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${watch.refreshing ? "animate-spin" : ""}`} /> Refresh now
          </Button>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {watch.lastRefresh ? `Last checked ${new Date(watch.lastRefresh).toLocaleString()}` : "Not checked yet"}
        </span>
      </div>

      {watch.unseen.length > 0 && (
        <div className="rounded-lg border border-rose-300 bg-rose-50/60 p-3 dark:bg-rose-950/20">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
              <Sparkles className="h-3.5 w-3.5" /> {watch.unseen.length} finding{watch.unseen.length === 1 ? "" : "s"} you have not reviewed
            </p>
            <Button size="sm" variant="outline" className="ml-auto h-6 text-[10px]" onClick={watch.acknowledge}>
              Mark all reviewed
            </Button>
          </div>
          <ul className="space-y-1 text-[11px]">
            {watch.unseen.slice(0, 5).map((f) => (
              <li key={f.id}>
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => openFact(f)}>
                  <span className="font-semibold">{f.theme}</span> — {f.place} · first seen {f.firstSeen}
                </button>
              </li>
            ))}
            {watch.unseen.length > 5 && <li className="text-muted-foreground">+{watch.unseen.length - 5} more</li>}
          </ul>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { l: "Field days logged", v: ledger.days.length, tone: "bg-[hsl(214,80%,40%)]" },
          { l: "Distinct findings", v: ledger.facts.length, tone: "bg-[hsl(190,65%,34%)]" },
          { l: "Undeniable (corroborated)", v: ledger.undeniable.length, tone: "bg-[hsl(142,60%,32%)]" },
          { l: `New on ${last.day.slice(5)}`, v: last.newFacts, tone: "bg-[hsl(35,85%,45%)]" },
        ].map((k) => (
          <div key={k.l} className={`rounded-xl p-3 text-white shadow-card ${k.tone}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide">{k.l}</p>
            <p className="font-display text-2xl font-bold leading-none">{k.v.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chart}
            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            onClick={(e: any) => { const d = e?.activePayload?.[0]?.payload?.fullDay; if (d) openDay(d); }}
          >
            <defs>
              <linearGradient id="evNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#DC2626" stopOpacity={0.85} />
                <stop offset="100%" stopColor="#DC2626" stopOpacity={0.15} />
              </linearGradient>
              <linearGradient id="evRep" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1668DC" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#1668DC" stopOpacity={0.12} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} label={{ value: "Findings", angle: -90, position: "insideLeft", fontSize: 10 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="Corroborations" stackId="1" stroke="#1668DC" fill="url(#evRep)" />
            <Area type="monotone" dataKey="New evidence" stackId="1" stroke="#DC2626" fill="url(#evNew)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <SectionNote>
        Red is evidence <strong>never seen on any earlier day</strong> (new place + new problem). Blue is the same
        finding recurring — that is what converts a one-off complaint into an undeniable identity. A finding is
        promoted to <strong>undeniable</strong> once it appears on ≥2 separate field days and ≥3 times in total.
      </SectionNote>

      {ledger.emerging.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:bg-amber-950/20">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Sparkles className="h-3.5 w-3.5" /> Surfaced for the first time on {ledger.latestDay} — not yet corroborated
          </p>
          <ul className="space-y-1 text-[11px]">
            {ledger.emerging.slice(0, 6).map((f) => (
              <li key={f.id}>
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => openFact(f)}>
                  <span className="font-semibold">{f.theme}</span> — {f.place}
                </button>
              </li>
            ))}
            {ledger.emerging.length > 6 && (
              <li className="text-muted-foreground">+{ledger.emerging.length - 6} more awaiting a second sighting</li>
            )}
          </ul>
        </div>
      )}

      <div className="overflow-auto rounded-md border">
        <table className="w-full min-w-[760px] text-xs">
          <thead className="sticky top-0 bg-muted/60">
            <tr>
              <th className="px-2 py-2 text-left font-semibold">Finding</th>
              <th className="px-2 py-2 text-left font-semibold">Location</th>
              <th className="px-2 py-2 text-right font-semibold">Sightings</th>
              <th className="px-2 py-2 text-right font-semibold">Days</th>
              <th className="px-2 py-2 text-left font-semibold">First → last</th>
              <th className="px-2 py-2 text-left font-semibold">Corroboration stack</th>
              <th className="px-2 py-2 text-left font-semibold">Standing</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                Nothing is corroborated yet — every finding has been seen on a single day only.
              </td></tr>
            )}
            {shown.map((f) => (
              <tr key={f.id} className="cursor-pointer border-t hover:bg-primary/5" onClick={() => openFact(f)} title="Open the records behind this finding">
                <td className="px-2 py-1.5 font-medium">{f.theme}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{f.place}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{f.occurrences}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{f.days.length}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{f.firstSeen} → {f.lastSeen}</td>
                <td className="px-2 py-1.5 text-[10px] text-muted-foreground">{f.notes.map((n) => `${n.day.slice(5)} ×${n.count}`).join(" · ")}</td>
                <td className="px-2 py-1.5">
                  <Badge
                    variant="outline"
                    className={
                      f.severity === "positive"
                        ? "border-emerald-500 text-emerald-600"
                        : f.severity === "critical"
                          ? "border-rose-500 text-rose-600"
                          : "border-amber-500 text-amber-600"
                    }
                  >
                    Undeniable
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ledger.undeniable.length > 8 && (
        <Button variant="outline" size="sm" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show top 8" : `Show all ${ledger.undeniable.length} corroborated findings`}
        </Button>
      )}
    </div>
  );
}

/* --------------------------------------------------------- 2. regression */

const TARGETS: { key: "any" | MdaClass; label: string }[] = [
  { key: "any", label: "Any non-completion" },
  { key: "Not started", label: "Not started" },
  { key: "Ongoing", label: "Still ongoing" },
  { key: "Halted", label: "Halted" },
];

const DIAG_STYLE = {
  pass: "border-emerald-500 text-emerald-600",
  warn: "border-amber-500 text-amber-600",
  fail: "border-rose-500 text-rose-600",
} as const;

function RegressionTab({ parents, drill }: { parents: Row[]; drill: Drill }) {
  const [target, setTarget] = useState<"any" | MdaClass>("any");
  const model = useMemo(() => runCompletionRegression(parents, target), [parents, target]);

  const chart = model.terms.slice(0, 10).map((t) => ({
    name: t.label,
    value: Number(t.coef.toFixed(3)),
    or: t.oddsRatio,
    sig: t.significant,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TARGETS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={target === t.key ? "default" : "outline"}
            className="h-7 text-[11px]"
            onClick={() => setTarget(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {model.note ? (
        <SectionNote>{model.note}</SectionNote>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { l: "Records modelled", v: model.n.toLocaleString() },
              { l: "Non-completion rate", v: pct(model.baseRate) },
              { l: "Pseudo R² (McFadden)", v: model.pseudoR2.toFixed(3) },
              { l: "In-sample accuracy", v: pct(model.accuracy) },
            ].map((k) => (
              <div key={k.l} className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k.l}</p>
                <p className="font-display text-xl font-bold">{k.v}</p>
              </div>
            ))}
          </div>

          <div style={{ height: Math.max(240, chart.length * 34 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} horizontal={false} />
                <XAxis
                  type="number" tick={{ fontSize: 10 }}
                  label={{ value: "Regression coefficient (log-odds of NOT completing)", position: "insideBottom", offset: -8, fontSize: 10 }}
                />
                <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 10 }} />
                <ReferenceLine x={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, _n, e: any) => [`β=${v} · odds ×${e?.payload?.or?.toFixed(2)}`, "Effect"]}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: any) => {
                    const t = model.terms.find((x) => x.label === d?.name);
                    if (t) drill({ title: t.label, category: "Risk condition present", color: "#DC2626", rows: t.rowsPresent, note: t.meaning });
                  }}
                >
                  {chart.map((c, i) => (
                    <Cell key={i} fill={c.value >= 0 ? (c.sig ? "#DC2626" : "#F59E0B") : (c.sig ? "#128B5B" : "#94A3B8")} />
                  ))}
                  <LabelList dataKey="or" position="right" formatter={(v: number) => `×${Number(v).toFixed(2)}`} style={{ fontSize: 10, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <SectionNote>
            Multiple logistic regression, all factors entered simultaneously so each effect is adjusted for the
            others. Bars to the right push the community <strong>away</strong> from Completed; bars to the left
            protect completion. Solid red/green = statistically significant (p&lt;0.05); amber/grey = suggestive but
            not yet proven.
          </SectionNote>

          <div className="overflow-auto rounded-md border">
            <table className="w-full min-w-[880px] text-xs">
              <thead className="sticky top-0 bg-muted/60">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">Predictor (risk condition)</th>
                  <th className="px-2 py-2 text-right font-semibold">β</th>
                  <th className="px-2 py-2 text-right font-semibold">Odds ratio (95% CI)</th>
                  <th className="px-2 py-2 text-right font-semibold">p-value</th>
                  <th className="px-2 py-2 text-right font-semibold">VIF</th>
                  <th className="px-2 py-2 text-right font-semibold">Prevalence</th>
                  <th className="px-2 py-2 text-right font-semibold">Fail rate present → absent</th>
                </tr>
              </thead>
              <tbody>
                {model.terms.map((t) => (
                  <tr
                    key={t.key}
                    className={`cursor-pointer border-t hover:bg-primary/5 ${t.significant ? "bg-rose-50/40 dark:bg-rose-950/10" : ""}`}
                    title="Open the records where this condition was present"
                    onClick={() => drill({ title: t.label, category: "Risk condition present", color: "#DC2626", rows: t.rowsPresent, note: t.meaning })}
                  >
                    <td className="px-2 py-1.5">
                      <span className="font-medium">{t.label}</span>
                      <p className="text-[10px] text-muted-foreground">{t.meaning}</p>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{t.coef.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                      ×{t.oddsRatio.toFixed(2)}
                      <span className="ml-1 font-normal text-muted-foreground">({t.ciLow.toFixed(2)}–{t.ciHigh.toFixed(2)})</span>
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${t.significant ? "font-semibold text-rose-600" : "text-muted-foreground"}`}>
                      {pval(t.p)}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${t.vif >= 10 ? "font-semibold text-rose-600" : t.vif >= 5 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {Number.isFinite(t.vif) ? t.vif.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pct(t.prevalence)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {pct(t.failWhenPresent)} → {pct(t.failWhenAbsent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {model.diagnostics && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Model diagnostics — can these odds ratios be trusted?
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {model.diagnostics.checks.map((c) => (
                  <div key={c.key} className="rounded-md border bg-background/70 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold">{c.label}</span>
                      <Badge variant="outline" className={`text-[9px] ${DIAG_STYLE[c.status]}`}>
                        {c.status === "pass" ? "OK" : c.status === "warn" ? "Caution" : "Weak"}
                      </Badge>
                    </div>
                    <p className="font-display text-sm font-bold tabular-nums">{c.value}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{c.explanation}</p>
                  </div>
                ))}
              </div>

              <p className="mt-3 mb-1 text-[11px] font-semibold">Calibration curve — predicted vs observed non-completion</p>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={model.diagnostics.calibration.map((b) => ({
                      bin: `B${b.bin}`,
                      Predicted: Number((b.predicted * 100).toFixed(1)),
                      Observed: Number((b.observed * 100).toFixed(1)),
                      n: b.n,
                    }))}
                    margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="bin" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n) => [`${v}%`, String(n)]} />
                    <Bar dataKey="Predicted" fill="#94A3B8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Observed" fill="#1668DC" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <SectionNote>
                Records are ranked by predicted risk and split into equal bands. When the blue (observed) bars track the
                grey (predicted) bars, the model's probabilities are honest. Brier score{" "}
                <strong>{model.diagnostics.brier.toFixed(3)}</strong> (lower is better) and AUC{" "}
                <strong>{model.diagnostics.auc.toFixed(3)}</strong> summarise accuracy and ranking power. Assumptions
                checked here: adequate events per variable, no crippling multicollinearity, no complete separation,
                convergence, calibration and missing-data load. Independence of observations is assumed — each row is one
                community visit.
              </SectionNote>
            </div>
          )}

          {model.terms.filter((t) => t.significant && t.coef > 0).length > 0 && (
            <div className="rounded-lg border border-rose-300 bg-rose-50/60 p-3 dark:bg-rose-950/20">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                <BrainCircuit className="h-3.5 w-3.5" /> Model verdict
              </p>
              <p className="text-[11px] leading-relaxed">
                Holding everything else constant, the strongest proven drivers of a non-completed MDA are{" "}
                {model.terms.filter((t) => t.significant && t.coef > 0).slice(0, 3).map((t, i, arr) => (
                  <span key={t.key}>
                    <strong>{t.label.toLowerCase()}</strong> (odds ×{t.oddsRatio.toFixed(2)}, {pval(t.p)})
                    {i < arr.length - 1 ? (i === arr.length - 2 ? " and " : ", ") : ""}
                  </span>
                ))}
                . Fixing these conditions is the shortest path to completion.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------ 3. geo post-mortem */

const VERDICT_STYLE: Record<GeoVerdict["verdict"], string> = {
  Worked: "border-emerald-500 text-emerald-600",
  Failed: "border-rose-500 text-rose-600",
  Mixed: "border-amber-500 text-amber-600",
  "Too few records": "border-slate-400 text-slate-500",
};

function GeoPostMortemTab({ parents, drill }: { parents: Row[]; drill: Drill }) {
  const [level, setLevel] = useState<GeoVerdict["level"]>("LGA");
  const [only, setOnly] = useState<"all" | "Worked" | "Failed">("all");
  const [minN, setMinN] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const rows = useMemo(() => buildGeoVerdicts(parents, level), [parents, level]);
  const filtered = rows.filter((r) => (only === "all" || r.verdict === only) && r.n >= minN);
  const comparison = useMemo(() => compareUnits(rows, selected), [rows, selected]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 6 ? s : [...s, id]));

  const openUnit = (r: GeoVerdict) =>
    drill({
      title: `${r.level}: ${r.unit}`,
      category: r.verdict,
      color: r.verdict === "Worked" ? "#128B5B" : r.verdict === "Failed" ? "#DC2626" : "#D97706",
      rows: r.rows,
      note: r.why,
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["State", "LGA", "Ward"] as const).map((l) => (
          <Button key={l} size="sm" variant={level === l ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => setLevel(l)}>
            {l}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {(["all", "Worked", "Failed"] as const).map((f) => (
          <Button key={f} size="sm" variant={only === f ? "secondary" : "ghost"} className="h-7 text-[11px]" onClick={() => setOnly(f)}>
            <Filter className="mr-1 h-3 w-3" />{f === "all" ? "All units" : f}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Min records
          <select
            className="h-7 rounded-md border bg-background px-1 text-[11px]"
            value={minN}
            onChange={(e) => setMinN(Number(e.target.value))}
          >
            {[0, 3, 5, 10, 20, 30].map((v) => <option key={v} value={v}>{v || "any"}</option>)}
          </select>
        </label>
        <Button
          size="sm"
          variant={compareMode ? "default" : "outline"}
          className="h-7 text-[11px]"
          onClick={() => setCompareMode((c) => !c)}
        >
          <Columns3 className="mr-1 h-3 w-3" /> Compare {level}s{selected.length ? ` (${selected.length})` : ""}
        </Button>
        {selected.length > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setSelected([])}>Clear selection</Button>
        )}
      </div>

      {compareMode && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-[11px] text-muted-foreground">
            Tick up to six {level.toLowerCase()}s below to place them side by side. Differences are tested with a
            two-proportion z-test, so only genuinely meaningful gaps are highlighted.
          </p>

          {comparison.units.length < 2 ? (
            <p className="text-[11px] font-medium">Select at least two {level.toLowerCase()}s to compare.</p>
          ) : (
            <>
              <div className="overflow-auto rounded-md border bg-background">
                <table className="w-full min-w-[720px] text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold">Metric</th>
                      {comparison.units.map((u) => (
                        <th key={geoUnitId(u)} className="px-2 py-2 text-left font-semibold">{u.unit}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="px-2 py-1.5 text-muted-foreground">Records</td>
                      {comparison.units.map((u) => (
                        <td key={geoUnitId(u)} className="px-2 py-1.5 tabular-nums">
                          <button type="button" className="underline-offset-2 hover:underline" onClick={() => openUnit(u)}>{u.n}</button>
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t">
                      <td className="px-2 py-1.5 text-muted-foreground">Completion (95% CI)</td>
                      {comparison.units.map((u) => (
                        <td key={geoUnitId(u)} className="px-2 py-1.5 tabular-nums">
                          <span className="font-semibold">{pct(u.rate)}</span>{" "}
                          <span className="text-[10px] text-muted-foreground">({pct(u.ciLow)}–{pct(u.ciHigh)})</span>
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t">
                      <td className="px-2 py-1.5 text-muted-foreground">Verdict</td>
                      {comparison.units.map((u) => (
                        <td key={geoUnitId(u)} className="px-2 py-1.5">
                          <Badge variant="outline" className={VERDICT_STYLE[u.verdict]}>{u.verdict}</Badge>
                        </td>
                      ))}
                    </tr>
                    {comparison.factors.slice(0, 10).map((f) => (
                      <tr key={f.key} className={`border-t ${f.significant ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}>
                        <td className="px-2 py-1.5">
                          <span className="font-medium">{f.label}</span>
                          {f.significant && (
                            <Badge variant="outline" className="ml-1 border-amber-500 text-[9px] text-amber-600">
                              Meaningful gap · {pval(f.p)}
                            </Badge>
                          )}
                        </td>
                        {comparison.units.map((u) => {
                          const c = f.byUnit[geoUnitId(u)];
                          const worst = f.worst === geoUnitId(u);
                          const best = f.best === geoUnitId(u);
                          return (
                            <td
                              key={geoUnitId(u)}
                              className={`px-2 py-1.5 tabular-nums ${f.significant && worst ? "font-semibold text-rose-600" : f.significant && best ? "font-semibold text-emerald-600" : ""}`}
                            >
                              {c ? `${pct(c.rate)} (n=${c.n})` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1">
                {comparison.pairs.map((pr) => (
                  <p key={`${pr.a}|${pr.b}`} className={`text-[11px] ${pr.significant ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    <strong>{pr.a.split(" › ").pop()} vs {pr.b.split(" › ").pop()}:</strong> {pr.verdict} ({pval(pr.p)})
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <SectionNote>No {level} meets this filter yet.</SectionNote>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.slice(0, 40).map((r) => (
            <div
              key={`${r.parent}|${r.unit}`}
              className={`rounded-lg border bg-card p-3 shadow-sm ${selected.includes(geoUnitId(r)) ? "ring-2 ring-primary" : ""}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                {compareMode && (
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.includes(geoUnitId(r))}
                    onCheckedChange={() => toggle(geoUnitId(r))}
                    aria-label={`Compare ${r.unit}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <button type="button" className="truncate text-left text-sm font-semibold underline-offset-2 hover:underline" onClick={() => openUnit(r)}>
                    {r.unit}
                  </button>
                  {r.parent && <p className="truncate text-[10px] text-muted-foreground">{r.parent}</p>}
                </div>
                <Badge variant="outline" className={VERDICT_STYLE[r.verdict]}>{r.verdict}</Badge>
              </div>

              <div className="mb-2 flex items-center gap-2">
                <Progress value={r.rate * 100} className="h-2 flex-1" />
                <span className="text-xs font-bold tabular-nums">{pct(r.rate)}</span>
              </div>
              <p className="mb-2 text-[10px] text-muted-foreground">
                {r.completed}/{r.n} completed · 95% CI {pct(r.ciLow)}–{pct(r.ciHigh)} ·{" "}
                <span className={r.lift >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {r.lift >= 0 ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}{" "}
                  {r.lift >= 0 ? "+" : ""}{Math.round(r.lift * 100)} pts vs programme average
                </span>{" "}
                · {pval(r.p)}
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" /> What worked
                  </p>
                  {r.worked.length ? (
                    <ul className="space-y-0.5 text-[10px]">
                      {r.worked.map((w) => <li key={w.label}>{w.label} — {pct(w.rate)} of visits</li>)}
                    </ul>
                  ) : <p className="text-[10px] text-muted-foreground">Nothing consistently in place.</p>}
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-rose-600">
                    <XCircle className="h-3 w-3" /> What failed
                  </p>
                  {r.failed.length ? (
                    <ul className="space-y-0.5 text-[10px]">
                      {r.failed.map((w) => <li key={w.label}>{w.label} — {pct(w.rate)} of visits</li>)}
                    </ul>
                  ) : <p className="text-[10px] text-muted-foreground">No systemic failure detected.</p>}
                </div>
              </div>

              <p className="mt-2 border-t pt-2 text-[10px] leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Why: </strong>{r.why}
              </p>
            </div>
          ))}
        </div>
      )}
      <SectionNote>
        Completion rates carry Wilson 95% confidence intervals and a two-proportion test against the rest of the
        programme, so a small unit with a flashy percentage is never mistaken for a real success or failure.
      </SectionNote>
    </div>
  );
}

/* ---------------------------------------------------- 4. signal vs noise */

function SignalTab({ parents, drill }: { parents: Row[]; drill: Drill }) {
  const d = useMemo(() => distillFacts(parents), [parents]);
  return (
    <div className="space-y-4">
      <SectionNote>
        Every candidate claim is put through three gates before it is allowed to be called a fact:
        sample size ≥ {d.minSample}, effect ≥ 15 percentage points, and significance p &lt; 0.05. Everything that
        fails is shown below as a decoy with the reason it was rejected — loud, but not evidence.
      </SectionNote>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50/50 p-3 dark:bg-emerald-950/20">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <Scale className="h-3.5 w-3.5" /> Undeniable facts ({d.facts.length})
          </p>
          {d.facts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nothing clears all three gates yet. That is itself the finding — the current noise level does not
              justify any programme-wide claim.
            </p>
          ) : (
            <ol className="space-y-2 text-[11px]">
              {d.facts.map((f, i) => (
                <li
                  key={f.statement}
                  className="cursor-pointer rounded-md border bg-background/70 p-2 hover:bg-primary/5"
                  onClick={() => drill({ title: f.statement, category: "Condition present", color: "#128B5B", rows: f.rows, note: f.detail })}
                >
                  <p className="font-semibold">{i + 1}. {f.statement}</p>
                  <p className="text-muted-foreground">{f.detail} {pval(f.p)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-lg border border-slate-300 bg-muted/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Discarded decoys ({d.decoys.length})
          </p>
          <ul className="space-y-2 text-[11px]">
            {d.decoys.map((f) => (
              <li
                key={f.statement}
                className="cursor-pointer rounded-md border bg-background/60 p-2 hover:bg-primary/5"
                onClick={() => drill({ title: f.statement, category: "Condition present", color: "#64748B", rows: f.rows, note: f.detail })}
              >
                <p className="font-medium">{f.statement}</p>
                <p className="text-muted-foreground">{f.detail}</p>
                <Badge variant="outline" className="mt-1 border-slate-400 text-[9px] text-slate-500">
                  Rejected — {f.discardReason}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

export default function EvidenceIntelligencePanel({
  parents, onRefresh,
}: { parents: Row[]; onRefresh?: () => void | Promise<void> }) {
  const [spec, setSpec] = useState<ChartDrillSpec | null>(null);
  const drill: Drill = (s) => setSpec(s);
  return (
    <>
      <Card className="overflow-hidden border-primary/30">
      <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-transparent to-transparent py-3 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Microscope className="h-4 w-4 text-primary" />
          Evidence &amp; Pattern Intelligence
          <Badge variant="outline" className="ml-1 text-[10px] font-normal">
            {parents.length.toLocaleString()} checklists analysed
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <Tabs defaultValue="ledger">
          <TabsList className="mb-3 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
            <TabsTrigger value="ledger" className="text-[11px]"><Layers className="mr-1 h-3.5 w-3.5" />Daily new evidence</TabsTrigger>
            <TabsTrigger value="regression" className="text-[11px]"><BrainCircuit className="mr-1 h-3.5 w-3.5" />Why MDA is not completed</TabsTrigger>
            <TabsTrigger value="geo" className="text-[11px]"><Filter className="mr-1 h-3.5 w-3.5" />What worked / failed</TabsTrigger>
            <TabsTrigger value="signal" className="text-[11px]"><Scale className="mr-1 h-3.5 w-3.5" />Signal vs noise</TabsTrigger>
          </TabsList>
          <TabsContent value="ledger"><EvidenceLedgerTab parents={parents} drill={drill} onRefresh={onRefresh} /></TabsContent>
          <TabsContent value="regression"><RegressionTab parents={parents} drill={drill} /></TabsContent>
          <TabsContent value="geo"><GeoPostMortemTab parents={parents} drill={drill} /></TabsContent>
          <TabsContent value="signal"><SignalTab parents={parents} drill={drill} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
    <ChartRecordsDialog spec={spec} onClose={() => setSpec(null)} />
    </>
  );
}
