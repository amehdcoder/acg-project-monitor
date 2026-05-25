import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { FormSection, Field, SaveBar, submitOfficeForm, BaseFormProps } from "../shared";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const ACCENT = "#2F6FE6";

interface Item {
  id: string; item: string; specification: string; quantity: number; unit: string; justification: string;
}

const newItem = (): Item => ({ id: crypto.randomUUID(), item: "", specification: "", quantity: 1, unit: "Piece", justification: "" });

export default function StationeryForm({ projectId, onBack }: BaseFormProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<Record<string, any>>({
    request_date: new Date().toISOString().slice(0, 10),
    requesting_officer: "", department: "", programme: "", office_location: "",
    needed_by: "", priority: "medium", cost_centre: "",
    purpose: "",
  });
  const [items, setItems] = useState<Item[]>([newItem()]);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const updateItem = (id: string, patch: Partial<Item>) => setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));

  async function submit() {
    if (!f.requesting_officer.trim() || items.every(i => !i.item.trim())) {
      toast({ title: "Officer name and at least one item are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const row = await submitOfficeForm("stationery", { ...f, items: items.filter(i => i.item.trim()) }, user?.id, projectId);
      toast({ title: "Request submitted", description: `Reference: ${row.reference_code}` });
      onBack();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-[#E3ECFB] border border-[#2F6FE6]/20 px-4 py-3 text-sm flex items-center justify-between">
        <span><span className="font-semibold text-[#1656BA]">Request Summary:</span> <span className="text-foreground/80 ml-1">{items.filter(i => i.item.trim()).length} item(s)</span></span>
        <span className="text-xs font-semibold text-[#1656BA] bg-white px-2.5 py-1 rounded-full uppercase tracking-wider">{f.priority}</span>
      </div>

      <FormSection title="Request Details" accent={ACCENT}>
        <Field label="Request Date" required><Input type="date" value={f.request_date} onChange={e => set("request_date", e.target.value)} /></Field>
        <Field label="Requesting Officer" required><Input value={f.requesting_officer} onChange={e => set("requesting_officer", e.target.value)} /></Field>
        <Field label="Department / Unit"><Input value={f.department} onChange={e => set("department", e.target.value)} /></Field>
        <Field label="Programme / Project"><Input value={f.programme} onChange={e => set("programme", e.target.value)} /></Field>
        <Field label="Office Location / State"><Input value={f.office_location} onChange={e => set("office_location", e.target.value)} /></Field>
        <Field label="Needed By Date"><Input type="date" value={f.needed_by} onChange={e => set("needed_by", e.target.value)} /></Field>
        <Field label="Priority Level">
          <Select value={f.priority} onValueChange={v => set("priority", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cost Centre / Budget Line"><Input value={f.cost_centre} onChange={e => set("cost_centre", e.target.value)} placeholder="e.g. CC-2205 / Admin Supplies" /></Field>
        <Field label="Purpose of Request" colSpan={2}><Textarea rows={3} value={f.purpose} onChange={e => set("purpose", e.target.value)} placeholder="For daily office administration and trainings" /></Field>
      </FormSection>

      <div className="rounded-lg border border-border/60 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30 flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />Items Required</h3>
          <Button size="sm" variant="outline" onClick={() => setItems(prev => [...prev, newItem()])}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 w-10">#</th>
                <th className="text-left px-4 py-2">Item</th>
                <th className="text-left px-4 py-2">Specification</th>
                <th className="text-left px-4 py-2 w-24">Qty</th>
                <th className="text-left px-4 py-2 w-32">Unit</th>
                <th className="text-left px-4 py-2">Justification</th>
                <th className="px-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {items.map((it, idx) => (
                <tr key={it.id}>
                  <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-1.5"><Input value={it.item} onChange={e => updateItem(it.id, { item: e.target.value })} placeholder="A4 Paper" className="h-8" /></td>
                  <td className="px-2 py-1.5"><Input value={it.specification} onChange={e => updateItem(it.id, { specification: e.target.value })} placeholder="80gsm" className="h-8" /></td>
                  <td className="px-2 py-1.5"><Input type="number" min={1} value={it.quantity} onChange={e => updateItem(it.id, { quantity: Number(e.target.value) || 1 })} className="h-8" /></td>
                  <td className="px-2 py-1.5">
                    <Select value={it.unit} onValueChange={v => updateItem(it.id, { unit: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Piece","Ream","Box","Pack","Carton","Bottle","Roll","Set"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5"><Input value={it.justification} onChange={e => updateItem(it.id, { justification: e.target.value })} placeholder="For printing & reports" className="h-8" /></td>
                  <td className="px-2 py-1.5">
                    <Button size="icon" variant="ghost" onClick={() => setItems(prev => prev.length > 1 ? prev.filter(x => x.id !== it.id) : prev)} className="h-8 w-8">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SaveBar onSave={submit} saving={saving} accent={ACCENT} label="Submit Request" />
    </div>
  );
}
