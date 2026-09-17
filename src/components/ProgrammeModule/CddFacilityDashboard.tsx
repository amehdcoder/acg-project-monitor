// CDD performance by facility — lets focal people track the case-search output
// and reward points of the CDDs working under their own facility.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Award, Hospital, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import { cddPerformance, type CddRow, type PotentialCaseRow } from "@/lib/programmeModule/cddCaseSearch";
import {
  CYCLE_OPTIONS, currentCycleStart, pointsByCdd, tierFor,
  type CddPointRow,
} from "@/lib/programmeModule/cddRewards";
import type { FacilityRow } from "@/lib/programmeModule/facilities";

interface Props {
  cdds: CddRow[];
  cases: PotentialCaseRow[];
  facilities: FacilityRow[];
  ledger: CddPointRow[];
}

const CddFacilityDashboard = ({ cdds, cases, facilities, ledger }: Props) => {
  const [period, setPeriod] = useState<string>("cycle");
  const [facilityFilter, setFacilityFilter] = useState("all");

  const awarded = useMemo(
    () => pointsByCdd(ledger, period === "cycle" ? currentCycleStart() : undefined),
    [ledger, period],
  );

  const groups = useMemo(() => {
    const byFacility = new Map<string, CddRow[]>();
    cdds.forEach((c) => {
      const list = byFacility.get(c.facility_id) || [];
      list.push(c);
      byFacility.set(c.facility_id, list);
    });
    return Array.from(byFacility.entries())
      .filter(([id]) => facilityFilter === "all" || facilityFilter === id)
      .map(([facilityId, list]) => {
        const rows = list.map((c) => {
          const p = cddPerformance(cases, c.id);
          const confirmed = p.confirmed + p.referred + p.registered;
          const reviewed = confirmed + p.notACase;
          return {
            cdd: c,
            found: p.found,
            confirmed,
            registered: p.registered,
            pending: p.pending,
            accuracy: reviewed ? Math.round((confirmed / reviewed) * 100) : 0,
            reviewed,
            points: awarded.get(c.id) || 0,
          };
        }).sort((a, b) => b.points - a.points || b.confirmed - a.confirmed);
        return {
          facilityId,
          name: facilities.find((f) => f.id === facilityId)?.name || "Unassigned facility",
          rows,
          found: rows.reduce((a, r) => a + r.found, 0),
          confirmed: rows.reduce((a, r) => a + r.confirmed, 0),
          registered: rows.reduce((a, r) => a + r.registered, 0),
          points: rows.reduce((a, r) => a + r.points, 0),
        };
      })
      .sort((a, b) => b.points - a.points || b.confirmed - a.confirmed);
  }, [cdds, cases, facilities, awarded, facilityFilter]);

  const best = groups[0];
  const facilityOptions = useMemo(
    () => Array.from(new Set(cdds.map((c) => c.facility_id))),
    [cdds],
  );

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Hospital className="h-4 w-4 text-primary" />
        <h4 className="font-semibold text-foreground">CDD performance by facility</h4>
        <Badge variant="outline">{groups.length} facilit{groups.length === 1 ? "y" : "ies"}</Badge>
        <div className="flex-1" />
        <Select value={facilityFilter} onValueChange={setFacilityFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[1200] bg-popover">
            <SelectItem value="all">All my facilities</SelectItem>
            {facilityOptions.map((id) => (
              <SelectItem key={id} value={id}>
                {facilities.find((f) => f.id === id)?.name || "Unassigned facility"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[1200] bg-popover">
            {CYCLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No CDD registered under a facility yet.
        </p>
      ) : (
        <div className="space-y-4">
          {best && best.points > 0 && (
            <div className={cn("flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm", toneClasses.success)}>
              <TrendingUp className="h-4 w-4" />
              <span className="font-medium">{best.name}</span> leads with {best.points} points from{" "}
              {best.confirmed} confirmed case{best.confirmed === 1 ? "" : "s"}.
            </div>
          )}

          {groups.map((g) => {
            const bestOfGroup = Math.max(1, ...g.rows.map((r) => r.points));
            return (
              <div key={g.facilityId} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
                  <p className="font-medium text-foreground">{g.name}</p>
                  <Badge variant="outline">{g.rows.length} CDD{g.rows.length === 1 ? "" : "s"}</Badge>
                  <div className="flex-1" />
                  <span className="text-xs text-muted-foreground">
                    {g.found} found · {g.confirmed} confirmed · {g.registered} registered
                  </span>
                  <Badge variant="outline" className={cn("gap-1 border", toneClasses.success)}>
                    <Award className="h-3 w-3" />{g.points} pts
                  </Badge>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CDD</TableHead>
                        <TableHead>Community</TableHead>
                        <TableHead className="text-right">Found</TableHead>
                        <TableHead className="text-right">Awaiting</TableHead>
                        <TableHead className="text-right">Confirmed</TableHead>
                        <TableHead className="text-right">Registered</TableHead>
                        <TableHead className="text-right">Accuracy</TableHead>
                        <TableHead className="w-[160px]">Points</TableHead>
                        <TableHead>Tier</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map((r) => (
                        <TableRow key={r.cdd.id}>
                          <TableCell>
                            <p className="font-medium text-foreground">{r.cdd.full_name}</p>
                            <p className="text-xs text-muted-foreground">{r.cdd.cdd_code || "—"}</p>
                          </TableCell>
                          <TableCell className="text-sm">
                            {[r.cdd.community, r.cdd.ward].filter(Boolean).join(", ") || "—"}
                          </TableCell>
                          <TableCell className="text-right">{r.found}</TableCell>
                          <TableCell className="text-right">{r.pending}</TableCell>
                          <TableCell className="text-right">{r.confirmed}</TableCell>
                          <TableCell className="text-right">{r.registered}</TableCell>
                          <TableCell className="text-right">
                            {r.reviewed ? `${r.accuracy}%` : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={(r.points / bestOfGroup) * 100} className="h-1.5" />
                              <span className="w-10 text-right text-sm font-medium">{r.points}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{tierFor(r.points).label}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Points are credited automatically as each case moves: 1 when found, 10 once a clinician
        confirms it, 5 more when the person is registered at a facility.
      </p>
    </Card>
  );
};

export default CddFacilityDashboard;
