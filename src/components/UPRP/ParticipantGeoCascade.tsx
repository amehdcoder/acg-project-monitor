import { useState, useEffect, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import {
  getHealthFacilitiesByWard, getSettlements, getCommunitiesByWard,
  getGrid3FacilitiesWithCoords, getGrid3SettlementsWithCoords, FacilityWithCoords,
} from "@/lib/grid3NigeriaData";
import { requiredScopeFields, UProParticipant } from "@/lib/uprp/definitions";

interface Props {
  participant: UProParticipant;
  onChange: (patch: Partial<UProParticipant>) => void;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium text-emerald-900/80">
      {label}<span className="text-red-500"> *</span>
    </Label>
    {children}
  </div>
);

// Searchable combobox with inline "Add new" — mirrors the Geo Microplanning UX.
const SearchableCombobox = memo(({ label, value, options, onSelect, allowAdd, placeholder }: {
  label: string; value: string; options: string[]; onSelect: (v: string) => void; allowAdd?: boolean; placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );
  const showAdd = allowAdd && search.trim().length > 1 && !filtered.some((o) => o.toLowerCase() === search.trim().toLowerCase());

  return (
    <Field label={label}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox"
            className={`h-10 w-full justify-between px-3 text-sm font-normal ${value ? "text-foreground" : "text-muted-foreground"}`}>
            <span className="truncate text-left">{value || placeholder || `Select ${label.toLowerCase()}`}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] max-w-[calc(100vw-2rem)] p-0 z-[10000]" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={allowAdd ? "Type to search or add new..." : "Type to search..."} value={search} onValueChange={setSearch} />
            <CommandList className="max-h-[260px]">
              {filtered.length === 0 && !showAdd && (
                <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No results found.</CommandEmpty>
              )}
              {showAdd && (
                <CommandGroup heading="Add new entry">
                  <CommandItem onSelect={() => { onSelect(search.trim()); setOpen(false); setSearch(""); }} className="text-xs py-2 px-3 text-emerald-700 font-semibold">
                    <Plus className="mr-2 h-4 w-4" /> Add "{search.trim()}" (not in list)
                  </CommandItem>
                </CommandGroup>
              )}
              {filtered.length > 0 && (
                <CommandGroup heading={`${filtered.length} result${filtered.length !== 1 ? "s" : ""}`}>
                  {filtered.map((opt) => (
                    <CommandItem key={opt} value={opt}
                      onSelect={() => { onSelect(opt); setOpen(false); setSearch(""); }}
                      className={`text-sm py-2 px-3 cursor-pointer ${value === opt ? "bg-emerald-50 font-semibold" : ""}`}>
                      <Check className={`mr-2 h-4 w-4 shrink-0 ${value === opt ? "opacity-100 text-emerald-600" : "opacity-0"}`} />
                      <span className="truncate">{opt}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
});
SearchableCombobox.displayName = "SearchableCombobox";

const ParticipantGeoCascade = ({ participant: p, onChange }: Props) => {
  const fields = useMemo(() => new Set(requiredScopeFields(p.designation)), [p.designation]);

  const [grid3Facilities, setGrid3Facilities] = useState<FacilityWithCoords[]>([]);
  const [grid3Settlements, setGrid3Settlements] = useState<FacilityWithCoords[]>([]);

  const states = useMemo(() => getAllStates(), []);
  const lgaOptions = useMemo(() => (p.state ? getLGAsForState(p.state) : []), [p.state]);
  const wardOptions = useMemo(() => (p.state && p.lga ? getWardsForLGA(p.state, p.lga) : []), [p.state, p.lga]);

  // Load GRID3 facilities/settlements (mirrors MicroplanEntryForm)
  useEffect(() => {
    if (!p.state || !p.lga) { setGrid3Facilities([]); return; }
    getGrid3FacilitiesWithCoords(p.state, p.lga, p.ward || undefined).then(setGrid3Facilities).catch(() => setGrid3Facilities([]));
  }, [p.state, p.lga, p.ward]);

  useEffect(() => {
    if (!p.state || !p.lga) { setGrid3Settlements([]); return; }
    getGrid3SettlementsWithCoords(p.state, p.lga, p.ward || undefined).then(setGrid3Settlements).catch(() => setGrid3Settlements([]));
  }, [p.state, p.lga, p.ward]);

  const flhfOptions = useMemo(() => {
    const map = new Map<string, true>();
    for (const f of grid3Facilities) map.set(f.name, true);
    const legacy = (p.state && p.lga && p.ward) ? getHealthFacilitiesByWard(p.state, p.lga, p.ward) : [];
    for (const n of legacy) map.set(n, true);
    return Array.from(map.keys());
  }, [grid3Facilities, p.state, p.lga, p.ward]);

  const communityOptions = useMemo(() => {
    const map = new Map<string, true>();
    for (const s of grid3Settlements) map.set(s.name, true);
    const legacyCom = (p.state && p.lga && p.ward) ? getCommunitiesByWard(p.state, p.lga, p.ward) : [];
    for (const n of legacyCom) map.set(n, true);
    if (p.community_name) for (const s of getSettlements(p.community_name)) map.set(s, true);
    return Array.from(map.keys());
  }, [grid3Settlements, p.state, p.lga, p.ward, p.community_name]);

  if (fields.size === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.has("state") && (
        <SearchableCombobox label="State" value={p.state} options={states}
          onSelect={(v) => onChange({ state: v, lga: "", ward: "", flhf_name: "", community_name: "" })} />
      )}
      {fields.has("lga") && (
        <SearchableCombobox label="LGA" value={p.lga} options={lgaOptions}
          onSelect={(v) => onChange({ lga: v, ward: "", flhf_name: "", community_name: "" })}
          placeholder={p.state ? "Select LGA" : "Select state first"} />
      )}
      {fields.has("ward") && (
        <SearchableCombobox label="Ward" value={p.ward} options={wardOptions}
          onSelect={(v) => onChange({ ward: v, flhf_name: "", community_name: "" })}
          placeholder={p.lga ? "Select ward" : "Select LGA first"} />
      )}
      {fields.has("flhf_name") && (
        <SearchableCombobox label="FLHF" value={p.flhf_name} options={flhfOptions} allowAdd
          onSelect={(v) => onChange({ flhf_name: v })}
          placeholder={p.ward ? "Search or add FLHF" : "Select ward first"} />
      )}
      {fields.has("community_name") && (
        <SearchableCombobox label="Community / Settlement" value={p.community_name} options={communityOptions} allowAdd
          onSelect={(v) => onChange({ community_name: v })}
          placeholder={p.flhf_name ? "Search or add community/settlement" : "Select FLHF first"} />
      )}
    </div>
  );
};

export default ParticipantGeoCascade;
