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
  Activity, AlertTriangle, ClipboardCheck, Droplets, Home, Loader2, MapPin, Maximize2,
  PlayCircle, RefreshCw, Settings2, ShieldAlert, UserCheck, Users,
} from "lucide-react";

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getActiveConnectionId, type KoboCache } from "./koboClient";
import {
  buildChecklistDataset, resolveChecklistValue, splitMulti,
} from "./checklistSchema";
import ChecklistFilters, {
  applyChecklistFilters, EMPTY_FILTERS, type ChecklistFilterState,
} from "./ChecklistFilters";
import { buildIdentityIndex } from "@/lib/isc/actorIdentity";
import { isHumanName } from "@/lib/isc/nameQuality";
import { rosterFromSchema, mergeRoster } from "@/lib/isc/monitorRoster";
import {
  StatusCommunityTables, StatusDrilldownDialog, useStatusDrilldown,
} from "./ChecklistStatusTables";
import ChecklistPredictive from "./ChecklistPredictive";
import ChecklistMaps from "./ChecklistMaps";
import HouseholdCoverageAnalysis from "./HouseholdCoverageAnalysis";
import DataIntegrityBadge from "./DataIntegrityBadge";
import { validate } from "@/lib/isc/chartValidation";
import MlIntelligenceHub from "./MlIntelligenceHub";
import ChecklistPresetBar from "./ChecklistPresetBar";
import CommunityVisitedTable, { buildCommunityVisits } from "./CommunityVisitedTable";
import { BRIGHT_CHART_PALETTE } from "@/lib/charts/brightPalette";
import { InfoDonut, InfoBarH, InfoBarV } from "./charts/InfographicCharts";
import MedicineOfferedGeo from "./MedicineOfferedGeo";



const PALETTE = [
  "#1D4ED8", "#059669", "#F59E0B", "#DC2626",
  "#7C3AED", "#0891B2", "#65A30D", "#EA580C",
  "#DB2777",
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

const GEO_TARGETS_KEY = "isc.geoCoverageTargetsByState";

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
}: { title: string; icon: React.ElementType; children: React.ReactNode; right?: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card className="flex flex-col overflow-hidden">
        <CardHeader className="py-3 px-4 border-b bg-muted/40 flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm font-semibold flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{title}</span>
          </CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            {right}
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(true)} aria-label={`Expand ${title}`} title="Expand"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 flex-1 overflow-hidden p-4">{children}</CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[96vw] sm:max-w-[92vw] lg:max-w-[1100px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Icon className="h-4 w-4 text-primary" /> {title}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[78vh] min-w-0 overflow-auto pr-1">{children}</div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const Empty = () => (
  <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">No data yet</div>
);


/** Poster-style donut (big central share, counted legend, leader callouts). */
function DonutChart({ data, height = 300 }: { data: { name: string; value: number }[]; height?: number }) {
  return <InfoDonut data={data} height={height} />;
}

/** Ranked horizontal bars with the exact count printed at the end of each bar. */
function HBarChart({
  data, color = PALETTE[0], axisLabel,
}: { data: { name: string; value: number }[]; color?: string; axisLabel?: string }) {
  return <InfoBarH data={data} color={color} axisLabel={axisLabel ?? "Number of responses"} />;
}

/** Vertical bar chart with semantic per-status colours and value labels. */
function StatusBarChart({
  data, onSelect,
}: { data: { name: string; value: number }[]; onSelect?: (name: string) => void }) {
  return (
    <InfoBarV
      data={data}
      height={280}
      colorOf={(n) => mdaStatusColor(n)}
      yLabel="Number of activities"
      xLabel="MDA status"
      onSelect={onSelect}
    />
  );
}

export interface PerfRow {
  name: string;
  submissions: number;
  respondents: number;
  avgRespondents: number;
  days: number;
  /** Configured on the Kobo form but has never submitted a checklist. */
  noSubmissions?: boolean;
}

