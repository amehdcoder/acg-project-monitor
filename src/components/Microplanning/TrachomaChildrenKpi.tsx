import { memo, useMemo } from "react";
import { Eye, Users, CheckCircle2 } from "lucide-react";
import { trachomaChildrenTotals } from "@/lib/microplanning/trachomaChildren";

function TrachomaChildrenKpi({ entries }: { entries: Record<string, unknown>[] }) {
  const totals = useMemo(() => trachomaChildrenTotals(entries), [entries]);
  return <section aria-label="Children 1–9 years population" className="border-y border-border bg-card py-4 px-3 sm:px-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1.2fr] gap-4 items-center">
      <div className="flex gap-3 items-start">
        <span className="p-2 rounded-md bg-chart-secondary/10 text-chart-secondary"><Eye className="h-5 w-5" /></span>
        <div><h3 className="text-xs font-semibold text-muted-foreground">Children 1–9 years</h3><p className="text-2xl font-bold tabular-nums text-foreground mt-1">{totals.anyRecorded ? totals.total.toLocaleString() : "Not recorded"}</p><span className="text-[10px] text-muted-foreground">Recorded population · Trachoma</span></div>
      </div>
      <div className="flex items-center gap-3"><Users className="h-4 w-4 text-chart-primary" /><div><p className="text-[11px] text-muted-foreground">Male</p><p className="text-lg font-semibold tabular-nums text-chart-primary">{totals.maleRecorded ? totals.male.toLocaleString() : "—"}</p></div></div>
      <div className="flex items-center gap-3"><Users className="h-4 w-4 text-chart-secondary" /><div><p className="text-[11px] text-muted-foreground">Female</p><p className="text-lg font-semibold tabular-nums text-chart-secondary">{totals.femaleRecorded ? totals.female.toLocaleString() : "—"}</p></div></div>
      <div className="space-y-1.5"><p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />Both sexes recorded</p><p className="text-sm font-semibold tabular-nums">{totals.complete.toLocaleString()} / {totals.communities.toLocaleString()} communities</p>{totals.complete < totals.communities && <p className="text-[10px] text-status-warning">Incomplete population evidence</p>}</div>
    </div>
  </section>;
}
export default memo(TrachomaChildrenKpi);