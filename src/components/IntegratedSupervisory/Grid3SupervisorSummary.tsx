/**
 * Supervisor-level GRID3 accuracy summary.
 *
 * Aggregates coordinate exceptions by Independent Monitor / Supervisor and by
 * FLHF, Ward or LGA, and reports the mismatch RATE (exceptions ÷ georeferenced
 * captures) over the selected day range — so supervision is directed at the
 * people and places that repeatedly fail the standard, not at single incidents.
 */
import { useMemo, useState } from "react";
import { Users, CalendarRange, Layers, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface SummaryInput {
  monitor: string;
  flhf: string;
  ward: string;
  lga: string;
  state: string;
  date: string;
  verdict: string;
}

type Dim = "monitor" | "flhf" | "ward" | "lga";
const DIM_LABEL: Record<Dim, string> = {
  monitor: "Independent Monitor / Supervisor",
  flhf: "FLHF (health facility)",
  ward: "Ward",
  lga: "LGA",
};

const DAY_OPTIONS = [
  { v: "0", label: "All days in view" },
  { v: "7", label: "Last 7 days" },
  { v: "14", label: "Last 14 days" },
  { v: "30", label: "Last 30 days" },
];

const rateTone = (r: number) =>
  r >= 0.5 ? "bg-rose-500" : r >= 0.25 ? "bg-amber-500" : r > 0 ? "bg-sky-500" : "bg-emerald-500";

export default function Grid3SupervisorSummary({ rows }: { rows: SummaryInput[] }) {
  const [dim, setDim] = useState<Dim>("monitor");
  const [days, setDays] = useState("0");

  const scoped = useMemo(() => {
    const n = Number(days);
    if (!n) return rows;
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    if (!dates.length) return rows;
    const latest = new Date(dates[dates.length - 1]);
    const floor = new Date(latest);
    floor.setDate(floor.getDate() - (n - 1));
    const iso = floor.toISOString().slice(0, 10);
    return rows.filter((r) => r.date && r.date >= iso);
  }, [rows, days]);

  const groups = useMemo(() => {
    const map = new Map<string, {
      key: string; total: number; bad: number; context: Set<string>; days: Set<string>;
    }>();
    scoped.forEach((r) => {
      const key = (r[dim] || "—").trim() || "—";
      let g = map.get(key);
      if (!g) { g = { key, total: 0, bad: 0, context: new Set(), days: new Set() }; map.set(key, g); }
      g.total += 1;
      if (r.verdict !== "match") g.bad += 1;
      if (r.date) g.days.add(r.date);
      const ctx = dim === "monitor" ? `${r.lga || "—"}` : dim === "flhf" ? `${r.ward || "—"}, ${r.lga || "—"}` : dim === "ward" ? `${r.lga || "—"}` : `${r.state || "—"}`;
      g.context.add(ctx);
    });
    return [...map.values()]
      .map((g) => ({ ...g, rate: g.total ? g.bad / g.total : 0 }))
      .sort((a, b) => b.rate - a.rate || b.bad - a.bad);
  }, [scoped, dim]);

  const totals = useMemo(() => {
    const total = scoped.length;
    const bad = scoped.filter((r) => r.verdict !== "match").length;
    return { total, bad, rate: total ? bad / total : 0 };
  }, [scoped]);

  return (
    <div className="space-y-3 rounded-lg border bg-gradient-to-br from-indigo-500/5 to-transparent p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold">
          <Users className="h-4 w-4 text-indigo-600" />
          Supervisor-level mismatch summary
        </p>
        <Badge variant="outline" className="text-[10px]">
          {totals.bad.toLocaleString()} / {totals.total.toLocaleString()} captures flagged ·{" "}
          {Math.round(totals.rate * 100)}% overall
        </Badge>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
            <Layers className="h-3.5 w-3.5 text-indigo-600" />
            <Select value={dim} onValueChange={(v) => setDim(v as Dim)}>
              <SelectTrigger className="h-7 w-[210px] text-[11.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DIM_LABEL) as Dim[]).map((d) => (
                  <SelectItem key={d} value={d}>{DIM_LABEL[d]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
            <CalendarRange className="h-3.5 w-3.5 text-indigo-600" />
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-7 w-[150px] text-[11.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((o) => (
                  <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!groups.length ? (
        <p className="text-[11px] italic text-muted-foreground">
          No georeferenced captures fall inside the selected day range.
        </p>
      ) : (
        <div className="max-h-[280px] overflow-auto rounded-md border bg-background">
          <table className="w-full min-w-[640px] border-collapse text-[11.5px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800 text-white">
                {["#", DIM_LABEL[dim], "Context", "Captures", "Flagged", "Days active", "Mismatch rate"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => (
                <tr key={g.key} className={`border-t ${i % 2 ? "bg-muted/30" : ""}`}>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-2.5 py-1.5 font-semibold text-slate-900">{g.key}</td>
                  <td className="px-2.5 py-1.5 text-[10.5px] text-muted-foreground">
                    {[...g.context].slice(0, 2).join(" · ")}
                    {g.context.size > 2 ? ` +${g.context.size - 2}` : ""}
                  </td>
                  <td className="px-2.5 py-1.5">{g.total}</td>
                  <td className="px-2.5 py-1.5 font-semibold text-rose-700">{g.bad}</td>
                  <td className="px-2.5 py-1.5">{g.days.size}</td>
                  <td className="px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <Progress
                        value={g.rate * 100}
                        className="h-1.5 w-24"
                        indicatorClassName={rateTone(g.rate)}
                      />
                      <span className={`font-semibold ${g.rate >= 0.5 ? "text-rose-700" : g.rate >= 0.25 ? "text-amber-700" : "text-emerald-700"}`}>
                        {Math.round(g.rate * 100)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
        <TrendingDown className="mt-0.5 h-3 w-3 shrink-0" />
        Rate = coordinate exceptions ÷ georeferenced captures for that {DIM_LABEL[dim].toLowerCase()} within the
        selected day range. Rates above 50% (red) indicate a systematic capture problem — retraining or device
        calibration — rather than isolated error.
      </p>
    </div>
  );
}
