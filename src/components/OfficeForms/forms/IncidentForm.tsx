import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection, Field, SaveBar, submitOfficeForm, BaseFormProps } from "../shared";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { getAllStates, getLGAsForState } from "@/lib/nigeriaAdminData";

const ACCENT = "#E25555";
const STATES = getAllStates();

export default function IncidentForm({ projectId, onBack }: BaseFormProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<Record<string, any>>({
    datetime: "", reported_date: new Date().toISOString().slice(0, 10),
    state: "", lga: "", ward: "", programme: "",
    incident_type: "", severity: "medium",
    alleged_perpetrator_type: "", affected_category: "", reported_to: "",
    response_deadline: "", classification: "Safeguarding Incident",
    what_happened: "", involved_parties: "", immediate_actions: "",
    referral_pathway: "", need_for_escalation: "no", case_status: "new",
  });
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const lgas = f.state ? getLGAsForState(f.state) : [];

  async function submit() {
    if (!f.what_happened.trim()) {
      toast({ title: "Description of what happened is required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const row = await submitOfficeForm("incident", f, user?.id, projectId);
      toast({ title: "Incident reported", description: `Reference: ${row.reference_code}` });
      onBack();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-[#FCE9E9] border border-[#E25555]/20 px-4 py-3 text-sm">
        <span className="font-semibold text-[#a8312e]">Secure & Protected.</span>
        <span className="text-foreground/80 ml-1">Act promptly to ensure safety, support and appropriate referral.</span>
      </div>

      <FormSection title="Incident Information" accent={ACCENT}>
        <Field label="Date & Time of Incident" required><Input type="datetime-local" value={f.datetime} onChange={e => set("datetime", e.target.value)} /></Field>
        <Field label="Reported Date" required><Input type="date" value={f.reported_date} onChange={e => set("reported_date", e.target.value)} /></Field>
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
        <Field label="Ward / Facility / Community"><Input value={f.ward} onChange={e => set("ward", e.target.value)} /></Field>
        <Field label="Programme / Project"><Input value={f.programme} onChange={e => set("programme", e.target.value)} /></Field>
        <Field label="Incident Type">
          <Select value={f.incident_type} onValueChange={v => set("incident_type", v)}>
            <SelectTrigger><SelectValue placeholder="Select incident type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sea">Sexual Exploitation / Abuse</SelectItem>
              <SelectItem value="child_abuse">Child Abuse</SelectItem>
              <SelectItem value="gbv">Gender-based Violence</SelectItem>
              <SelectItem value="harassment">Harassment</SelectItem>
              <SelectItem value="fraud">Fraud / Corruption</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Severity Level">
          <Select value={f.severity} onValueChange={v => set("severity", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Alleged Perpetrator Type"><Input value={f.alleged_perpetrator_type} onChange={e => set("alleged_perpetrator_type", e.target.value)} /></Field>
        <Field label="Affected Person Category"><Input value={f.affected_category} onChange={e => set("affected_category", e.target.value)} /></Field>
        <Field label="Incident Reported To"><Input value={f.reported_to} onChange={e => set("reported_to", e.target.value)} /></Field>
        <Field label="Response Deadline"><Input type="date" value={f.response_deadline} onChange={e => set("response_deadline", e.target.value)} /></Field>
      </FormSection>

      <FormSection title="What Happened" accent={ACCENT}>
        <Field label="Narrative" required colSpan={2}>
          <Textarea rows={5} value={f.what_happened} onChange={e => set("what_happened", e.target.value)} placeholder="Describe the incident factually…" />
        </Field>
        <Field label="Involved Parties" colSpan={2}><Textarea rows={3} value={f.involved_parties} onChange={e => set("involved_parties", e.target.value)} /></Field>
      </FormSection>

      <FormSection title="Immediate Actions & Referral" accent={ACCENT}>
        <Field label="Immediate Action Taken" colSpan={2}><Textarea rows={3} value={f.immediate_actions} onChange={e => set("immediate_actions", e.target.value)} /></Field>
        <Field label="Referral Pathway"><Input value={f.referral_pathway} onChange={e => set("referral_pathway", e.target.value)} /></Field>
        <Field label="Need for Escalation?">
          <Select value={f.need_for_escalation} onValueChange={v => set("need_for_escalation", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Case Status" colSpan={2}>
          <Select value={f.case_status} onValueChange={v => set("case_status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New Report</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="referred">Referred</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <SaveBar onSave={submit} saving={saving} accent={ACCENT} />
    </div>
  );
}
