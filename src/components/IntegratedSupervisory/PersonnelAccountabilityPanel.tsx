import { useDeferredValue, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search } from "lucide-react";
import type { LogisticsDataset } from "@/lib/isc/medicineAccountability";
import {
  computePersonnelAccountability, ROLE_LABELS,
  type PersonnelRole, type PersonnelRow,
} from "@/lib/isc/personnelAccountability";

const ROLES: PersonnelRole[] = ["SLO", "EDO", "FLHF", "CDD"];

const bandTone: Record<PersonnelRow["band"], string> = {
  Strong: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Adequate: "bg-blue-100 text-blue-800 border-blue-200",
  "At risk": "bg-amber-100 text-amber-900 border-amber-200",
  Critical: "bg-red-100 text-red-800 border-red-200",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

function RoleTable({ rows, query }: { rows: PersonnelRow[]; query: string }) {
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? rows.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.lgas.some((l) => l.toLowerCase().includes(q)) ||
      r.communities.some((c) => c.toLowerCase().includes(q)),
    ) : rows),
    [rows, q],
  );

  if (!filtered.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No personnel records in the synced data for this role.</p>;
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Coverage (State / LGA / Ward)</TableHead>
            <TableHead className="text-right">Communities</TableHead>
            <TableHead className="text-right">Transactions</TableHead>
            <TableHead className="text-right">Units handled</TableHead>
            <TableHead className="text-right">Documentation</TableHead>
            <TableHead className="text-right">Onward flow</TableHead>
            <TableHead className="text-right">Integrity</TableHead>
            <TableHead className="w-[170px]">Accountability score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={`${r.role}|${r.name}`}>
              <TableCell className="font-medium">
                {r.name}
                {r.activeDays > 0 && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {r.activeDays} active day{r.activeDays === 1 ? "" : "s"}
                    {r.firstDate ? ` · ${r.firstDate} → ${r.lastDate}` : ""}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {[r.states.join(", "), r.lgas.join(", "), r.wards.join(", ")]
                  .filter(Boolean).join(" · ") || "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.communityCount.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{r.transactions.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{Math.round(r.unitsHandled).toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(r.documentation)}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(r.onward)}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(r.integrity)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={r.score} className="h-2 flex-1" />
                  <span className="tabular-nums text-xs font-semibold w-8 text-right">{Math.round(r.score)}</span>
                  <Badge variant="outline" className={bandTone[r.band]}>{r.band}</Badge>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Accountability dashboard for the people who move medicines: State Logistic
 * Officers, LGA EDO / Logistic Officers, FLHF In-charges and CDDs — showing the
 * communities each covers and a composite accountability score built from
 * documentation completeness, onward stock flow and stock integrity.
 */
export default function PersonnelAccountabilityPanel({ dataset }: { dataset: LogisticsDataset }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const result = useMemo(() => computePersonnelAccountability(dataset), [dataset]);

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Personnel accountability — SLOs, EDOs, FLHF In-charges & CDDs
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {result.totals.people.toLocaleString()} people · {result.totals.communities.toLocaleString()} communities covered ·
            {" "}{Math.round(result.totals.unitsHandled).toLocaleString()} units handled · average score{" "}
            {Math.round(result.totals.avgScore)}/100. Score = documentation 40% + onward flow 40% + integrity 20%.
            Name variants are fuzzy-resolved within each role in real time.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, LGA or community"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="SLO">
          <TabsList className="flex-wrap h-auto">
            {ROLES.map((role) => (
              <TabsTrigger key={role} value={role}>
                {ROLE_LABELS[role]}
                <Badge variant="secondary" className="ml-2">{result.byRole[role]?.length ?? 0}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          {ROLES.map((role) => (
            <TabsContent key={role} value={role} className="mt-4">
              <RoleTable rows={result.byRole[role] ?? []} query={deferredQuery} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