/** Submissions / respondents / average / days-worked table. */
function PerformanceTable({
  rows, headLabel, onSelect, selected, rosterNote,
}: {
  rows: PerfRow[];
  headLabel: string;
  onSelect?: (name: string) => void;
  selected?: string | null;
  /** Show the "configured on the form but silent" caption + counter. */
  rosterNote?: boolean;
}) {
  if (rows.length === 0) return <Empty />;
  const totals = rows.reduce(
    (a, r) => ({ s: a.s + r.submissions, r: a.r + r.respondents, d: a.d + r.days }),
    { s: 0, r: 0, d: 0 },
  );
  const silent = rows.filter((r) => r.noSubmissions).length;
  return (
    <div className="space-y-2">
      {rosterNote && silent > 0 && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-amber-600">{silent}</span> of {rows.length} monitors on the
          KoboToolbox form have <strong>not submitted any checklist yet</strong> — listed below with zero values.
        </p>
      )}
      <div className="max-h-[340px] overflow-auto rounded-md border">
      <table className="w-full min-w-[620px] text-xs">
        <thead className="bg-muted/60 sticky top-0 z-10">
          <tr>
            <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">{headLabel}</th>
            <th className="text-right px-2 py-2 font-semibold whitespace-nowrap">Checklists</th>
            <th className="text-right px-2 py-2 font-semibold whitespace-nowrap">Respondents</th>
            <th className="text-right px-2 py-2 font-semibold whitespace-nowrap">Avg / checklist</th>
            <th className="text-right px-2 py-2 font-semibold whitespace-nowrap">Days worked <span className="font-normal text-muted-foreground">(avg)</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = !!selected && selected === r.name;
            const idle = !!r.noSubmissions;
            return (
              <tr
                key={r.name}
                onClick={onSelect && !idle ? () => onSelect(r.name) : undefined}
                className={`border-t hover:bg-muted/30 ${onSelect && !idle ? "cursor-pointer" : ""} ${active ? "bg-primary/10" : ""} ${idle ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}
              >
                <td className={`px-2 py-1.5 font-medium align-top whitespace-normal break-words ${active ? "text-primary" : onSelect && !idle ? "hover:underline" : ""}`}>
                  {r.name}
                  {idle && (
                    <Badge variant="outline" className="ml-2 border-amber-500 text-amber-600 text-[9px] px-1 py-0 align-middle">
                      No submission yet
                    </Badge>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap align-top">{r.submissions.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap align-top">{r.respondents.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap align-top">{r.avgRespondents.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap align-top">{r.days.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>


        <tfoot className="bg-muted/50 sticky bottom-0">
          <tr className="border-t font-semibold">
            <td className="px-2 py-1.5">Total</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{totals.s.toLocaleString()}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{totals.r.toLocaleString()}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{totals.s ? (totals.r / totals.s).toFixed(1) : "0.0"}</td>
            <td className="px-2 py-1.5 text-right tabular-nums" title="Average days worked per row (not a sum)">
              {rows.length ? (totals.d / rows.length).toFixed(1) : "0.0"}
            </td>
          </tr>
        </tfoot>

      </table>
      </div>
    </div>

  );
}

/**
 * Group parents by a field and compute performance metrics.
 *
 * When `personNames` is set, only plausible human names are kept (blank /
 * "Unspecified" / questionnaire answers are dropped) and spelling variants are
 * fuzzy-resolved to one canonical actor. Fuzzy clustering runs *within* each
 * Designation | LGA | Ward bucket so two different people in different places
 * never collapse together; canonical labels are then aggregated across buckets.
 */
/**
 * Build the canonical-name resolver used by both the performance tables and
 * the Community Visited register, so clicking a name filters exactly the
 * records aggregated under that row (spelling variants included).
 */
function makeNameResolver(
  parents: Record<string, unknown>[],
  field: string,
  personNames = false,
): (p: Record<string, unknown>) => string {
  const raw = (p: Record<string, unknown>) =>
    String(resolveChecklistValue(field, p[field]) || "").trim();

  if (!personNames) return (p) => raw(p) || "Unspecified";

  const scopeKey = (p: Record<string, unknown>) =>
    [
      resolveChecklistValue("Designation", p.Designation) || "",
      resolveChecklistValue("LGA", p.LGA) || "",
      resolveChecklistValue("Ward", p.Ward) || "",
    ].join("|").toLowerCase();

  const buckets = new Map<string, string[]>();
  for (const p of parents) {
    const v = raw(p);
    if (!isHumanName(v)) continue;
    const k = scopeKey(p);
    const list = buckets.get(k) ?? [];
    list.push(v);
    buckets.set(k, list);
  }
  const indexes = new Map<string, ReturnType<typeof buildIdentityIndex>>();
  for (const [k, names] of buckets) indexes.set(k, buildIdentityIndex(names));

  return (p) => {
    const v = raw(p);
    if (!isHumanName(v)) return "";
    return indexes.get(scopeKey(p))?.resolve(v)?.name || v;
  };
}

/**
 * Calendar day a checklist was actually worked, taken from the KoboToolbox
 * device metadata `_end` (the moment the enumerator saved the form) so the
 * count reflects real field days, not server sync days.
 *
 * The Kobo timestamp carries the device UTC offset (e.g.
 * "2026-08-19T16:40:12.123+01:00"), so the leading YYYY-MM-DD is already the
 * enumerator's local date — slicing avoids any timezone shift from the
 * viewer's browser. Falls back to `_start`, then the server submission time.
 */
function koboWorkDay(p: Record<string, unknown>): string {
  const candidates = [p._end, p.end, p._start, p.start, p._submission_time];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (!s) continue;
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return "";
}

function performanceBy(
  parents: Record<string, unknown>[],
  field: string,
  personNames = false,
): PerfRow[] {
  const nameOf = makeNameResolver(parents, field, personNames);


  const m = new Map<string, { subs: number; resp: number; days: Set<string> }>();
  for (const p of parents) {
    const name = nameOf(p);
    if (!name) continue;
    const rec = m.get(name) ?? { subs: 0, resp: 0, days: new Set<string>() };
    rec.subs += 1;
    rec.resp += Number(p.respondent_count) || 0;
    const t = koboWorkDay(p);
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


/** Editable per-State denominator control for the Geographic Coverage KPI. */
function CoverageTargetDialog({
  states, visitedByState, value, onSave,
}: {
  states: string[];
  visitedByState: Record<string, number>;
  value: Record<string, number>;
  onSave: (v: Record<string, number>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const d: Record<string, string> = {};
    for (const s of states) d[s] = value[s] != null ? String(value[s]) : "";
    setDraft(d);
  }, [open, states, value]);

  const draftTotal = states.reduce((t, s) => t + (Number(draft[s]) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="absolute top-2 right-2 rounded-md bg-white/20 p-1 text-white hover:bg-white/30 transition-colors"
          aria-label="Set communities targeted per State"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Geographic coverage target by State</DialogTitle>
          <DialogDescription>
            Enter the number of communities targeted in each State present in the synced data.
            Coverage is computed as communities visited ÷ communities targeted, summed across
            the States you configure.
          </DialogDescription>
        </DialogHeader>
        {states.length === 0 ? (
          <p className="text-sm text-muted-foreground">No States found in the synced data yet.</p>
        ) : (
          <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
            {states.map((s) => (
              <div key={s} className="grid grid-cols-[1fr_120px] items-center gap-3">
                <Label htmlFor={`geo-t-${s}`} className="text-sm">
                  {s}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {(visitedByState[s] ?? 0).toLocaleString()} visited
                  </span>
                </Label>
                <Input
                  id={`geo-t-${s}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="target"
                  value={draft[s] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [s]: e.target.value }))}
                />
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Total target: <strong>{draftTotal.toLocaleString()}</strong> communities
            </p>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => { onSave({}); setOpen(false); }}>Clear all</Button>
          <Button
            onClick={() => {
              const next: Record<string, number> = {};
              for (const s of states) {
                const n = Number(draft[s]);
                if (Number.isFinite(n) && n > 0) next[s] = Math.round(n);
              }
              onSave(next);
              setOpen(false);
            }}
          >
            Save targets
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

  /* Geographic coverage target, configured per State from the synced data. */
  const [geoTargets, setGeoTargets] = useState<Record<string, number>>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(GEO_TARGETS_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) out[k] = n;
        }
        return out;
      }
    } catch { /* corrupt storage */ }
    return {};
  });
  const saveGeoTargets = (v: Record<string, number>) => {
    setGeoTargets(v);
    try {
      if (!Object.keys(v).length) window.localStorage.removeItem(GEO_TARGETS_KEY);
      else window.localStorage.setItem(GEO_TARGETS_KEY, JSON.stringify(v));
    } catch { /* storage unavailable */ }
  };
  const syncedStates = useMemo(
    () => [...new Set(allParents.map((p) => String(p.State ?? "").trim()).filter(Boolean))].sort(),
    [allParents],
  );

  /* Full monitor roster straight from the synced Kobo form schema, so monitors
     who have never submitted still appear (with zero values). */
  const monitorRoster = useMemo(
    () => rosterFromSchema(cache?.survey ?? [], cache?.choices ?? [], "Independent_Monitor_s_Name"),
    [cache],
  );
  const monitorPerf = useMemo(
    () => mergeRoster(performanceBy(parents, "Independent_Monitor_s_Name", true), monitorRoster) as PerfRow[],
    [parents, monitorRoster],
  );

  const designationPerf = useMemo(() => performanceBy(parents, "Designation"), [parents]);
  const supervisorPerf = useMemo(
    () => performanceBy(parents, "Name_of_Supervisor", true),
    [parents],
  );

  /* Community Visited register — filtered instantly by the monitor/supervisor
     selected in either performance table. */
  const [visitPerson, setVisitPerson] = useState<string | null>(null);
  const communityVisits = useMemo(() => {
    const monitorName = makeNameResolver(parents, "Independent_Monitor_s_Name", true);
    const supervisorName = makeNameResolver(parents, "Name_of_Supervisor", true);
    return buildCommunityVisits(parents, (p) => monitorName(p) || supervisorName(p) || "");
  }, [parents]);
  const toggleVisitPerson = (name: string) =>
    setVisitPerson((cur) => (cur === name ? null : name));




  const kpi = useMemo(() => {
    const states = new Set<string>(), lgas = new Set<string>(), communities = new Set<string>(), wards = new Set<string>();
    const perState = new Map<string, Set<string>>();
    let started = 0, notStarted = 0, sae = 0;
    for (const p of parents) {
      const stateName = String(p.State ?? "").trim();
      if (stateName) states.add(stateName);
      if (p.LGA) lgas.add(`${p.State}|${p.LGA}`);
      if (p.Ward) wards.add(`${p.LGA}|${p.Ward}`);
      if (p.COMMUNITIES) {
        // deduplicate community names within the same State|LGA|Ward
        const key = `${stateName.toLowerCase()}|${String(p.LGA ?? "").trim().toLowerCase()}|${String(p.Ward ?? "").trim().toLowerCase()}|${String(p.COMMUNITIES).trim().toLowerCase()}`;
        communities.add(key);
        if (stateName) {
          if (!perState.has(stateName)) perState.set(stateName, new Set());
          perState.get(stateName)!.add(key);
        }
      }
      if (String(p.has_treatment_commenced ?? "").toLowerCase() === "yes") started++;
      else if (String(p.has_treatment_commenced ?? "").toLowerCase() === "no") notStarted++;
      if (yes(p.Any_SAE_Complain)) sae++;
    }
    const communitiesByState: Record<string, number> = {};
    for (const [s, set] of perState) communitiesByState[s] = set.size;
    return {
      total: parents.length,
      states: states.size, lgas: lgas.size, wards: wards.size, communities: communities.size,
      communitiesByState,
      respondents: respondents.length, started, notStarted, sae,
    };
  }, [parents, respondents]);

  /* Geographic coverage rolled up from the per-State targets. */
  const geoCoverage = useMemo(() => {
    const configured = Object.entries(geoTargets).filter(([, n]) => n > 0);
    if (!configured.length) return null;
    const target = configured.reduce((t, [, n]) => t + n, 0);
    const visited = configured.reduce((t, [s]) => t + (kpi.communitiesByState[s] ?? 0), 0);
    return { target, visited, states: configured.length, pct: target ? (visited / target) * 100 : 0 };
  }, [geoTargets, kpi.communitiesByState]);

  /* Household medicine uptake — share of respondents who confirmed being
     offered the medicine(s) and those who confirmed swallowing them. */
  const uptake = useMemo(() => {
    let offeredAnswered = 0, offeredYes = 0, swallowAnswered = 0, swallowYes = 0;
    for (const r of respondents) {
      const o = resolveChecklistValue("Were_you_OFFERED_the_medicine_s", r.Were_you_OFFERED_the_medicine_s).toLowerCase();
      if (o) { offeredAnswered++; if (o.startsWith("offered")) offeredYes++; }
      const s = resolveChecklistValue("swallow", r.swallow).toLowerCase();
      if (s) { swallowAnswered++; if (s.startsWith("swallowed")) swallowYes++; }
    }
    return {
      offeredPct: offeredAnswered ? (offeredYes / offeredAnswered) * 100 : null,
      swallowPct: swallowAnswered ? (swallowYes / swallowAnswered) * 100 : null,
    };
  }, [respondents]);

  const campaign = useMemo(() => tally(parents.map((p) => p.MDA_Campaign_Type), "MDA_Campaign_Type"), [parents]);
  const inventory = useMemo(() => tally(parents.map((p) => p.Is_Medicine_Inventory_Availabl), "Is_Medicine_Inventory_Availabl"), [parents]);
  const register = useMemo(() => tally(parents.map((p) => p.Is_Treatment_Register_Availabl), "Is_Treatment_Register_Availabl"), [parents]);
  const registerCorrect = useMemo(() => tally(parents.map((p) => p.Are_entries_in_Register_CORRECT), "Are_entries_in_Register_CORRECT"), [parents]);
  const sufficiency = useMemo(() => tally(parents.map((p) => p.Does_CDI_CDD_have_sufficient_d), "Does_CDI_CDD_have_sufficient_d"), [parents]);
  const mdaStatus = useMemo(() => tally(parents.map((p) => p.Status_of_MDA), "Status_of_MDA"), [parents]);

  /* Supervisory insight bars: why respondents swallowed / did not swallow. */
  const swallowReasons = useMemo(
    () => tally(respondents.map((r) => r.Reason_respondent_SWALLOWED_th), "Reason_respondent_SWALLOWED_th"),
    [respondents],
  );
  const noSwallowReasons = useMemo(
    () => tally(respondents.map((r) => r.Reason_respondent_DID_NOT_SWAL), "Reason_respondent_DID_NOT_SWAL"),
    [respondents],
  );


  const latrine = useMemo(() => tally(respondents.map((r) => r.What_type_of_Laterin_our_school_household), "What_type_of_Laterin_our_school_household"), [respondents]);
  const waterHh = useMemo(() => tallyMulti(respondents.map((r) => r.What_water_source_i_your_class_household), "What_water_source_i_your_class_household"), [respondents]);
  const waste = useMemo(() => tallyMulti(respondents.map((r) => r.How_do_you_Dispose_D_your_class_household), "How_do_you_Dispose_D_your_class_household"), [respondents]);
  const waterWithin = useMemo(() => tally(parents.map((p) => p.Are_all_sources_of_water_used_), "Are_all_sources_of_water_used_"), [parents]);

  const dosePole = useMemo(() => tally(parents.map((p) => p.Is_Dose_Pole_Available), "Is_Dose_Pole_Available"), [parents]);
  const dosePoleKnow = useMemo(() => tally(parents.map((p) => p.Does_CDI_CDD_Know_how_to_use_Dose_Pole), "Does_CDI_CDD_Know_how_to_use_Dose_Pole"), [parents]);
  const posters = useMemo(() => tally(parents.map((p) => p.Are_any_NTD_posters_the_School_Community), "Are_any_NTD_posters_the_School_Community"), [parents]);
  const cddTrained = useMemo(() => tally(parents.map((p) => p.Has_CDI_CDD_been_trained), "Has_CDI_CDD_been_trained"), [parents]);
  const stipends = useMemo(() => tally(parents.map((p) => p.Did_CDI_CDD_receive_stipends), "Did_CDI_CDD_receive_stipends"), [parents]);
  const cddTotal = useMemo(
    () => parents.reduce((s, p) => s + (Number(p.how_many_teachers_cdds_school_) || 0), 0),
    [parents],
  );


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

  /* Dashboard-wide mathematical consistency audit — every distribution, KPI and
     ranking is re-derived from the Kobo submissions and compared with what the
     charts are about to render. */
  const integrity = useMemo(() => {
    const v = validate();
    const parentDists: [string, { name: string; value: number }[]][] = [
      ["MDA Campaign Type", campaign],
      ["Medicine Inventory Available", inventory],
      ["Medicine Sufficiency", sufficiency],
      ["Treatment Register Available", register],
      ["Register Entries Correct", registerCorrect],
      ["Status of MDA", mdaStatus],
      ["Dose Pole Available", dosePole],
      ["CDD Knows Dose Pole Use", dosePoleKnow],
      ["NTD Posters Displayed", posters],
      ["CDDs Trained", cddTrained],
      ["CDD Stipends Received", stipends],
      ["Community Water Source Proximity", waterWithin],
    ];
    for (const [scope, d] of parentDists) v.distribution(scope, d, parents.length);
    for (const [scope, d] of [
      ["Latrine type", latrine],
      ["Reasons for swallowing", swallowReasons],
      ["Reasons for NOT swallowing", noSwallowReasons],
    ] as [string, { name: string; value: number }[]][]) {
      v.distribution(scope, d, respondents.length);
    }
    v.rate(
      "KPI · Offered medicine",
      Math.round(((uptake.offeredPct ?? 0) / 100) * respondents.length),
      respondents.length,
      null,
    );
    v.atMost("KPI · Swallowed ≤ offered", uptake.swallowPct ?? 0, uptake.offeredPct ?? 0,
      "KPI strip shows a swallowed rate above the offered rate.");
    v.stacked("KPI · Treatment commenced", [
      { name: "Treatment status", parts: [kpi.started, kpi.notStarted], total: kpi.started + kpi.notStarted },
    ]);
    v.stacked("KPI · Top LGA ranking", [
      { name: "Ranked LGAs", parts: topLgas.map((l) => l.value), total: topLgas.reduce((s, l) => s + l.value, 0) },
    ]);
    if (geoCoverage && geoCoverage.visited > geoCoverage.target) {
      v.atMost("KPI · Geographic coverage", geoCoverage.visited, geoCoverage.target,
        "More communities visited than the configured target — coverage exceeds 100%.");
    }
    return v.report();
  }, [
    campaign, inventory, sufficiency, register, registerCorrect, mdaStatus, dosePole, dosePoleKnow,
    posters, cddTrained, stipends, waterWithin, latrine, swallowReasons, noSwallowReasons,
    parents.length, respondents.length, uptake, kpi, geoCoverage, topLgas,
  ]);


  return (
    <div className="space-y-4">

      <ChecklistFilters
        parents={allParents}
        value={filters}
        onChange={setFilters}
        presetSlot={
          <ChecklistPresetBar
            connectionId={getActiveConnectionId()}
            value={filters}
            onApply={setFilters}
          />
        }
      />

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
          value={geoCoverage ? `${geoCoverage.pct.toFixed(1)}%` : "—"}
          sub={
            geoCoverage
              ? `${geoCoverage.visited.toLocaleString()} of ${geoCoverage.target.toLocaleString()} communities · ${geoCoverage.states} state${geoCoverage.states === 1 ? "" : "s"} targeted`
              : `${kpi.communities.toLocaleString()} communities visited · set targets by State →`
          }
          tone="bg-[hsl(160,55%,35%)]"
          action={
            <CoverageTargetDialog
              states={syncedStates}
              visitedByState={kpi.communitiesByState}
              value={geoTargets}
              onSave={saveGeoTargets}
            />
          }
        />

        <Kpi
          icon={Users}
          label="Respondents Reached"
          value={kpi.respondents.toLocaleString()}
          sub={
            uptake.offeredPct == null && uptake.swallowPct == null
              ? "No medicine responses yet"
              : `${uptake.offeredPct == null ? "—" : `${uptake.offeredPct.toFixed(1)}%`} offered medicine · ${uptake.swallowPct == null ? "—" : `${uptake.swallowPct.toFixed(1)}%`} swallowed`
          }
          tone="bg-[hsl(265,50%,48%)]"
        />
        <Kpi icon={PlayCircle} label="Treatment Commenced" value={kpi.started.toLocaleString()} sub={`${kpi.notStarted.toLocaleString()} not started`} tone="bg-[hsl(35,85%,45%)]" />
        <Kpi icon={ShieldAlert} label="SAE Alerts" value={kpi.sae.toLocaleString()} sub={kpi.sae > 0 ? "Requires review" : "None reported"} tone={kpi.sae > 0 ? "bg-[hsl(350,70%,45%)] animate-pulse" : "bg-[hsl(215,15%,45%)]"} />
      </div>


      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {cache ? `Synced ${new Date(cache.fetchedAt).toLocaleString()} · ${kpi.total} submissions · ${kpi.respondents} flattened respondent records` : "No Kobo data cached yet — run a sync."}
        </p>
        <div className="flex items-center gap-2">
          <DataIntegrityBadge report={integrity} label="Dashboard data integrity" />
        {onRefresh && (
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Refresh
          </Button>
        )}
        </div>
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
          <div className="max-h-[280px] overflow-auto rounded-md border bg-background">
            {saeRows.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No SAE complaints reported.</div>
            ) : (
              <table className="w-full min-w-[520px] text-xs">
                <thead className="bg-muted/60 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">Community</th>
                    <th className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">LGA</th>
                    <th className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">Type(s)</th>
                    <th className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">Other</th>
                  </tr>
                </thead>
                <tbody>
                  {saeRows.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5 align-top whitespace-normal break-words">{String(p.COMMUNITIES ?? "—")}</td>
                      <td className="px-2 py-1.5 align-top whitespace-normal break-words">{String(p.LGA ?? "—")}</td>
                      <td className="px-2 py-1.5 align-top whitespace-normal break-words">{resolveChecklistValue("If_YES_what_type_of_SAE", p.If_YES_what_type_of_SAE) || "—"}</td>
                      <td className="px-2 py-1.5 align-top whitespace-normal break-words">{String(p.Specify_the_OTHER_type_of_SAE ?? "—")}</td>
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

      {/* Supervisory insight bars — swallowing behaviour drivers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Reasons for NOT swallowing" icon={AlertTriangle}>
          <InfoBarH data={noSwallowReasons} color="#DC2626" axisLabel="Number of responses" />
        </Panel>
        <Panel title="Reasons for swallowing" icon={ClipboardCheck}>
          <InfoBarH data={swallowReasons} color="#1668DC" axisLabel="Number of responses" />
        </Panel>
      </div>

      {/* Medicine offered — geography breakdown (State & LGA) */}
      <MedicineOfferedGeo respondents={respondents} />

      {/* Geospatial: community status + household medicine-offer maps */}
      <ChecklistMaps parents={parents} respondents={respondents} filters={filters} />


      {/* Household survey coverage generalised to Community → Ward → LGA → State */}
      <HouseholdCoverageAnalysis respondents={respondents} campaignFilter={filters.campaign || null} />



      {/* Predictive modelling: completion timeline */}
      <ChecklistPredictive parents={parents} respondents={respondents} geoTarget={geoCoverage?.target ?? null} />



      {/* Community status registers */}
      <StatusCommunityTables parents={parents} />

      {/* Field-worker accountability */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Independent Monitor Performance" icon={UserCheck}>
          <PerformanceTable
            rows={monitorPerf}
            headLabel="Independent Monitor's Name"
            onSelect={toggleVisitPerson}
            selected={visitPerson}
            rosterNote
          />
        </Panel>
        <Panel title="Other Supervisors Performance" icon={UserCheck}>
          <PerformanceTable
            rows={supervisorPerf}
            headLabel="Name of Supervisor"
            onSelect={toggleVisitPerson}
            selected={visitPerson}
          />
        </Panel>
        <Panel title="Performance by Designation" icon={Users}>
          <PerformanceTable rows={designationPerf} headLabel="Designation" />
        </Panel>
        <Panel title="Community Visited" icon={MapPin}>
          <CommunityVisitedTable
            rows={communityVisits}
            selected={visitPerson}
            onClearSelection={() => setVisitPerson(null)}
          />
        </Panel>
      </div>




      {/* Supervision & CDD engagement */}
      <div className="grid gap-4">
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
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Panel title="CDDs Trained" icon={Users}><DonutChart data={cddTrained} /></Panel>
        <Panel title="CDD Stipends Received" icon={Users}><DonutChart data={stipends} /></Panel>
        <Panel title="Dose Pole Available" icon={ClipboardCheck}><DonutChart data={dosePole} /></Panel>
        <Panel title="CDD Knows Dose Pole Use" icon={ClipboardCheck}><DonutChart data={dosePoleKnow} /></Panel>
      </div>

      <div className="grid gap-4">
        <Panel title="NTD Posters Displayed" icon={ClipboardCheck}><DonutChart data={posters} /></Panel>
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

      <div className="grid gap-4">
        <Panel title="Top LGAs by Supervision Volume" icon={MapPin}><HBarChart data={topLgas} /></Panel>
      </div>

      <MlIntelligenceHub
        parents={parents}
        respondents={respondents}
        lastSyncLabel={cache ? `Synced ${new Date(cache.fetchedAt).toLocaleTimeString()}` : undefined}
        syncedAt={cache?.fetchedAt}
        onRefresh={onRefresh}
        syncing={syncing}
        filterSummary={
          Object.values(filters).filter(Boolean).length
            ? `${Object.values(filters).filter(Boolean).length} shared filter(s) applied`
            : "no filters applied"
        }
      />


    </div>
  );
}
