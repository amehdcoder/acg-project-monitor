/**
 * Searchable State / LGA / Ward filters plus a quick community lookup, shared
 * by the GRID3 Coordinate Accuracy Audit and the at-risk community register.
 *
 * The LGA list narrows to the picked State and the Ward list to the picked LGA,
 * so a supervisor never scrolls a national list to reach one ward.
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface GeoScope { state: string; lga: string; ward: string }

export const EMPTY_GEO_SCOPE: GeoScope = { state: "", lga: "", ward: "" };

export interface GeoRecord { state?: string; lga?: string; ward?: string }

const t = (v: unknown) => String(v ?? "").trim();
const eq = (a: unknown, b: unknown) =>
  t(a).toLowerCase() === t(b).toLowerCase();

/** Distinct, alphabetically ordered State / LGA / Ward options for a dataset. */
export function geoOptions(records: GeoRecord[], scope: GeoScope) {
  const uniq = (vals: string[]) =>
    Array.from(new Set(vals.map(t).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const states = uniq(records.map((r) => t(r.state)));
  const inState = scope.state ? records.filter((r) => eq(r.state, scope.state)) : records;
  const lgas = uniq(inState.map((r) => t(r.lga)));
  const inLga = scope.lga ? inState.filter((r) => eq(r.lga, scope.lga)) : inState;
  const wards = uniq(inLga.map((r) => t(r.ward)));
  return { states, lgas, wards };
}

/** True when a record satisfies the selected State / LGA / Ward scope. */
export function matchesGeoScope(r: GeoRecord, scope: GeoScope): boolean {
  if (scope.state && !eq(r.state, scope.state)) return false;
  if (scope.lga && !eq(r.lga, scope.lga)) return false;
  if (scope.ward && !eq(r.ward, scope.ward)) return false;
  return true;
}

/** Drop selections that no longer exist one level down (State change etc.). */
export function normaliseGeoScope(next: GeoScope, prev: GeoScope): GeoScope {
  const out = { ...next };
  if (!eq(out.state, prev.state)) { out.lga = ""; out.ward = ""; }
  else if (!eq(out.lga, prev.lga)) { out.ward = ""; }
  return out;
}

function GeoCombo({
  label, value, options, onChange, disabled,
}: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline" size="sm" role="combobox" aria-expanded={open}
          aria-label={`Filter by ${label}`} disabled={disabled || !options.length}
          className={cn("h-8 w-[168px] justify-between text-[11.5px] font-normal",
            value && "border-primary/50 bg-primary/5 font-medium")}
        >
          <span className="truncate">{value || `All ${label}s`}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label}…`} className="h-9 text-[12px]" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-[12px] text-muted-foreground">
              No {label} found.
            </CommandEmpty>
            <CommandGroup>
              <CommandItem value={`__all_${label}`} onSelect={() => { onChange(""); setOpen(false); }} className="text-[12px]">
                <Check className={cn("mr-2 h-3.5 w-3.5", value ? "opacity-0" : "opacity-100")} />
                All {label}s
              </CommandItem>
              {options.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => { onChange(o); setOpen(false); }} className="text-[12px]">
                  <Check className={cn("mr-2 h-3.5 w-3.5", eq(o, value) ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function GeoFilterBar({
  records, scope, onScopeChange, query, onQueryChange,
  queryPlaceholder = "Quick community lookup…", children,
}: {
  records: GeoRecord[];
  scope: GeoScope;
  onScopeChange: (s: GeoScope) => void;
  query: string;
  onQueryChange: (q: string) => void;
  queryPlaceholder?: string;
  children?: React.ReactNode;
}) {
  const { states, lgas, wards } = useMemo(() => geoOptions(records, scope), [records, scope]);
  const active = !!(scope.state || scope.lga || scope.ward || query);

  const set = (patch: Partial<GeoScope>) =>
    onScopeChange(normaliseGeoScope({ ...scope, ...patch }, scope));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" /> Scope
      </span>
      <GeoCombo label="State" value={scope.state} options={states} onChange={(v) => set({ state: v })} />
      <GeoCombo label="LGA" value={scope.lga} options={lgas} onChange={(v) => set({ lga: v })} />
      <GeoCombo label="Ward" value={scope.ward} options={wards} onChange={(v) => set({ ward: v })} />

      <div className="relative min-w-[190px] flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={queryPlaceholder}
          aria-label="Quick community lookup"
          className="h-8 pl-7 text-[12px]"
        />
      </div>

      {active && (
        <Button
          size="sm" variant="ghost" className="h-8 text-[11px]"
          onClick={() => { onScopeChange(EMPTY_GEO_SCOPE); onQueryChange(""); }}
        >
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      )}
      {children}
    </div>
  );
}
