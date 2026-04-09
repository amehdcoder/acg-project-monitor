import { useState, useCallback, useEffect, memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ChevronsUpDown, MapPin, Navigation, Building2, Users, Shield, UserCheck, Save, X, Calendar, Info, Eye, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { getHealthFacilitiesByWard, getCommunitiesByWard, getSettlements, getGrid3FacilitiesWithCoords, getGrid3SettlementsWithCoords, FacilityWithCoords } from "@/lib/grid3NigeriaData";

interface MicroplanEntryFormProps {
  projectId: string;
  initialData?: Partial<MicroplanFormData>;
  onSubmit: (data: MicroplanFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export interface MicroplanFormData {
  state: string;
  lga: string;
  ward: string;
  flhf_name: string;
  flhf_incharge_name: string;
  flhf_incharge_phone: string;
  community_name: string;
  community_leader_name: string;
  community_leader_phone: string;
  community_distance_to_flhf_km: number | null;
  settlement_name: string;
  settlement_mai_unguwa: string;
  settlement_distance_to_flhf_km: number | null;
  terrain_type: string;
  accessibility: string;
  security_clearance: string;
  estimated_total_population: number | null;
  estimated_children_5_14: number | null;
  estimated_adults_15_plus: number | null;
  estimated_children_0_4: number | null;
  number_of_households: number | null;
  trachoma_0_5_months: number | null;
  trachoma_6m_6y: number | null;
  trachoma_7_14y: number | null;
  trachoma_15_plus: number | null;
  cdd_names: string;
  cdd_phone_numbers: string;
  cdd_from_community: boolean;
  community_latitude: number | null;
  community_longitude: number | null;
  community_gps_accuracy: number | null;
  settlement_latitude: number | null;
  settlement_longitude: number | null;
  flhf_latitude: number | null;
  flhf_longitude: number | null;
  campaign_type: string;
  notes: string;
  year_of_microplanning: number | null;
  population_source: string;
}

const defaultFormData: MicroplanFormData = {
  state: "", lga: "", ward: "",
  flhf_name: "", flhf_incharge_name: "", flhf_incharge_phone: "",
  community_name: "", community_leader_name: "", community_leader_phone: "",
  community_distance_to_flhf_km: null,
  settlement_name: "", settlement_mai_unguwa: "",
  settlement_distance_to_flhf_km: null,
  terrain_type: "", accessibility: "", security_clearance: "",
  estimated_total_population: null, estimated_children_5_14: null,
  estimated_adults_15_plus: null, estimated_children_0_4: null,
  number_of_households: null,
  trachoma_0_5_months: null, trachoma_6m_6y: null,
  trachoma_7_14y: null, trachoma_15_plus: null,
  cdd_names: "", cdd_phone_numbers: "", cdd_from_community: false,
  community_latitude: null, community_longitude: null, community_gps_accuracy: null,
  settlement_latitude: null, settlement_longitude: null,
  flhf_latitude: null, flhf_longitude: null,
  campaign_type: "ntd", notes: "",
  year_of_microplanning: new Date().getFullYear(),
  population_source: "",
};

const nativeSelectClass = "flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const Section = memo(({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
  <Card className="border-border/40 shadow-none">
    <CardHeader className="pb-2 pt-3 px-3">
      <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2">
      {children}
    </CardContent>
  </Card>
));
Section.displayName = "Section";

const Field = memo(({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-0.5 ${className || ""}`}>
    <Label className="text-[11px] font-medium text-muted-foreground leading-none">
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
    {children}
  </div>
));
Field.displayName = "Field";

// Haversine distance calculation (returns km)
const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Round to 1 decimal
};

// Searchable combobox with "Add new" fallback for FLHF/Community/Settlement
const SearchableFieldCombobox = memo(({ label, required, value, options, onSelect, onCustom, addLabel, placeholder }: {
  label: string; required?: boolean; value: string; options: string[]; onSelect: (v: string) => void; onCustom: () => void; addLabel: string; placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const showAdd = search.length > 0 && !filtered.some(o => o.toLowerCase() === search.toLowerCase());

  // Highlight matching text in search results
  const highlightMatch = (text: string, query: string) => {
    if (!query) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <span>
        {text.slice(0, idx)}
        <span className="bg-primary/20 text-primary font-semibold rounded px-0.5">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </span>
    );
  };

  return (
    <Field label={label} required={required}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" className={`h-8 w-full justify-between px-2 text-xs font-normal ${value ? "text-foreground" : "text-muted-foreground"}`}>
            <span className="truncate text-left">{value || placeholder || `Search ${label.toLowerCase()}...`}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] max-w-[calc(100vw-2rem)] p-0 z-[10000]" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={`Type to search ${label.toLowerCase()}...`} value={search} onValueChange={setSearch} className="text-sm" />
            <CommandList className="max-h-[280px]">
              {filtered.length === 0 && !showAdd && <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No results found. Type to add new.</CommandEmpty>}
              <CommandGroup heading={`${filtered.length} result${filtered.length !== 1 ? "s" : ""} found`}>
                {filtered.map(opt => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => { onSelect(opt); setOpen(false); setSearch(""); }}
                    className={`text-xs py-2 px-3 cursor-pointer ${value === opt ? "bg-primary/10 font-semibold" : "hover:bg-accent"}`}
                  >
                    <Check className={`mr-2 h-4 w-4 shrink-0 ${value === opt ? "opacity-100 text-primary" : "opacity-0"}`} />
                    <span className="truncate">{highlightMatch(opt, search)}</span>
                  </CommandItem>
                ))}
                {showAdd && (
                  <CommandItem onSelect={() => { onCustom(); setOpen(false); setSearch(""); }} className="text-xs py-2 px-3 text-primary font-semibold border-t border-border mt-1">
                    <Plus className="mr-2 h-4 w-4" />
                    {addLabel}: "{search}"
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
});
SearchableFieldCombobox.displayName = "SearchableFieldCombobox";

const MicroplanEntryForm = ({ projectId, initialData, onSubmit, onCancel, isSubmitting }: MicroplanEntryFormProps) => {
  const [form, setForm] = useState<MicroplanFormData>({ ...defaultFormData, ...initialData });
  const [wardPickerOpen, setWardPickerOpen] = useState(false);
  const [flhfIsCustomInput, setFlhfIsCustomInput] = useState(false);
  const [communityIsCustomInput, setCommunityIsCustomInput] = useState(false);
  const [settlementIsCustomInput, setSettlementIsCustomInput] = useState(false);
  const [showTrachoma, setShowTrachoma] = useState(() => {
    if (initialData) {
      return !!(initialData.trachoma_0_5_months || initialData.trachoma_6m_6y || initialData.trachoma_7_14y || initialData.trachoma_15_plus);
    }
    return false;
  });

  // GRID3 data with coordinates
  const [grid3Facilities, setGrid3Facilities] = useState<FacilityWithCoords[]>([]);
  const [grid3Settlements, setGrid3Settlements] = useState<FacilityWithCoords[]>([]);

  // Cascaded admin hierarchy
  const allStates = getAllStates();
  const lgaOptions = form.state ? getLGAsForState(form.state) : [];
  const wardOptions = form.state && form.lga ? getWardsForLGA(form.state, form.lga) : [];

  // Load GRID3 facilities when state/lga/ward changes
  useEffect(() => {
    if (!form.state || !form.lga) { setGrid3Facilities([]); return; }
    getGrid3FacilitiesWithCoords(form.state, form.lga, form.ward || undefined)
      .then(setGrid3Facilities)
      .catch(() => setGrid3Facilities([]));
  }, [form.state, form.lga, form.ward]);

  // Load GRID3 settlements when state/lga/ward changes
  useEffect(() => {
    if (!form.state || !form.lga) { setGrid3Settlements([]); return; }
    getGrid3SettlementsWithCoords(form.state, form.lga, form.ward || undefined)
      .then(setGrid3Settlements)
      .catch(() => setGrid3Settlements([]));
  }, [form.state, form.lga, form.ward]);

  // Build FLHF options — merge GRID3 JSON data with legacy static data
  const flhfOptionsWithCoords = useMemo(() => {
    // Start with GRID3 JSON entries (have coords)
    const map = new Map<string, FacilityWithCoords>();
    for (const f of grid3Facilities) {
      map.set(f.name.toLowerCase(), f);
    }
    // Add legacy static entries (no coords) if not already present
    const legacyNames = (form.state && form.lga && form.ward) ? getHealthFacilitiesByWard(form.state, form.lga, form.ward) : [];
    for (const name of legacyNames) {
      if (!map.has(name.toLowerCase())) {
        map.set(name.toLowerCase(), { name, latitude: null, longitude: null });
      }
    }
    return Array.from(map.values());
  }, [grid3Facilities, form.state, form.lga, form.ward]);

  const flhfOptions = useMemo(() => flhfOptionsWithCoords.map(f => f.name), [flhfOptionsWithCoords]);

  // Build Community options from legacy static data
  const communityOptions = useMemo(() => {
    if (!form.state || !form.lga || !form.ward) return [];
    return getCommunitiesByWard(form.state, form.lga, form.ward);
  }, [form.state, form.lga, form.ward]);

  // Build Settlement options — merge GRID3 JSON with legacy
  const settlementOptionsWithCoords = useMemo(() => {
    const map = new Map<string, FacilityWithCoords>();
    for (const s of grid3Settlements) {
      map.set(s.name.toLowerCase(), s);
    }
    // Legacy settlement data
    const legacyNames = form.community_name ? getSettlements(form.community_name) : [];
    for (const name of legacyNames) {
      if (!map.has(name.toLowerCase())) {
        map.set(name.toLowerCase(), { name, latitude: null, longitude: null });
      }
    }
    return Array.from(map.values());
  }, [grid3Settlements, form.community_name]);

  const settlementOptions = useMemo(() => settlementOptionsWithCoords.map(s => s.name), [settlementOptionsWithCoords]);

  const set = useCallback((field: keyof MicroplanFormData, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const setNum = useCallback((field: keyof MicroplanFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value === "" ? null : Number(value) }));
  }, []);

  // Cascade: when state changes, clear LGA, ward, and downstream fields
  const handleStateChange = useCallback((state: string) => {
    setWardPickerOpen(false);
    setFlhfIsCustomInput(false);
    setCommunityIsCustomInput(false);
    setSettlementIsCustomInput(false);
    setForm(prev => ({ ...prev, state, lga: "", ward: "", flhf_name: "", community_name: "", settlement_name: "" }));
  }, []);

  const handleLgaChange = useCallback((lga: string) => {
    setWardPickerOpen(false);
    setFlhfIsCustomInput(false);
    setCommunityIsCustomInput(false);
    setSettlementIsCustomInput(false);
    setForm(prev => ({ ...prev, lga, ward: "", flhf_name: "", community_name: "", settlement_name: "" }));
  }, []);

  // When ward changes, clear FLHF, Community, Settlement
  const handleWardSelect = useCallback((ward: string) => {
    setFlhfIsCustomInput(false);
    setCommunityIsCustomInput(false);
    setSettlementIsCustomInput(false);
    setForm(prev => ({ ...prev, ward, flhf_name: "", community_name: "", settlement_name: "" }));
    setWardPickerOpen(false);
  }, []);

  // Auto-compute community distance to FLHF using Haversine
  useEffect(() => {
    if (form.community_latitude && form.community_longitude && form.flhf_latitude && form.flhf_longitude) {
      const dist = haversineDistance(form.community_latitude, form.community_longitude, form.flhf_latitude, form.flhf_longitude);
      setForm(prev => ({ ...prev, community_distance_to_flhf_km: dist }));
    }
  }, [form.community_latitude, form.community_longitude, form.flhf_latitude, form.flhf_longitude]);

  // Auto-compute settlement distance to FLHF using Haversine
  useEffect(() => {
    if (form.settlement_latitude && form.settlement_longitude && form.flhf_latitude && form.flhf_longitude) {
      const dist = haversineDistance(form.settlement_latitude, form.settlement_longitude, form.flhf_latitude, form.flhf_longitude);
      setForm(prev => ({ ...prev, settlement_distance_to_flhf_km: dist }));
    }
  }, [form.settlement_latitude, form.settlement_longitude, form.flhf_latitude, form.flhf_longitude]);

  // Auto-populate total population from the standard age disaggregation
  useEffect(() => {
    const c04 = form.estimated_children_0_4 ?? 0;
    const c514 = form.estimated_children_5_14 ?? 0;
    const a15 = form.estimated_adults_15_plus ?? 0;
    if (form.estimated_children_0_4 !== null || form.estimated_children_5_14 !== null || form.estimated_adults_15_plus !== null) {
      const total = c04 + c514 + a15;
      if (total > 0) {
        setForm(prev => ({ ...prev, estimated_total_population: total }));
      }
    }
  }, [form.estimated_children_0_4, form.estimated_children_5_14, form.estimated_adults_15_plus]);

  // Auto-populate total population from trachoma age disaggregation when trachoma section is active
  useEffect(() => {
    if (!showTrachoma) return;
    const t1 = form.trachoma_0_5_months ?? 0;
    const t2 = form.trachoma_6m_6y ?? 0;
    const t3 = form.trachoma_7_14y ?? 0;
    const t4 = form.trachoma_15_plus ?? 0;
    if (form.trachoma_0_5_months !== null || form.trachoma_6m_6y !== null || form.trachoma_7_14y !== null || form.trachoma_15_plus !== null) {
      const total = t1 + t2 + t3 + t4;
      if (total > 0) {
        setForm(prev => ({ ...prev, estimated_total_population: total }));
      }
    }
  }, [form.trachoma_0_5_months, form.trachoma_6m_6y, form.trachoma_7_14y, form.trachoma_15_plus, showTrachoma]);

  const captureGPS = useCallback((latField: keyof MicroplanFormData, lngField: keyof MicroplanFormData, accField?: keyof MicroplanFormData) => {
    if (!navigator.geolocation) {
      toast({ title: "GPS not available", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({
          ...prev,
          [latField]: pos.coords.latitude,
          [lngField]: pos.coords.longitude,
          ...(accField ? { [accField]: pos.coords.accuracy } : {}),
        }));
        toast({ title: "📍 GPS captured", description: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` });
      },
      (err) => toast({ title: "GPS Error", description: err.message, variant: "destructive" }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.state || !form.lga || !form.ward || !form.flhf_name || !form.community_name) {
      toast({ title: "Required fields missing", description: "State, LGA, Ward, FLHF, and Community are required.", variant: "destructive" });
      return;
    }
    const submitData = showTrachoma ? form : {
      ...form,
      trachoma_0_5_months: null, trachoma_6m_6y: null, trachoma_7_14y: null, trachoma_15_plus: null,
    };
    await onSubmit(submitData);
  }, [form, onSubmit, showTrachoma]);

  const GPSRow = ({ latField, lngField, accField, latVal, lngVal }: { latField: keyof MicroplanFormData; lngField: keyof MicroplanFormData; accField?: keyof MicroplanFormData; latVal: number | null; lngVal: number | null }) => (
    <div className="col-span-1 sm:col-span-2 lg:col-span-3 grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
      <Field label="Latitude">
        <Input value={latVal ?? ""} onChange={e => setNum(latField, e.target.value)} type="number" step="any" className="h-8 text-xs" />
      </Field>
      <Field label="Longitude">
        <Input value={lngVal ?? ""} onChange={e => setNum(lngField, e.target.value)} type="number" step="any" className="h-8 text-xs" />
      </Field>
      <Button type="button" variant="outline" size="sm" onClick={() => captureGPS(latField, lngField, accField)} className="h-8 px-2 text-[11px] mb-0">
        <Navigation className="h-3 w-3 mr-1" /> GPS
      </Button>
    </div>
  );

  const stdTotal = (form.estimated_children_0_4 ?? 0) + (form.estimated_children_5_14 ?? 0) + (form.estimated_adults_15_plus ?? 0);
  const tracTotal = (form.trachoma_0_5_months ?? 0) + (form.trachoma_6m_6y ?? 0) + (form.trachoma_7_14y ?? 0) + (form.trachoma_15_plus ?? 0);

  // Check if community distance was auto-computed
  const communityDistAutoComputed = !!(form.community_latitude && form.community_longitude && form.flhf_latitude && form.flhf_longitude);
  const settlementDistAutoComputed = !!(form.settlement_latitude && form.settlement_longitude && form.flhf_latitude && form.flhf_longitude);

  return (
    <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto pr-1 scrollbar-thin flex-1">
      {/* Year & Campaign */}
      <Section title="Campaign & Year" icon={Calendar}>
        <Field label="Year of Microplanning" required>
          <Input value={form.year_of_microplanning ?? ""} onChange={e => setNum("year_of_microplanning", e.target.value)} type="number" min={2000} max={2100} placeholder="2026" className="h-8 text-xs" />
        </Field>
        <Field label="Campaign Type">
          <select className={nativeSelectClass} value={form.campaign_type} onChange={e => set("campaign_type", e.target.value)}>
            <option value="ntd">NTD (MDA)</option>
            <option value="polio">Polio (SIA)</option>
            <option value="malaria">Malaria (ITN/IRS)</option>
            <option value="routine_immunization">Routine Immunization</option>
            <option value="covid19">COVID-19 Vaccination</option>
            <option value="nutrition">Nutrition</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Source of Population Data">
          <select className={nativeSelectClass} value={form.population_source} onChange={e => set("population_source", e.target.value)}>
            <option value="">Select source</option>
            <option value="census">National Census</option>
            <option value="projected">Census Projection</option>
            <option value="community_leader">Community Leader Estimate</option>
            <option value="health_facility">Health Facility Records</option>
            <option value="household_listing">Household Listing</option>
            <option value="survey">Survey/Study</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </Section>

      {/* Administrative Hierarchy - Cascaded */}
      <Section title="Administrative Hierarchy" icon={Building2}>
        <Field label="State" required>
          <select className={nativeSelectClass} value={form.state} onChange={e => handleStateChange(e.target.value)}>
            <option value="">Select State</option>
            {allStates.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="LGA" required>
          <select className={nativeSelectClass} value={form.lga} onChange={e => handleLgaChange(e.target.value)} disabled={!form.state}>
            <option value="">{form.state ? "Select LGA" : "Select State first"}</option>
            {lgaOptions.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Ward" required>
          <Popover open={wardPickerOpen} onOpenChange={setWardPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={wardPickerOpen}
                disabled={!form.lga}
                className="h-8 w-full justify-between px-2 text-xs font-normal"
              >
                <span className="truncate text-left">
                  {form.lga
                    ? (form.ward || `Search and select ward (${wardOptions.length} available)`)
                    : "Select LGA first"}
                </span>
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] max-w-[calc(100vw-2rem)] p-0 z-[10000]" align="start">
              <Command>
                <CommandInput placeholder="Search wards..." />
                <CommandList>
                  <CommandEmpty>No ward found.</CommandEmpty>
                  <CommandGroup>
                    {wardOptions.map((ward) => (
                      <CommandItem
                        key={ward}
                        value={ward}
                        onSelect={() => handleWardSelect(ward)}
                        className="text-xs"
                      >
                        <Check className={`mr-2 h-4 w-4 ${form.ward === ward ? "opacity-100" : "opacity-0"}`} />
                        <span className="truncate">{ward}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </Field>
      </Section>

      {/* FLHF Information */}
      <Section title="Frontline Health Facility (FLHF)" icon={Building2}>
        {flhfIsCustomInput ? (
          <Field label="Name of FLHF" required>
            <div className="flex gap-1">
              <Input value={form.flhf_name} onChange={e => set("flhf_name", e.target.value)} className="h-8 text-xs flex-1" placeholder="Type FLHF name..." autoFocus />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setFlhfIsCustomInput(false); set("flhf_name", ""); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Field>
        ) : (
          <SearchableFieldCombobox
            label="Name of FLHF"
            required
            value={form.flhf_name}
            options={flhfOptions}
            onSelect={v => {
              const match = flhfOptionsWithCoords.find(f => f.name === v);
              setForm(prev => ({
                ...prev,
                flhf_name: v,
                ...(match?.latitude != null ? { flhf_latitude: match.latitude } : {}),
                ...(match?.longitude != null ? { flhf_longitude: match.longitude } : {}),
              }));
            }}
            onCustom={() => setFlhfIsCustomInput(true)}
            addLabel="+ Add FLHF"
            placeholder="Search or add FLHF..."
          />
        )}
        <Field label="FLHF In-charge Name">
          <Input value={form.flhf_incharge_name} onChange={e => set("flhf_incharge_name", e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="FLHF In-charge Phone">
          <Input value={form.flhf_incharge_phone} onChange={e => set("flhf_incharge_phone", e.target.value)} type="tel" className="h-8 text-xs" />
        </Field>
        {form.flhf_latitude != null && form.flhf_longitude != null && (
          <p className="text-[10px] text-primary col-span-full">📍 Auto-populated from GRID3 database — editable below</p>
        )}
        <GPSRow latField="flhf_latitude" lngField="flhf_longitude" latVal={form.flhf_latitude} lngVal={form.flhf_longitude} />
      </Section>

      {/* Community Information */}
      <Section title="Community Information" icon={Users}>
        {communityIsCustomInput ? (
          <Field label="Community Name" required>
            <div className="flex gap-1">
              <Input value={form.community_name} onChange={e => set("community_name", e.target.value)} className="h-8 text-xs flex-1" placeholder="Type community name..." autoFocus />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setCommunityIsCustomInput(false); set("community_name", ""); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Field>
        ) : (
          <SearchableFieldCombobox
            label="Community Name"
            required
            value={form.community_name}
            options={communityOptions}
            onSelect={v => set("community_name", v)}
            onCustom={() => setCommunityIsCustomInput(true)}
            addLabel="+ Add Community"
            placeholder="Search or add community..."
          />
        )}
        <Field label="Community Leader">
          <Input value={form.community_leader_name} onChange={e => set("community_leader_name", e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="Leader Phone">
          <Input value={form.community_leader_phone} onChange={e => set("community_leader_phone", e.target.value)} type="tel" className="h-8 text-xs" />
        </Field>
        <Field label={`Distance to FLHF (KM)${communityDistAutoComputed ? " — auto-computed ✓" : ""}`}>
          <Input
            value={form.community_distance_to_flhf_km ?? ""}
            onChange={e => setNum("community_distance_to_flhf_km", e.target.value)}
            type="number" step="0.1"
            className={`h-8 text-xs ${communityDistAutoComputed ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300" : ""}`}
            readOnly={communityDistAutoComputed}
          />
          {communityDistAutoComputed && <p className="text-[10px] text-emerald-600">Haversine distance from GPS coordinates</p>}
        </Field>
        <GPSRow latField="community_latitude" lngField="community_longitude" accField="community_gps_accuracy" latVal={form.community_latitude} lngVal={form.community_longitude} />
      </Section>

      {/* Settlement Information */}
      <Section title="Settlement Information" icon={MapPin}>
        {settlementIsCustomInput ? (
          <Field label="Settlement Name">
            <div className="flex gap-1">
              <Input value={form.settlement_name} onChange={e => set("settlement_name", e.target.value)} className="h-8 text-xs flex-1" placeholder="Type settlement name..." autoFocus />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setSettlementIsCustomInput(false); set("settlement_name", ""); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Field>
        ) : (
          <SearchableFieldCombobox
            label="Settlement Name"
            value={form.settlement_name}
            options={settlementOptions}
            onSelect={v => {
              const match = settlementOptionsWithCoords.find(s => s.name === v);
              setForm(prev => ({
                ...prev,
                settlement_name: v,
                ...(match?.latitude != null ? { settlement_latitude: match.latitude } : {}),
                ...(match?.longitude != null ? { settlement_longitude: match.longitude } : {}),
              }));
            }}
            onCustom={() => setSettlementIsCustomInput(true)}
            addLabel="+ Add Settlement"
            placeholder="Search or add settlement..."
          />
        )}
        <Field label="Mai Unguwa">
          <Input value={form.settlement_mai_unguwa} onChange={e => set("settlement_mai_unguwa", e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label={`Distance to FLHF (KM)${settlementDistAutoComputed ? " — auto-computed ✓" : ""}`}>
          <Input
            value={form.settlement_distance_to_flhf_km ?? ""}
            onChange={e => setNum("settlement_distance_to_flhf_km", e.target.value)}
            type="number" step="0.1"
            className={`h-8 text-xs ${settlementDistAutoComputed ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300" : ""}`}
            readOnly={settlementDistAutoComputed}
          />
          {settlementDistAutoComputed && <p className="text-[10px] text-emerald-600">Haversine distance from GPS coordinates</p>}
        </Field>
        {form.settlement_latitude != null && form.settlement_longitude != null && (
          <p className="text-[10px] text-primary col-span-full">📍 Auto-populated from GRID3 database — editable below</p>
        )}
        <GPSRow latField="settlement_latitude" lngField="settlement_longitude" latVal={form.settlement_latitude} lngVal={form.settlement_longitude} />
      </Section>

      {/* Terrain & Access */}
      <Section title="Terrain & Accessibility" icon={Shield}>
        <Field label="Type of Terrain">
          <select className={nativeSelectClass} value={form.terrain_type} onChange={e => set("terrain_type", e.target.value)}>
            <option value="">Select terrain</option>
            <option value="flat">🌾 Flat</option>
            <option value="hilly">⛰️ Hilly</option>
            <option value="mountainous">🏔️ Mountainous</option>
            <option value="riverine">🌊 Riverine</option>
            <option value="swampy">🏝️ Swampy</option>
            <option value="desert">🏜️ Desert</option>
            <option value="forest">🌲 Forest</option>
          </select>
        </Field>
        <Field label="Accessibility">
          <select className={nativeSelectClass} value={form.accessibility} onChange={e => set("accessibility", e.target.value)}>
            <option value="">Select</option>
            <option value="accessible">✅ Accessible</option>
            <option value="hard_to_reach">⚠️ Hard to Reach</option>
            <option value="inaccessible">🚫 Inaccessible</option>
            <option value="seasonal">🌧️ Seasonal Access</option>
          </select>
        </Field>
        <Field label="Security Clearance">
          <select className={nativeSelectClass} value={form.security_clearance} onChange={e => set("security_clearance", e.target.value)}>
            <option value="">Select</option>
            <option value="cleared">🟢 Cleared</option>
            <option value="partial">🟡 Partial</option>
            <option value="not_cleared">🔴 Not Cleared</option>
            <option value="unknown">⚪ Unknown</option>
          </select>
        </Field>
      </Section>

      {/* Population Estimates - Standard */}
      <Section title="Estimated Population (Standard)" icon={Users}>
        <Field label="Total Population">
          <Input
            value={form.estimated_total_population ?? ""}
            onChange={e => setNum("estimated_total_population", e.target.value)}
            type="number"
            placeholder="Auto-calculated or enter manually"
            className="h-8 text-xs bg-muted/30"
            readOnly={stdTotal > 0 || (showTrachoma && tracTotal > 0)}
          />
          {stdTotal > 0 && <p className="text-[10px] text-muted-foreground">Sum of age groups: {stdTotal.toLocaleString()}</p>}
        </Field>
        <Field label="Children 0-4 yrs">
          <Input value={form.estimated_children_0_4 ?? ""} onChange={e => setNum("estimated_children_0_4", e.target.value)} type="number" placeholder="e.g. 800" className="h-8 text-xs" />
        </Field>
        <Field label="Children 5-14 yrs">
          <Input value={form.estimated_children_5_14 ?? ""} onChange={e => setNum("estimated_children_5_14", e.target.value)} type="number" placeholder="e.g. 1200" className="h-8 text-xs" />
        </Field>
        <Field label="Adults 15+ yrs">
          <Input value={form.estimated_adults_15_plus ?? ""} onChange={e => setNum("estimated_adults_15_plus", e.target.value)} type="number" placeholder="e.g. 3000" className="h-8 text-xs" />
        </Field>
        <Field label="Number of Households">
          <Input value={form.number_of_households ?? ""} onChange={e => setNum("number_of_households", e.target.value)} type="number" placeholder="e.g. 450" className="h-8 text-xs" />
        </Field>
      </Section>

      {/* Trachoma Age Disaggregation - Optional */}
      <Card className="border-border/40 shadow-none">
        <CardHeader className="pb-2 pt-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <Eye className="h-3.5 w-3.5" />
              Trachoma Age Disaggregation (Optional)
            </CardTitle>
            <Switch checked={showTrachoma} onCheckedChange={setShowTrachoma} />
          </div>
        </CardHeader>
        {showTrachoma && (
          <CardContent className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2">
            <Field label="0 - 5 Months">
              <Input value={form.trachoma_0_5_months ?? ""} onChange={e => setNum("trachoma_0_5_months", e.target.value)} type="number" placeholder="e.g. 150" className="h-8 text-xs" />
            </Field>
            <Field label="6 Months - 6 Years">
              <Input value={form.trachoma_6m_6y ?? ""} onChange={e => setNum("trachoma_6m_6y", e.target.value)} type="number" placeholder="e.g. 900" className="h-8 text-xs" />
            </Field>
            <Field label="7 - 14 Years">
              <Input value={form.trachoma_7_14y ?? ""} onChange={e => setNum("trachoma_7_14y", e.target.value)} type="number" placeholder="e.g. 1100" className="h-8 text-xs" />
            </Field>
            <Field label="15+ Years">
              <Input value={form.trachoma_15_plus ?? ""} onChange={e => setNum("trachoma_15_plus", e.target.value)} type="number" placeholder="e.g. 2800" className="h-8 text-xs" />
            </Field>
            <Field label="Total (Trachoma)">
              <Input value={tracTotal > 0 ? tracTotal : ""} readOnly className="h-8 text-xs bg-muted/30 font-semibold" />
              {tracTotal > 0 && <p className="text-[10px] text-muted-foreground">Auto-calculated: {tracTotal.toLocaleString()}</p>}
            </Field>
          </CardContent>
        )}
      </Card>

      {/* CDD Information */}
      <Section title="CDD Information" icon={UserCheck}>
        <Field label="Name(s) of CDD">
          <Input value={form.cdd_names} onChange={e => set("cdd_names", e.target.value)} placeholder="Comma-separated" className="h-8 text-xs" />
        </Field>
        <Field label="Phone Number(s) of CDD(s)">
          <Input value={form.cdd_phone_numbers} onChange={e => set("cdd_phone_numbers", e.target.value)} placeholder="Comma-separated" className="h-8 text-xs" />
        </Field>
        <div className="flex items-center gap-3 pt-4">
          <Switch checked={form.cdd_from_community} onCheckedChange={v => set("cdd_from_community", v)} />
          <Label className="text-xs">CDD is from Community/Settlement</Label>
        </div>
      </Section>

      {/* Notes */}
      <Section title="Additional Notes" icon={Info}>
        <div className="col-span-1 sm:col-span-2 lg:col-span-3">
          <Field label="Notes">
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className="text-xs" />
          </Field>
        </div>
      </Section>

      {/* Spacer to ensure content isn't hidden behind fixed footer */}
      <div className="h-20 flex-shrink-0" />

      {/* Actions - fixed at bottom of scrollable area */}
      <div className="sticky bottom-0 left-0 right-0 flex items-center justify-end gap-2 pt-3 pb-4 px-2 bg-background border-t border-border z-30 -mx-1" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <Button type="button" variant="outline" size="default" onClick={onCancel} disabled={isSubmitting} className="min-h-[44px] min-w-[90px]">
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <Button type="submit" size="default" className="min-h-[44px] min-w-[140px] font-semibold" disabled={isSubmitting}>
          <Save className="h-4 w-4 mr-1" /> {isSubmitting ? "Saving..." : "Save Entry"}
        </Button>
      </div>
    </form>
  );
};

export default MicroplanEntryForm;
