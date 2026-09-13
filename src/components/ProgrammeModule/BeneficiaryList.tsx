import { useMemo, useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, UserPlus, CloudOff, RefreshCw, Building2, MapPin, Users, ChevronRight, ArrowLeft, Hospital,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BeneficiaryRow, ProgrammeModuleConfig } from "@/lib/programmeModule/types";
import { evaluateDataQuality, labelFor, toneClasses, toneFor } from "@/lib/programmeModule/defaults";
import { FACILITY_TYPE_LABEL, useFacilities, type FacilityRow } from "@/lib/programmeModule/facilities";

interface Props {
  beneficiaries: BeneficiaryRow[];
  config: ProgrammeModuleConfig;
  loading: boolean;
  onOpen: (b: BeneficiaryRow) => void;
  onRegister: () => void;
  onRefresh: () => void;
  projectId?: string;
}

/** Rotating token-based accents so the facility wall is colourful but themable. */
const ACCENTS = [
  { card: "border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent", icon: "bg-primary/15 text-primary", chip: "border-primary/30 bg-primary/10 text-primary" },
  { card: "border-accent/50 bg-gradient-to-br from-accent/40 via-accent/15 to-transparent", icon: "bg-accent/40 text-accent-foreground", chip: "border-accent/50 bg-accent/25 text-accent-foreground" },
  { card: "border-secondary/60 bg-gradient-to-br from-secondary/50 via-secondary/20 to-transparent", icon: "bg-secondary/40 text-secondary-foreground", chip: "border-secondary/60 bg-secondary/30 text-secondary-foreground" },
  { card: "border-destructive/30 bg-gradient-to-br from-destructive/15 via-destructive/5 to-transparent", icon: "bg-destructive/15 text-destructive", chip: "border-destructive/30 bg-destructive/10 text-destructive" },
  { card: "border-muted-foreground/25 bg-gradient-to-br from-muted via-muted/40 to-transparent", icon: "bg-muted text-muted-foreground", chip: "border-muted-foreground/25 bg-muted text-muted-foreground" },
] as const;

const facilityIdOf = (b: BeneficiaryRow) =>
  (b as unknown as { facility_id?: string | null }).facility_id || null;

