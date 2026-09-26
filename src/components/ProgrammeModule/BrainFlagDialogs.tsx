import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";

/** Shared flag + resolve flow for the Record quality brain (used by the brain tab and the records list). */
export const RESOLVE_REASONS: { code: string; label: string; realError: boolean }[] = [
  { code: "corrected", label: "Error found and record corrected", realError: true },
  { code: "duplicate", label: "Duplicate or invalid record removed", realError: true },
  { code: "confirmed_correct", label: "Checked — values are correct (false alarm)", realError: false },
  { code: "expected_rare", label: "Genuinely rare but valid case", realError: false },
  { code: "other", label: "Other (explain below)", realError: false },
];

export type BrainFlag = {
  id: string; beneficiary_id: string; status: string; reason_code: string | null; reason_note: string | null;
  resolved_at: string | null; level: string; last_flagged_at: string; source?: string; flag_note?: string | null;
};

export function useBrainFlags(moduleId?: string) {
  const [flags, setFlags] = useState<Map<string, BrainFlag>>(new Map());
  const reload = useCallback(async () => {
    if (!moduleId) { setFlags(new Map()); return; }
    const out = new Map<string, BrainFlag>();
    for (let from = 0; from < 50000; from += 1000) {
      const { data } = await supabase.from("brain_flags" as never)
        .select("id,beneficiary_id,status,reason_code,reason_note,resolved_at,level,last_flagged_at,source,flag_note")
        .eq("module_id", moduleId).range(from, from + 999);
      const rows = (data as unknown as BrainFlag[]) || [];
      rows.forEach((r) => out.set(r.beneficiary_id, r));
      if (rows.length < 1000) break;
    }
    setFlags(out);
    window.dispatchEvent(new CustomEvent("brain-flags-changed", { detail: moduleId }));
  }, [moduleId]);
  useEffect(() => {
    void reload();
    const on = (e: Event) => { if ((e as CustomEvent).detail === moduleId && !(e as any).__self) void quiet(); };
    const quiet = async () => {
      if (!moduleId) return;
      const { data } = await supabase.from("brain_flags" as never).select("id,beneficiary_id,status,reason_code,reason_note,resolved_at,level,last_flagged_at,source,flag_note").eq("module_id", moduleId).limit(50000);
      const m = new Map<string, BrainFlag>(); ((data as unknown as BrainFlag[]) || []).forEach((r) => m.set(r.beneficiary_id, r)); setFlags(m);
    };
    window.addEventListener("brain-flags-changed", on);
    return () => window.removeEventListener("brain-flags-changed", on);
  }, [moduleId, reload]);
  return { flags, reload };
}

/** Manually flag a record from the list before the brain has flagged it. */
export function FlagRecordDialog({ record, moduleId, projectId, onClose, onDone }: {
  record: BeneficiaryRow | null; moduleId?: string; projectId?: string; onClose: () => void; onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!record || !moduleId || !projectId) return;
    if (!note.trim()) { toast.error("Say what looks wrong so the reviewer knows where to look."); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("brain_flags" as never).upsert({
      module_id: moduleId, project_id: projectId, beneficiary_id: record.id, case_id: record.case_id,
      level: "review", source: "manual", flagged_by: u.user?.id, flag_note: note.trim().slice(0, 500),
      status: "open", reason_code: null, reason_note: null, resolved_at: null, resolved_by: null, last_flagged_at: new Date().toISOString(),
    } as never, { onConflict: "module_id,beneficiary_id" });
    setSaving(false);
    if (error) { toast.error(`Could not flag: ${error.message}`); return; }
    toast.success(`${record.case_id} flagged for review`);
    setNote(""); onDone(); onClose();
  };
  return (
    <Dialog open={!!record} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[1300]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Flag record</DialogTitle>
          <DialogDescription>{record?.case_id} · {record?.full_name}. It will appear in the Record quality brain for review and resolution.</DialogDescription>
        </DialogHeader>
        <Textarea placeholder="What looks wrong? e.g. age 140, wrong ward for this LGA" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Flag for review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResolveFlagDialog({ record, flag, moduleId, projectId, onClose, onDone }: {
  record: BeneficiaryRow | null; flag?: BrainFlag; moduleId?: string; projectId?: string; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState("corrected");
  const [note, setNote] = useState("");
  const resolve = async () => {
    if (!record) return;
    if (reason === "other" && !note.trim()) { toast.error("Please explain the reason."); return; }
    const { data: u } = await supabase.auth.getUser();
    const patch = { status: "resolved", reason_code: reason, reason_note: note.trim().slice(0, 500) || null, resolved_by: u.user?.id, resolved_at: new Date().toISOString() };
    const { error } = flag
      ? await supabase.from("brain_flags" as never).update(patch as never).eq("id", flag.id)
      : await supabase.from("brain_flags" as never).insert({ ...patch, module_id: moduleId, project_id: projectId, beneficiary_id: record.id, case_id: record.case_id } as never);
    if (error) { toast.error(`Could not resolve: ${error.message}`); return; }
    toast.success(`${record.case_id} marked resolved`);
    setNote(""); setReason("corrected"); onDone(); onClose();
  };
  return (
    <Dialog open={!!record} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[1300]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Resolve flag</DialogTitle>
          <DialogDescription>{record?.case_id} · {record?.full_name}. Your answer teaches the brain how often its flags are real errors.</DialogDescription>
        </DialogHeader>
        {flag?.flag_note && <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">Flagged by a team member: {flag.flag_note}</p>}
        <div className="space-y-3">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1400]">{RESOLVE_REASONS.map((r) => <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea placeholder="Note (optional, required for Other)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={resolve}>Mark resolved</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
