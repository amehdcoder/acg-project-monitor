// Restricted safeguarding module — visible only to appointed safeguarding
// officers. Holds the detailed narrative, concern categories, actions taken and
// case notes that must never sit in the general beneficiary record.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Lock, Plus, ShieldAlert, MessageSquarePlus, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  CONCERN_CATEGORIES, CONCERN_STATUSES, CONCERN_STATUS_LABEL, CONSENT_OPTIONS,
  IMMEDIATE_ACTIONS, REFERRAL_ACTIONS, SEVERITIES, SEVERITY_LABEL,
  addNote, logAccess, saveConcern, useSafeguardingConcerns, useSafeguardingNotes,
  type SafeguardingConcernRow,
} from "@/lib/programmeModule/safeguarding";
import type { BeneficiaryRow } from "@/lib/programmeModule/types";
import { useFacilities } from "@/lib/programmeModule/facilities";

interface Props {
  projectId: string;
  moduleId?: string;
  beneficiaries: BeneficiaryRow[];
  isOfficer: boolean;
}

const SEVERITY_TONE: Record<string, string> = {
  low: "border-border bg-muted text-muted-foreground",
  moderate: "border-amber-200 bg-amber-50 text-amber-800",
  high: "border-orange-200 bg-orange-50 text-orange-900",
  critical: "border-rose-200 bg-rose-50 text-rose-800",
};

const emptyDraft = () => ({
  beneficiary_id: "",
  facility_id: "",
  concern_date: new Date().toISOString().slice(0, 10),
  categories: [] as string[],
  severity: "moderate",
  immediate_action: "No",
  narrative: "",
  action_taken: "",
  referral_made: [] as string[],
  consent_obtained: "Not applicable",
  status: "open",
  outcome: "",
});

