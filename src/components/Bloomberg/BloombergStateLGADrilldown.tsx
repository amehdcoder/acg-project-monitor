import { useState } from "react";
import { ChevronRight, ChevronDown, Layers, MapPin, CheckCircle2, MinusCircle } from "lucide-react";

const fmt = (n: number) => n.toLocaleString();

interface LgaNode {
  lga: string;
  submissions: number;
  validatedSchools: number;
  validated: number;
  baseline: number;
  notFound: number;
  variancePct: number;
  sampleSize: number;
  ciLow: number | null;
  ciHigh: number | null;
  significant: boolean;
  pValue: number | null;
}

interface StateNode extends Omit<LgaNode, "lga"> {
  state: string;
  lgas: LgaNode[];
}

interface Props {
  data: StateNode[];
}

const varianceClass = (pct: number, hasBaseline: boolean) => {
  if (!hasBaseline) return "text-muted-foreground";
  const a = Math.abs(pct);
  if (a >= 20) return "text-red-600";
  if (a >= 10) return "text-amber-600";
  if (a >= 2) return "text-yellow-600";
  return "text-emerald-600";
};

const VarianceCell = ({ pct, baseline }: { pct: number; baseline: number }) => (
  <span className={`font-semibold tabular-nums ${varianceClass(pct, baseline > 0)}`}>
    {baseline > 0 ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
  </span>
);

const pctTxt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

// 95% confidence interval for the mean per-school variance within the unit.
const CICell = ({ low, high, n }: { low: number | null; high: number | null; n: number }) => {
  if (low === null || high === null || n < 2) {
    return <span className="text-[11px] text-muted-foreground">n={n} (insufficient)</span>;
  }
  return (
    <span className="text-[11px] tabular-nums text-slate-600">
      [{pctTxt(low)}, {pctTxt(high)}] · n={n}
    </span>
  );
};

// Significance verdict: does the 95% CI exclude zero?
const SigBadge = ({ significant, n }: { significant: boolean; n: number }) => {
  if (n < 2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
        <MinusCircle className="h-3 w-3" /> n/a
      </span>
    );
  }
  return significant ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
      <CheckCircle2 className="h-3 w-3" /> Significant
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
      Not signif.
    </span>
  );
};

export default function BloombergStateLGADrilldown({ data }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (state: string) => setOpen((p) => ({ ...p, [state]: !p[state] }));

  const totals = data.reduce(
    (acc, s) => {
      acc.submissions += s.submissions;
      acc.validatedSchools += s.validatedSchools;
      acc.notFound += s.notFound;
      return acc;
    },
    { submissions: 0, validatedSchools: 0, notFound: 0 },
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Layers className="h-4 w-4 text-[#2563eb]" />
        <h3 className="text-sm font-semibold text-foreground">Validation by State &amp; LGA</h3>
        <span className="ml-auto rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
          {fmt(data.length)} states
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Disaggregated submissions, validated pupils and variance vs LEA baseline, with a 95% confidence interval and a
        statistical-significance verdict (CI excludes 0). Click a state to drill into its LGAs.
      </p>

      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No submitted validations yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">State / LGA</th>
                <th className="py-2 px-3 text-right">Submissions</th>
                <th className="py-2 px-3 text-right">Schools</th>
                <th className="py-2 px-3 text-right">Not Found</th>
                <th className="py-2 px-3 text-right">Baseline</th>
                <th className="py-2 px-3 text-right">Validated</th>
                <th className="py-2 px-3 text-right">Variance</th>
                <th className="py-2 px-3 text-right">95% CI</th>
                <th className="py-2 pl-3 text-center">Significance</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const isOpen = !!open[s.state];
                return (
                  <>
                    <tr
                      key={s.state}
                      onClick={() => toggle(s.state)}
                      className="cursor-pointer border-b border-border/60 bg-muted/30 font-medium transition-colors hover:bg-muted/60"
                    >
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-1.5 text-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          {s.state}
                          <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-600">
                            {s.lgas.length} LGA{s.lgas.length === 1 ? "" : "s"}
                          </span>
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(s.submissions)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(s.validatedSchools)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums ${s.notFound > 0 ? "text-red-600" : "text-muted-foreground"}`}>{fmt(s.notFound)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{s.baseline > 0 ? fmt(s.baseline) : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(s.validated)}</td>
                      <td className="py-2 px-3 text-right"><VarianceCell pct={s.variancePct} baseline={s.baseline} /></td>
                      <td className="py-2 px-3 text-right"><CICell low={s.ciLow} high={s.ciHigh} n={s.sampleSize} /></td>
                      <td className="py-2 pl-3 text-center"><SigBadge significant={s.significant} n={s.sampleSize} /></td>
                    </tr>
                    {isOpen &&
                      s.lgas.map((l) => (
                        <tr key={`${s.state}-${l.lga}`} className="border-b border-border/40 last:border-0">
                          <td className="py-1.5 pr-3 pl-8">
                            <span className="flex items-center gap-1.5 text-xs text-foreground">
                              <MapPin className="h-3 w-3 text-[#2563eb]" />
                              {l.lga}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmt(l.submissions)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmt(l.validatedSchools)}</td>
                          <td className={`py-1.5 px-3 text-right tabular-nums ${l.notFound > 0 ? "text-red-600" : "text-muted-foreground"}`}>{fmt(l.notFound)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{l.baseline > 0 ? fmt(l.baseline) : "—"}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmt(l.validated)}</td>
                          <td className="py-1.5 px-3 text-right"><VarianceCell pct={l.variancePct} baseline={l.baseline} /></td>
                          <td className="py-1.5 px-3 text-right"><CICell low={l.ciLow} high={l.ciHigh} n={l.sampleSize} /></td>
                          <td className="py-1.5 pl-3 text-center"><SigBadge significant={l.significant} n={l.sampleSize} /></td>
                        </tr>
                      ))}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2 pr-3 text-foreground">Total ({data.length} states)</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmt(totals.submissions)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmt(totals.validatedSchools)}</td>
                <td className={`py-2 px-3 text-right tabular-nums ${totals.notFound > 0 ? "text-red-600" : "text-muted-foreground"}`}>{fmt(totals.notFound)}</td>
                <td className="py-2 px-3 text-right" colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
