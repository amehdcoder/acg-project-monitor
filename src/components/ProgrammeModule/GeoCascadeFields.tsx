// Shared cascading State → LGA → Ward → Community pickers used across the
// Longitudinal Beneficiary Records screens. Backed by the bundled INEC / GRID3
// registry so the lists work with no network.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { getCommunities, getCommunitiesByWard } from "@/lib/grid3NigeriaData";

export interface GeoValue {
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  community?: string | null;
}

interface ComboProps {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  disabled?: boolean;
  /** Lets the user keep a name that is not in the registry (communities). */
  allowCustom?: boolean;
  placeholder?: string;
}

export const GeoCombobox = ({
  label, value, options, onSelect, disabled, allowCustom, placeholder,
}: ComboProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 300),
    [options, search],
  );
  const typed = search.trim();
  const showAdd =
    allowCustom && typed.length > 1 &&
    !filtered.some((o) => o.toLowerCase() === typed.toLowerCase());

  return (
    <div>
      <Label className="text-sm">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button" variant="outline" role="combobox" disabled={disabled}
            className={cn(
              "mt-1 h-10 w-full justify-between px-3 text-sm font-normal",
              value ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span className="truncate text-left">
              {value || placeholder || `Select ${label.toLowerCase()}`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[1300] w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={allowCustom ? "Search or type a new name…" : "Type to search…"}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-[260px]">
              {filtered.length === 0 && !showAdd && (
                <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                  No match found.
                </CommandEmpty>
              )}
              {showAdd && (
                <CommandGroup heading="Not in the list">
                  <CommandItem
                    onSelect={() => { onSelect(typed); setOpen(false); setSearch(""); }}
                    className="text-xs"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Use “{typed}”
                  </CommandItem>
                </CommandGroup>
              )}
              {filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map((o) => (
                    <CommandItem
                      key={o} value={o}
                      onSelect={() => { onSelect(o); setOpen(false); setSearch(""); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === o ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{o}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

interface Props {
  value: GeoValue;
  /** Emits the changed level together with the levels it clears below it. */
  onChange: (patch: GeoValue) => void;
  showCommunity?: boolean;
  communityLabel?: string;
  className?: string;
}

const GeoCascadeFields = ({
  value, onChange, showCommunity = true, communityLabel = "Community / village", className,
}: Props) => {
  const state = value.state || "";
  const lga = value.lga || "";
  const ward = value.ward || "";
  const community = value.community || "";

  const states = useMemo(() => getAllStates(), []);
  const lgas = useMemo(() => (state ? getLGAsForState(state) : []), [state]);
  const wards = useMemo(() => (state && lga ? getWardsForLGA(state, lga) : []), [state, lga]);
  const communities = useMemo(() => {
    if (!state || !lga) return [] as string[];
    const byWard = ward ? getCommunitiesByWard(state, lga, ward) : [];
    return byWard.length ? byWard : getCommunities(state, lga);
  }, [state, lga, ward]);

  return (
    <div className={cn("grid gap-3", showCommunity ? "sm:grid-cols-4" : "sm:grid-cols-3", className)}>
      <GeoCombobox
        label="State" value={state} options={states}
        onSelect={(v) => onChange({ state: v, lga: "", ward: "", community: "" })}
      />
      <GeoCombobox
        label="LGA" value={lga} options={lgas} disabled={!state}
        placeholder={state ? "Select LGA" : "Pick a state first"}
        onSelect={(v) => onChange({ state, lga: v, ward: "", community: "" })}
      />
      <GeoCombobox
        label="Ward" value={ward} options={wards} disabled={!lga}
        placeholder={lga ? "Select ward" : "Pick an LGA first"}
        onSelect={(v) => onChange({ state, lga, ward: v, community: "" })}
      />
      {showCommunity && (
        <GeoCombobox
          label={communityLabel} value={community} options={communities} disabled={!lga} allowCustom
          placeholder={lga ? "Select or type" : "Pick an LGA first"}
          onSelect={(v) => onChange({ state, lga, ward, community: v })}
        />
      )}
    </div>
  );
};

export default GeoCascadeFields;
