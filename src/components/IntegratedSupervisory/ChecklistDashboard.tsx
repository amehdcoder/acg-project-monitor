import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, AlertTriangle, ClipboardCheck, Droplets, Loader2, MapPin,
  PlayCircle, RefreshCw, ShieldAlert, Users,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { KoboCache } from "./koboClient";
import {
  buildChecklistDataset, resolveChecklistValue, splitMulti,
  CHECKLIST_CHOICES,
} from "./checklistSchema";

const PALETTE = [
  "hsl(214,80%,45%)", "hsl(160,60%,40%)", "hsl(35,90%,50%)", "hsl(350,70%,52%)",
  "hsl(265,55%,55%)", "hsl(190,65%,42%)", "hsl(95,45%,42%)", "hsl(20,75%,52%)",
  "hsl(320,50%,50%)",
];

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
  icon: Icon, label, value, sub, tone,
}: { icon: React.ElementType; label: string; value: string; sub?: string; tone: string }) => (
  <div className={`rounded-xl p-4 text-white shadow-card transition-transform duration-300 hover:-translate-y-1 ${tone}`}>
    <div className="flex items-center gap-1.5 mb-1.5">
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

export default function ChecklistDashboard({
  cache, onRefresh, syncing,
}: { cache: KoboCache | null; onRefresh?: () => void; syncing?: boolean }) {
  const { parents, respondents } = useMemo(
    () => buildChecklistDataset(cache?.results ?? []),
    [cache],
  );

  const kpi = useMemo(() => {
    const states = new Set<string>(), lgas = new Set<string>(), communities = new Set<string>(), wards = new Set<string>();
    let started = 0, notStarted = 0, sae = 0;
    for (const p of parents) {
      if (p.State) states.add(String(p.State));
      if (p.LGA) lgas.add(`${p.State}|${p.LGA}`);
      if (p.Ward) wards.add(`${p.LGA}|${p.Ward}`);
      if (p.COMMUNITIES) communities.add(`${p.LGA}|${p.COMMUNITIES}`);
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
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={ClipboardCheck} label="Total Submissions" value={kpi.total.toLocaleString()} sub="Supervisory checklists" tone="bg-[hsl(214,80%,40%)]" />
        <Kpi icon={MapPin} label="Geographic Coverage" value={`${kpi.communities}`} sub={`${kpi.states} states · ${kpi.lgas} LGAs · ${kpi.wards} wards`} tone="bg-[hsl(160,55%,35%)]" />
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Treatment Register Available" icon={ClipboardCheck}><DonutChart data={register} /></Panel>
        <Panel title="Register Entries Correct" icon={ClipboardCheck}><DonutChart data={registerCorrect} /></Panel>
        <Panel title="Status of MDA" icon={Activity}><DonutChart data={mdaStatus} /></Panel>
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
