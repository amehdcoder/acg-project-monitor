import { useMemo } from "react";
import { AlertTriangle, Users, Accessibility, Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pwdTotalFor } from "@/lib/microplanning/disabilityTypes";

export const COMMUNITY_POP_FLAG = 30000;
export const SETTLEMENT_POP_FLAG = 10000;
export const PWD_FLAG = 50;
export const HOUSEHOLD_FLAG = 2000;

interface Props {
  entries: Record<string, any>[];
}

type FlagRow = {
  id: string;
  kind: "Community" | "Settlement" | "PWD" | "Households" | "HH > Pop";
  name: string;
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  population: number;
  pwd: number;
  households: number;
  threshold: number;
};

/**
 * Oversized-population watchlist: communities ≥ 30,000, settlements ≥ 10,000
 * estimated total population, and records with ≥ 50 persons with disability.
 */
const LargePopulationFlags = ({ entries }: Props) => {
  const rows = useMemo<FlagRow[]>(() => {
    const out: FlagRow[] = [];
    for (const e of entries) {
      const pop = Number(e.estimated_total_population) || 0;
      const pwd = pwdTotalFor(e);
      const hh = Number(e.number_of_households) || 0;
      const base = {
        state: e.state || "—",
        lga: e.lga || "—",
        ward: e.ward || "—",
        flhf: e.flhf_name || "—",
        population: pop,
        pwd,
        households: hh,
      };
      const name = e.settlement_name || e.community_name || "—";
      if (pop) {
        if (e.settlement_name && pop >= SETTLEMENT_POP_FLAG) {
          out.push({ id: `${e.id}-s`, kind: "Settlement", name: e.settlement_name, threshold: SETTLEMENT_POP_FLAG, ...base });
        } else if (pop >= COMMUNITY_POP_FLAG) {
          out.push({ id: `${e.id}-c`, kind: "Community", name: e.community_name || "—", threshold: COMMUNITY_POP_FLAG, ...base });
        }
      }
      if (pwd >= PWD_FLAG) {
        out.push({ id: `${e.id}-p`, kind: "PWD", name, threshold: PWD_FLAG, ...base });
      }
      if (hh >= HOUSEHOLD_FLAG) {
        out.push({ id: `${e.id}-h`, kind: "Households", name, threshold: HOUSEHOLD_FLAG, ...base });
      }
      if (hh > 0 && pop > 0 && hh > pop) {
        out.push({ id: `${e.id}-hp`, kind: "HH > Pop", name, threshold: pop, ...base });
      }
    }
    return out.sort((a, b) => b.population - a.population || b.households - a.households || b.pwd - a.pwd);
  }, [entries]);

  const communities = rows.filter((r) => r.kind === "Community").length;
  const settlements = rows.filter((r) => r.kind === "Settlement").length;
  const pwdFlags = rows.filter((r) => r.kind === "PWD").length;
  const hhFlags = rows.filter((r) => r.kind === "Households").length;
  const hhOverPop = rows.filter((r) => r.kind === "HH > Pop").length;

  return (
    <Card className="border-amber-500/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-foreground">Oversized Population Flags</h3>
            <Badge variant="outline" className="text-[10px]">
              Communities ≥ {COMMUNITY_POP_FLAG.toLocaleString()} · Settlements ≥ {SETTLEMENT_POP_FLAG.toLocaleString()} · PWD ≥ {PWD_FLAG} · HH ≥ {HOUSEHOLD_FLAG.toLocaleString()} · HH &gt; Population
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {communities} communities · {settlements} settlements
            </span>
            <span className="flex items-center gap-1.5">
              <Accessibility className="h-3.5 w-3.5" />
              {pwdFlags} PWD flags
            </span>
            <span className="flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" />
              {hhFlags} HH ≥ {HOUSEHOLD_FLAG.toLocaleString()} · {hhOverPop} HH &gt; population
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No community, settlement, household or disability count crosses the flag thresholds in the current scope.</p>
        ) : (
          <div className="max-h-[360px] overflow-auto rounded-md border border-border/60">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                <tr className="text-left text-muted-foreground">
                  {["Type", "Name", "State", "LGA", "Ward", "Health Facility", "Population", "Households", "PWD"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-muted/30">
                    <td className="px-2 py-1.5">
                      <Badge
                        variant={r.kind === "Community" ? "destructive" : r.kind === "Settlement" ? "secondary" : "outline"}
                        className={`text-[9px] ${r.kind === "PWD" ? "border-purple-400 text-purple-700" : ""} ${r.kind === "Households" ? "border-sky-400 text-sky-700" : ""} ${r.kind === "HH > Pop" ? "border-rose-500 text-rose-700" : ""}`}
                      >
                        {r.kind}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 font-medium text-foreground">{r.name}</td>
                    <td className="px-2 py-1.5">{r.state}</td>
                    <td className="px-2 py-1.5">{r.lga}</td>
                    <td className="px-2 py-1.5">{r.ward}</td>
                    <td className="px-2 py-1.5">{r.flhf}</td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-amber-700">{r.population.toLocaleString()}</td>
                    <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${r.households >= HOUSEHOLD_FLAG || (r.households > 0 && r.population > 0 && r.households > r.population) ? "text-rose-700" : "text-muted-foreground"}`}>{r.households.toLocaleString()}</td>
                    <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${r.pwd >= PWD_FLAG ? "text-purple-700" : "text-muted-foreground"}`}>{r.pwd.toLocaleString()}</td>
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
