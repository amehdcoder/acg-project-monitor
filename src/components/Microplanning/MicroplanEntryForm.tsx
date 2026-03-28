import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Navigation, Building2, Users, Shield, UserCheck, Save, X } from "lucide-react";
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
};

const MicroplanEntryForm = ({ projectId, initialData, onSubmit, onCancel, isSubmitting }: MicroplanEntryFormProps) => {
  const [form, setForm] = useState<MicroplanFormData>({ ...defaultFormData, ...initialData });

  const set = (field: keyof MicroplanFormData, value: any) => setForm(prev => ({ ...prev, [field]: value }));
  const setNum = (field: keyof MicroplanFormData, value: string) => set(field, value === "" ? null : Number(value));

  const captureGPS = (latField: keyof MicroplanFormData, lngField: keyof MicroplanFormData, accField?: keyof MicroplanFormData) => {
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.state || !form.lga || !form.ward || !form.flhf_name || !form.community_name) {
      toast({ title: "Required fields missing", description: "State, LGA, Ward, FLHF, and Community are required.", variant: "destructive" });
      return;
    }
    await onSubmit(form);
  };

  const Section = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
    <Card className="border-border/50">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </CardContent>
    </Card>
  );

  const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 scrollbar-thin">
      {/* Administrative Hierarchy */}
      <Section title="Administrative Hierarchy" icon={Building2}>
        <Field label="State" required><Input value={form.state} onChange={e => set("state", e.target.value)} placeholder="e.g. Jigawa" /></Field>
        <Field label="LGA" required><Input value={form.lga} onChange={e => set("lga", e.target.value)} placeholder="e.g. Yankwashi" /></Field>
        <Field label="Ward" required><Input value={form.ward} onChange={e => set("ward", e.target.value)} placeholder="e.g. Gangara" /></Field>
      </Section>

      {/* FLHF Information */}
      <Section title="Frontline Health Facility (FLHF)" icon={Building2}>
        <Field label="Name of FLHF" required><Input value={form.flhf_name} onChange={e => set("flhf_name", e.target.value)} /></Field>
        <Field label="FLHF In-charge Name"><Input value={form.flhf_incharge_name} onChange={e => set("flhf_incharge_name", e.target.value)} /></Field>
        <Field label="FLHF In-charge Phone"><Input value={form.flhf_incharge_phone} onChange={e => set("flhf_incharge_phone", e.target.value)} type="tel" /></Field>
        <div className="sm:col-span-2 lg:col-span-3 flex items-end gap-2">
          <Field label="FLHF Latitude"><Input value={form.flhf_latitude ?? ""} onChange={e => setNum("flhf_latitude", e.target.value)} type="number" step="any" /></Field>
          <Field label="FLHF Longitude"><Input value={form.flhf_longitude ?? ""} onChange={e => setNum("flhf_longitude", e.target.value)} type="number" step="any" /></Field>
          <Button type="button" variant="outline" size="sm" onClick={() => captureGPS("flhf_latitude", "flhf_longitude")} className="mb-0.5">
            <Navigation className="h-3.5 w-3.5 mr-1" /> GPS
          </Button>
        </div>
      </Section>

      {/* Community Information */}
      <Section title="Community Information" icon={Users}>
        <Field label="Community Name" required><Input value={form.community_name} onChange={e => set("community_name", e.target.value)} /></Field>
        <Field label="Community Leader"><Input value={form.community_leader_name} onChange={e => set("community_leader_name", e.target.value)} /></Field>
        <Field label="Leader Phone"><Input value={form.community_leader_phone} onChange={e => set("community_leader_phone", e.target.value)} type="tel" /></Field>
        <Field label="Distance to FLHF (KM)"><Input value={form.community_distance_to_flhf_km ?? ""} onChange={e => setNum("community_distance_to_flhf_km", e.target.value)} type="number" step="0.1" /></Field>
        <div className="sm:col-span-2 lg:col-span-3 flex items-end gap-2">
          <Field label="Community Latitude"><Input value={form.community_latitude ?? ""} onChange={e => setNum("community_latitude", e.target.value)} type="number" step="any" /></Field>
          <Field label="Community Longitude"><Input value={form.community_longitude ?? ""} onChange={e => setNum("community_longitude", e.target.value)} type="number" step="any" /></Field>
          <Button type="button" variant="outline" size="sm" onClick={() => captureGPS("community_latitude", "community_longitude", "community_gps_accuracy")} className="mb-0.5">
            <Navigation className="h-3.5 w-3.5 mr-1" /> GPS
          </Button>
        </div>
      </Section>

      {/* Settlement Information */}
      <Section title="Settlement Information" icon={MapPin}>
        <Field label="Settlement Name"><Input value={form.settlement_name} onChange={e => set("settlement_name", e.target.value)} /></Field>
        <Field label="Mai Unguwa"><Input value={form.settlement_mai_unguwa} onChange={e => set("settlement_mai_unguwa", e.target.value)} /></Field>
        <Field label="Distance to FLHF (KM)"><Input value={form.settlement_distance_to_flhf_km ?? ""} onChange={e => setNum("settlement_distance_to_flhf_km", e.target.value)} type="number" step="0.1" /></Field>
        <div className="sm:col-span-2 lg:col-span-3 flex items-end gap-2">
          <Field label="Settlement Latitude"><Input value={form.settlement_latitude ?? ""} onChange={e => setNum("settlement_latitude", e.target.value)} type="number" step="any" /></Field>
          <Field label="Settlement Longitude"><Input value={form.settlement_longitude ?? ""} onChange={e => setNum("settlement_longitude", e.target.value)} type="number" step="any" /></Field>
          <Button type="button" variant="outline" size="sm" onClick={() => captureGPS("settlement_latitude", "settlement_longitude")} className="mb-0.5">
            <Navigation className="h-3.5 w-3.5 mr-1" /> GPS
          </Button>
        </div>
      </Section>

      {/* Terrain & Access */}
      <Section title="Terrain & Accessibility" icon={Shield}>
        <Field label="Type of Terrain">
          <Select value={form.terrain_type} onValueChange={v => set("terrain_type", v)}>
            <SelectTrigger><SelectValue placeholder="Select terrain" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">Flat</SelectItem>
              <SelectItem value="hilly">Hilly</SelectItem>
              <SelectItem value="mountainous">Mountainous</SelectItem>
              <SelectItem value="riverine">Riverine</SelectItem>
              <SelectItem value="swampy">Swampy</SelectItem>
              <SelectItem value="desert">Desert</SelectItem>
              <SelectItem value="forest">Forest</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Accessibility">
          <Select value={form.accessibility} onValueChange={v => set("accessibility", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="accessible">Accessible</SelectItem>
              <SelectItem value="hard_to_reach">Hard to Reach</SelectItem>
              <SelectItem value="inaccessible">Inaccessible</SelectItem>
              <SelectItem value="seasonal">Seasonal Access</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Security Clearance">
          <Select value={form.security_clearance} onValueChange={v => set("security_clearance", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cleared">Cleared</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="not_cleared">Not Cleared</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      {/* Population Estimates */}
      <Section title="Estimated Population" icon={Users}>
        <Field label="Total Population"><Input value={form.estimated_total_population ?? ""} onChange={e => setNum("estimated_total_population", e.target.value)} type="number" /></Field>
        <Field label="Children 0-4 yrs"><Input value={form.estimated_children_0_4 ?? ""} onChange={e => setNum("estimated_children_0_4", e.target.value)} type="number" /></Field>
        <Field label="Children 5-14 yrs"><Input value={form.estimated_children_5_14 ?? ""} onChange={e => setNum("estimated_children_5_14", e.target.value)} type="number" /></Field>
        <Field label="Adults 15+ yrs"><Input value={form.estimated_adults_15_plus ?? ""} onChange={e => setNum("estimated_adults_15_plus", e.target.value)} type="number" /></Field>
        <Field label="Number of Households"><Input value={form.number_of_households ?? ""} onChange={e => setNum("number_of_households", e.target.value)} type="number" /></Field>
      </Section>

      {/* CDD Information */}
      <Section title="CDD Information" icon={UserCheck}>
        <Field label="Name(s) of CDD"><Input value={form.cdd_names} onChange={e => set("cdd_names", e.target.value)} placeholder="Comma-separated" /></Field>
        <Field label="Phone Number(s) of CDD(s)"><Input value={form.cdd_phone_numbers} onChange={e => set("cdd_phone_numbers", e.target.value)} placeholder="Comma-separated" /></Field>
        <div className="flex items-center gap-3 pt-5">
          <Switch checked={form.cdd_from_community} onCheckedChange={v => set("cdd_from_community", v)} />
          <Label className="text-xs">CDD from Community/Settlement</Label>
        </div>
      </Section>

      {/* Campaign & Notes */}
      <Section title="Campaign Details" icon={Shield}>
        <Field label="Campaign Type">
          <Select value={form.campaign_type} onValueChange={v => set("campaign_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ntd">NTD (MDA)</SelectItem>
              <SelectItem value="polio">Polio (SIA)</SelectItem>
              <SelectItem value="malaria">Malaria (ITN/IRS)</SelectItem>
              <SelectItem value="routine_immunization">Routine Immunization</SelectItem>
              <SelectItem value="covid19">COVID-19 Vaccination</SelectItem>
              <SelectItem value="nutrition">Nutrition</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes"><Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} /></Field>
        </div>
      </Section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          <Save className="h-4 w-4 mr-1" /> {isSubmitting ? "Saving..." : "Save Entry"}
        </Button>
      </div>
    </form>
  );
};

export default MicroplanEntryForm;
