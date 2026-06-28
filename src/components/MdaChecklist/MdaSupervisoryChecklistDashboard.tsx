/**
 * Integrated MDA Supervisory Checklist Dashboard — v2 (Bloomberg-class)
 * ────────────────────────────────────────────────────────────────────────
 * A professional, decision-support dashboard built around the COMMUNITY
 * CHECKLIST module as the spine, with longitudinal linkage to the three
 * follow-up modules captured later against the same community:
 *   • Follow-up on MDA Completion
 *   • Follow-up on MDA Commodities / Communities
 *   • Follow-up on Adverse Reactions
 *
 * Every metric is computed strictly from REAL captured fields. The dashboard
 * adopts the visual language of the Bloomberg School Enrolment Validation
 * Dashboard: a navy report header, tinted KPI tiles, a longitudinal funnel,
 * follow-up outcome panels, a per-community linkage register and a coverage
 * map — all driven by a comprehensive, professional filter bar.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, CheckCircle2, Pill, AlertTriangle, Flag, Activity,
  MapPin, CalendarClock, Users2, Search, RotateCcw, Download, Filter,
  ArrowRight, ShieldCheck, Map as MapIcon, Building2, Layers, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { prepareMdaData, communityKey } from "@/lib/mda/dashboardData";

import { computeMdaKpis, buildMdaModel, type Heatmap as KHeatmap } from "@/lib/mda/kpis";
import { exportKpiWorkbook, type KpiId } from "@/lib/mda/kpiExport";
import MdaDrillDownSheet, { type DrillData } from "./MdaDrillDownSheet";
import {
  getMdaFollowUpGroupName, isMdaFollowUpGroup,
  MDA_FOLLOWUP_COMPLETION, MDA_FOLLOWUP_COMMODITIES, MDA_FOLLOWUP_ADVERSE,
} from "@/lib/mdaFollowUp";
import { exportMdaDashboard } from "@/lib/mda/dashboardExport";
import MdaSupervisoryMap from "./MdaSupervisoryMap";
import JigawaSupervisoryMap from "./JigawaSupervisoryMap";
import FctSupervisoryMap from "./FctSupervisoryMap";
import HouseholdCoverageSurveyMap from "./HouseholdCoverageSurveyMap";
import MdaAdvancedAnalyses from "./MdaAdvancedAnalyses";
import MdaLongitudinalInsights from "./MdaLongitudinalInsights";
import { useTablePagination } from "@/hooks/useTablePagination";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";

// ───────────────────────── Types ─────────────────────────
interface QOption { id?: string; label: string; value: string; }
interface FormQuestion {
  id: string; name?: string; label?: string; type?: string;
  options?: QOption[]; questions?: FormQuestion[];
}
interface MdaSubmission {
  id: string; projectId?: string | null;
  state?: string | null; lga?: string | null; ward?: string | null;
  submitter?: string | null; submittedAt?: string | null; status?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
  data?: Record<string, any>;
}
interface Props {
  submissions: MdaSubmission[];
  questions: FormQuestion[];
  formName?: string;
  projectName?: string;
  projectId?: string | null;
  /** When true, data is served from the offline cache. */
  offline?: boolean;
}

// ───────────────────────── Palette ─────────────────────────
const NAVY = "#0c2340";
const BLUE = "#2563eb";
const TEAL = "#14b8a6";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const PINK = "#ec4899";
const VIOLET = "#8b5cf6";
const SLATE = "#64748b";

// ───────────────────────── Helpers ─────────────────────────
const stripTags = (s?: string) => String(s || "").replace(/<[^>]*>/g, "").trim();
const norm = (v: any) => String(v ?? "").trim().toLowerCase();
const POSITIVE = new Set(["yes", "true", "1", "available", "present", "good", "done", "complete", "completed", "compliant", "adequate", "trained", "passed", "okay"]);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const fmt = (n: number) => n.toLocaleString();

const FU_LABELS: Record<string, string> = {
  [MDA_FOLLOWUP_COMPLETION]: "Follow-up on MDA Completion",
  [MDA_FOLLOWUP_COMMODITIES]: "Follow-up on MDA Commodities/Communities",
  [MDA_FOLLOWUP_ADVERSE]: "Follow-up on Adverse Reactions",
};
const FU_TINTS: Record<string, string> = {
  [MDA_FOLLOWUP_COMPLETION]: EMERALD,
  [MDA_FOLLOWUP_COMMODITIES]: TEAL,
  [MDA_FOLLOWUP_ADVERSE]: AMBER,
};




function pickGeo(s: MdaSubmission, kind: "state" | "lga" | "ward" | "community"): string {
  const d = s.data || {};
  if (kind === "state") return stripTags(s.state || d.state || d.state_name) || "";
  if (kind === "lga") return stripTags(s.lga || d.lga || d.LGA || d.local_government || d.local_government_area) || "";
  if (kind === "ward") return stripTags(s.ward || d.ward || d.ward_name) || "";
  return stripTags(d.community || d.community_name || d.settlement_name || d.settlement) || "";
}

// ───────────────────────── Small UI atoms ─────────────────────────
function Kpi({ icon: Icon, label, value, sub, tint, bar, onExport, exporting }: {
  icon: any; label: string; value: string | number; sub?: string; tint: string; bar?: number;
  onExport?: () => void; exporting?: boolean;
}) {
  const clickable = !!onExport;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onExport}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExport?.(); } } : undefined}
      title={clickable ? `Download the submissions behind “${label}” as Excel` : undefined}
      aria-label={clickable ? `Download ${label} KPI data as Excel` : undefined}
      className={`group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${clickable ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" : ""}`}
      style={{ background: `linear-gradient(135deg, ${tint}0d, transparent 70%)` }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: tint }} aria-hidden />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</span>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${tint}1a`, color: tint }}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        </div>
      </div>
      <p className="mt-2 font-display text-2xl font-bold tracking-tight" style={{ color: tint }}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      {typeof bar === "number" && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, bar)}%`, background: tint }} />
        </div>
      )}
      {clickable && (
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <Download className="h-3 w-3" /> Excel
        </span>
      )}
    </div>
  );
}



