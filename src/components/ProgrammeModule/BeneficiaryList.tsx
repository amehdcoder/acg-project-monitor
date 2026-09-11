import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, UserPlus, CloudOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BeneficiaryRow, ProgrammeModuleConfig } from "@/lib/programmeModule/types";
import { evaluateDataQuality, labelFor, toneClasses, toneFor } from "@/lib/programmeModule/defaults";
import { useFacilities } from "@/lib/programmeModule/facilities";

interface Props {
  beneficiaries: BeneficiaryRow[];
  config: ProgrammeModuleConfig;
  loading: boolean;
  onOpen: (b: BeneficiaryRow) => void;
  onRegister: () => void;
  onRefresh: () => void;
  projectId?: string;
}

const BeneficiaryList = ({ beneficiaries, config, loading, onOpen, onRegister, onRefresh, projectId }: Props) => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [lga, setLga] = useState("all");
  const [facility, setFacility] = useState("all");
  const { facilities } = useFacilities(projectId);
  const facilityName = (b: BeneficiaryRow) =>
    facilities.find((f) => f.id === (b as unknown as { facility_id?: string | null }).facility_id)?.name || "";

  const lgas = useMemo(
    () => Array.from(new Set(beneficiaries.map((b) => b.lga).filter(Boolean) as string[])).sort(),
    [beneficiaries],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return beneficiaries.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (lga !== "all" && b.lga !== lga) return false;
      if (facility !== "all"
        && (b as unknown as { facility_id?: string | null }).facility_id !== facility) return false;
      if (!term) return true;
      return [b.full_name, b.case_id, String(b.profile?.phone ?? ""), b.village]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [beneficiaries, search, status, lga, facility]);

  return (
    <div className="space-y-4">
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
                {[facilityName(b), b.village, b.lga, b.state].filter(Boolean).join(" · ") || "Location not recorded"}
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
          No beneficiaries yet. Use “Register beneficiary” to create the first record.
        </Card>
      )}
    </div>
  );
};

export default BeneficiaryList;
