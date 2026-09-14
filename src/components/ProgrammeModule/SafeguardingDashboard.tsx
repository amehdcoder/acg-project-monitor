// Safeguarding oversight dashboard — restricted to appointed safeguarding
// officers. Shows, per health facility, each officer's caseload: open cases,
// what action was taken and the recorded outcomes.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Lock, RefreshCw, ShieldCheck, Hospital, UserCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CONCERN_STATUSES, CONCERN_STATUS_LABEL, SEVERITY_LABEL,
  useSafeguardingConcerns, type SafeguardingConcernRow,
} from "@/lib/programmeModule/safeguarding";
import { useFacilities } from "@/lib/programmeModule/facilities";

interface Props {
  projectId: string;
  isOfficer: boolean;
  /** When set (facility focal persons), only these facilities are shown. */
  allowedFacilityIds?: string[];
}

const SEVERITY_TONE: Record<string, string> = {
  low: "border-border bg-muted text-muted-foreground",
  moderate: "border-amber-200 bg-amber-50 text-amber-800",
  high: "border-orange-200 bg-orange-50 text-orange-900",
  critical: "border-rose-200 bg-rose-50 text-rose-800",
};

const OPEN_STATUSES = new Set(["open", "in_progress", "referred"]);

interface OfficerGroup {
  userId: string;
  name: string;
  concerns: SafeguardingConcernRow[];
  open: number;
  closed: number;
  withAction: number;
  withOutcome: number;
}

interface FacilityGroup {
  facilityId: string;
  facilityName: string;
  concerns: SafeguardingConcernRow[];
  open: number;
  officers: OfficerGroup[];
}