function Tag({ text, tint }: { text: string; tint: string }) {
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${tint}1a`, color: tint }}>
      {text}
    </span>
  );
}

/**
 * Professional LGA × category heatmap.
 * Rows are LGAs / Area Councils, columns are the module's categories. Each cell
 * encodes the count at first visit (colour intensity) and the follow-up coverage
 * (small ✓ ratio), giving an at-a-glance, dashboard-friendly read of progress.
 */
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function HeatmapPanel({ title, icon: Icon, tint, baseTint, heat, empty, onCell }: {
  title: string; icon: any; tint: string; baseTint: string; heat: KHeatmap; empty: string;
  onCell?: (category: string, lga: string | null) => void;
}) {
  const max = Math.max(1, ...heat.rows.flatMap((r) => heat.categories.map((c) => r.cells[c]?.value || 0)));
  const { r, g, b } = hexToRgb(baseTint);
  const cellBg = (v: number) => (v <= 0 ? "transparent" : `rgba(${r}, ${g}, ${b}, ${0.12 + 0.78 * (v / max)})`);
  const cellFg = (v: number) => (v / max > 0.55 ? "#ffffff" : "hsl(var(--foreground))");
  const hasData = heat.rows.some((row) => heat.categories.some((c) => (row.cells[c]?.value || 0) > 0));
  const clickable = !!onCell;
  const gridRef = useRef<HTMLTableElement>(null);

  // Roving arrow-key navigation across heatmap cells (grid pattern).
  const handleGridKey = (e: React.KeyboardEvent<HTMLTableElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const cells: HTMLButtonElement[] = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-r]") ?? []);
    if (cells.length === 0) return;
    const active = document.activeElement as HTMLButtonElement | null;
    const cur = active && active.dataset.r !== undefined
      ? { r: Number(active.dataset.r), c: Number(active.dataset.c) }
      : { r: 0, c: -1 };
    e.preventDefault();
    const at = (r: number, c: number) => cells.find((el) => Number(el.dataset.r) === r && Number(el.dataset.c) === c);
    const maxR = Math.max(...cells.map((el) => Number(el.dataset.r)));
    const maxC = Math.max(...cells.map((el) => Number(el.dataset.c)));
    let { r: nr, c: nc } = cur;
    if (e.key === "ArrowRight") nc = Math.min(maxC, nc + 1);
    else if (e.key === "ArrowLeft") nc = Math.max(0, nc - 1);
    else if (e.key === "ArrowDown") nr = Math.min(maxR, nr + 1);
    else if (e.key === "ArrowUp") nr = Math.max(0, nr - 1);
    else if (e.key === "Home") { nc = 0; }
    else if (e.key === "End") { nc = maxC; }
    // Find the nearest existing cell on the target row (cells with 0 value are not focusable).
    let target = at(nr, nc);
    if (!target) {
      const rowCells = cells.filter((el) => Number(el.dataset.r) === nr).sort((a, b) => Number(a.dataset.c) - Number(b.dataset.c));
      target = rowCells.find((el) => Number(el.dataset.c) >= nc) || rowCells[rowCells.length - 1] || cells[0];
    }
    target?.focus();
  };


  const Cell = ({ cell, lga, category, isTotal, rowIdx, colIdx }: { cell: KHeatmap["colTotals"][string]; lga: string | null; category: string; isTotal?: boolean; rowIdx: number; colIdx: number }) => {
    const value = cell?.value || 0;
    const followed = cell?.followed || 0;
    const fpct = value ? Math.round((followed / value) * 100) : 0;
    const label = `${isTotal ? "All LGAs" : lga} · ${category}`;
    const tip = value
      ? `${label}\n${value} communit${value === 1 ? "y" : "ies"} at first visit (count)\n${followed} followed up over time — ${fpct}% follow-up coverage${clickable ? "\nPress Enter to view the underlying communities & answers" : ""}`
      : `${label}: none`;
    const ariaLabel = value
      ? `${label}. ${value} communities at first visit, ${fpct}% followed up over time.${clickable ? " Activate to view underlying communities." : ""}`
      : `${label}. No communities.`;
    const inner = (
      <>
        <span className="block font-bold leading-none">{value || "·"}</span>
        {value > 0 && (
          <span className="block text-[9px] font-medium leading-tight opacity-90">↑{fpct}%</span>
        )}
      </>
    );
    const style = isTotal
      ? undefined
      : { background: cellBg(value), color: value ? cellFg(value) : "hsl(var(--muted-foreground))" };
    if (clickable && value > 0) {
      return (
        <button
          type="button"
          data-r={rowIdx}
          data-c={colIdx}
          role="gridcell"
          onClick={() => onCell!(category, isTotal ? null : lga)}
          title={tip}
          aria-label={ariaLabel}
          className={`w-full rounded-md px-1 py-1.5 transition-all hover:ring-2 hover:ring-offset-1 hover:ring-offset-card focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer ${isTotal ? "bg-muted/60 text-foreground" : ""}`}
          style={{ ...(style || {}), ...(isTotal ? {} : {}) }}
        >
          {inner}
        </button>
      );
    }
    return (
      <div className={`rounded-md px-1 py-1.5 transition-colors ${isTotal ? "bg-muted/60 text-foreground" : ""}`} role="gridcell" title={tip} aria-label={ariaLabel} style={style}>
        {inner}
      </div>
    );
  };


  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm"><Icon className="h-4 w-4" style={{ color: tint }} />{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!hasData ? (
          <p className="py-10 text-center text-xs text-muted-foreground">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              ref={gridRef}
              role="grid"
              aria-label={`${title} heatmap — LGA by category. Use arrow keys to move between cells, Enter to drill in.`}
              className="w-full border-separate border-spacing-0.5 text-[11px]"
              onKeyDown={clickable ? handleGridKey : undefined}
            >
              <thead>
                <tr role="row">
                  <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-semibold text-muted-foreground" scope="col">LGA / Area Council</th>
                  {heat.categories.map((c) => (
                    <th key={c} className="px-1.5 py-1.5 text-center font-semibold text-muted-foreground" title={c} scope="col">
                      <span className="block max-w-[72px] truncate mx-auto">{c}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.rows.map((row, ri) => (
                  <tr key={row.lga} role="row">
                    <td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-medium text-foreground" scope="row">
                      <span className="block max-w-[120px] truncate" title={row.lga}>{row.lga}</span>
                    </td>
                    {heat.categories.map((c, ci) => (
                      <td key={c} className="px-0.5 py-0.5 text-center">
                        <Cell cell={row.cells[c] || { value: 0, followed: 0 }} lga={row.lga} category={c} rowIdx={ri} colIdx={ci} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr role="row">
                  <td className="sticky left-0 z-10 bg-muted/60 px-2 py-1.5 font-semibold text-foreground" scope="row">All LGAs</td>
                  {heat.categories.map((c, ci) => (
                    <td key={c} className="px-0.5 py-0.5 text-center">
                      <Cell cell={heat.colTotals[c] || { value: 0, followed: 0 }} lga={null} category={c} isTotal rowIdx={heat.rows.length} colIdx={ci} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            {/* ── Professional legend / colour scale ── */}
            <div className="space-y-1.5 border-t border-border/60 px-3 py-2.5" role="group" aria-label={`${title} legend and colour scale`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">Colour</span>
                  <span
                    className="inline-flex items-center gap-1"
                    role="img"
                    aria-label={`Colour scale from 1 (lightest) to ${max} (darkest) communities at first visit, by count`}
                  >
                    <span>1</span>
                    <span className="inline-block h-3 w-16 rounded" style={{ background: `linear-gradient(90deg, rgba(${r},${g},${b},0.12), rgba(${r},${g},${b},0.9))` }} aria-hidden />
                    <span>{max}</span>
                  </span>
                  <span>communities at first visit (count)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground" aria-hidden>↑%</span>
                  <span>share followed up over time (% of first-visit communities)</span>
                </span>
              </div>
              {clickable && (
                <p className="text-[10px] italic text-muted-foreground">
                  Click or focus a cell and press Enter to drill into the underlying communities, their first-visit answers and follow-up answers. Use arrow keys to move between cells.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ALL = "__all__";
const HCS_URL_KEYS = {
  lga: "hcs_lga",
  community: "hcs_community",
  state: "hcs_state",
  visit: "hcs_visit",
} as const;

const writeDashboardUrl = (updates: Record<string, string | null | undefined>) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
};

// ───────────────────────── Main ─────────────────────────
export default function MdaSupervisoryChecklistDashboard({ submissions, questions, formName, projectName, projectId, offline }: Props) {
  // ── Filter state ──────────────────────────────────────────────
  const [fState, setFState] = useState(ALL);
  const [fLga, setFLga] = useState(ALL);
  const [fWard, setFWard] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fModule, setFModule] = useState(ALL);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  // Module → question-name set (for classifying follow-up submissions).
  const moduleQuestions = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const item of questions || []) {
      const isGroup = Array.isArray(item.questions) && !item.type;
      if (!isGroup || !isMdaFollowUpGroup(item as any)) continue;
      const canonical = getMdaFollowUpGroupName(item as any);
      if (!canonical) continue;
      const set = map[canonical] || (map[canonical] = new Set());
      for (const q of item.questions || []) if (q?.name) set.add(q.name);
    }
    return map;
  }, [questions]);

  const classifyFollowUp = useMemo(() => {
    const entries = Object.entries(moduleQuestions);
    return (s: MdaSubmission): string | null => {
      const keys = Object.keys(s.data || {});
      let best: string | null = null;
      let bestHits = 0;
      for (const [canonical, names] of entries) {
        const hits = keys.filter((k) => names.has(k)).length;
        if (hits > bestHits) { bestHits = hits; best = canonical; }
      }
      return best;
    };
  }, [moduleQuestions]);

  // ── Filter option lists (from full dataset, geography is cascading) ──
  const states = useMemo(
    () => Array.from(new Set(submissions.map((s) => pickGeo(s, "state")).filter(Boolean))).sort(),
    [submissions],
  );
  const lgas = useMemo(() => {
    const pool = fState === ALL ? submissions : submissions.filter((s) => pickGeo(s, "state") === fState);
    return Array.from(new Set(pool.map((s) => pickGeo(s, "lga")).filter(Boolean))).sort();
  }, [submissions, fState]);
  const wards = useMemo(() => {
    const pool = submissions.filter(
      (s) => (fState === ALL || pickGeo(s, "state") === fState) && (fLga === ALL || pickGeo(s, "lga") === fLga),
    );
    return Array.from(new Set(pool.map((s) => pickGeo(s, "ward")).filter(Boolean))).sort();
  }, [submissions, fState, fLga]);

  // ── Apply geography / status / date / search filters to raw rows ──
  const filtered = useMemo(() => {
    const q = norm(search);
    const fromTs = fFrom ? new Date(fFrom + "T00:00:00").getTime() : null;
    const toTs = fTo ? new Date(fTo + "T23:59:59").getTime() : null;
    return submissions.filter((s) => {
      if (fState !== ALL && pickGeo(s, "state") !== fState) return false;
      if (fLga !== ALL && pickGeo(s, "lga") !== fLga) return false;
      if (fWard !== ALL && pickGeo(s, "ward") !== fWard) return false;
      if (fStatus !== ALL && norm(s.status) !== fStatus) return false;
      if (fromTs || toTs) {
        const t = s.submittedAt ? new Date(s.submittedAt).getTime() : null;
        if (t === null) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      if (q) {
        const hay = [
          pickGeo(s, "community"), pickGeo(s, "ward"), pickGeo(s, "lga"), pickGeo(s, "state"),
          stripTags(s.submitter || s.data?.supervisor_name),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, fState, fLga, fWard, fStatus, fFrom, fTo, search]);

  // Clone the rows before merging so the KPI engine below always reads clean,
  // un-mutated first-visit answers (prepareMdaData overwrites linked fields).
  const prepared = useMemo(
    () => prepareMdaData(filtered.map((s) => ({ ...s, data: { ...(s.data || {}) } })), questions as any),
    [filtered, questions],
  );
  const checklist = prepared.checklist;
  const followUps = prepared.followUps;
  const total = checklist.length;

  // Owner-defined KPI engine (resolves every determinant by question LABEL).
  const kpis = useMemo(() => computeMdaKpis(filtered as any, questions as any), [filtered, questions]);

  // Shared authoritative model (resolves every determinant by question LABEL with
  // legacy-key fallbacks). Reused so the Longitudinal Linkage register reconciles
  // exactly with the headline KPIs/heatmaps instead of reading hard-coded fields
  // that break on copied projects whose question keys differ.
  const mdaModel = useMemo(() => buildMdaModel(filtered as any, questions as any), [filtered, questions]);

  // Follow-up determinant keys resolved by LABEL (work across projects):
  //  • commodity "available/sufficient now" answer in the Commodities module
  //  • adverse "has it been managed?" answer in the Adverse Reaction module
  const fuKeys = useMemo(() => {
    const qi = mdaModel.qIndex;
    return {
      commodityAvailable: qi.find([/commodit(y|ies).*(availab|sufficient)/i, /(medicine|commodit).*now\s*availab/i, /availab.*commodit/i]),
      commodityInadequate: qi.find([/commodit(y|ies).*(inadequate|insufficient|short)/i, /(stock|medicine).*out/i]),
      adverseManaged: mdaModel.dq.managed,
    };
  }, [mdaModel]);

  const authoritativeStatusByCom = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of mdaModel.allComs) {
      const st = mdaModel.latestStatus(c);
      m.set(c.key, st ? mdaModel.statusTitle(st) : "");
    }
    return m;
  }, [mdaModel]);


  // ── KPI data export (#2): clicking a KPI downloads the underlying submissions ──
  const [kpiExporting, setKpiExporting] = useState<KpiId | null>(null);
  const exportKpi = useCallback(async (id: KpiId) => {
    if (kpiExporting) return;
    setKpiExporting(id);
    try {
      await exportKpiWorkbook(id, filtered as any, questions as any, formName || "Integrated MDA Supervisory Checklist", projectName);
      toast.success("KPI data exported to Excel");
    } catch (e: any) {
      console.error("KPI export failed", e);
      toast.error(e?.message || "Could not export KPI data");
    } finally {
      setKpiExporting(null);
    }
  }, [kpiExporting, filtered, questions, formName, projectName]);

  // ── Heatmap cell drill-down ──────────────────────────────────
  const [drill, setDrill] = useState<DrillData | null>(null);
  const comRows = useMemo(() => {
    const m = new Map<string, MdaSubmission[]>();
    for (const s of filtered) {
      const k = communityKey(s as any);
      let arr = m.get(k);
      if (!arr) { arr = []; m.set(k, arr); }
      arr.push(s);
    }
    return m;
  }, [filtered]);
  const followUpFieldSet = useMemo(() => {
    const set = new Set<string>();
    for (const names of Object.values(moduleQuestions)) for (const n of names) set.add(n);
    return set;
  }, [moduleQuestions]);
  const openHeatDrill = (heat: KHeatmap, category: string, lga: string | null, title: string, tint: string) => {
    const cell = lga === null ? heat.colTotals[category] : heat.rows.find((r) => r.lga === lga)?.cells[category];
    const keys = new Set(cell?.members || []);
    const rows: MdaSubmission[] = [];
    for (const k of keys) for (const s of comRows.get(k) || []) rows.push(s);
    rows.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
    setDrill({
      title: `${title} — ${category}`,
      subtitle: `${lga ? lga + " · " : "All LGAs · "}${keys.size} communit${keys.size === 1 ? "y" : "ies"} at first visit · ${rows.length} submission${rows.length === 1 ? "" : "s"}`,
      tint,
      rows: rows as any,
    });
  };

  // ── Drilldown from the household coverage map (marker / LGA selection) ──
  const openMapCommunityDrill = (community: string, state?: string | null) => {
    const target = norm(community);
    if (!target) return;
    writeDashboardUrl({
      [HCS_URL_KEYS.community]: community,
      [HCS_URL_KEYS.state]: state || null,
      [HCS_URL_KEYS.lga]: null,
    });
    const rows = submissions.filter((s) => {
      if (state && pickGeo(s, "state") && norm(pickGeo(s, "state")) !== norm(state)) return false;
      return norm(pickGeo(s, "community")) === target;
    });
    rows.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
    setDrill({
      title: `Household Coverage — ${community}`,
      subtitle: `${state ? state + " · " : ""}${rows.length} submission${rows.length === 1 ? "" : "s"} for this community`,
      tint: TEAL,
      rows: rows as any,
    });
  };
  const openMapLgaDrill = (lga: string, state?: string | null) => {
    const target = norm(lga);
    if (!target) return;
    writeDashboardUrl({
      [HCS_URL_KEYS.lga]: lga,
      [HCS_URL_KEYS.state]: state || null,
      [HCS_URL_KEYS.community]: null,
      [HCS_URL_KEYS.visit]: null,
    });
    const rows = submissions.filter((s) => {
      if (state && pickGeo(s, "state") && norm(pickGeo(s, "state")) !== norm(state)) return false;
      return norm(pickGeo(s, "lga")) === target;
    });
    rows.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
    setDrill({
      title: `Household Coverage — ${lga} LGA`,
      subtitle: `${state ? state + " · " : ""}${rows.length} submission${rows.length === 1 ? "" : "s"} in this LGA`,
      tint: TEAL,
      rows: rows as any,
    });
  };



  const filtersActive =
    fState !== ALL || fLga !== ALL || fWard !== ALL || fStatus !== ALL || fModule !== ALL || !!fFrom || !!fTo || !!search;
  const resetFilters = () => {
    setFState(ALL); setFLga(ALL); setFWard(ALL); setFStatus(ALL); setFModule(ALL);
    setFFrom(""); setFTo(""); setSearch("");
  };

  // ── Follow-ups grouped by community + module ──────────────────
  const fuByCommunity = useMemo(() => {
    const map = new Map<string, Map<string, MdaSubmission[]>>();
    for (const fu of followUps) {
      const canonical = classifyFollowUp(fu) || "other";
      const ck = communityKey(fu as any);
      const inner = map.get(ck) || new Map<string, MdaSubmission[]>();
      const arr = inner.get(canonical) || [];
      arr.push(fu);
      inner.set(canonical, arr);
      map.set(ck, inner);
    }
    // newest first within each module
    for (const inner of map.values())
      for (const arr of inner.values())
        arr.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
    return map;
  }, [followUps, classifyFollowUp]);

  // ── Distinct communities supervised + funnel ──────────────────
  const primaryByCom = useMemo(() => {
    const m = new Map<string, MdaSubmission>();
    for (const s of checklist) {
      const k = communityKey(s as any);
      const prev = m.get(k);
      if (!prev || new Date(s.submittedAt || 0) > new Date(prev.submittedAt || 0)) m.set(k, s);
    }
    return m;
  }, [checklist]);

  const communitiesSupervised = primaryByCom.size;

  // Longitudinal funnel — each follow-up step is expressed against the number of
  // communities that ACTUALLY require that follow-up (Owner definition #7).
  const funnel = [
    { label: "Community Checklist", icon: ClipboardList, value: kpis.funnel.checklist, base: kpis.funnel.checklist, pctOverride: undefined as number | undefined, tint: BLUE },
    { label: "MDA Completion follow-up", icon: CheckCircle2, value: kpis.funnel.completion.value, base: kpis.funnel.completion.base, pctOverride: kpis.funnel.completion.pct, tint: EMERALD },
    { label: "Commodities follow-up", icon: Pill, value: kpis.funnel.commodities.value, base: kpis.funnel.commodities.base, pctOverride: kpis.funnel.commodities.pct, tint: TEAL },
    { label: "Adverse Reaction follow-up", icon: AlertTriangle, value: kpis.funnel.adverse.value, base: kpis.funnel.adverse.base, pctOverride: kpis.funnel.adverse.pct, tint: AMBER },
  ];

  // NOTE: Headline KPIs are computed exclusively by the authoritative
  // `computeMdaKpis` engine (see `kpis` above), which resolves every
  // determinant by question LABEL per the Owner's published definitions.
  // Earlier duplicate, field-name-based KPI computations were removed — they
  // were never rendered and ran O(n) work on every filter change.

  // ── Trend (last 14 days) ──────────────────────────────────────
  const trend = useMemo(() => {
    const days: { date: string; key: string; checklist: number; followups: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push({ date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), key: d.toISOString().slice(0, 10), checklist: 0, followups: 0 });
    }
    const idx = new Map(days.map((d) => [d.key, d]));
    for (const s of checklist) {
      const k = s.submittedAt ? new Date(s.submittedAt).toISOString().slice(0, 10) : null;
      const row = k && idx.get(k); if (row) row.checklist++;
    }
    for (const s of followUps) {
      const k = s.submittedAt ? new Date(s.submittedAt).toISOString().slice(0, 10) : null;
      const row = k && idx.get(k); if (row) row.followups++;
    }
    return days;
  }, [checklist, followUps]);

  // ── Longitudinal linkage register ─────────────────────────────
  const linkage = useMemo(() => {
    const statusLabel = (v: any) => {
      const map: Record<string, string> = { "not started": "Not Started", ongoing: "Ongoing", halted: "Halted", completed: "Completed" };
      return v ? map[norm(v)] || stripTags(String(v)) : "";
    };
    const rows = [...primaryByCom.entries()].map(([ck, s]) => {
      const inner = fuByCommunity.get(ck);
      const completionSub = inner?.get(MDA_FOLLOWUP_COMPLETION)?.[0];
      const commoditySub = inner?.get(MDA_FOLLOWUP_COMMODITIES)?.[0];
      const adverseSub = inner?.get(MDA_FOLLOWUP_ADVERSE)?.[0];
      const mdaStatus =
        authoritativeStatusByCom.get(ck) ??
        statusLabel(completionSub?.data?.status_of_mda ?? s.data?.status_of_mda);
      return {
        id: s.id,
        community: pickGeo(s, "community") || "Unspecified",
        ward: pickGeo(s, "ward") || "—",
        lga: pickGeo(s, "lga") || "—",
        state: pickGeo(s, "state") || "—",
        supervisor: stripTags(s.submitter || s.data?.supervisor_name) || "—",
        visitDate: s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "—",
        visitTs: s.submittedAt ? new Date(s.submittedAt).getTime() : 0,
        risk: stripTags(s.data?.risk_category) || "",
        mdaStatus,
        hasCompletion: !!completionSub,
        hasCommodities: !!commoditySub,
        hasAdverse: !!adverseSub,
        commodityIssue: commoditySub
          ? (fuKeys.commodityAvailable
              ? mdaModel.isNo(fuKeys.commodityAvailable, commoditySub.data?.[fuKeys.commodityAvailable.key])
              : !POSITIVE.has(norm(commoditySub.data?.commodities_available ?? "yes"))) ||
            (fuKeys.commodityInadequate
              ? mdaModel.isYes(fuKeys.commodityInadequate, commoditySub.data?.[fuKeys.commodityInadequate.key])
              : !!commoditySub.data?.commodity_inadequate)
          : false,
        adverseManaged: adverseSub
          ? (fuKeys.adverseManaged
              ? mdaModel.isYes(fuKeys.adverseManaged, adverseSub.data?.[fuKeys.adverseManaged.key])
              : POSITIVE.has(norm(adverseSub.data?.ae_been_managed)))
          : null,
      };
    });
    rows.sort((a, b) => b.visitTs - a.visitTs);
    // Apply module filter to the register.
    if (fModule === MDA_FOLLOWUP_COMPLETION) return rows.filter((r) => r.hasCompletion);
    if (fModule === MDA_FOLLOWUP_COMMODITIES) return rows.filter((r) => r.hasCommodities);
    if (fModule === MDA_FOLLOWUP_ADVERSE) return rows.filter((r) => r.hasAdverse);
    return rows;
  }, [primaryByCom, fuByCommunity, fModule, authoritativeStatusByCom, fuKeys, mdaModel]);

  // Paginate the register so the DOM stays light with very large datasets
  // (thousands of communities) instead of rendering every row at once.
  const register = useTablePagination(linkage, 25);



  // ── Field worker accountability ───────────────────────────────
  // Reconciles with the headline KPIs: `checklist` submissions are the supervised
  // community visits (the "12" everywhere else), `followups` are the linked
  // follow-up module submissions. Total = checklist + follow-ups so the column
  // sums always tally with the dashboard header counts.
  const workers = useMemo(() => {
    const map = new Map<string, {
      name: string; checklist: number; followups: number;
      communities: Set<string>; days: Set<string>; last: number;
    }>();
    const tally = (s: typeof checklist[number], isFollowUp: boolean) => {
      const name = stripTags(s.submitter || s.data?.supervisor_name) || "Unknown";
      const rec = map.get(name) || {
        name, checklist: 0, followups: 0,
        communities: new Set<string>(), days: new Set<string>(), last: 0,
      };
      if (isFollowUp) rec.followups++; else {
        rec.checklist++;
        const c = pickGeo(s, "community");
        if (c) rec.communities.add(c.toLowerCase().trim());
      }
      if (s.submittedAt) {
        rec.days.add(new Date(s.submittedAt).toISOString().slice(0, 10));
        rec.last = Math.max(rec.last, new Date(s.submittedAt).getTime());
      }
      map.set(name, rec);
    };
    for (const s of checklist) tally(s, false);
    for (const s of followUps) tally(s, true);
    return [...map.values()]
      .map((r) => ({
        name: r.name,
        checklist: r.checklist,
        followups: r.followups,
        subs: r.checklist + r.followups,
        communities: r.communities.size,
        days: r.days.size,
        last: r.last ? new Date(r.last).toLocaleDateString() : "—",
      }))
      .sort((a, b) => b.subs - a.subs).slice(0, 12);
  }, [checklist, followUps]);

  // ── Map ───────────────────────────────────────────────────────
  const mapSubs = useMemo(
    () => checklist.map((s) => ({
      id: s.id, state: s.state, lga: s.lga, submitter: s.submitter,
      submittedAt: s.submittedAt, status: s.status,
      location: s.location || (() => {
        const g = s.data?.geolocation || s.data?.geopoint;
        if (typeof g === "string") {
          const m = g.match(/(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
          if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
        }
        return null;
      })(),
    })),
    [checklist],
  );
  const isJigawa = useMemo(() => {
    const n2 = (v: any) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/jigawa/i.test(formName || "")) return true;
    const jig = checklist.filter((s) => n2(pickGeo(s, "state")) === "jigawa").length;
    return jig > 0 && jig >= checklist.length * 0.6;
  }, [checklist, formName]);
  const isFct = useMemo(() => {
    const n2 = (v: any) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/endfund|\bfct\b|abuja|federalcapital/i.test(`${projectName || ""} ${formName || ""}`)) return true;
    const fctStates = new Set(["fct", "abuja", "federalcapitalterritory", "fctabuja"]);
    const fct = checklist.filter((s) => fctStates.has(n2(pickGeo(s, "state")))).length;
    return fct > 0 && fct >= checklist.length * 0.6;
  }, [checklist, formName, projectName]);
  const householdMapDefaultState = useMemo(() => {
    if (fState !== ALL) return fState;
    if (states.length === 1) return states[0];
    if (/jigawa/i.test(`${projectName || ""} ${formName || ""}`)) return "Jigawa";
    if (/endfund|\bfct\b|abuja|federalcapital/i.test(`${projectName || ""} ${formName || ""}`)) return "FCT";
    return null;
  }, [fState, states, projectName, formName]);

  // ── Export ────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      await exportMdaDashboard(filtered as any, questions as any, formName || "Integrated MDA Supervisory Checklist", projectName);
      toast.success("Dashboard exported to Excel");
    } catch (e: any) {
      toast.error(e?.message || "Could not export dashboard");
    } finally {
      setExporting(false);
    }
  };

  // ── Empty state ───────────────────────────────────────────────
  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No submissions yet. As supervisors send in the Integrated MDA Supervisory Checklist, this dashboard updates automatically.
        </CardContent>
      </Card>
    );
  }



  return (
    <div className="space-y-4">
      {/* ── Navy report header ── */}
      <div className="overflow-hidden rounded-2xl text-white shadow-sm" style={{ background: `linear-gradient(160deg, ${NAVY}, #163a63)` }}>
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <ShieldCheck className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold tracking-tight">Integrated MDA Supervisory Dashboard</h2>
              <p className="text-sm text-white/70">Community Checklist with longitudinal follow-up linkage · {formName || "MDA Supervisory Checklist"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleExport} disabled={exporting} className="h-9 border-0 bg-white/15 text-white hover:bg-white/25">
              {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              Export Excel
            </Button>
          </div>
        </div>
        {/* Scope strip */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 bg-black/10 px-5 py-2.5 text-[11px] text-white/80">
          {[
            { icon: MapIcon, label: "States", value: states.length },
            { icon: Building2, label: "LGAs", value: lgas.length },
            { icon: Layers, label: "Wards", value: wards.length },
            { icon: MapPin, label: "Communities", value: communitiesSupervised },
            { icon: ClipboardList, label: "Checklist visits", value: total },
            { icon: Activity, label: "Follow-ups", value: followUps.length },
          ].map((c) => (
            <span key={c.label} className="flex items-center gap-1.5">
              <c.icon className="h-3.5 w-3.5 text-white/60" />
              <span className="font-semibold text-white">{fmt(c.value)}</span> {c.label}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-white/60" /> Generated {new Date().toLocaleString()}
          </span>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <Card>
        <CardContent className="p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
            <Filter className="h-3.5 w-3.5 text-primary" /> Filters
            {filtersActive && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs" onClick={resetFilters}>
                <RotateCcw className="mr-1 h-3 w-3" /> Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
            <Select value={fState} onValueChange={(v) => { setFState(v); setFLga(ALL); setFWard(ALL); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All states</SelectItem>
                {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fLga} onValueChange={(v) => { setFLga(v); setFWard(ALL); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="LGA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All LGAs</SelectItem>
                {lgas.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fWard} onValueChange={setFWard}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Ward" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All wards</SelectItem>
                {wards.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any status</SelectItem>
                <SelectItem value="sent">Submitted</SelectItem>
                <SelectItem value="finalized">Finalized</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fModule} onValueChange={setFModule}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Follow-up module" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All modules</SelectItem>
                <SelectItem value={MDA_FOLLOWUP_COMPLETION}>MDA Completion</SelectItem>
                <SelectItem value={MDA_FOLLOWUP_COMMODITIES}>MDA Commodities</SelectItem>
                <SelectItem value={MDA_FOLLOWUP_ADVERSE}>Adverse Reactions</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="h-9 text-xs" aria-label="From date" />
            <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="h-9 text-xs" aria-label="To date" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search community…" className="h-9 pl-8 text-xs" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={MapPin} label="Communities Supervised" value={fmt(kpis.communitiesSupervised)} sub={`${fmt(kpis.distinctCommunities)} distinct communit${kpis.distinctCommunities === 1 ? "y" : "ies"}`} tint={BLUE} onExport={() => exportKpi("communitiesSupervised")} exporting={kpiExporting === "communitiesSupervised"} />
        <Kpi icon={CheckCircle2} label="MDA Completed" value={`${kpis.mdaCompleted.pct}%`} sub={`${fmt(kpis.mdaCompleted.done)} of ${fmt(kpis.mdaCompleted.total)} submissions`} tint={EMERALD} bar={kpis.mdaCompleted.pct} onExport={() => exportKpi("mdaCompleted")} exporting={kpiExporting === "mdaCompleted"} />
        <Kpi icon={Pill} label="Sufficient Medicine" value={`${kpis.sufficientMedicine.pct}%`} sub={`${fmt(kpis.sufficientMedicine.yes)} of ${fmt(kpis.sufficientMedicine.total)} submissions`} tint={TEAL} bar={kpis.sufficientMedicine.pct} onExport={() => exportKpi("sufficientMedicine")} exporting={kpiExporting === "sufficientMedicine"} />
        <Kpi icon={Activity} label="Follow-up Coverage" value={kpis.followUpCoverage.needing ? `${kpis.followUpCoverage.pct}%` : "—"} sub={`${fmt(kpis.followUpCoverage.followed)} of ${fmt(kpis.followUpCoverage.needing)} needing follow-up`} tint={VIOLET} bar={kpis.followUpCoverage.needing ? kpis.followUpCoverage.pct : undefined} onExport={() => exportKpi("followUpCoverage")} exporting={kpiExporting === "followUpCoverage"} />
        <Kpi icon={AlertTriangle} label="Adverse Cases Managed" value={kpis.adverseManaged.reported ? `${kpis.adverseManaged.pct}%` : "—"} sub={`${fmt(kpis.adverseManaged.managed)} of ${fmt(kpis.adverseManaged.reported)} SAE cases`} tint={AMBER} bar={kpis.adverseManaged.reported ? kpis.adverseManaged.pct : undefined} onExport={() => exportKpi("adverseManaged")} exporting={kpiExporting === "adverseManaged"} />
        <Kpi icon={Flag} label="Red-flag Sites" value={fmt(kpis.redFlagSites)} sub="communities needing action" tint={RED} onExport={() => exportKpi("redFlagSites")} exporting={kpiExporting === "redFlagSites"} />
      </div>

      {/* ── Longitudinal funnel ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <ArrowRight className="h-4 w-4 text-primary" /> Longitudinal Linkage Funnel
            <span className="font-normal text-muted-foreground">— Community Checklist → follow-up outcomes</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {funnel.map((f, i) => {
              const p = f.pctOverride ?? pct(f.value, f.base);
              return (
                <div key={f.label} className="relative rounded-xl border border-border bg-card p-3" style={{ background: `linear-gradient(135deg, ${f.tint}0d, transparent 70%)` }}>
                  <div className="flex items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${f.tint}1a`, color: f.tint }}><f.icon className="h-4 w-4" /></span>
                    {i > 0 && <span className="text-[11px] font-bold" style={{ color: f.tint }}>{p}%</span>}
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold" style={{ color: f.tint }}>{fmt(f.value)}</p>
                  <p className="text-[11px] text-muted-foreground">{f.label}</p>
                  {i > 0 && (
                    <>
                      <p className="text-[10px] text-muted-foreground/80">of {fmt(f.base)} requiring follow-up</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${p}%`, background: f.tint }} />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Follow-up outcome heatmaps (categories × LGA, first visit + follow-up) ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <HeatmapPanel
          title="MDA Completion Outcomes"
          icon={CheckCircle2}
          tint={EMERALD}
          baseTint={EMERALD}
          heat={kpis.completionHeatmap}
          empty="No MDA Completion data yet."
          onCell={(cat, lga) => openHeatDrill(kpis.completionHeatmap, cat, lga, "MDA Completion Outcomes", EMERALD)}
        />
        <HeatmapPanel
          title="Commodities Follow-up"
          icon={Pill}
          tint={TEAL}
          baseTint={TEAL}
          heat={kpis.commoditiesHeatmap}
          empty="No commodity gaps reported."
          onCell={(cat, lga) => openHeatDrill(kpis.commoditiesHeatmap, cat, lga, "Commodities Follow-up", TEAL)}
        />
        <HeatmapPanel
          title="Adverse Reactions"
          icon={AlertTriangle}
          tint={AMBER}
          baseTint={AMBER}
          heat={kpis.adverseHeatmap}
          empty="No adverse reactions reported."
          onCell={(cat, lga) => openHeatDrill(kpis.adverseHeatmap, cat, lga, "Adverse Reactions", AMBER)}
        />
      </div>

      {/* ── Activity trend ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Supervision Activity Trend <span className="font-normal text-muted-foreground">(last 14 days)</span></CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <RTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="checklist" name="Checklist visits" stroke={BLUE} strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="followups" name="Follow-ups" stroke={EMERALD} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Insightful, conditionally-formatted analyses ── */}
      <MdaAdvancedAnalyses
        submissions={filtered as any}
        questions={questions as any}
        projectName={projectName}
        followUpFields={new Set(Object.values(moduleQuestions).flatMap((s) => Array.from(s)))}
        offline={offline}
      />

      {/* ── Longitudinal follow-up outcome trend + duplicate community flags ── */}
      <MdaLongitudinalInsights
        checklist={checklist as any}
        submissions={filtered as any}
        questions={questions as any}
      />



      {/* ── Longitudinal linkage register ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <ClipboardList className="h-4 w-4 text-primary" /> Community Longitudinal Register
            <span className="ml-auto text-xs font-normal text-muted-foreground">{fmt(linkage.length)} communit{linkage.length === 1 ? "y" : "ies"}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Community</th>
                  <th className="px-3 py-2 font-semibold">Ward · LGA</th>
                  <th className="px-3 py-2 font-semibold">Visit</th>
                  <th className="px-3 py-2 font-semibold">MDA Completion</th>
                  <th className="px-3 py-2 font-semibold">Commodities</th>
                  <th className="px-3 py-2 font-semibold">Adverse</th>
                  <th className="px-3 py-2 font-semibold">Supervisor</th>
                </tr>
              </thead>
              <tbody>
                {linkage.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No communities match the current filters.</td></tr>
                ) : register.paginatedData.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-foreground">{r.community}</div>
                      {r.risk && <span className="text-[10px]" style={{ color: norm(r.risk) === "high" ? RED : SLATE }}>{r.risk} risk</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.ward} · {r.lga}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.visitDate}</td>
                    <td className="px-3 py-2">
                      {r.hasCompletion
                        ? <Tag text={r.mdaStatus || "Done"} tint={norm(r.mdaStatus) === "completed" ? EMERALD : norm(r.mdaStatus) === "halted" ? RED : BLUE} />
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.hasCommodities
                        ? <Tag text={r.commodityIssue ? "Issue" : "OK"} tint={r.commodityIssue ? AMBER : EMERALD} />
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.hasAdverse
                        ? <Tag text={r.adverseManaged ? "Managed" : "Reported"} tint={r.adverseManaged ? EMERALD : RED} />
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.supervisor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {register.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
              <span>
                Showing {register.startIndex + 1}–{Math.min(register.startIndex + register.pageSize, register.totalItems)} of {fmt(register.totalItems)}
              </span>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); register.prevPage(); }}
                      className={!register.hasPrev ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#" isActive onClick={(e) => e.preventDefault()}>
                      {register.currentPage} / {register.totalPages}
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); register.nextPage(); }}
                      className={!register.hasNext ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Coverage map ── */}
      {isJigawa ? (
        <JigawaSupervisoryMap submissions={mapSubs} formName={formName} />
      ) : isFct ? (
        <FctSupervisoryMap submissions={mapSubs} formName={formName} />
      ) : (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-1.5 text-sm"><MapPin className="h-4 w-4 text-primary" />Supervision Coverage Map</CardTitle></CardHeader>
          <CardContent><MdaSupervisoryMap submissions={mapSubs} formName={formName} /></CardContent>
        </Card>
      )}

      {/* ── Household coverage survey map (Coverage Evaluation 3D outcomes) ── */}
      <HouseholdCoverageSurveyMap
        projectId={projectId}
        formName={formName}
        stateFilter={fState === ALL ? null : fState}
        defaultState={householdMapDefaultState}
        dateFrom={fFrom ? fFrom + "T00:00:00" : null}
        dateTo={fTo ? fTo + "T23:59:59" : null}
        onSelectCommunity={openMapCommunityDrill}
        onSelectLga={openMapLgaDrill}
      />


      {/* ── Field worker accountability ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-1.5 text-sm"><Users2 className="h-4 w-4 text-primary" />Field Worker Submissions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Field worker</th>
                  <th className="px-3 py-2 text-right font-semibold">Submissions</th>
                  <th className="px-3 py-2 text-right font-semibold">Days worked</th>
                  <th className="px-3 py-2 text-right font-semibold">Last active</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.name} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium text-foreground">{w.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(w.subs)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(w.days)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">{w.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Heatmap cell drill-down ── */}
      <MdaDrillDownSheet
        data={drill}
        questions={questions as any}
        followUpFields={followUpFieldSet}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}
