import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection, Field, SaveBar, submitOfficeForm, BaseFormProps } from "../shared";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const ACCENT = "#22A55A";

function workingDays(start: string, end: string) {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default function LeaveForm({ projectId, onBack }: BaseFormProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<Record<string, any>>({
    staff_name: "", staff_id: "", department: "", duty_station: "", supervisor: "",
    leave_type: "annual", start_date: "", end_date: "",
    reason: "", contact_during_leave: "",
    handover_to: "", handover_notes: "",
  });
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const days = workingDays(f.start_date, f.end_date);

  async function submit() {
    if (!f.staff_name.trim() || !f.start_date || !f.end_date) {
      toast({ title: "Staff name, start and end date are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const row = await submitOfficeForm("leave", { ...f, total_working_days: days }, user?.id, projectId);
      toast({ title: "Leave request submitted", description: `Reference: ${row.reference_code}` });
      onBack();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-[#E2F5EC] border border-[#22A55A]/20 px-4 py-3 text-sm flex items-center justify-between">
        <span><span className="font-semibold text-[#1f7a3a]">Leave Balance:</span> <span className="text-foreground/80 ml-1">View your balance in HR portal.</span></span>
        <span className="text-xs font-semibold text-[#1f7a3a] bg-white px-2.5 py-1 rounded-full">{days} Working Days</span>
      </div>

      <FormSection title="Staff Information" accent={ACCENT}>
        <Field label="Staff Name" required><Input value={f.staff_name} onChange={e => set("staff_name", e.target.value)} /></Field>
        <Field label="Staff ID"><Input value={f.staff_id} onChange={e => set("staff_id", e.target.value)} placeholder="HANDS-EMP-01245" /></Field>
        <Field label="Department / Unit"><Input value={f.department} onChange={e => set("department", e.target.value)} /></Field>
        <Field label="Duty Station / State"><Input value={f.duty_station} onChange={e => set("duty_station", e.target.value)} /></Field>
        <Field label="Supervisor" colSpan={2}><Input value={f.supervisor} onChange={e => set("supervisor", e.target.value)} /></Field>
      </FormSection>

      <FormSection title="Leave Details" accent={ACCENT}>
        <Field label="Leave Type" required>
          <Select value={f.leave_type} onValueChange={v => set("leave_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="annual">Annual Leave</SelectItem>
              <SelectItem value="sick">Sick Leave</SelectItem>
              <SelectItem value="compassionate">Compassionate Leave</SelectItem>
              <SelectItem value="study">Study Leave</SelectItem>
              <SelectItem value="maternity">Maternity Leave</SelectItem>
              <SelectItem value="paternity">Paternity Leave</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Total Working Days"><Input value={`${days} day${days === 1 ? "" : "s"}`} readOnly className="bg-muted/40" /></Field>
        <Field label="Start Date" required><Input type="date" value={f.start_date} onChange={e => set("start_date", e.target.value)} /></Field>
        <Field label="End Date" required><Input type="date" value={f.end_date} onChange={e => set("end_date", e.target.value)} /></Field>
        <Field label="Reason for Leave" colSpan={2}><Textarea rows={3} value={f.reason} onChange={e => set("reason", e.target.value)} /></Field>
        <Field label="Contact During Leave" colSpan={2}><Input value={f.contact_during_leave} onChange={e => set("contact_during_leave", e.target.value)} placeholder="Enter phone number or email" /></Field>
      </FormSection>

      <FormSection title="Handover / Cover" accent={ACCENT}>
        <Field label="Handover To"><Input value={f.handover_to} onChange={e => set("handover_to", e.target.value)} /></Field>
        <Field label="Handover Notes" colSpan={2}><Textarea rows={3} value={f.handover_notes} onChange={e => set("handover_notes", e.target.value)} /></Field>
      </FormSection>

      <p className="text-xs text-muted-foreground italic">Leave is subject to organisational policy and operational needs.</p>
      <SaveBar onSave={submit} saving={saving} accent={ACCENT} label="Submit Request" />
    </div>
  );
}
