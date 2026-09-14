// Beneficiary journey dashboard — the story of change, facility by facility.
// Each person shows where they stand in the programme, the services they have
// received, the change they report, the feedback they gave, and whether a
// safeguarding flag was raised (the narrative itself stays in the restricted
// safeguarding module).

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Hospital, RefreshCw, Route, ShieldAlert, MessageCircle, TrendingUp, Activity,
} from "lucide-react";
import {
  CHANGE_TONE, groupByFacility, useBeneficiaryJourneys, type JourneyRow,
} from "@/lib/programmeModule/journey";
import { useFacilities } from "@/lib/programmeModule/facilities";
import type { BeneficiaryRow, ProgrammeModuleConfig } from "@/lib/programmeModule/types";

interface Props {
  projectId: string;
  moduleId?: string;
  config?: ProgrammeModuleConfig;
  /** Facility ids the viewer is limited to; empty means no limit. */
  allowedFacilityIds?: string[];
  onOpenBeneficiary?: (b: BeneficiaryRow) => void;
}

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <Card className="p-3">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-xl font-semibold text-foreground">{value}</p>
  </Card>
);

const JourneyDashboard = ({
  projectId, moduleId, config, allowedFacilityIds = [], onOpenBeneficiary,
}: Props) => {
  const { rows, loading, reload } = useBeneficiaryJourneys(projectId, moduleId);
  const { facilities } = useFacilities(projectId);
  const [search, setSearch] = useState("");
  const [changeFilter, setChangeFilter] = useState("all");

  const componentLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of config?.components || []) map[c.key] = c.label;
    return map;
  }, [config]);

  const scoped = useMemo(() => {
    let out = rows;
    if (allowedFacilityIds.length) {
      out = out.filter((r) => allowedFacilityIds.includes(r.facilityId));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        `${r.beneficiary.full_name} ${r.beneficiary.case_id}`.toLowerCase().includes(q));
    }
    if (changeFilter === "improved") {
      out = out.filter((r) => r.perceivedChange === "Improved" || r.perceivedChange === "Much improved");
    } else if (changeFilter === "no_change") {
      out = out.filter((r) => r.perceivedChange === "No change");
    } else if (changeFilter === "worse") {
      out = out.filter((r) => r.perceivedChange === "Worsened" || r.perceivedChange === "Much worsened");
    } else if (changeFilter === "safeguarding") {
      out = out.filter((r) => r.safeguardingFlags > 0);
    }
    return out;
  }, [rows, allowedFacilityIds, search, changeFilter]);

  const groups = useMemo(() => {
    const g = groupByFacility(scoped);
    const nameOf = (id: string) => facilities.find((f) => f.id === id)?.name || "";
    return g.sort((a, b) => (nameOf(a.facilityId) || "zzz").localeCompare(nameOf(b.facilityId) || "zzz"));
  }, [scoped, facilities]);

  const totals = useMemo(() => ({
    people: scoped.length,
    services: scoped.reduce((n, r) => n + r.serviceCount, 0),
    improved: scoped.filter((r) =>
      r.perceivedChange === "Improved" || r.perceivedChange === "Much improved").length,
    feedback: scoped.filter((r) => r.feedbackTypes.length > 0).length,
    flags: scoped.filter((r) => r.safeguardingFlags > 0).length,
  }), [scoped]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Route className="h-5 w-5 text-primary" />
        <h3 className="font-display text-base font-semibold text-foreground">Beneficiary journey</h3>
        <div className="flex-1" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or case ID…"
          className="w-[220px]"
        />
        <Select value={changeFilter} onValueChange={setChangeFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[1200] bg-popover">
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="improved">Reporting improvement</SelectItem>
            <SelectItem value="no_change">Reporting no change</SelectItem>
            <SelectItem value="worse">Reporting deterioration</SelectItem>
            <SelectItem value="safeguarding">With a safeguarding flag</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void reload()} aria-label="Refresh journeys">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Beneficiaries" value={totals.people} />
        <Stat label="Services delivered" value={totals.services} />
        <Stat label="Reporting improvement" value={totals.improved} />
        <Stat label="Gave feedback" value={totals.feedback} />
        <Stat label="Safeguarding flags" value={totals.flags} />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Building journeys…</p>}
      {!loading && groups.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">No beneficiary journeys yet.</Card>
      )}

      <Accordion type="multiple" defaultValue={groups.slice(0, 3).map((g) => g.facilityId || "none")}>
        {groups.map((g) => {
          const facility = facilities.find((f) => f.id === g.facilityId);
          return (
            <AccordionItem key={g.facilityId || "none"} value={g.facilityId || "none"}>
              <AccordionTrigger className="text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <Hospital className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-foreground">
                    {facility?.name || "No facility assigned"}
                  </span>
                  <Badge variant="outline">{g.rows.length} beneficiar{g.rows.length === 1 ? "y" : "ies"}</Badge>
                  {g.rows.some((r) => r.safeguardingFlags > 0) && (
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">
                      safeguarding flags
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3">
                  {g.rows.map((r) => (
                    <JourneyCard
                      key={r.beneficiary.id}
                      row={r}
                      componentLabel={componentLabel}
                      onOpen={onOpenBeneficiary}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};

const JourneyCard = ({
  row, componentLabel, onOpen,
}: {
  row: JourneyRow;
  componentLabel: Record<string, string>;
  onOpen?: (b: BeneficiaryRow) => void;
}) => (
  <Card className="space-y-2.5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{row.beneficiary.full_name}</p>
        <p className="text-xs text-muted-foreground">
          {row.beneficiary.case_id}
          {row.firstServiceDate && ` · first seen ${new Date(row.firstServiceDate).toLocaleDateString()}`}
          {row.lastServiceDate && ` · last seen ${new Date(row.lastServiceDate).toLocaleDateString()}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{row.programmeStatus}</Badge>
        {row.perceivedChange && (
          <Badge variant="outline" className={CHANGE_TONE[row.perceivedChange] || ""}>
            <TrendingUp className="mr-1 h-3 w-3" /> {row.perceivedChange}
          </Badge>
        )}
        {row.safeguardingFlags > 0 && (
          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">
            <ShieldAlert className="mr-1 h-3 w-3" />
            {row.safeguardingFlags} flag{row.safeguardingFlags === 1 ? "" : "s"}
            {row.safeguardingUrgent ? " · action needed" : ""}
          </Badge>
        )}
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Activity className="h-3.5 w-3.5" />
      {row.serviceCount} service{row.serviceCount === 1 ? "" : "s"}
      {row.components.map((c) => (
        <Badge key={c} variant="secondary">{componentLabel[c] || c}</Badge>
      ))}
    </div>

    {!!row.improvementAreas.length && (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Improvement in: </span>
        {row.improvementAreas.join(", ")}
      </p>
    )}

    {(row.feedbackTypes.length > 0 || row.satisfaction) && (
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <MessageCircle className="h-3.5 w-3.5" />
        {row.satisfaction && <span>{row.satisfaction}</span>}
        {row.feedbackTypes.map((f) => <Badge key={f} variant="outline">{f}</Badge>)}
        {row.feedbackResolved && <span>· resolved: {row.feedbackResolved}</span>}
      </p>
    )}

    {row.safeguardingFlags > 0 && (
      <p className="text-xs text-rose-800">
        Details are held in the restricted safeguarding module and are only visible to
        safeguarding officers.
      </p>
    )}

    {onOpen && (
      <Button size="sm" variant="outline" onClick={() => onOpen(row.beneficiary)}>
        Open full record
      </Button>
    )}
  </Card>
);

export default JourneyDashboard;