const SafeguardingPanel = ({ projectId, moduleId, beneficiaries, isOfficer }: Props) => {
  const { toast } = useToast();
  const { concerns, loading, reload } = useSafeguardingConcerns(projectId, isOfficer);
  const { facilities } = useFacilities(projectId);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SafeguardingConcernRow | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [noteFor, setNoteFor] = useState<SafeguardingConcernRow | null>(null);

  const facilityName = (id: string | null) =>
    facilities.find((f) => f.id === id)?.name || "Unassigned facility";

  const visible = useMemo(
    () => (statusFilter === "all" ? concerns : concerns.filter((c) => c.status === statusFilter)),
    [concerns, statusFilter],
  );

  if (!isOfficer) {
    return (
      <Card className="space-y-2 p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Restricted safeguarding module</h3>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Safeguarding narratives, concerns and actions are held separately and can only be
          opened by a named safeguarding officer. Ask an administrator if you should be one.
        </p>
      </Card>
    );
  }

  const startNew = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  };

  const startEdit = (c: SafeguardingConcernRow) => {
    setEditing(c);
    setDraft({
      beneficiary_id: c.beneficiary_id || "",
      facility_id: c.facility_id || "",
      concern_date: c.concern_date,
      categories: c.categories,
      severity: c.severity,
      immediate_action: c.immediate_action || "No",
      narrative: c.narrative,
      action_taken: c.action_taken || "",
      referral_made: c.referral_made,
      consent_obtained: c.consent_obtained || "Not applicable",
      status: c.status,
      outcome: c.outcome || "",
    });
    void logAccess(projectId, c.id, "opened");
    setOpen(true);
  };

  const toggleIn = (key: "categories" | "referral_made", value: string) =>
    setDraft((p) => ({
      ...p,
      [key]: p[key].includes(value) ? p[key].filter((x) => x !== value) : [...p[key], value],
    }));

  const save = async () => {
    if (!draft.narrative.trim()) {
      toast({ title: "Please write the safeguarding narrative", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const b = beneficiaries.find((x) => x.id === draft.beneficiary_id);
      await saveConcern({
        project_id: projectId,
        module_id: moduleId || null,
        beneficiary_id: draft.beneficiary_id || null,
        beneficiary_label: b ? `${b.full_name} (${b.case_id})` : null,
        facility_id: draft.facility_id || (b as unknown as { facility_id?: string })?.facility_id || null,
        concern_date: draft.concern_date,
        categories: draft.categories,
        severity: draft.severity,
        immediate_action: draft.immediate_action,
        narrative: draft.narrative.trim(),
        action_taken: draft.action_taken.trim() || null,
        referral_made: draft.referral_made,
        consent_obtained: draft.consent_obtained,
        status: draft.status,
        outcome: draft.outcome.trim() || null,
      }, editing?.id);
      toast({ title: editing ? "Safeguarding record updated" : "Safeguarding concern logged" });
      setOpen(false);
      await reload();
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 border-rose-200 bg-rose-50/60 p-4">
        <ShieldAlert className="h-5 w-5 text-rose-700" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-rose-900">Restricted safeguarding module</h3>
          <p className="text-xs text-rose-800">
            Confidential. Only named safeguarding officers can open these records, and every
            time one is opened it is recorded.
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[190px] bg-background"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[1200] bg-popover">
            <SelectItem value="all">All concerns</SelectItem>
            {CONCERN_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void reload()} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button size="sm" className="gap-1" onClick={startNew}>
          <Plus className="h-4 w-4" /> Log a concern
        </Button>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading safeguarding records…</p>}
      {!loading && visible.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">No safeguarding concerns recorded.</Card>
      )}

      <div className="grid gap-3">
        {visible.map((c) => (
          <Card key={c.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {c.beneficiary_label || "Unlinked concern"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {facilityName(c.facility_id)} · {new Date(c.concern_date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={SEVERITY_TONE[c.severity]}>
                  {SEVERITY_LABEL[c.severity] || c.severity}
                </Badge>
                <Badge variant="outline">{CONCERN_STATUS_LABEL[c.status] || c.status}</Badge>
              </div>
            </div>
            {!!c.categories.length && (
              <div className="flex flex-wrap gap-1">
                {c.categories.map((x) => <Badge key={x} variant="secondary">{x}</Badge>)}
              </div>
            )}
            <p className="whitespace-pre-wrap text-sm text-foreground">{c.narrative}</p>
            {c.action_taken && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Action taken: </span>{c.action_taken}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => startEdit(c)}>Open & update</Button>
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => setNoteFor(c)}>
                <MessageSquarePlus className="h-4 w-4" /> Case notes
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Concern form */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>{editing ? "Safeguarding record" : "Log a safeguarding concern"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70dvh] px-5 py-4">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Beneficiary</Label>
                  <Select
                    value={draft.beneficiary_id}
                    onValueChange={(v) => setDraft((p) => ({ ...p, beneficiary_id: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select beneficiary…" /></SelectTrigger>
                    <SelectContent className="z-[1200] max-h-72 bg-popover">
                      {beneficiaries.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.full_name} — {b.case_id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date of concern</Label>
                  <Input
                    type="date" value={draft.concern_date}
                    onChange={(e) => setDraft((p) => ({ ...p, concern_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Concern category</Label>
                <div className="grid gap-1.5 rounded-lg border border-border p-3 sm:grid-cols-2">
                  {CONCERN_CATEGORIES.map((x) => (
                    <label key={x} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.categories.includes(x)}
                        onCheckedChange={() => toggleIn("categories", x)}
                      />
                      {x}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Severity</Label>
                  <Select value={draft.severity} onValueChange={(v) => setDraft((p) => ({ ...p, severity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[1200] bg-popover">
                      {SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Immediate action required?</Label>
                  <Select
                    value={draft.immediate_action}
                    onValueChange={(v) => setDraft((p) => ({ ...p, immediate_action: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[1200] bg-popover">
                      {IMMEDIATE_ACTIONS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Safeguarding narrative</Label>
                <Textarea
                  rows={6}
                  value={draft.narrative}
                  onChange={(e) => setDraft((p) => ({ ...p, narrative: e.target.value }))}
                  placeholder="What was observed or disclosed, by whom, when and where. Use factual language."
                />
                <p className="text-xs text-muted-foreground">
                  Stored in the restricted module only. It never appears in the beneficiary record.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Safeguarding / referral action</Label>
                <div className="grid gap-1.5 rounded-lg border border-border p-3 sm:grid-cols-2">
                  {REFERRAL_ACTIONS.map((x) => (
                    <label key={x} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.referral_made.includes(x)}
                        onCheckedChange={() => toggleIn("referral_made", x)}
                      />
                      {x}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Action taken</Label>
                <Textarea
                  rows={3} value={draft.action_taken}
                  onChange={(e) => setDraft((p) => ({ ...p, action_taken: e.target.value }))}
                  placeholder="Steps already taken, who was informed and when."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Consent</Label>
                  <Select
                    value={draft.consent_obtained}
                    onValueChange={(v) => setDraft((p) => ({ ...p, consent_obtained: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[1200] bg-popover">
                      {CONSENT_OPTIONS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Case status</Label>
                  <Select value={draft.status} onValueChange={(v) => setDraft((p) => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[1200] bg-popover">
                      {CONCERN_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {draft.status === "closed" && (
                <div className="space-y-1.5">
                  <Label>Outcome</Label>
                  <Textarea
                    rows={3} value={draft.outcome}
                    onChange={(e) => setDraft((p) => ({ ...p, outcome: e.target.value }))}
                    placeholder="How the concern was resolved and the protection outcome for the person."
                  />
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter className="border-t border-border px-5 py-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save record"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NotesDialog
        concern={noteFor}
        onOpenChange={(v) => { if (!v) setNoteFor(null); }}
      />
    </div>
  );
};

const NotesDialog = ({
  concern, onOpenChange,
}: { concern: SafeguardingConcernRow | null; onOpenChange: (v: boolean) => void }) => {
  const { toast } = useToast();
  const { notes, reload } = useSafeguardingNotes(concern?.id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!concern || !text.trim()) return;
    setBusy(true);
    try {
      await addNote(concern.id, concern.project_id, text.trim());
      setText("");
      await reload();
    } catch (e) {
      toast({ title: "Could not add note", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(concern)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Safeguarding case notes</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Textarea
            rows={3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Add a follow-up note…"
          />
          <Button size="sm" disabled={busy || !text.trim()} onClick={submit}>Add note</Button>
          <div className="space-y-2">
            {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
            {notes.map((n) => (
              <div key={n.id} className="rounded-lg border border-border p-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">{n.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SafeguardingPanel;
