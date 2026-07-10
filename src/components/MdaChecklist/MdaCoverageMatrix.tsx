import { useMemo } from "react";
import { Home, Users2, ShieldCheck, Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testAgainstBenchmark } from "@/lib/ces/coverageStats";

/* ─────────────────────────── palette (matches brand table) ─────────────────────────── */
const NAVY = "#0c2340";
const NAVY_SOFT = "#12325c";
const BLUE = "#1e63c7";
const PURPLE = "#6d28d9";
const TEAL = "#0e7490";
const GREEN = "#15803d";
const ORANGE = "#b45309";
const EMERALD = "#10b981";
const RED = "#ef4444";
const AMBER = "#f59e0b";

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const fmt = (n: number) => n.toLocaleString();
const fmt1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—");

interface PersonRow { offered?: string; swallowed?: string }
export interface HouseholdRecord {
  cdd_came?: string;
  anyone_treated?: string;
  offered_count?: number;
  swallowed_count?: number;
  people?: PersonRow[];
}
export interface CoverageSurveyRow {
  state: string | null;
  lga: string | null;
  ward: string | null;
  community_name: string | null;
  target_households: number | null;
  completed_households: number | null;
  households: HouseholdRecord[] | null;
}

const personsOffered = (h: HouseholdRecord) =>
  Math.max(Number(h.offered_count) || 0, (h.people || []).filter((p) => norm(p.offered) === "y").length);
const personsSwallowed = (h: HouseholdRecord) =>
  Math.max(Number(h.swallowed_count) || 0, (h.people || []).filter((p) => norm(p.swallowed) === "y").length);

interface WardRow {
  key: string;
  lga: string;
  ward: string;
  sampled: number;
  interviewed: number;
  treatedHh: number;
  eligible: number;
  swallowed: number;
}
interface LgaGroup {
  lga: string;
  wards: WardRow[];
}

function build(surveys: CoverageSurveyRow[]): { groups: LgaGroup[]; totals: WardRow } {
  const map = new Map<string, WardRow>();
  for (const s of surveys) {
    const lga = s.lga || "—";
    const ward = s.ward || "Unspecified";
    const key = `${norm(lga)}|${norm(ward)}`;
    let r = map.get(key);
    if (!r) {
      r = { key, lga, ward, sampled: 0, interviewed: 0, treatedHh: 0, eligible: 0, swallowed: 0 };
      map.set(key, r);
    }
    const hh = s.households || [];
    r.interviewed += hh.length;
    r.sampled += Math.max(Number(s.target_households) || 0, hh.length);
    for (const h of hh) {
      if (norm(h.anyone_treated) === "yes") r.treatedHh += 1;
      r.eligible += personsOffered(h);
      r.swallowed += personsSwallowed(h);
    }
  }
  const rows = [...map.values()];
  const groupMap = new Map<string, LgaGroup>();
  for (const r of rows) {
    const gk = norm(r.lga);
    let g = groupMap.get(gk);
    if (!g) { g = { lga: r.lga, wards: [] }; groupMap.set(gk, g); }
    g.wards.push(r);
  }
  const groups = [...groupMap.values()]
    .map((g) => ({ ...g, wards: g.wards.sort((a, b) => a.ward.localeCompare(b.ward)) }))
    .sort((a, b) => a.lga.localeCompare(b.lga));
  const totals = rows.reduce<WardRow>(
    (acc, r) => {
      acc.sampled += r.sampled; acc.interviewed += r.interviewed; acc.treatedHh += r.treatedHh;
      acc.eligible += r.eligible; acc.swallowed += r.swallowed;
      return acc;
    },
    { key: "total", lga: "", ward: "", sampled: 0, interviewed: 0, treatedHh: 0, eligible: 0, swallowed: 0 },
  );
  return { groups, totals };
}

function ci(successes: number, total: number): [number, number] | null {
  if (total <= 0) return null;
  const t = testAgainstBenchmark(Math.min(successes, total), total, 100);
  return t.ci95;
}

/** Quality badge from therapeutic coverage vs target. */
function quality(txCov: number, target: number): { label: string; color: string } {
  if (txCov >= target) return { label: "GOOD", color: GREEN };
  if (txCov >= target - 5) return { label: "FAIR", color: AMBER };
  return { label: "LOW", color: RED };
}

const HDR = { color: "#ffffff", fontWeight: 700 } as const;

function GroupCell({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <th className="px-2 py-2 text-center text-[10px] uppercase tracking-wide" style={{ background: bg, ...HDR }}>
      {children}
    </th>
  );
}

