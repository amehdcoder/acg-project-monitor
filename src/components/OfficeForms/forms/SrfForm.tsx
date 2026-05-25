import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection, Field, SaveBar, submitOfficeForm, BaseFormProps } from "../shared";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { getAllStates, getLGAsForState } from "@/lib/nigeriaAdminData";

const ACCENT = "#7C5CFF";
const STATES = getAllStates();

export default function SrfForm({ projectId, onBack }: BaseFormProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<Record<string, any>>({
    full_name: "", contact_method: "phone", phone: "", email: "", anonymous: "no",
    programme: "", state: "", lga: "", ward: "",
    person_at_risk: "", category: "", date_of_concern: "", location: "",
    narrative: "",
    immediate_risk: "no", risk_explanation: "",
    focal_person: "", focal_contact: "", follow_up_method: "phone",
  });
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  async function submit() {
    if (!f.narrative.trim() && f.anonymous !== "yes") {
      toast({ title: "Narrative description is required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const row = await submitOfficeForm("srf", f, user?.id, projectId);
      toast({ title: "Report submitted", description: `Reference: ${row.reference_code}` });
      onBack();
    } catch (e: any) {
      toast({ title: "Failed to submit", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  const lgas = f.state ? getLGAsForState(f.state) : [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-[#EDE7FE] border border-[#7C5CFF]/20 px-4 py-3 text-sm">
        <span className="font-semibold text-[#5b3fbf]">Confidential & Safe.</span>
        <span className="text-foreground/80 ml-1">Share your concern. We are here to listen and act.</span>
      </div>

      <FormSection title="Reporter Information" accent={ACCENT}>
        <Field label="Full Name"><Input value={f.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Enter your full name" /></Field>
        <Field label="Preferred Contact Method">
          <Select value={f.contact_method} onValueChange={v => set("contact_method", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="in_person">In-person</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Phone"><Input value={f.phone} onChange={e => set("phone", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={e => set("email", e.target.value)} /></Field>
        <Field label="Anonymous Reporting" colSpan={2}>
          <Select value={f.anonymous} onValueChange={v => set("anonymous", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No, share my identity</SelectItem>
              <SelectItem value="yes">Yes, keep my identity anonymous</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Programme / Project" colSpan={2}><Input value={f.programme} onChange={e => set("programme", e.target.value)} /></Field>
        <Field label="State">
          <Select value={f.state} onValueChange={v => { set("state", v); set("lga", ""); }}>
            <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
            <SelectContent>{STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="LGA">
          <Select value={f.lga} onValueChange={v => set("lga", v)} disabled={!f.state}>
            <SelectTrigger><SelectValue placeholder="Select LGA" /></SelectTrigger>
            <SelectContent>{lgas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Ward / Community" colSpan={2}><Input value={f.ward} onChange={e => set("ward", e.target.value)} /></Field>
      </FormSection>

      <FormSection title="Details of Concern" accent={ACCENT}>
        <Field label="Person(s) at Risk"><Input value={f.person_at_risk} onChange={e => set("person_at_risk", e.target.value)} /></Field>
        <Field label="Category of Concern">
          <Select value={f.category} onValueChange={v => set("category", v)}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sea">Sexual Exploitation / Abuse</SelectItem>
              <SelectItem value="child">Child Protection</SelectItem>
              <SelectItem value="bullying">Harassment / Bullying</SelectItem>
              <SelectItem value="fraud">Fraud / Misconduct</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date of Concern"><Input type="date" value={f.date_of_concern} onChange={e => set("date_of_concern", e.target.value)} /></Field>
        <Field label="Location of Concern"><Input value={f.location} onChange={e => set("location", e.target.value)} /></Field>
        <Field label="Narrative Description" required colSpan={2}>
          <Textarea rows={5} value={f.narrative} onChange={e => set("narrative", e.target.value)} placeholder="Please describe what happened in as much detail as you can…" />
        </Field>
      </FormSection>

      <FormSection title="Immediate Safety Risk" accent={ACCENT}>
        <Field label="Is anyone in immediate danger?">
          <Select value={f.immediate_risk} onValueChange={v => set("immediate_risk", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="If yes, please describe" colSpan={2}><Textarea rows={3} value={f.risk_explanation} onChange={e => set("risk_explanation", e.target.value)} /></Field>
      </FormSection>

      <FormSection title="Referral / Safeguarding Focal Person" accent={ACCENT}>
        <Field label="Focal Person"><Input value={f.focal_person} onChange={e => set("focal_person", e.target.value)} /></Field>
        <Field label="Contact (Phone / Email)"><Input value={f.focal_contact} onChange={e => set("focal_contact", e.target.value)} /></Field>
        <Field label="Preferred Follow-up Method" colSpan={2}>
          <Select value={f.follow_up_method} onValueChange={v => set("follow_up_method", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">Phone Call</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="in_person">In-person Meeting</SelectItem>
              <SelectItem value="none">No follow-up needed</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <p className="text-xs text-muted-foreground italic">Your information is confidential and will be used only for safeguarding purposes.</p>
      <SaveBar onSave={submit} saving={saving} accent={ACCENT} />
    </div>
  );
}
