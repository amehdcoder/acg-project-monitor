import { memo, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTablePagination } from "@/hooks/useTablePagination";
import { compareRisks, riskInRange, type RiskCache } from "@/lib/microplanning/riskRanking";
import type { CommunityRiskInput } from "@/lib/microplanning/communityRisk";
import DatasetPagination from "./DatasetPagination";
import CommunityRiskBadge from "./CommunityRiskBadge";

interface Entry extends CommunityRiskInput { id: string; community_name: string; settlement_name?: string; state: string; lga: string; ward: string }
function CommunityRiskRanking({ entries, risks }: { entries: Entry[]; risks: RiskCache }) {
  const [band, setBand] = useState("all");
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("100");
  const [search, setSearch] = useState("");
  const ranked = useMemo(() => entries.filter(e => risks[e.id]).sort((a, b) => compareRisks(risks[a.id].risk, risks[b.id].risk) || a.community_name.localeCompare(b.community_name)).map((entry, index) => ({ entry, rank: risks[entry.id].risk.score === null ? null : index + 1 })), [entries, risks]);
  const filtered = useMemo(() => ranked.filter(({ entry }) => {
    const risk = risks[entry.id].risk;
    const ranges: Record<string, [number, number]> = { low: [0,24], moderate: [25,49], high: [50,74], critical: [75,100] };
    const range = ranges[band];
    const match = band === "incomplete" ? risk.score === null : range ? riskInRange(risk, ...range) : band === "custom" ? riskInRange(risk, Number(min), Number(max)) : true;
    return match && [entry.community_name, entry.settlement_name, entry.state, entry.lga, entry.ward].join(" ").toLowerCase().includes(search.toLowerCase());
  }), [ranked, risks, band, min, max, search]);
  const pagination = useTablePagination(filtered, 20);
  return <section className="space-y-3 border-t border-border pt-5" aria-label="Community risk ranking">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-destructive" />Community risk ranking <span className="text-muted-foreground">· {filtered.length.toLocaleString()}</span></h3>
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Search risk communities" placeholder="Search community or geography" value={search} onChange={e => setSearch(e.target.value)} className="w-60 max-w-full" />
        <Select value={band} onValueChange={setBand}><SelectTrigger className="w-48" aria-label="Risk score range"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="all">All risk scores</SelectItem><SelectItem value="critical">Critical · 75–100</SelectItem><SelectItem value="high">High · 50–74</SelectItem><SelectItem value="moderate">Moderate · 25–49</SelectItem><SelectItem value="low">Low · 0–24</SelectItem><SelectItem value="incomplete">Incomplete evidence</SelectItem><SelectItem value="custom">Custom score range</SelectItem>
        </SelectContent></Select>
        {band === "custom" && <div className="flex items-center gap-2"><Label htmlFor="risk-min">Min</Label><Input id="risk-min" type="number" min={0} max={100} value={min} onChange={e => setMin(e.target.value)} className="w-20" /><Label htmlFor="risk-max">Max</Label><Input id="risk-max" type="number" min={0} max={100} value={max} onChange={e => setMax(e.target.value)} className="w-20" /></div>}
      </div>
    </div>
    <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-xs"><thead className="bg-muted text-muted-foreground"><tr>{["Rank", "Community / settlement", "State / LGA / Ward", "Risk score", "Security", "Accessibility", "CDD evidence"].map(label => <th key={label} className="p-3 text-left whitespace-nowrap">{label}</th>)}</tr></thead><tbody>
      {pagination.paginatedData.map(({ entry, rank }) => <tr key={entry.id} className="border-t border-border"><td className="p-3 tabular-nums text-muted-foreground">{rank ?? "—"}</td><td className="p-3 font-medium">{entry.community_name}<div className="text-muted-foreground">{entry.settlement_name}</div></td><td className="p-3">{entry.state} / {entry.lga} / {entry.ward}</td><td className="p-2"><CommunityRiskBadge entry={entry} /></td><td className="p-3">{entry.security_clearance?.replace(/_/g," ") || "Not recorded"}</td><td className="p-3">{entry.accessibility?.replace(/_/g," ") || "Not recorded"}</td><td className="p-3">{risks[entry.id].risk.parts[2].points === 20 ? "Explicit gap" : "Named CDD present"}</td></tr>)}
      {!filtered.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No communities in this range.</td></tr>}
    </tbody></table></div><DatasetPagination pagination={pagination} />
  </section>;
}
export default memo(CommunityRiskRanking);