const BeneficiaryList = ({ beneficiaries, config, loading, onOpen, onRegister, onRefresh, projectId }: Props) => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [lga, setLga] = useState("all");
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);
  const { facilities } = useFacilities(projectId);

  const activeFacility: FacilityRow | undefined = useMemo(
    () => facilities.find((f) => f.id === activeFacilityId),
    [facilities, activeFacilityId],
  );

  const lgas = useMemo(
    () => Array.from(new Set(beneficiaries.map((b) => b.lga).filter(Boolean) as string[])).sort(),
    [beneficiaries],
  );

  const statsByFacility = useMemo(() => {
    const m = new Map<string | null, { total: number; statuses: Record<string, number> }>();
    for (const b of beneficiaries) {
      const key = facilityIdOf(b);
      const entry = m.get(key) || { total: 0, statuses: {} };
      entry.total += 1;
      entry.statuses[b.status] = (entry.statuses[b.status] || 0) + 1;
      m.set(key, entry);
    }
    return m;
  }, [beneficiaries]);

  /** Facilities that have a registered facility row, plus "unassigned" bucket. */
  const facilityCards = useMemo(() => {
    const cards = facilities.map((f) => ({
      facility: f,
      stats: statsByFacility.get(f.id) || { total: 0, statuses: {} },
    }));
    return cards;
  }, [facilities, statsByFacility]);

  const unassigned = statsByFacility.get(null) || { total: 0, statuses: {} };

  // ---------- Detail view: beneficiaries inside one facility ----------
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return beneficiaries.filter((b) => {
      const fid = facilityIdOf(b);
      if (activeFacilityId === "__unassigned__" ? fid !== null : fid !== activeFacilityId) return false;
      if (status !== "all" && b.status !== status) return false;
      if (lga !== "all" && b.lga !== lga) return false;
      if (!term) return true;
      return [b.full_name, b.case_id, String(b.profile?.phone ?? ""), b.village]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [beneficiaries, search, status, lga, activeFacilityId]);

  if (activeFacilityId !== null) {
    const headerAccent = ACCENTS[0];
    return (
      <div className="space-y-4">
        <Card className={cn("border p-5", headerAccent.card)}>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => { setActiveFacilityId(null); setSearch(""); setStatus("all"); setLga("all"); }}>
              <ArrowLeft className="h-4 w-4" /> All facilities
            </Button>
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", headerAccent.icon)}>
              <Hospital className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-display text-lg font-semibold text-foreground">
                {activeFacility?.name || "Unassigned beneficiaries"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {activeFacility
                  ? [
                      FACILITY_TYPE_LABEL[activeFacility.facility_type],
                      activeFacility.ward ? `${activeFacility.ward} ward` : null,
                      activeFacility.lga,
                      activeFacility.state,
                    ].filter(Boolean).join(" · ")
                  : "Records not yet linked to a facility"}
              </p>
            </div>
            <Badge variant="outline" className={cn("border", headerAccent.chip)}>
              {rows.length} beneficiar{rows.length === 1 ? "y" : "ies"}
            </Badge>
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9" placeholder="Search name, Case ID, phone or village"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200] bg-popover">
              <SelectItem value="all">All statuses</SelectItem>
              {config.workflow.statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={lga} onValueChange={setLga}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200] bg-popover">
              <SelectItem value="all">All LGAs</SelectItem>
              {lgas.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={onRefresh} aria-label="Refresh list">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={onRegister} className="gap-1">
            <UserPlus className="h-4 w-4" /> Register beneficiary
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => {
            const flags = evaluateDataQuality(config, b);
            return (
              <Card
                key={b.id}
                role="button" tabIndex={0}
                onClick={() => onOpen(b)}
                onKeyDown={(e) => e.key === "Enter" && onOpen(b)}
                className="cursor-pointer p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{b.full_name}</h3>
                    <p className="text-xs text-muted-foreground">{b.case_id}</p>
                  </div>
                  <Badge variant="outline" className={cn("border", toneClasses[toneFor(config.workflow.statuses, b.status)])}>
                    {labelFor(config.workflow.statuses, b.status)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {[b.village, b.lga, b.state].filter(Boolean).join(" · ") || "Location not recorded"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {b.__pending && (
                    <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700">
                      <CloudOff className="h-3 w-3" /> Queued
                    </Badge>
                  )}
                  {flags.length > 0 && (
                    <Badge variant="outline" className={cn("border", toneClasses["warning"])}>
                      {flags.length} data issue{flags.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {!loading && rows.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            No beneficiaries in this facility yet. Use “Register beneficiary” to create the first record.
          </Card>
        )}
      </div>
    );
  }

  // ---------- Entry view: colourful wall of facility cards ----------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <FacilitySearch value={search} onChange={setSearch} />
        </div>
        <Button variant="outline" size="icon" onClick={onRefresh} aria-label="Refresh list">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <Button onClick={onRegister} className="gap-1">
          <UserPlus className="h-4 w-4" /> Register beneficiary
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {facilityCards
          .filter(({ facility: f }) => {
            const term = search.trim().toLowerCase();
            if (!term) return true;
            return `${f.name} ${f.ward || ""} ${f.lga || ""} ${f.state || ""}`.toLowerCase().includes(term);
          })
          .map(({ facility: f, stats }, i) => {
            const accent = ACCENTS[i % ACCENTS.length];
            return (
              <Card
                key={f.id}
                role="button" tabIndex={0}
                onClick={() => setActiveFacilityId(f.id)}
                onKeyDown={(e) => e.key === "Enter" && setActiveFacilityId(f.id)}
                className={cn(
                  "group cursor-pointer border p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg",
                  accent.card,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", accent.icon)}>
                    <Building2 className="h-6 w-6" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <h3 className="mt-3 truncate font-display text-base font-semibold text-foreground">{f.name}</h3>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {[FACILITY_TYPE_LABEL[f.facility_type], f.ward ? `${f.ward} ward` : null, f.lga, f.state]
                      .filter(Boolean).join(" · ")}
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn("gap-1 border", accent.chip)}>
                    <Users className="h-3 w-3" /> {stats.total} beneficiar{stats.total === 1 ? "y" : "ies"}
                  </Badge>
                  {config.workflow.statuses
                    .filter((s) => stats.statuses[s.value])
                    .map((s) => (
                      <Badge key={s.value} variant="outline" className={cn("border", toneClasses[toneFor(config.workflow.statuses, s.value)])}>
                        {s.label}: {stats.statuses[s.value]}
                      </Badge>
                    ))}
                </div>
              </Card>
            );
          })}

        {unassigned.total > 0 && (
          <Card
            role="button" tabIndex={0}
            onClick={() => setActiveFacilityId(null as unknown as string) /* placeholder */}
            className="hidden"
          />
        )}
      </div>

      {unassigned.total > 0 && (
        <Card
          role="button" tabIndex={0}
          onClick={() => setActiveFacilityId("__unassigned__")}
          onKeyDown={(e) => e.key === "Enter" && setActiveFacilityId("__unassigned__")}
          className={cn("group cursor-pointer border p-4 transition-all hover:shadow-md", ACCENTS[4].card)}
        >
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", ACCENTS[4].icon)}>
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Unassigned beneficiaries</p>
              <p className="text-xs text-muted-foreground">{unassigned.total} record{unassigned.total === 1 ? "" : "s"} not yet linked to a facility</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </Card>
      )}

      {!loading && facilityCards.length === 0 && beneficiaries.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No health facilities registered yet. Register a facility, then add beneficiaries to it.
        </Card>
      )}
      {!loading && facilityCards.length === 0 && beneficiaries.length > 0 && (
        <Card className="p-10 text-center text-muted-foreground">
          No health facilities registered yet. Use “Health facilities” to register one.
        </Card>
      )}
    </div>
  );
};

const FacilitySearch = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <Input
    className="pl-9" placeholder="Search facilities, ward or LGA"
    value={value} onChange={(e) => onChange(e.target.value)}
  />
);

export default BeneficiaryList;
