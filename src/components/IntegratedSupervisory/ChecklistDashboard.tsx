import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Activity, AlertTriangle, ClipboardCheck, Droplets, Home, Loader2, MapPin,
  PlayCircle, RefreshCw, Settings2, ShieldAlert, UserCheck, Users,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { KoboCache } from "./koboClient";
import {
  buildChecklistDataset, resolveChecklistValue, splitMulti,
} from "./checklistSchema";
import ChecklistFilters, {
  applyChecklistFilters, EMPTY_FILTERS, type ChecklistFilterState,
} from "./ChecklistFilters";
import {
  StatusCommunityTables, StatusDrilldownDialog, useStatusDrilldown,
} from "./ChecklistStatusTables";


const PALETTE = [
  "hsl(214,80%,45%)", "hsl(160,60%,40%)", "hsl(35,90%,50%)", "hsl(350,70%,52%)",
  "hsl(265,55%,55%)", "hsl(190,65%,42%)", "hsl(95,45%,42%)", "hsl(20,75%,52%)",
  "hsl(320,50%,50%)",
];

/** Semantic colours for the Status of MDA bar chart. */
const MDA_STATUS_COLORS: { match: RegExp; color: string }[] = [
  { match: /complete/i, color: "hsl(142,71%,38%)" },   // green
  { match: /not\s*start|no[t]?\s*commenc|yet\s*to/i, color: "hsl(0,72%,48%)" },  // red
  { match: /halt|stopp|suspend|paus/i, color: "hsl(45,95%,50%)" },  // yellow
  { match: /ongoing|on-?going|progress|started|commenc/i, color: "hsl(214,85%,48%)" }, // blue
];
const mdaStatusColor = (name: string) =>
  MDA_STATUS_COLORS.find((c) => c.match.test(name))?.color ?? "hsl(215,15%,55%)";

const GEO_DENOM_KEY = "isc.geoCoverageDenominator";

const yes = (v: unknown) => String(v ?? "").trim().toLowerCase() === "yes";


