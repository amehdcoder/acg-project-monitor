// Graduation Approach dashboard — sequential view of every livelihood
// beneficiary from mapping → verification → selection → delivery stages → graduation.
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, GraduationCap, Loader2, MapPin, Search, Sprout, Target, UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cachedRead } from "@/lib/programmeModule/offlineReadCache";
import { PRIORITY_LIVELIHOOD_SERVICES } from "@/lib/programmeModule/componentOutcomes";
import { graduationOverview } from "@/lib/programmeModule/graduation";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import { cn } from "@/lib/utils";

type Svc = { beneficiary_id: string; service_name: string | null; service_date: string | null };
const PHASE_TONE: Record<string, string> = {
  Selection: "border-health-blue text-health-blue",
  "Social empowerment": "border-health-teal text-health-teal",
  "Skills & training": "border-health-amber text-health-amber",
  "Consumption support": "border-health-red text-health-red",
  "Enterprise & capital": "border-primary text-primary",
  "Savings & markets": "border-health-teal text-health-teal",
  Graduation: "border-health-blue text-health-blue",
};

export default function GraduationDashboard({ projectId, beneficiaries, onOpenBeneficiary }: {
  projectId: string; beneficiaries: BeneficiaryRow[]; onOpenBeneficiary?: (b: BeneficiaryRow) => void;
}) {
  const [services, setServices] = useState<Svc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lga, setLga] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true; setLoading(true); setError("");
    void cachedRead<Svc[]>(`graduation-services:${projectId}`, async () => {
      const all: Svc[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("beneficiary_services").select("beneficiary_id,service_name,service_date")
          .eq("project_id", projectId).in("service_name", PRIORITY_LIVELIHOOD_SERVICES).order("id").range(from, from + 999);
        if (error) return { data: null, error };
        all.push(...(data ?? []) as Svc[]);
        if ((data ?? []).length < 1000) break;
      }
      return { data: all, error: null };
    }).then(r => { if (!alive) return; if (r.data) setServices(r.data); else setError("Livelihood services could not be loaded; reconnect to refresh."); })
      .catch(() => alive && setError("Livelihood services could not be loaded."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [projectId]);

  const scoped = useMemo(() => lga === "all" ? beneficiaries : beneficiaries.filter(b => (b.lga || "Not recorded") === lga), [beneficiaries, lga]);
  const overview = useMemo(() => graduationOverview(scoped, services), [scoped, services]);
  const allLgas = useMemo(() => graduationOverview(beneficiaries, services).lgas.map(l => l.lga), [beneficiaries, services]);
  const max = Math.max(1, ...overview.funnel.map(f => f.count));
  const people = overview.participants.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.percent - a.percent).slice(0, 50);
  const byId = useMemo(() => new Map(beneficiaries.map(b => [b.id, b])), [beneficiaries]);
  const { totals } = overview;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-health-ink"><GraduationCap className="h-6 w-6 text-health-teal" />Graduation Approach pathway</h2>
          <p className="text-sm text-muted-foreground">Every livelihood beneficiary, from mapping and selection through each delivery stage to graduation.</p>
        </div>
        <Select value={lga} onValueChange={setLga}>
          <SelectTrigger className="w-56" aria-label="Filter by LGA"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All LGAs</SelectItem>{allLgas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Livelihood beneficiaries", value: totals.tracked, icon: Users, tone: "border-health-blue text-health-blue" },
          { label: "Selected onto pathway", value: totals.selected, icon: UserCheck, tone: "border-health-teal text-health-teal" },
          { label: "Average stage completion", value: `${totals.avgPercent}%`, icon: Target, tone: "border-health-amber text-health-amber" },
          { label: "Completed all stages", value: totals.graduated, icon: GraduationCap, tone: "border-primary text-primary" },
          { label: "Not selected", value: totals.notSelected, icon: MapPin, tone: "border-health-red text-health-red" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className={cn("border-t-4 p-4", tone)}>
            <div className="flex items-center justify-between text-sm text-muted-foreground">{label}<Icon className="h-5 w-5" /></div>
            <p className="mt-2 text-3xl font-bold text-foreground">{loading ? <Loader2 className="h-6 w-6 animate-spin" /> : value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 sm:p-5">
        <h3 className="font-semibold text-health-ink">Sequential pathway</h3>
        <p className="mb-4 text-sm text-muted-foreground">Selection steps show conversion from the previous step; delivery stages show the share of selected beneficiaries who have received each service.</p>
        <ol className="space-y-1">
          {overview.funnel.map((step, i) => (
            <li key={step.key}>
              {i > 0 && <div className="flex justify-center py-0.5"><ArrowDown className="h-3.5 w-3.5 text-muted-foreground" /></div>}
              <div className="grid items-center gap-2 sm:grid-cols-[2rem_minmax(0,18rem)_1fr_5.5rem]">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug">{step.label}</p>
                  <Badge variant="outline" className={cn("mt-0.5 text-[11px]", PHASE_TONE[step.phase])}>{step.phase}</Badge>
                </div>
                <div className="h-7 rounded-md bg-muted">
                  <div className={cn("flex h-7 items-center rounded-md px-2 text-xs font-bold text-primary-foreground", step.phase === "Selection" ? "bg-health-blue" : step.phase === "Graduation" ? "bg-primary" : "bg-health-teal")} style={{ width: `${Math.max(step.count ? 6 : 0, (step.count / max) * 100)}%` }}>{step.count || ""}</div>
                </div>
                <span className="text-right text-sm font-semibold text-muted-foreground">{step.conversion === null ? "—" : `${step.conversion}%`}</span>
              </div>
            </li>
          ))}
        </ol>
        {totals.unmapped > 0 && <p className="mt-4 text-sm text-health-amber">{totals.unmapped} beneficiaries have livelihood services but no recorded mapping/selection decision — complete their Graduation gate in the record.</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-x-auto p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-health-blue" />Progress by LGA</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">LGA</th><th className="p-2">Mapped</th><th className="p-2">Selected</th><th className="p-2">Avg completion</th><th className="p-2">Graduated</th></tr></thead>
            <tbody>{overview.lgas.map(r => <tr key={r.lga} className="border-b"><td className="p-2 font-semibold">{r.lga}</td><td className="p-2">{r.mapped}</td><td className="p-2">{r.selected}</td><td className="p-2"><div className="flex items-center gap-2"><Progress value={r.avgPercent} className="h-2 w-20" />{r.avgPercent}%</div></td><td className="p-2">{r.graduated}</td></tr>)}
              {!overview.lgas.length && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No livelihood beneficiaries yet.</td></tr>}</tbody>
          </table>
        </Card>
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-semibold"><Sprout className="h-4 w-4 text-health-teal" />Beneficiary progress & next stage</h3>
            <div className="relative w-full sm:w-56"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search livelihood beneficiaries" className="pl-8" placeholder="Search name" value={search} onChange={e => setSearch(e.target.value)} /></div>
          </div>
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {people.map(p => (
              <li key={p.id}>
                <button type="button" className="w-full rounded-md border border-border p-2 text-left" onClick={() => { const b = byId.get(p.id); if (b) onOpenBeneficiary?.(b); }}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{p.name}</span><Badge variant="outline" className="capitalize">{p.status.replace("_", " ")}</Badge></div>
                  <div className="mt-1 flex items-center gap-2"><Progress value={p.percent} className="h-2 flex-1" /><span className="text-xs font-semibold">{p.percent}%</span></div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{p.lga} · {p.status === "selected" ? (p.nextStage ? `Next: ${p.nextStage}` : "All stages completed") : p.status === "not_selected" ? "Not selected for the pathway" : "Awaiting selection decision"}</p>
                </button>
              </li>
            ))}
            {!people.length && <li className="p-6 text-center text-sm text-muted-foreground">No matching beneficiaries.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
