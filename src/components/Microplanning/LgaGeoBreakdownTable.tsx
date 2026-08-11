import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Grid3x3, Home, Building2, MapPin, Landmark } from "lucide-react";
import { toast } from "sonner";
import { buildLgaBreakdown, exportLgaBreakdown } from "@/lib/microplanning/lgaGeoBreakdown";

interface Props {
  entries: any[];
  scopeLabel?: string;
}

const n = (v: number) => v.toLocaleString();

const COLS = [
  { key: "wards", label: "Wards", icon: Landmark, tone: "text-sky-600" },
  { key: "flhfs", label: "Health Facilities", icon: Building2, tone: "text-indigo-600" },
  { key: "communities", label: "Communities", icon: Home, tone: "text-emerald-600" },
  { key: "settlements", label: "Settlements", icon: MapPin, tone: "text-amber-600" },
] as const;

/** Unique Wards / FLHF / Communities / Settlements per LGA, with Excel export. */
const LgaGeoBreakdownTable = ({ entries, scopeLabel = "All data" }: Props) => {
  const { rows, totals } = useMemo(() => buildLgaBreakdown(entries), [entries]);

  const download = () => {
    try {
      const file = exportLgaBreakdown({ rows, totals }, scopeLabel);
      toast.success(`Exported ${file}`);
    } catch (err) {
      toast.error("Export failed: " + (err as Error).message);
    }
  };

  const max = (key: (typeof COLS)[number]["key"]) =>
    rows.reduce((m, r) => Math.max(m, r[key]), 0) || 1;

  return (
    <Card className="border-primary/20 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Grid3x3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Geography Coverage per LGA</h3>
            <Badge variant="secondary" className="text-[10px]">{rows.length} LGA{rows.length === 1 ? "" : "s"}</Badge>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={download} disabled={!rows.length}>
            <Download className="h-3.5 w-3.5" /> Export Excel
          </Button>
        </div>

        <div className="max-h-[420px] overflow-auto rounded-lg border border-border/50">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="text-left">
                <th className="px-2.5 py-2 font-semibold text-muted-foreground">LGA</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-2.5 py-2 font-semibold text-muted-foreground whitespace-nowrap">
                    <span className="inline-flex items-center gap-1"><c.icon className={`h-3 w-3 ${c.tone}`} />{c.label}</span>
                  </th>
                ))}
                <th className="px-2.5 py-2 font-semibold text-muted-foreground text-right">Records</th>
                <th className="px-2.5 py-2 font-semibold text-muted-foreground text-right">Population</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.state}-${r.lga}`} className="border-t border-border/40 hover:bg-muted/40 transition-colors">
                  <td className="px-2.5 py-1.5">
                    <span className="font-semibold text-foreground">{r.lga || "—"}</span>
                    {r.state && <span className="ml-1 text-[9px] uppercase tracking-wide text-muted-foreground">{r.state}</span>}
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums font-semibold text-foreground w-8">{n(r[c.key])}</span>
                        <span className="h-1.5 flex-1 min-w-[28px] rounded-full bg-muted overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-current opacity-70"
                            style={{ width: `${Math.round((r[c.key] / max(c.key)) * 100)}%` }}
                          />
                        </span>
                      </div>
                    </td>
                  ))}
                  <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.records)}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.population)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={7} className="px-2.5 py-6 text-center text-muted-foreground">No records in the current scope</td></tr>
              )}
            </tbody>
            {!!rows.length && (
              <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur">
                <tr className="border-t border-border">
                  <td className="px-2.5 py-2 font-bold text-foreground">Total (sum per LGA)</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-2.5 py-2 font-bold tabular-nums text-foreground">{n(totals[c.key])}</td>
                  ))}
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.records)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.population)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Counts use the same blank-excluding composite keys as the dashboard KPIs, so identically named
          wards, facilities or communities in different parents are never collapsed.
        </p>
      </CardContent>
    </Card>
  );
};

export default LgaGeoBreakdownTable;
