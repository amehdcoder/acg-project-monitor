import { useState, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Navigation, Building2, Users, Shield, UserCheck, Save, X, Calendar, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
  cdd_names: "", cdd_phone_numbers: "", cdd_from_community: false,
  community_latitude: null, community_longitude: null, community_gps_accuracy: null,
  settlement_latitude: null, settlement_longitude: null,
  flhf_latitude: null, flhf_longitude: null,
  campaign_type: "ntd", notes: "",
  year_of_microplanning: new Date().getFullYear(),
  population_source: "",
};

// Lightweight native select styling
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

const MicroplanEntryForm = ({ projectId, initialData, onSubmit, onCancel, isSubmitting }: MicroplanEntryFormProps) => {
  const [form, setForm] = useState<MicroplanFormData>({ ...defaultFormData, ...initialData });

  const set = useCallback((field: keyof MicroplanFormData, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const setNum = useCallback((field: keyof MicroplanFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value === "" ? null : Number(value) }));
  }, []);

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
    await onSubmit(form);
  }, [form, onSubmit]);

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

      {/* Administrative Hierarchy */}
      <Section title="Administrative Hierarchy" icon={Building2}>
        <Field label="State" required>
          <Input value={form.state} onChange={e => set("state", e.target.value)} placeholder="e.g. Jigawa" className="h-8 text-xs" />
        </Field>
        <Field label="LGA" required>
          <Input value={form.lga} onChange={e => set("lga", e.target.value)} placeholder="e.g. Yankwashi" className="h-8 text-xs" />
        </Field>
        <Field label="Ward" required>
          <Input value={form.ward} onChange={e => set("ward", e.target.value)} placeholder="e.g. Gangara" className="h-8 text-xs" />
        </Field>
      </Section>

      {/* FLHF Information */}
      <Section title="Frontline Health Facility (FLHF)" icon={Building2}>
        <Field label="Name of FLHF" required>
          <Input value={form.flhf_name} onChange={e => set("flhf_name", e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="FLHF In-charge Name">
          <Input value={form.flhf_incharge_name} onChange={e => set("flhf_incharge_name", e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="FLHF In-charge Phone">
          <Input value={form.flhf_incharge_phone} onChange={e => set("flhf_incharge_phone", e.target.value)} type="tel" className="h-8 text-xs" />
        </Field>
        <GPSRow latField="flhf_latitude" lngField="flhf_longitude" latVal={form.flhf_latitude} lngVal={form.flhf_longitude} />
      </Section>

      {/* Community Information */}
      <Section title="Community Information" icon={Users}>
        <Field label="Community Name" required>
          <Input value={form.community_name} onChange={e => set("community_name", e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="Community Leader">
          <Input value={form.community_leader_name} onChange={e => set("community_leader_name", e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="Leader Phone">
          <Input value={form.community_leader_phone} onChange={e => set("community_leader_phone", e.target.value)} type="tel" className="h-8 text-xs" />
        </Field>
        <Field label="Distance to FLHF (KM)">
          <Input value={form.community_distance_to_flhf_km ?? ""} onChange={e => setNum("community_distance_to_flhf_km", e.target.value)} type="number" step="0.1" className="h-8 text-xs" />
        </Field>
        <GPSRow latField="community_latitude" lngField="community_longitude" accField="community_gps_accuracy" latVal={form.community_latitude} lngVal={form.community_longitude} />
      </Section>

      {/* Settlement Information */}
      <Section title="Settlement Information" icon={MapPin}>
        <Field label="Settlement Name">
          <Input value={form.settlement_name} onChange={e => set("settlement_name", e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="Mai Unguwa">
          <Input value={form.settlement_mai_unguwa} onChange={e => set("settlement_mai_unguwa", e.target.value)} className="h-8 text-xs" />
        </Field>
        <Field label="Distance to FLHF (KM)">
          <Input value={form.settlement_distance_to_flhf_km ?? ""} onChange={e => setNum("settlement_distance_to_flhf_km", e.target.value)} type="number" step="0.1" className="h-8 text-xs" />
        </Field>
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

      {/* Population Estimates */}
      <Section title="Estimated Population" icon={Users}>
        <Field label="Total Population">
          <Input value={form.estimated_total_population ?? ""} onChange={e => setNum("estimated_total_population", e.target.value)} type="number" placeholder="e.g. 5000" className="h-8 text-xs" />
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

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-2 z-10">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          <Save className="h-3.5 w-3.5 mr-1" /> {isSubmitting ? "Saving..." : "Save Entry"}
        </Button>
      </div>
    </form>
  );
};

export default MicroplanEntryForm;
