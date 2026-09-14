// WHO-inspired beneficiary journey evidence report — facility and person-level change.
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Activity, ArrowRight, CheckCircle2, Hospital, MessageCircle, RefreshCw,
  Search, ShieldAlert, Sparkles, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { groupByFacility, useBeneficiaryJourneys, type JourneyRow } from "@/lib/programmeModule/journey";
import { useFacilities } from "@/lib/programmeModule/facilities";
import type { BeneficiaryRow, ProgrammeModuleConfig } from "@/lib/programmeModule/types";

interface Props {
  projectId: string;
  moduleId?: string;
  config?: ProgrammeModuleConfig;
  allowedFacilityIds?: string[];
  onOpenBeneficiary?: (beneficiary: BeneficiaryRow) => void;
}

const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0;

const Metric = ({ label, value, note, tone = "blue" }: {
  label: string; value: string | number; note: string; tone?: "blue" | "teal" | "amber" | "red";
}) => {
  const tones = {
    blue: "border-health-blue text-health-blue",
    teal: "border-health-teal text-health-teal",
    amber: "border-health-amber text-health-ink",
    red: "border-health-red text-health-red",
  };
  return (
    <div className={`border-l-[3px] px-4 py-3 ${tones[tone]}`}>
      <p className="font-report-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
};

const JourneyDashboard = ({ projectId, moduleId, config, allowedFacilityIds = [], onOpenBeneficiary }: Props) => {
  const { rows, loading, reload } = useBeneficiaryJourneys(projectId, moduleId);
  const { facilities } = useFacilities(projectId);
  const [search, setSearch] = useState("");
  const [changeFilter, setChangeFilter] = useState("all");

  const componentLabel = useMemo(() => Object.fromEntries(
    (config?.components || []).map((component) => [component.key, component.label]),
  ), [config]);

  const scoped = useMemo(() => {
    let result = allowedFacilityIds.length ? rows.filter((row) => allowedFacilityIds.includes(row.facilityId)) : rows;
    const query = search.trim().toLowerCase();
    if (query) result = result.filter((row) =>
      `${row.beneficiary.full_name} ${row.beneficiary.case_id}`.toLowerCase().includes(query));
    if (changeFilter === "improved") result = result.filter((row) => ["Improved", "Much improved"].includes(row.perceivedChange || ""));
    if (changeFilter === "no_change") result = result.filter((row) => row.perceivedChange === "No change");
    if (changeFilter === "worse") result = result.filter((row) => ["Worsened", "Much worsened"].includes(row.perceivedChange || ""));
    if (changeFilter === "safeguarding") result = result.filter((row) => row.safeguardingFlags > 0);
    return result;
  }, [rows, allowedFacilityIds, search, changeFilter]);

  const groups = useMemo(() => groupByFacility(scoped).sort((left, right) => {
    const name = (id: string) => facilities.find((facility) => facility.id === id)?.name || "Unassigned";
    return name(left.facilityId).localeCompare(name(right.facilityId));
  }), [scoped, facilities]);

  const evidence = useMemo(() => {
    const improved = scoped.filter((row) => ["Improved", "Much improved"].includes(row.perceivedChange || "")).length;
    const noChange = scoped.filter((row) => row.perceivedChange === "No change").length;
    const worsened = scoped.filter((row) => ["Worsened", "Much worsened"].includes(row.perceivedChange || "")).length;
    const assessed = improved + noChange + worsened;
    const feedback = scoped.filter((row) => row.feedbackTypes.length || row.satisfaction).length;
    const flags = scoped.filter((row) => row.safeguardingFlags > 0).length;
    const urgent = scoped.filter((row) => row.safeguardingUrgent).length;
    return {
      improved, noChange, worsened, assessed, feedback, flags, urgent,
      services: scoped.reduce((sum, row) => sum + row.serviceCount, 0),
      improvementRate: pct(improved, assessed),
      feedbackRate: pct(feedback, scoped.length),
    };
  }, [scoped]);

  const facilityEvidence = groups.map((group) => {
    const improved = group.rows.filter((row) => ["Improved", "Much improved"].includes(row.perceivedChange || "")).length;
    const assessed = group.rows.filter((row) => row.perceivedChange && row.perceivedChange !== "Unable to assess").length;
    return {
      ...group,
      name: facilities.find((facility) => facility.id === group.facilityId)?.name || "No facility assigned",
      improved,
      assessed,
      services: group.rows.reduce((sum, row) => sum + row.serviceCount, 0),
      flags: group.rows.filter((row) => row.safeguardingFlags > 0).length,
    };
  }).sort((left, right) => right.rows.length - left.rows.length);

  return (
    <section className="animate-fade-in overflow-hidden rounded-lg border bg-card font-report shadow-card">
      <header className="bg-health-blue px-5 py-6 text-primary-foreground sm:px-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-primary-foreground/80">Programme evidence report</p>
            <h2 className="mt-2 font-report-display text-2xl font-bold sm:text-3xl">Beneficiary journey</h2>
            <p className="mt-2 max-w-2xl text-sm text-primary-foreground/85">
              A facility-level view of service reach, beneficiary-reported change, feedback and protection signals.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-2">
              {scoped.length.toLocaleString()} people in current view
            </span>
            <span className="rounded border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-2">
              Updated {new Date().toLocaleDateString()}
            </span>
          </div>
        </div>
      </header>

      <div className="border-b bg-health-surface px-5 py-4 sm:px-7">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search beneficiary name or case ID" className="bg-card pl-9" />
          </div>
          <Select value={changeFilter} onValueChange={setChangeFilter}>
            <SelectTrigger className="w-full bg-card md:w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200] bg-popover">
              <SelectItem value="all">All journey outcomes</SelectItem>
              <SelectItem value="improved">Reporting improvement</SelectItem>
              <SelectItem value="no_change">Reporting no change</SelectItem>
              <SelectItem value="worse">Reporting deterioration</SelectItem>
              <SelectItem value="safeguarding">Safeguarding signal</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => void reload()} aria-label="Refresh beneficiary journey" className="min-h-11 min-w-11 bg-card">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid divide-y border-b sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
        <Metric label="Beneficiaries" value={scoped.length} note={`${groups.length} reporting facilities`} />
        <Metric label="Services delivered" value={evidence.services} note={`${(evidence.services / Math.max(scoped.length, 1)).toFixed(1)} per beneficiary`} tone="teal" />
        <Metric label="Reporting improvement" value={`${evidence.improvementRate}%`} note={`${evidence.improved} of ${evidence.assessed} assessed`} tone="teal" />
        <Metric label="Feedback coverage" value={`${evidence.feedbackRate}%`} note={`${evidence.feedback} people provided feedback`} tone="amber" />
        <Metric label="Protection signals" value={evidence.flags} note={evidence.urgent ? `${evidence.urgent} require prompt action` : "No urgent action recorded"} tone="red" />
      </div>

      <div className="grid border-b lg:grid-cols-[1.05fr_1.6fr] lg:divide-x">
        <div className="p-5 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-health-blue">Reported outcomes</p>
              <h3 className="mt-1 font-report-display text-lg font-bold text-health-ink">Change among assessed beneficiaries</h3>
            </div>
            <Sparkles className="h-5 w-5 text-health-teal" />
          </div>
          <div className="space-y-5">
            {[
              { label: "Improved", value: evidence.improved, icon: TrendingUp, color: "bg-health-teal" },
              { label: "No change", value: evidence.noChange, icon: Activity, color: "bg-health-amber" },
              { label: "Worsened", value: evidence.worsened, icon: TrendingDown, color: "bg-health-red" },
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold"><item.icon className="h-4 w-4" />{item.label}</span>
                  <span className="font-bold tabular-nums">{item.value} · {pct(item.value, evidence.assessed)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-muted"><div className={`h-full ${item.color}`} style={{ width: `${pct(item.value, evidence.assessed)}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="mt-5 border-l-2 border-health-blue pl-3 text-xs leading-relaxed text-muted-foreground">
            Percentages use beneficiaries with a recorded outcome as the denominator. Missing assessments are not treated as no change.
          </p>
        </div>

        <div className="p-5 sm:p-7">
          <p className="text-xs font-bold uppercase text-health-blue">Facility comparison</p>
          <h3 className="mt-1 font-report-display text-lg font-bold text-health-ink">Service reach and reported progress</h3>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-y bg-health-surface text-xs uppercase text-muted-foreground">
                <tr><th className="px-3 py-2.5">Facility</th><th className="px-3 py-2.5">People</th><th className="px-3 py-2.5">Services</th><th className="px-3 py-2.5">Improved</th><th className="px-3 py-2.5">Signals</th></tr>
              </thead>
              <tbody className="divide-y">
                {facilityEvidence.slice(0, 6).map((facility) => (
                  <tr key={facility.facilityId || "none"}>
                    <td className="px-3 py-3 font-semibold text-foreground">{facility.name}</td>
                    <td className="px-3 py-3 tabular-nums">{facility.rows.length}</td>
                    <td className="px-3 py-3 tabular-nums">{facility.services}</td>
                    <td className="px-3 py-3 font-semibold text-health-teal">{pct(facility.improved, facility.assessed)}%</td>
                    <td className="px-3 py-3 font-semibold text-health-red">{facility.flags || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-health-blue">Journey register</p>
            <h3 className="mt-1 font-report-display text-lg font-bold text-health-ink">Beneficiaries by health facility</h3>
          </div>
          <p className="text-xs text-muted-foreground">Safeguarding narratives remain in the restricted module.</p>
        </div>
        {loading && <div className="border-y py-12 text-center text-sm text-muted-foreground">Building the evidence report…</div>}
        {!loading && groups.length === 0 && <div className="border-y py-12 text-center text-sm text-muted-foreground">No beneficiary journeys match this view.</div>}
        <Accordion type="multiple" defaultValue={groups.slice(0, 2).map((group) => group.facilityId || "none")}>
          {groups.map((group) => {
            const facility = facilityEvidence.find((item) => item.facilityId === group.facilityId);
            return (
              <AccordionItem key={group.facilityId || "none"} value={group.facilityId || "none"}>
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-health-blue/10 text-health-blue"><Hospital className="h-4 w-4" /></span>
                    <span className="min-w-0"><span className="block truncate font-report-display text-sm font-bold">{facility?.name}</span><span className="text-xs font-normal text-muted-foreground">{group.rows.length} beneficiaries · {facility?.services || 0} services</span></span>
                    {Boolean(facility?.flags) && <Badge variant="outline" className="ml-auto mr-3 border-health-red/40 text-health-red">{facility?.flags} signal{facility?.flags === 1 ? "" : "s"}</Badge>}
                  </span>
                </AccordionTrigger>
                <AccordionContent><div className="divide-y border-y">{group.rows.map((row) => <JourneyRowView key={row.beneficiary.id} row={row} componentLabel={componentLabel} onOpen={onOpenBeneficiary} />)}</div></AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </section>
  );
};

const JourneyRowView = ({ row, componentLabel, onOpen }: { row: JourneyRow; componentLabel: Record<string, string>; onOpen?: (beneficiary: BeneficiaryRow) => void }) => (
  <article className="grid gap-4 bg-card px-4 py-5 transition-colors hover:bg-health-surface md:grid-cols-[1.15fr_1fr_1fr_auto] md:items-center">
    <div className="min-w-0">
      <p className="truncate font-report-display text-sm font-bold text-foreground">{row.beneficiary.full_name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{row.beneficiary.case_id} · {row.programmeStatus}</p>
    </div>
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Activity className="h-3.5 w-3.5 text-health-blue" />{row.serviceCount} service{row.serviceCount === 1 ? "" : "s"}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{row.components.map((key) => componentLabel[key] || key).join(", ") || "No service recorded"}</p>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {row.perceivedChange && <Badge variant="outline" className="border-health-teal/40 text-health-teal"><CheckCircle2 className="mr-1 h-3 w-3" />{row.perceivedChange}</Badge>}
      {(row.feedbackTypes.length > 0 || row.satisfaction) && <Badge variant="outline" className="border-health-amber/60"><MessageCircle className="mr-1 h-3 w-3" />Feedback</Badge>}
      {row.safeguardingFlags > 0 && <Badge variant="outline" className="border-health-red/40 text-health-red"><ShieldAlert className="mr-1 h-3 w-3" />{row.safeguardingFlags} signal{row.safeguardingFlags === 1 ? "" : "s"}</Badge>}
    </div>
    {onOpen && <Button size="sm" variant="ghost" onClick={() => onOpen(row.beneficiary)} className="justify-self-start gap-1 text-health-blue md:justify-self-end">Open record<ArrowRight className="h-4 w-4" /></Button>}
  </article>
);

export default JourneyDashboard;