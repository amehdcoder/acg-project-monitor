// Community cluster dashboard.
//
// Rolls the household register up to community level — households, people,
// mass drug administration coverage, the water and sanitation points those
// households share, and a transmission-risk reading — and groups the
// communities under the health facility that serves them.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Building2, Droplets, Home, Search, ShieldAlert, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WASH_SOURCE_TYPES, diseaseLabel, useHouseholds, washTypeLabel,
} from "@/lib/programmeModule/households";
import { useFacilities } from "@/lib/programmeModule/facilities";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";

interface Props {
  projectId: string;
  moduleId?: string;
  beneficiaries: BeneficiaryRow[];
  /** Focal persons only see the facilities they are attached to. */
  allowedFacilityIds?: string[] | null;
}

interface Cluster {
  key: string;
  community: string;
  ward: string;
  lga: string;
  facilityId: string | null;
  households: number;
  people: number;
  registered: number;
  eligible: number;
  treated: number;
  coverage: number;
  rounds: number;
  diseases: string[];
  washPoints: { id: string; name: string; type: string; improved: boolean }[];
  unimprovedShare: number;
  risk: number;
}

const riskTone = (v: number) =>
  v >= 70 ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
    : v >= 45 ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : v >= 25 ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

const riskLabel = (v: number) => (v >= 70 ? "Very high" : v >= 45 ? "High" : v >= 25 ? "Moderate" : "Low");

const improvedType = (t?: string | null) =>
  WASH_SOURCE_TYPES.find((x) => x.value === t)?.improved ?? false;