const SafeguardingDashboard = ({ projectId, isOfficer, allowedFacilityIds = [] }: Props) => {
  const { concerns, loading, reload } = useSafeguardingConcerns(projectId, isOfficer);
  const { facilities } = useFacilities(projectId);
  const [names, setNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");

  // Resolve the officers' display names for the caseload grouping.
  useEffect(() => {
    const ids = Array.from(new Set(
      concerns.flatMap((c) => [c.assigned_to, c.reported_by]).filter(Boolean) as string[],
    ));
    if (!ids.length) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id,first_name,last_name,email")
        .in("user_id", ids);
      const map: Record<string, string> = {};
      for (const p of (data as { user_id: string; first_name: string | null; last_name: string | null; email: string | null }[]) || []) {
        map[p.user_id] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "Officer";
      }
      setNames(map);
    })();
  }, [concerns]);

  const facilityName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of facilities) map[f.id] = f.name;
    return map;
  }, [facilities]);

  const visible = useMemo(() => {
    const allowed = new Set(allowedFacilityIds);
    const term = search.trim().toLowerCase();
    return concerns.filter((c) => {
      if (allowed.size && !(c.facility_id && allowed.has(c.facility_id))) return false;
      if (statusFilter === "open" && !OPEN_STATUSES.has(c.status)) return false;
      if (statusFilter === "closed" && c.status !== "closed") return false;
      if (statusFilter !== "all" && statusFilter !== "open" && statusFilter !== "closed"
        && c.status !== statusFilter) return false;
      if (!term) return true;
      const officer = names[c.assigned_to || c.reported_by || ""] || "";
      return [
        c.beneficiary_label || "", officer, facilityName[c.facility_id || ""] || "",
        c.action_taken || "", c.outcome || "", c.categories.join(" "),
      ].join(" ").toLowerCase().includes(term);
    });
  }, [concerns, allowedFacilityIds, search, statusFilter, names, facilityName]);

  const groups: FacilityGroup[] = useMemo(() => {
    const byFacility = new Map<string, SafeguardingConcernRow[]>();
    for (const c of visible) {
      const key = c.facility_id || "__none";
      const list = byFacility.get(key) || [];
      list.push(c);
      byFacility.set(key, list);
    }
    return Array.from(byFacility.entries()).map(([facilityId, rows]) => {
      const byOfficer = new Map<string, SafeguardingConcernRow[]>();
      for (const c of rows) {
        const key = c.assigned_to || c.reported_by || "__unassigned";
        const list = byOfficer.get(key) || [];
        list.push(c);
        byOfficer.set(key, list);
      }
      const officers: OfficerGroup[] = Array.from(byOfficer.entries()).map(([userId, list]) => ({
        userId,
        name: userId === "__unassigned" ? "Unassigned" : (names[userId] || "Officer"),
        concerns: list,
        open: list.filter((c) => OPEN_STATUSES.has(c.status)).length,
        closed: list.filter((c) => c.status === "closed").length,
        withAction: list.filter((c) => (c.action_taken || "").trim()).length,
        withOutcome: list.filter((c) => (c.outcome || "").trim()).length,
      })).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
      return {
        facilityId,
        facilityName: facilityId === "__none"
          ? "No facility recorded"
          : (facilityName[facilityId] || "Unknown facility"),
        concerns: rows,
        open: rows.filter((c) => OPEN_STATUSES.has(c.status)).length,
        officers,
      };
    }).sort((a, b) => b.open - a.open || a.facilityName.localeCompare(b.facilityName));
  }, [visible, names, facilityName]);

  const totals = useMemo(() => ({
    cases: visible.length,
    open: visible.filter((c) => OPEN_STATUSES.has(c.status)).length,
    closed: visible.filter((c) => c.status === "closed").length,
    critical: visible.filter((c) => c.severity === "critical" || c.severity === "high").length,
    officers: new Set(visible.map((c) => c.assigned_to || c.reported_by).filter(Boolean)).size,
  }), [visible]);

  if (!isOfficer) {
    return (
      <Card className="space-y-2 p-10 text-center">
        <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Restricted safeguarding dashboard</h3>
        <p className="text-sm text-muted-foreground">
          Only appointed safeguarding officers can see safeguarding caseloads.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "Cases", value: totals.cases, icon: ShieldCheck },
          { label: "Open", value: totals.open, icon: AlertTriangle },
          { label: "Closed", value: totals.closed, icon: CheckCircle2 },
          { label: "High / critical", value: totals.critical, icon: AlertTriangle },
          { label: "Officers involved", value: totals.officers, icon: UserCheck },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <s.icon className="h-4 w-4" /> {s.label}
            </div>
            <p className="font-display text-2xl font-semibold text-foreground">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search officer, facility, beneficiary, action or outcome"
          className="max-w-[360px]"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[1200] bg-popover">
            <SelectItem value="open">Open cases</SelectItem>
            <SelectItem value="closed">Closed cases</SelectItem>
            <SelectItem value="all">All cases</SelectItem>
            {CONCERN_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => void reload()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {loading && <Card className="p-8 text-center text-muted-foreground">Loading safeguarding cases…</Card>}

      {!loading && groups.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No safeguarding cases match this view.
        </Card>
      )}

      <Accordion type="multiple" className="space-y-2">
        {groups.map((g) => (
          <AccordionItem key={g.facilityId} value={g.facilityId} className="rounded-lg border bg-card px-3">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex flex-1 flex-wrap items-center gap-2 pr-2 text-left">
                <Hospital className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{g.facilityName}</span>
                <Badge variant="outline">{g.concerns.length} case{g.concerns.length === 1 ? "" : "s"}</Badge>
                {g.open > 0 && <Badge className="bg-amber-100 text-amber-900">{g.open} open</Badge>}
                <Badge variant="outline">{g.officers.length} officer{g.officers.length === 1 ? "" : "s"}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pb-4">
              {g.officers.map((o) => (
                <Card key={o.userId} className="space-y-3 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">{o.name}</span>
                    <Badge variant="outline">{o.open} open</Badge>
                    <Badge variant="outline">{o.closed} closed</Badge>
                    <Badge variant="outline">{o.withAction} with action recorded</Badge>
                    <Badge variant="outline">{o.withOutcome} with outcome</Badge>
                  </div>

                  <div className="space-y-2">
                    {o.concerns.map((c) => (
                      <div key={c.id} className="rounded-md border border-border/70 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">
                            {c.beneficiary_label || "Unnamed beneficiary"}
                          </span>
                          <Badge className={SEVERITY_TONE[c.severity] || SEVERITY_TONE.low}>
                            {SEVERITY_LABEL[c.severity] || c.severity}
                          </Badge>
                          <Badge variant="outline">{CONCERN_STATUS_LABEL[c.status] || c.status}</Badge>
                          <span className="text-xs text-muted-foreground">{c.concern_date}</span>
                        </div>
                        {c.categories.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.categories.map((cat) => (
                              <Badge key={cat} variant="secondary" className="text-[11px]">{cat}</Badge>
                            ))}
                          </div>
                        )}
                        <dl className="mt-2 space-y-1 text-sm">
                          <div>
                            <dt className="inline text-muted-foreground">Action taken: </dt>
                            <dd className="inline text-foreground">{c.action_taken?.trim() || "Not recorded yet"}</dd>
                          </div>
                          <div>
                            <dt className="inline text-muted-foreground">Outcome: </dt>
                            <dd className="inline text-foreground">{c.outcome?.trim() || "Pending"}</dd>
                          </div>
                          {c.referral_made.length > 0 && (
                            <div>
                              <dt className="inline text-muted-foreground">Referred to: </dt>
                              <dd className="inline text-foreground">{c.referral_made.join(", ")}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default SafeguardingDashboard;
