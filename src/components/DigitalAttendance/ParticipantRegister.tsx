import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Camera, Save, CheckCircle2, RotateCcw, UserPlus } from "lucide-react";
import { Participant } from "./types";

interface Props {
  onSaved: (p: Participant) => void;
  projectId?: string | null;
}

const EMPTY = {
  full_name: "",
  sex: "",
  phone: "",
  email: "",
  organization: "",
  role: "Participant",
  state: "",
  lga: "",
  ward: "",
  facility: "",
  photo_url: "",
  is_active: true,
};

export default function ParticipantRegister({ onSaved, projectId }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [savedParticipant, setSavedParticipant] = useState<Participant | null>(null);

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  async function handlePhoto(file: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Photo too large", description: "Max 2MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("photo_url", reader.result as string);
    reader.readAsDataURL(file);
  }

  async function save(addAnother: boolean) {
    if (!form.full_name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("attendance_participants" as any)
      .insert({
        full_name: form.full_name.trim(),
        sex: form.sex || null,
        phone: form.phone || null,
        email: form.email || null,
        organization: form.organization || null,
        role: form.role || null,
        state: form.state || null,
        lga: form.lga || null,
        ward: form.ward || null,
        facility: form.facility || null,
        photo_url: form.photo_url || null,
        is_active: form.is_active,
        project_id: projectId || null,
        registered_by: user?.id,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      return;
    }
    const p = data as unknown as Participant;
    onSaved(p);
    setSavedParticipant(p);
    toast({ title: "Participant saved", description: `${p.full_name} · ${p.participant_code}` });
    if (addAnother) {
      setForm({ ...EMPTY });
      setSavedParticipant(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 border border-border/60 shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-5">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Register Participant</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name" required>
            <Input value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="e.g. Aisha Musa" />
          </Field>
          <Field label="Role / Category" required>
            <Select value={form.role} onValueChange={v => set("role", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Participant">Participant</SelectItem>
                <SelectItem value="Staff">Staff</SelectItem>
                <SelectItem value="Health Worker">Health Worker</SelectItem>
                <SelectItem value="Supervisor">Supervisor</SelectItem>
                <SelectItem value="Facilitator">Facilitator</SelectItem>
                <SelectItem value="Community Volunteer">Community Volunteer</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Sex" required>
            <Select value={form.sex} onValueChange={v => set("sex", v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Other">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Phone Number">
            <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="08012345678" />
          </Field>

          <Field label="Organization / Community" className="sm:col-span-2">
            <Input value={form.organization} onChange={e => set("organization", e.target.value)} placeholder="e.g. Kafin Hausa Community" />
          </Field>

          <Field label="State">
            <Input value={form.state} onChange={e => set("state", e.target.value)} placeholder="e.g. Jigawa" />
          </Field>
          <Field label="LGA">
            <Input value={form.lga} onChange={e => set("lga", e.target.value)} placeholder="e.g. Dutse" />
          </Field>
          <Field label="Ward">
            <Input value={form.ward} onChange={e => set("ward", e.target.value)} placeholder="e.g. Kafin Hausa" />
          </Field>
          <Field label="Facility / Location">
            <Input value={form.facility} onChange={e => set("facility", e.target.value)} placeholder="e.g. Dutse LGA Secretariat" />
          </Field>

          <Field label="Status">
            <Select value={form.is_active ? "active" : "inactive"} onValueChange={v => set("is_active", v === "active")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="optional" />
          </Field>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <Button onClick={() => save(false)} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            <Save className="h-4 w-4 mr-2" /> Save Participant
          </Button>
          <Button onClick={() => save(true)} disabled={saving} variant="outline">
            Save & Add Another
          </Button>
          <Button variant="ghost" onClick={() => setForm({ ...EMPTY })}>
            <RotateCcw className="h-4 w-4 mr-2" /> Reset
          </Button>
        </div>
      </Card>

      <Card className="border border-border/60 shadow-sm p-5">
        <h3 className="text-sm font-semibold mb-3">Photo (Optional)</h3>
        <label className="block aspect-square w-full max-w-[180px] mx-auto rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-hidden cursor-pointer hover:border-primary transition-colors">
          {form.photo_url ? (
            <img src={form.photo_url} alt="Participant" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
              <Camera className="h-8 w-8 mb-2" />
              <span className="text-xs">Tap to add photo</span>
              <span className="text-[10px] mt-1">JPG, PNG (max 2MB)</span>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])}
          />
        </label>

        {savedParticipant && (
          <div className="mt-5 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
              <CheckCircle2 className="h-4 w-4" /> Participant Saved
            </div>
            <div className="mt-3 space-y-1 text-xs">
              <div><span className="text-muted-foreground">ID:</span> <span className="font-mono font-semibold">{savedParticipant.participant_code}</span></div>
              <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{savedParticipant.full_name}</span></div>
              <div><span className="text-muted-foreground">Registered:</span> {new Date(savedParticipant.created_at).toLocaleString()}</div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-foreground mb-1.5 block">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
    </div>
  );
}
