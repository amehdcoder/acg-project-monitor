import { useMemo } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const COMMUNITY_POP_FLAG = 30000;
export const SETTLEMENT_POP_FLAG = 10000;

interface Props {
  entries: Record<string, any>[];
}

type FlagRow = {
  id: string;
  kind: "Community" | "Settlement";
  name: string;
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  population: number;
  threshold: number;
};

/**
 * Oversized-population watchlist: communities ≥ 30,000 and settlements ≥ 10,000
 * estimated total population, with their full administrative context.
 */
const LargePopulationFlags = ({ entries }: Props) => {
  const rows = useMemo<FlagRow[]>(() => {
    const out: FlagRow[] = [];
    for (const e of entries) {
      const pop = Number(e.estimated_total_population) || 0;
      if (!pop) continue;
      const base = {
        state: e.state || "—",
        lga: e.lga || "—",
        ward: e.ward || "—",
        flhf: e.flhf_name || "—",
        population: pop,
      };
      if (e.settlement_name && pop >= SETTLEMENT_POP_FLAG) {
        out.push({ id: `${e.id}-s`, kind: "Settlement", name: e.settlement_name, threshold: SETTLEMENT_POP_FLAG, ...base });
      } else if (pop >= COMMUNITY_POP_FLAG) {
        out.push({ id: `${e.id}-c`, kind: "Community", name: e.community_name || "—", threshold: COMMUNITY_POP_FLAG, ...base });
      }
    }
    return out.sort((a, b) => b.population - a.population);
  }, [entries]);

  const communities = rows.filter((r) => r.kind === "Community").length;
  const settlements = rows.length - communities;

  return (
    <Card className="border-amber-500/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-foreground">Oversized Population Flags</h3>
            <Badge variant="outline" className="text-[10px]">
              Communities ≥ {COMMUNITY_POP_FLAG.toLocaleString()} · Settlements ≥ {SETTLEMENT_POP_FLAG.toLocaleString()}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {communities} communities · {settlements} settlements
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No community or settlement crosses the population thresholds in the current scope.</p>
        ) : (
          <div className="max-h-[360px] overflow-auto rounded-md border border-border/60">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                <tr className="text-left text-muted-foreground">
                  {["Type", "Name", "State", "LGA", "Ward", "Health Facility", "Population"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-muted/30">
                    <td className="px-2 py-1.5">
                      <Badge variant={r.kind === "Community" ? "destructive" : "secondary"} className="text-[9px]">{r.kind}</Badge>
                    </td>
                    <td className="px-2 py-1.5 font-medium text-foreground">{r.name}</td>
                    <td className="px-2 py-1.5">{r.state}</td>
                    <td className="px-2 py-1.5">{r.lga}</td>
                    <td className="px-2 py-1.5">{r.ward}</td>
                    <td className="px-2 py-1.5">{r.flhf}</td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-amber-700">{r.population.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LargePopulationFlags;