const ClusterDashboard = ({ projectId, moduleId, beneficiaries, allowedFacilityIds }: Props) => {
  const { households, washSources, rounds, loading } = useHouseholds(projectId, moduleId);
  const { facilities } = useFacilities(projectId);
  const [search, setSearch] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("all");

  const visibleFacilities = useMemo(
    () => (allowedFacilityIds && allowedFacilityIds.length
      ? facilities.filter((f) => allowedFacilityIds.includes(f.id))
      : facilities),
    [facilities, allowedFacilityIds],
  );

  const clusters = useMemo<Cluster[]>(() => {
    const washById = new Map(washSources.map((w) => [w.id, w]));
    const roundsByHousehold = new Map<string, typeof rounds>();
    for (const r of rounds) {
      roundsByHousehold.set(r.household_id, [...(roundsByHousehold.get(r.household_id) || []), r]);
    }
    const membersByHousehold = new Map<string, BeneficiaryRow[]>();
    for (const b of beneficiaries) {
      if (!b.household_id) continue;
      membersByHousehold.set(b.household_id, [...(membersByHousehold.get(b.household_id) || []), b]);
    }

    const groups = new Map<string, Cluster & { facilityVotes: Map<string, number>; diseaseSet: Set<string> }>();

    for (const h of households) {
      const community = h.village || h.ward || h.lga || "Unassigned community";
      const key = `${h.lga || ""}|${h.ward || ""}|${community}`.toLowerCase();
      let g = groups.get(key);
      if (!g) {
        g = {
          key, community, ward: h.ward || "—", lga: h.lga || "—", facilityId: null,
          households: 0, people: 0, registered: 0, eligible: 0, treated: 0, coverage: 0,
          rounds: 0, diseases: [], washPoints: [], unimprovedShare: 0, risk: 0,
          facilityVotes: new Map(), diseaseSet: new Set(),
        };
        groups.set(key, g);
      }
      g.households += 1;
      g.people += h.household_size || 0;

      const members = membersByHousehold.get(h.id) || [];
      g.registered += members.length;
      for (const m of members) {
        const fid = (m as unknown as { facility_id?: string | null }).facility_id;
        if (fid) g.facilityVotes.set(fid, (g.facilityVotes.get(fid) || 0) + 1);
      }

      for (const r of roundsByHousehold.get(h.id) || []) {
        g.eligible += r.persons_eligible || 0;
        g.treated += r.persons_treated || 0;
        g.rounds += 1;
        if (r.disease) g.diseaseSet.add(r.disease);
      }

      const w = h.wash_source_id ? washById.get(h.wash_source_id) : null;
      if (w && !g.washPoints.some((p) => p.id === w.id)) {
        g.washPoints.push({
          id: w.id, name: w.name, type: w.source_type,
          improved: w.is_improved ?? improvedType(w.source_type),
        });
      }
    }

    return [...groups.values()].map((g) => {
      const coverage = g.eligible > 0 ? Math.round((g.treated / g.eligible) * 100) : 0;
      const unimproved = g.washPoints.filter((p) => !p.improved).length;
      const unimprovedShare = g.washPoints.length ? Math.round((unimproved / g.washPoints.length) * 100) : 100;
      const sharing = g.washPoints.length ? g.households / g.washPoints.length : g.households;

      // Transmission risk: treatment gap, unsafe water, crowding on a shared
      // point, and how many registered patients the community already carries.
      const gap = g.rounds ? 100 - coverage : 70;
      const density = g.households ? Math.min(100, (g.registered / g.households) * 50) : 0;
      const crowding = Math.min(100, sharing * 8);
      const risk = Math.round(gap * 0.4 + unimprovedShare * 0.3 + crowding * 0.15 + density * 0.15);

      const facilityId = [...g.facilityVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      return {
        ...g,
        coverage,
        unimprovedShare,
        risk: Math.max(0, Math.min(100, risk)),
        facilityId,
        diseases: [...g.diseaseSet],
      };
    }).sort((a, b) => b.risk - a.risk);
  }, [households, washSources, rounds, beneficiaries]);

  const scoped = useMemo(() => {
    const allowed = allowedFacilityIds && allowedFacilityIds.length ? new Set(allowedFacilityIds) : null;
    const q = search.trim().toLowerCase();
    return clusters.filter((c) => {
      if (allowed && !(c.facilityId && allowed.has(c.facilityId))) return false;
      if (facilityFilter === "unassigned" && c.facilityId) return false;
      if (facilityFilter !== "all" && facilityFilter !== "unassigned" && c.facilityId !== facilityFilter) return false;
      if (q && !`${c.community} ${c.ward} ${c.lga}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clusters, allowedFacilityIds, facilityFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Cluster[]>();
    for (const c of scoped) {
      const key = c.facilityId || "__none";
      map.set(key, [...(map.get(key) || []), c]);
    }
    return [...map.entries()].sort((a, b) => {
      const an = facilities.find((f) => f.id === a[0])?.name || "zzz";
      const bn = facilities.find((f) => f.id === b[0])?.name || "zzz";
      return an.localeCompare(bn);
    });
  }, [scoped, facilities]);

  const totals = useMemo(() => {
    const eligible = scoped.reduce((a, c) => a + c.eligible, 0);
    const treated = scoped.reduce((a, c) => a + c.treated, 0);
    return {
      communities: scoped.length,
      households: scoped.reduce((a, c) => a + c.households, 0),
      people: scoped.reduce((a, c) => a + c.people, 0),
      coverage: eligible > 0 ? Math.round((treated / eligible) * 100) : 0,
      highRisk: scoped.filter((c) => c.risk >= 45).length,
      unsafeWater: scoped.filter((c) => c.unimprovedShare >= 50).length,
    };
  }, [scoped]);

  const Metric = ({ label, value, hint, tone, icon: Icon }: {
    label: string; value: string; hint: string; tone: string;
    icon: typeof Home;
  }) => (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1 text-3xl font-bold" style={{ color: `hsl(${tone})` }}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Users} label="Communities" value={String(totals.communities)}
          hint={`${totals.households} households · ${totals.people} people`} tone="var(--health-blue, 209 100% 36%)" />
        <Metric icon={Home} label="MDA coverage" value={`${totals.coverage}%`}
          hint="Treated out of everyone eligible" tone="var(--health-teal, 176 100% 31%)" />
        <Metric icon={ShieldAlert} label="High transmission risk" value={String(totals.highRisk)}
          hint="Communities needing a mop-up round" tone="var(--health-red, 356 63% 56%)" />
        <Metric icon={Droplets} label="Unsafe water" value={String(totals.unsafeWater)}
          hint="Mostly unimproved water points" tone="var(--health-amber, 45 87% 61%)" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Community clusters by facility</h3>
            <p className="text-xs text-muted-foreground">
              Households, treatment coverage, shared water points and transmission risk for every community.
            </p>
          </div>
          <div className="flex-1" />
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search community or ward"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={facilityFilter} onValueChange={setFacilityFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200] max-h-72 bg-popover">
              <SelectItem value="all">All facilities</SelectItem>
              {visibleFacilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              <SelectItem value="unassigned">Not linked to a facility</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {grouped.map(([facilityId, list]) => {
        const facility = facilities.find((f) => f.id === facilityId);
        const eligible = list.reduce((a, c) => a + c.eligible, 0);
        const treated = list.reduce((a, c) => a + c.treated, 0);
        const coverage = eligible > 0 ? Math.round((treated / eligible) * 100) : 0;
        return (
          <Card key={facilityId} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
              <div className="min-w-0">
                <h4 className="font-semibold text-foreground">{facility?.name || "Not linked to a facility"}</h4>
                <p className="text-xs text-muted-foreground">
                  {list.length} communit{list.length === 1 ? "y" : "ies"} ·{" "}
                  {list.reduce((a, c) => a + c.households, 0)} households
                  {facility?.lga ? ` · ${facility.lga}` : ""}
                </p>
              </div>
              <div className="flex-1" />
              <div className="w-40">
                <p className="text-xs text-muted-foreground">Coverage {coverage}%</p>
                <Progress value={coverage} className="mt-1 h-2" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Community</TableHead>
                    <TableHead>Households</TableHead>
                    <TableHead>MDA coverage</TableHead>
                    <TableHead>Diseases treated</TableHead>
                    <TableHead>Water &amp; sanitation</TableHead>
                    <TableHead>Transmission risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((c) => (
                    <TableRow key={c.key}>
                      <TableCell>
                        <p className="font-medium text-foreground">{c.community}</p>
                        <p className="text-xs text-muted-foreground">{c.ward} · {c.lga}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {c.households}
                        <span className="text-muted-foreground"> · {c.people} people</span>
                        <div className="text-xs text-muted-foreground">{c.registered} registered</div>
                      </TableCell>
                      <TableCell className="min-w-[140px]">
                        {c.rounds ? (
                          <>
                            <span className="text-sm font-medium text-foreground">{c.coverage}%</span>
                            <Progress value={c.coverage} className="mt-1 h-1.5" />
                            <span className="text-xs text-muted-foreground">{c.treated}/{c.eligible} · {c.rounds} rounds</span>
                          </>
                        ) : <span className="text-sm text-muted-foreground">No round recorded</span>}
                      </TableCell>
                      <TableCell className="max-w-[180px] text-xs text-muted-foreground">
                        {c.diseases.length ? c.diseases.map((d) => diseaseLabel(d)).join(", ") : "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-xs">
                        {c.washPoints.length ? (
                          <div className="space-y-0.5">
                            {c.washPoints.slice(0, 3).map((p) => (
                              <div key={p.id} className="flex items-center gap-1.5">
                                <Droplets className={cn("h-3 w-3", p.improved ? "text-emerald-600" : "text-amber-600")} />
                                <span className="truncate text-foreground">{p.name}</span>
                                <span className="text-muted-foreground">· {washTypeLabel(p.type)}</span>
                              </div>
                            ))}
                            {c.washPoints.length > 3 && (
                              <p className="text-muted-foreground">+{c.washPoints.length - 3} more</p>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground">No water point linked</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("border", riskTone(c.risk))}>
                          {c.risk} · {riskLabel(c.risk)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        );
      })}

      {!loading && grouped.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No households registered yet. Add households under “Households &amp; MDA” and they will cluster here.
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Transmission risk combines the treatment gap, unimproved water points, how many households share a
        point and how many registered patients the community already carries. It guides where to mop up —
        it is not a diagnosis.
      </p>
    </div>
  );
};

export default ClusterDashboard;