interface Props {
  surveys: CoverageSurveyRow[];
  txTarget?: number;
  onExport?: () => void;
}

export default function MdaCoverageMatrix({ surveys, txTarget = 75, onExport }: Props) {
  const { groups, totals } = useMemo(() => build(surveys), [surveys]);

  if (!groups.length) {
    return (
      <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
        No ward-level coverage data captured yet.
      </div>
    );
  }

  const hhCovCell = (r: WardRow) => pct(r.treatedHh, r.interviewed);
  const txCovCell = (r: WardRow) => pct(r.swallowed, r.eligible);

  const renderRow = (r: WardRow, showLga: boolean, rowspan: number, zebra: boolean) => {
    const hhCov = hhCovCell(r);
    const txCov = txCovCell(r);
    const hhCI = ci(r.treatedHh, r.interviewed);
    const txCI = ci(r.swallowed, r.eligible);
    const q = quality(txCov, txTarget);
    const base = zebra ? "bg-muted/30" : "bg-background";
    return (
      <tr key={r.key} className={`border-b border-border/60 ${base}`}>
        {showLga && (
          <td rowSpan={rowspan} className="border-r border-border px-3 py-2 align-middle font-semibold text-foreground"
            style={{ background: "#eef2fb" }}>
            {r.lga}
          </td>
        )}
        <td className="px-3 py-2 font-medium text-foreground">{r.ward}</td>
        <td className="px-2 py-2 text-center tabular-nums text-foreground">{fmt(r.sampled)}</td>
        <td className="px-2 py-2 text-center tabular-nums text-foreground">{fmt(r.interviewed)}</td>
        <td className="px-2 py-2 text-center tabular-nums text-foreground">{fmt(r.treatedHh)}</td>
        <td className="px-2 py-2 text-center">
          <span className="inline-block rounded-md px-2 py-0.5 text-xs font-bold" style={{ background: `${BLUE}1a`, color: BLUE }}>
            {fmt1(hhCov)}%
          </span>
        </td>
        <td className="px-2 py-2 text-center tabular-nums" style={{ color: BLUE }}>{hhCI ? fmt1(hhCI[0]) : "—"}</td>
        <td className="px-2 py-2 text-center tabular-nums" style={{ color: BLUE }}>{hhCI ? fmt1(hhCI[1]) : "—"}</td>
        <td className="px-2 py-2 text-center tabular-nums" style={{ color: TEAL }}>{fmt(r.eligible)}</td>
        <td className="px-2 py-2 text-center tabular-nums" style={{ color: GREEN }}>{fmt(r.swallowed)}</td>
        <td className="px-2 py-2 text-center">
          <span className="inline-block rounded-md px-2 py-0.5 text-xs font-bold"
            style={{ background: `${(txCov >= txTarget ? EMERALD : RED)}1a`, color: txCov >= txTarget ? GREEN : RED }}>
            {fmt1(txCov)}%
          </span>
        </td>
        <td className="px-2 py-2 text-center tabular-nums" style={{ color: ORANGE }}>{txCI ? fmt1(txCI[0]) : "—"}</td>
        <td className="px-2 py-2 text-center tabular-nums" style={{ color: ORANGE }}>{txCI ? fmt1(txCI[1]) : "—"}</td>
        <td className="px-2 py-2 text-center">
          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: q.color }}>
            {q.label}
          </span>
        </td>
      </tr>
    );
  };

  const totalHhCov = pct(totals.treatedHh, totals.interviewed);
  const totalTxCov = pct(totals.swallowed, totals.eligible);
  const totalHhCI = ci(totals.treatedHh, totals.interviewed);
  const totalTxCI = ci(totals.swallowed, totals.eligible);
  const totalQ = quality(totalTxCov, txTarget);

  return (
    <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
      {/* Banner */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_SOFT})` }}>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white"><Home className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-white">MDA Coverage by LGA and Ward</h3>
          <p className="text-[11px] text-blue-200">Household &amp; Therapeutic Coverage Summary — Repeat Household Coverage Survey</p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-white/90">
          <span className="hidden items-center gap-1 text-[11px] sm:flex"><Home className="h-3.5 w-3.5" /> Household</span>
          <span className="hidden items-center gap-1 text-[11px] sm:flex"><Users2 className="h-3.5 w-3.5" /> Therapeutic</span>
          <span className="hidden items-center gap-1 text-[11px] sm:flex"><ShieldCheck className="h-3.5 w-3.5" /> Quality</span>
          {onExport && (
            <Button size="sm" variant="secondary" onClick={onExport} className="h-8 gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-xs">
          {/* group band */}
          <thead>
            <tr>
              <th colSpan={2} className="px-2 py-2 text-center text-[10px] uppercase tracking-wide" style={{ background: NAVY, ...HDR }}>Location</th>
              <GroupCell bg={BLUE}>Households</GroupCell>
              <th colSpan={1} className="px-2 py-2" style={{ background: BLUE }} />
              <th colSpan={1} className="px-2 py-2" style={{ background: BLUE }} />
              <th colSpan={1} className="px-2 py-2 text-center text-[10px] uppercase tracking-wide" style={{ background: BLUE, ...HDR }}>HH Cov.</th>
              <th colSpan={2} className="px-2 py-2 text-center text-[10px] uppercase tracking-wide" style={{ background: PURPLE, ...HDR }}>Household Coverage (95% CI)</th>
              <th colSpan={1} className="px-2 py-2 text-center text-[10px] uppercase tracking-wide" style={{ background: TEAL, ...HDR }}>Eligible</th>
              <th colSpan={2} className="px-2 py-2 text-center text-[10px] uppercase tracking-wide" style={{ background: GREEN, ...HDR }}>Therapeutic Coverage</th>
              <th colSpan={2} className="px-2 py-2 text-center text-[10px] uppercase tracking-wide" style={{ background: ORANGE, ...HDR }}>Therapeutic Coverage (95% CI)</th>
              <th className="px-2 py-2" style={{ background: NAVY }} />
            </tr>
            <tr>
              <th className="px-3 py-2 text-left text-[10px] uppercase" style={{ background: NAVY, ...HDR }}>LGA</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase" style={{ background: NAVY, ...HDR }}>Ward</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: BLUE, ...HDR }}>Sampled HH</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: BLUE, ...HDR }}>Interviewed HH</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: BLUE, ...HDR }}>Treatment Took Place</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: BLUE, ...HDR }}>Coverage (%)</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: PURPLE, ...HDR }}>Lower (%)</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: PURPLE, ...HDR }}>Upper (%)</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: TEAL, ...HDR }}>Eligible Persons</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: GREEN, ...HDR }}>Offered &amp; Swallowed</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: GREEN, ...HDR }}>Coverage (%)</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: ORANGE, ...HDR }}>Lower (%)</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: ORANGE, ...HDR }}>Upper (%)</th>
              <th className="px-2 py-2 text-center text-[10px]" style={{ background: NAVY, ...HDR }}>Data Quality</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) =>
              g.wards.map((w, wi) => renderRow(w, wi === 0, g.wards.length, gi % 2 === 1)),
            )}
            {/* Totals */}
            <tr className="font-bold text-white" style={{ background: NAVY }}>
              <td className="px-3 py-2" colSpan={2}>TOTAL (ALL LGAs)</td>
              <td className="px-2 py-2 text-center tabular-nums">{fmt(totals.sampled)}</td>
              <td className="px-2 py-2 text-center tabular-nums">{fmt(totals.interviewed)}</td>
              <td className="px-2 py-2 text-center tabular-nums">{fmt(totals.treatedHh)}</td>
              <td className="px-2 py-2 text-center tabular-nums">{fmt1(totalHhCov)}%</td>
              <td className="px-2 py-2 text-center tabular-nums">{totalHhCI ? fmt1(totalHhCI[0]) : "—"}</td>
              <td className="px-2 py-2 text-center tabular-nums">{totalHhCI ? fmt1(totalHhCI[1]) : "—"}</td>
              <td className="px-2 py-2 text-center tabular-nums">{fmt(totals.eligible)}</td>
              <td className="px-2 py-2 text-center tabular-nums">{fmt(totals.swallowed)}</td>
              <td className="px-2 py-2 text-center tabular-nums">{fmt1(totalTxCov)}%</td>
              <td className="px-2 py-2 text-center tabular-nums">{totalTxCI ? fmt1(totalTxCI[0]) : "—"}</td>
              <td className="px-2 py-2 text-center tabular-nums">{totalTxCI ? fmt1(totalTxCI[1]) : "—"}</td>
              <td className="px-2 py-2 text-center">
                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: totalQ.color }}>{totalQ.label}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-1 border-t border-border bg-muted/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Info className="h-3.5 w-3.5" /> Household Coverage (%) = Households Where Treatment Took Place ÷ Interviewed Households × 100</span>
        <span>Therapeutic Coverage (%) = Offered &amp; Swallowed Medicine ÷ Eligible Persons × 100</span>
        <span>CI = Confidence Interval · Target = {txTarget}%</span>
      </div>
    </div>
  );
}
