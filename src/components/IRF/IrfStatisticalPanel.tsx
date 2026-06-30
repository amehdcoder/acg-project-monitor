import { useMemo } from "react";
import { Sigma, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { analyzeStatistics } from "@/lib/irf/statistics";
import type { IrfReport } from "@/lib/irf/definition";

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));

export default function IrfStatisticalPanel({ rows }: { rows: IrfReport[] }) {
  const s = useMemo(() => analyzeStatistics(rows), [rows]);

  if (!s.indicators.length) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <Sigma className="mx-auto mb-2 h-7 w-7 opacity-40" />
        No numeric indicators captured yet for statistical analysis.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 p-4">
        <Sigma className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Statistical Analysis of Indicators</h3>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> {s.reportsPerActiveMonth} reports / active month</span>
          {s.momGrowthPct != null && (
            <span className={`inline-flex items-center gap-1 font-medium ${s.momGrowthPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {s.momGrowthPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {s.momGrowthPct >= 0 ? "+" : ""}{s.momGrowthPct}% reach MoM
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold">Indicator</th>
              <th className="px-3 py-2 text-right font-semibold">n</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
              <th className="px-3 py-2 text-right font-semibold">Mean</th>
              <th className="px-3 py-2 text-right font-semibold">Median</th>
              <th className="px-3 py-2 text-right font-semibold">95% CI</th>
              <th className="px-3 py-2 text-right font-semibold">SD</th>
              <th className="px-3 py-2 text-right font-semibold">Range</th>
              <th className="px-3 py-2 text-right font-semibold" title="Coefficient of variation — lower is more consistent">Consistency</th>
            </tr>
          </thead>
          <tbody>
            {s.indicators.map((ind) => {
              const consistency = ind.cv <= 50 ? "High" : ind.cv <= 100 ? "Moderate" : "Variable";
              const cColor = ind.cv <= 50 ? "text-emerald-600" : ind.cv <= 100 ? "text-amber-600" : "text-rose-600";
              return (
                <tr key={ind.key} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2 font-medium text-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: ind.color }} />
                      {ind.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{ind.n}</td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{fmt(ind.sum)}</td>
                  <td className="px-3 py-2 text-right text-foreground">{fmt(ind.mean)}</td>
                  <td className="px-3 py-2 text-right text-foreground">{fmt(ind.median)}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">{fmt(ind.ciLow)} – {fmt(ind.ciHigh)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmt(ind.sd)}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">{fmt(ind.min)}–{fmt(ind.max)}</td>
                  <td className={`px-3 py-2 text-right text-xs font-medium ${cColor}`}>{consistency}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        95% confidence interval of the mean (normal approximation). “Consistency” reflects the coefficient of variation across reports — lower variation indicates more uniform field performance.
      </p>
    </Card>
  );
}