function tally(values: unknown[], field: string) {
  const m = new Map<string, number>();
  for (const v of values) {
    if (v == null || v === "") continue;
    const label = resolveChecklistValue(field, v) || "—";
    m.set(label, (m.get(label) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function tallyMulti(values: unknown[], field: string) {
  const m = new Map<string, number>();
  for (const v of values) {
    for (const code of splitMulti(v)) {
      const label = resolveChecklistValue(field, code) || code;
      m.set(label, (m.get(label) ?? 0) + 1);
    }
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

const Kpi = ({
  icon: Icon, label, value, sub, tone, action,
}: { icon: React.ElementType; label: string; value: string; sub?: string; tone: string; action?: React.ReactNode }) => (
  <div className={`relative rounded-xl p-4 text-white shadow-card transition-transform duration-300 hover:-translate-y-1 ${tone}`}>
    {action}
    <div className="flex items-center gap-1.5 mb-1.5 pr-6">
      <Icon className="h-4 w-4" />
      <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide leading-tight">{label}</p>
    </div>
    <p className="font-display text-2xl sm:text-3xl font-bold leading-none">{value}</p>
    {sub && <p className="mt-1.5 text-[11px] font-medium text-white/85">{sub}</p>}
  </div>
);


const Panel = ({
  title, icon: Icon, children, right,
}: { title: string; icon: React.ElementType; children: React.ReactNode; right?: React.ReactNode }) => (
  <Card className="overflow-hidden">
    <CardHeader className="py-3 px-4 border-b bg-muted/40 flex-row items-center justify-between space-y-0">
      <CardTitle className="text-sm font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </CardTitle>
      {right}
    </CardHeader>
    <CardContent className="p-4">{children}</CardContent>
  </Card>
);

const Empty = () => (
  <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">No data yet</div>
);

function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={86} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function HBarChart({ data, color = PALETTE[0] }: { data: { name: string; value: number }[]; color?: string }) {
  if (data.length === 0) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10 }} />
        <Tooltip />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vertical bar chart with semantic per-status colours. */
function StatusBarChart({
  data, onSelect,
}: { data: { name: string; value: number }[]; onSelect?: (name: string) => void }) {
  if (data.length === 0) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: 4, right: 12, top: 12 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} height={48} angle={-12} textAnchor="end" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => [`${v} submission${v === 1 ? "" : "s"} — click to drill down`, "Count"]} />
        <Bar
          dataKey="value"
          radius={[6, 6, 0, 0]}
          maxBarSize={72}
          cursor={onSelect ? "pointer" : undefined}
          onClick={(d: any) => onSelect?.(String(d?.name ?? d?.payload?.name ?? ""))}
        >
          {data.map((d, i) => <Cell key={i} fill={mdaStatusColor(d.name)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface PerfRow {
  name: string;
  submissions: number;
  respondents: number;
  avgRespondents: number;
  days: number;
}

/** Submissions / respondents / average / days-worked table. */
function PerformanceTable({ rows, headLabel }: { rows: PerfRow[]; headLabel: string }) {
  if (rows.length === 0) return <Empty />;
  const totals = rows.reduce(
    (a, r) => ({ s: a.s + r.submissions, r: a.r + r.respondents, d: a.d + r.days }),
    { s: 0, r: 0, d: 0 },
  );
  return (
    <div className="max-h-[340px] overflow-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 sticky top-0 z-10">
          <tr>
            <th className="text-left px-2 py-2 font-semibold">{headLabel}</th>
            <th className="text-right px-2 py-2 font-semibold">Checklists</th>
            <th className="text-right px-2 py-2 font-semibold">Respondents</th>
            <th className="text-right px-2 py-2 font-semibold">Avg / checklist</th>
            <th className="text-right px-2 py-2 font-semibold">Days worked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t hover:bg-muted/30">
              <td className="px-2 py-1.5 font-medium">{r.name}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.submissions.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.respondents.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{r.avgRespondents.toFixed(1)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.days.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/50 sticky bottom-0">
          <tr className="border-t font-semibold">
            <td className="px-2 py-1.5">Total</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{totals.s.toLocaleString()}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{totals.r.toLocaleString()}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{totals.s ? (totals.r / totals.s).toFixed(1) : "0.0"}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{totals.d.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Group parents by a field and compute performance metrics. */
function performanceBy(
  parents: Record<string, unknown>[],
  field: string,
): PerfRow[] {
  const m = new Map<string, { subs: number; resp: number; days: Set<string> }>();
  for (const p of parents) {
    const name = resolveChecklistValue(field, p[field]) || "Unspecified";
    const rec = m.get(name) ?? { subs: 0, resp: 0, days: new Set<string>() };
    rec.subs += 1;
    rec.resp += Number(p.respondent_count) || 0;
    const t = String(p._submission_time ?? "").slice(0, 10);
    if (t) rec.days.add(t);
    m.set(name, rec);
  }
  return [...m.entries()]
    .map(([name, r]) => ({
      name,
      submissions: r.subs,
      respondents: r.resp,
      avgRespondents: r.subs ? r.resp / r.subs : 0,
      days: r.days.size,
    }))
    .sort((a, b) => b.submissions - a.submissions);
}

/** Editable denominator control for the Geographic Coverage KPI. */
function CoverageTargetDialog({
  value, onSave,
}: { value: number | null; onSave: (v: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  useEffect(() => { if (open) setDraft(value != null ? String(value) : ""); }, [open, value]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="absolute top-2 right-2 rounded-md bg-white/20 p-1 text-white hover:bg-white/30 transition-colors"
          aria-label="Set total communities targeted"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Geographic coverage target</DialogTitle>
          <DialogDescription>
            Enter the total number of communities targeted for this campaign. Coverage is
            computed as communities visited ÷ communities targeted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="geo-denominator">Total communities targeted</Label>
          <Input
            id="geo-denominator"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="e.g. 1200"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => { onSave(null); setOpen(false); }}>Clear</Button>
          <Button
            onClick={() => {
              const n = Number(draft);
              onSave(draft.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : Math.round(n));
              setOpen(false);
            }}
          >
            Save target
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



export default function ChecklistDashboard({
  cache, onRefresh, syncing,
}: { cache: KoboCache | null; onRefresh?: () => void; syncing?: boolean }) {
  const { parents: allParents, respondents: allRespondents } = useMemo(
    () => buildChecklistDataset(cache?.results ?? []),
    [cache],
  );

  const [filters, setFilters] = useState<ChecklistFilterState>({ ...EMPTY_FILTERS });
  const parents = useMemo(() => applyChecklistFilters(allParents, filters), [allParents, filters]);
  const parentKeys = useMemo(
    () => new Set(parents.map((p) => `${p._uuid ?? ""}|${p._id ?? ""}`)),
    [parents],
  );
  const respondents = useMemo(
    () => allRespondents.filter((r) => parentKeys.has(`${r.parent_uuid ?? ""}|${r.parent_id ?? ""}`)),
    [allRespondents, parentKeys],
  );

  const drill = useStatusDrilldown();
  const drillRows = useMemo(
    () => (drill.status
      ? parents.filter((p) => (resolveChecklistValue("Status_of_MDA", p.Status_of_MDA) || String(p.Status_of_MDA ?? "") || "—") === drill.status)
      : []),
    [parents, drill.status],
  );

  const [geoTarget, setGeoTarget] = useState<number | null>(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(GEO_DENOM_KEY) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const saveGeoTarget = (v: number | null) => {
    setGeoTarget(v);
    try {
      if (v == null) window.localStorage.removeItem(GEO_DENOM_KEY);
      else window.localStorage.setItem(GEO_DENOM_KEY, String(v));
    } catch { /* storage unavailable */ }
  };

  const monitorPerf = useMemo(
    () => performanceBy(parents, "Independent_Monitor_s_Name"),
    [parents],
  );
  const designationPerf = useMemo(() => performanceBy(parents, "Designation"), [parents]);



  const kpi = useMemo(() => {
    const states = new Set<string>(), lgas = new Set<string>(), communities = new Set<string>(), wards = new Set<string>();
    let started = 0, notStarted = 0, sae = 0;
    for (const p of parents) {
      if (p.State) states.add(String(p.State));
      if (p.LGA) lgas.add(`${p.State}|${p.LGA}`);
      if (p.Ward) wards.add(`${p.LGA}|${p.Ward}`);
      if (p.COMMUNITIES) {
        // deduplicate community names within the same State|LGA|Ward
        communities.add(
          `${String(p.State ?? "").trim().toLowerCase()}|${String(p.LGA ?? "").trim().toLowerCase()}|${String(p.Ward ?? "").trim().toLowerCase()}|${String(p.COMMUNITIES).trim().toLowerCase()}`,
        );
      }
      if (String(p.has_treatment_commenced ?? "").toLowerCase() === "yes") started++;
      else if (String(p.has_treatment_commenced ?? "").toLowerCase() === "no") notStarted++;
      if (yes(p.Any_SAE_Complain)) sae++;
    }
    return {
      total: parents.length,
      states: states.size, lgas: lgas.size, wards: wards.size, communities: communities.size,
      respondents: respondents.length, started, notStarted, sae,
    };
  }, [parents, respondents]);

  const campaign = useMemo(() => tally(parents.map((p) => p.MDA_Campaign_Type), "MDA_Campaign_Type"), [parents]);
  const inventory = useMemo(() => tally(parents.map((p) => p.Is_Medicine_Inventory_Availabl), "Is_Medicine_Inventory_Availabl"), [parents]);
  const register = useMemo(() => tally(parents.map((p) => p.Is_Treatment_Register_Availabl), "Is_Treatment_Register_Availabl"), [parents]);
  const registerCorrect = useMemo(() => tally(parents.map((p) => p.Are_entries_in_Register_CORRECT), "Are_entries_in_Register_CORRECT"), [parents]);
  const sufficiency = useMemo(() => tally(parents.map((p) => p.Does_CDI_CDD_have_sufficient_d), "Does_CDI_CDD_have_sufficient_d"), [parents]);
  const mdaStatus = useMemo(() => tally(parents.map((p) => p.Status_of_MDA), "Status_of_MDA"), [parents]);

  const latrine = useMemo(() => tally(respondents.map((r) => r.What_type_of_Laterin_our_school_household), "What_type_of_Laterin_our_school_household"), [respondents]);
  const waterHh = useMemo(() => tallyMulti(respondents.map((r) => r.What_water_source_i_your_class_household), "What_water_source_i_your_class_household"), [respondents]);
  const waste = useMemo(() => tallyMulti(respondents.map((r) => r.How_do_you_Dispose_D_your_class_household), "How_do_you_Dispose_D_your_class_household"), [respondents]);
  const waterWithin = useMemo(() => tally(parents.map((p) => p.Are_all_sources_of_water_used_), "Are_all_sources_of_water_used_"), [parents]);

  const designation = useMemo(() => tally(parents.map((p) => p.Designation), "Designation"), [parents]);
  const dosePole = useMemo(() => tally(parents.map((p) => p.Is_Dose_Pole_Available), "Is_Dose_Pole_Available"), [parents]);
  const dosePoleKnow = useMemo(() => tally(parents.map((p) => p.Does_CDI_CDD_Know_how_to_use_Dose_Pole), "Does_CDI_CDD_Know_how_to_use_Dose_Pole"), [parents]);
  const posters = useMemo(() => tally(parents.map((p) => p.Are_any_NTD_posters_the_School_Community), "Are_any_NTD_posters_the_School_Community"), [parents]);
  const cddTrained = useMemo(() => tally(parents.map((p) => p.Has_CDI_CDD_been_trained), "Has_CDI_CDD_been_trained"), [parents]);
  const stipends = useMemo(() => tally(parents.map((p) => p.Did_CDI_CDD_receive_stipends), "Did_CDI_CDD_receive_stipends"), [parents]);
  const cddTotal = useMemo(
    () => parents.reduce((s, p) => s + (Number(p.how_many_teachers_cdds_school_) || 0), 0),
    [parents],
  );

  const offered = useMemo(() => tally(respondents.map((r) => r.Were_you_OFFERED_the_medicine_s), "Were_you_OFFERED_the_medicine_s"), [respondents]);
  const swallowed = useMemo(() => tally(respondents.map((r) => r.swallow), "swallow"), [respondents]);
  const refusalReasons = useMemo(() => tally(respondents.map((r) => r.Reason_respondent_DID_NOT_SWAL), "Reason_respondent_DID_NOT_SWAL"), [respondents]);

  const saeTypes = useMemo(() => tallyMulti(parents.map((p) => p.If_YES_what_type_of_SAE), "If_YES_what_type_of_SAE"), [parents]);
  const saeRows = useMemo(
    () => parents.filter((p) => yes(p.Any_SAE_Complain)),
    [parents],
  );

  const trend = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of parents) {
      const t = String(p._submission_time ?? "");
      if (!t) continue;
      const d = t.slice(0, 10);
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30)
      .map(([date, visits]) => ({ date: date.slice(5), visits }));
  }, [parents]);

  const topLgas = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of parents) {
      const k = String(p.LGA ?? "").trim();
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [parents]);

  return (
    <div className="space-y-4">
      <ChecklistFilters parents={allParents} value={filters} onChange={setFilters} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi icon={ClipboardCheck} label="Total Submissions" value={kpi.total.toLocaleString()} sub="Supervisory checklists" tone="bg-[hsl(214,80%,40%)]" />
        <Kpi
          icon={Home}
          label="Communities Visited"
          value={kpi.communities.toLocaleString()}
          sub={`Deduplicated · ${kpi.wards} wards · ${kpi.lgas} LGAs`}
          tone="bg-[hsl(190,65%,34%)]"
        />
        <Kpi
          icon={MapPin}
          label="Geographic Coverage"
          value={geoTarget ? `${((kpi.communities / geoTarget) * 100).toFixed(1)}%` : "—"}
          sub={
            geoTarget
              ? `${kpi.communities.toLocaleString()} of ${geoTarget.toLocaleString()} communities · ${kpi.lgas} LGAs`
              : `${kpi.communities.toLocaleString()} communities visited · set target →`
          }
          tone="bg-[hsl(160,55%,35%)]"
          action={<CoverageTargetDialog value={geoTarget} onSave={saveGeoTarget} />}
        />

        <Kpi icon={Users} label="Respondents Reached" value={kpi.respondents.toLocaleString()} sub={`${cddTotal.toLocaleString()} CDDs counted`} tone="bg-[hsl(265,50%,48%)]" />
        <Kpi icon={PlayCircle} label="Treatment Commenced" value={kpi.started.toLocaleString()} sub={`${kpi.notStarted.toLocaleString()} not started`} tone="bg-[hsl(35,85%,45%)]" />
        <Kpi icon={ShieldAlert} label="SAE Alerts" value={kpi.sae.toLocaleString()} sub={kpi.sae > 0 ? "Requires review" : "None reported"} tone={kpi.sae > 0 ? "bg-[hsl(350,70%,45%)] animate-pulse" : "bg-[hsl(215,15%,45%)]"} />
      </div>


      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {cache ? `Synced ${new Date(cache.fetchedAt).toLocaleString()} · ${kpi.total} submissions · ${kpi.respondents} flattened respondent records` : "No Kobo data cached yet — run a sync."}
        </p>
        {onRefresh && (
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Refresh
          </Button>
        )}
      </div>

      {/* SAE monitor */}
      <Card className={saeRows.length > 0 ? "border-rose-300 bg-rose-50/60" : ""}>
        <CardHeader className="py-3 px-4 border-b flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${saeRows.length ? "text-rose-600" : "text-muted-foreground"}`} />
            Adverse Events Monitor
          </CardTitle>
          <Badge variant={saeRows.length ? "destructive" : "outline"}>{saeRows.length} SAE report{saeRows.length === 1 ? "" : "s"}</Badge>
        </CardHeader>
        <CardContent className="p-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">SAE types reported</p>
            {saeTypes.length ? <HBarChart data={saeTypes} color="hsl(350,70%,52%)" /> : <Empty />}
          </div>
          <div className="max-h-[280px] overflow-y-auto rounded-md border bg-background">
            {saeRows.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No SAE complaints reported.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-semibold">Community</th>
                    <th className="text-left px-2 py-1.5 font-semibold">LGA</th>
                    <th className="text-left px-2 py-1.5 font-semibold">Type(s)</th>
                    <th className="text-left px-2 py-1.5 font-semibold">Other</th>
                  </tr>
                </thead>
                <tbody>
                  {saeRows.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5">{String(p.COMMUNITIES ?? "—")}</td>
                      <td className="px-2 py-1.5">{String(p.LGA ?? "—")}</td>
                      <td className="px-2 py-1.5">{resolveChecklistValue("If_YES_what_type_of_SAE", p.If_YES_what_type_of_SAE) || "—"}</td>
                      <td className="px-2 py-1.5">{String(p.Specify_the_OTHER_type_of_SAE ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Campaign & inventory */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="MDA Campaign Type" icon={Activity}><DonutChart data={campaign} /></Panel>
        <Panel title="Medicine Inventory Available" icon={ClipboardCheck}><DonutChart data={inventory} /></Panel>
        <Panel title="Medicine Sufficiency" icon={ClipboardCheck}><DonutChart data={sufficiency} /></Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Treatment Register Available" icon={ClipboardCheck}><DonutChart data={register} /></Panel>
        <Panel title="Register Entries Correct" icon={ClipboardCheck}><DonutChart data={registerCorrect} /></Panel>
      </div>

      <Panel
        title="Status of MDA"
        icon={Activity}
        right={
          <div className="flex items-center gap-2.5 text-[10px] font-medium text-muted-foreground">
            {[["Completed", "hsl(142,71%,38%)"], ["Ongoing", "hsl(214,85%,48%)"], ["Halted", "hsl(45,95%,50%)"], ["Not Started", "hsl(0,72%,48%)"]].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} /> {l}
              </span>
            ))}
          </div>
        }
      >
        <StatusBarChart data={mdaStatus} onSelect={(n) => n && drill.open(n)} />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Tip: click any bar to drill down into the exact checklist records behind that status.
        </p>
      </Panel>

      <StatusDrilldownDialog statusLabel={drill.status} rows={drillRows} onClose={drill.close} />

      {/* Community status registers */}
      <StatusCommunityTables parents={parents} />

      {/* Field-worker accountability */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Independent Monitor Performance" icon={UserCheck}>
          <PerformanceTable rows={monitorPerf} headLabel="Independent Monitor's Name" />
        </Panel>
        <Panel title="Performance by Designation" icon={Users}>
          <PerformanceTable rows={designationPerf} headLabel="Designation" />
        </Panel>
      </div>



      {/* Supervision & CDD engagement */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Supervision Visit Trend" icon={Activity}>
          {trend.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="visits" stroke={PALETTE[0]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Supervisor Designation Mix" icon={Users}><DonutChart data={designation} /></Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Panel title="CDDs Trained" icon={Users}><DonutChart data={cddTrained} /></Panel>
        <Panel title="CDD Stipends Received" icon={Users}><DonutChart data={stipends} /></Panel>
        <Panel title="Dose Pole Available" icon={ClipboardCheck}><DonutChart data={dosePole} /></Panel>
        <Panel title="CDD Knows Dose Pole Use" icon={ClipboardCheck}><DonutChart data={dosePoleKnow} /></Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="NTD Posters Displayed" icon={ClipboardCheck}><DonutChart data={posters} /></Panel>
        <Panel title="Medicines Offered (Respondents)" icon={Users}><DonutChart data={offered} /></Panel>
        <Panel title="Medicines Swallowed (Respondents)" icon={Users}><DonutChart data={swallowed} /></Panel>
      </div>

      {/* WASH */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Latrine Type (Households)" icon={Droplets}><HBarChart data={latrine} color={PALETTE[1]} /></Panel>
        <Panel title="Household Water Sources" icon={Droplets}><HBarChart data={waterHh} color={PALETTE[5]} /></Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Domestic Dirty-Water Disposal" icon={Droplets}><HBarChart data={waste} color={PALETTE[2]} /></Panel>
        <Panel title="Community Water Source Proximity" icon={Droplets}><DonutChart data={waterWithin} /></Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top LGAs by Supervision Volume" icon={MapPin}><HBarChart data={topLgas} /></Panel>
        <Panel title="Reasons for Not Swallowing" icon={AlertTriangle}><HBarChart data={refusalReasons} color={PALETTE[3]} /></Panel>
      </div>
    </div>
  );
}
