import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Filter, X } from "lucide-react";
import { resolveChecklistValue } from "./checklistSchema";

export interface ChecklistFilterState {
  from: string;
  to: string;
  state: string;
  lga: string;
  ward: string;
  designation: string;
  monitor: string;
  campaign: string;
}

export const EMPTY_FILTERS: ChecklistFilterState = {
  from: "", to: "", state: "", lga: "", ward: "", designation: "", monitor: "", campaign: "",
};

const ALL = "__all__";

const label = (field: string, v: unknown) =>
  String(resolveChecklistValue(field, v) || v || "").trim();

const day = (v: unknown) => String(v ?? "").slice(0, 10);

/** Apply date + cascaded geography/person filters to parent rows. */
export function applyChecklistFilters<T extends Record<string, unknown>>(
  parents: T[],
  f: ChecklistFilterState,
): T[] {
  return parents.filter((p) => {
    const d = day(p._submission_time);
    if (f.from && (!d || d < f.from)) return false;
    if (f.to && (!d || d > f.to)) return false;
    if (f.state && label("State", p.State) !== f.state) return false;
    if (f.lga && label("LGA", p.LGA) !== f.lga) return false;
    if (f.ward && label("Ward", p.Ward) !== f.ward) return false;
    if (f.designation && label("Designation", p.Designation) !== f.designation) return false;
    if (f.monitor && label("Independent_Monitor_s_Name", p.Independent_Monitor_s_Name) !== f.monitor) return false;
    if (f.campaign && label("MDA_Campaign_Type", p.MDA_Campaign_Type) !== f.campaign) return false;
    return true;
  });
}

const uniq = (rows: Record<string, unknown>[], field: string) =>
  [...new Set(rows.map((r) => label(field, r[field])).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

function FilterSelect({
  id, title, value, options, onChange, disabled,
}: {
  id: string; title: string; value: string; options: string[];
  onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] font-semibold text-muted-foreground">{title}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)} disabled={disabled}>
        <SelectTrigger id={id} className="h-9 text-xs">
          <SelectValue placeholder={`All ${title}`} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ALL}>All {title}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Cascaded filter bar: date range → State → LGA → Ward, plus person filters. */
export default function ChecklistFilters({
  parents, value, onChange, presetSlot,
}: {
  parents: Record<string, unknown>[];
  value: ChecklistFilterState;
  onChange: (v: ChecklistFilterState) => void;
  /** Optional saved-view controls rendered in the filter bar header. */
  presetSlot?: React.ReactNode;
}) {
  const dateScoped = useMemo(
    () => applyChecklistFilters(parents, { ...EMPTY_FILTERS, from: value.from, to: value.to }),
    [parents, value.from, value.to],
  );

  const states = useMemo(() => uniq(dateScoped, "State"), [dateScoped]);
  const byState = useMemo(
    () => (value.state ? dateScoped.filter((p) => label("State", p.State) === value.state) : dateScoped),
    [dateScoped, value.state],
  );
  const lgas = useMemo(() => uniq(byState, "LGA"), [byState]);
  const byLga = useMemo(
    () => (value.lga ? byState.filter((p) => label("LGA", p.LGA) === value.lga) : byState),
    [byState, value.lga],
  );
  const wards = useMemo(() => uniq(byLga, "Ward"), [byLga]);
  const byWard = useMemo(
    () => (value.ward ? byLga.filter((p) => label("Ward", p.Ward) === value.ward) : byLga),
    [byLga, value.ward],
  );
  const designations = useMemo(() => uniq(byWard, "Designation"), [byWard]);
  const byDesig = useMemo(
    () => (value.designation ? byWard.filter((p) => label("Designation", p.Designation) === value.designation) : byWard),
    [byWard, value.designation],
  );
  const monitors = useMemo(() => uniq(byDesig, "Independent_Monitor_s_Name"), [byDesig]);
  const campaigns = useMemo(() => uniq(byWard, "MDA_Campaign_Type"), [byWard]);

  const set = (patch: Partial<ChecklistFilterState>) => {
    const next = { ...value, ...patch };
    // cascade reset
    if (patch.state !== undefined) { next.lga = ""; next.ward = ""; }
    if (patch.lga !== undefined) next.ward = "";
    if (patch.designation !== undefined) next.monitor = "";
    onChange(next);
  };

  const active = Object.values(value).filter(Boolean).length;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-primary" /> Filters
          {active > 0 && <span className="text-muted-foreground font-normal">({active} active)</span>}
        </p>
        {active > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange({ ...EMPTY_FILTERS })}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear all
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <div className="space-y-1">
          <Label htmlFor="isc-from" className="text-[11px] font-semibold text-muted-foreground">From date</Label>
          <Input id="isc-from" type="date" className="h-9 text-xs" value={value.from}
            onChange={(e) => set({ from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="isc-to" className="text-[11px] font-semibold text-muted-foreground">To date</Label>
          <Input id="isc-to" type="date" className="h-9 text-xs" value={value.to}
            onChange={(e) => set({ to: e.target.value })} />
        </div>
        <FilterSelect id="isc-state" title="States" value={value.state} options={states}
          onChange={(v) => set({ state: v })} />
        <FilterSelect id="isc-lga" title="LGAs" value={value.lga} options={lgas}
          onChange={(v) => set({ lga: v })} />
        <FilterSelect id="isc-ward" title="Wards" value={value.ward} options={wards}
          onChange={(v) => set({ ward: v })} />
        <FilterSelect id="isc-desig" title="Designations" value={value.designation} options={designations}
          onChange={(v) => set({ designation: v })} />
        <FilterSelect id="isc-monitor" title="Monitors" value={value.monitor} options={monitors}
          onChange={(v) => set({ monitor: v })} />
        <FilterSelect id="isc-campaign" title="MDA Campaign Types" value={value.campaign} options={campaigns}
          onChange={(v) => set({ campaign: v })} />
      </div>
    </Card>
  );
}
