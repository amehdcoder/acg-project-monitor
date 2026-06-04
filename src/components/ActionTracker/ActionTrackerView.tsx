import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Plus, ClipboardList, AlertTriangle, CalendarClock, CheckCircle2,
  Search, Loader2, Pencil, Trash2, Target, MessageSquareWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  ActionPoint, ActionPriority, ActionStatus, PROGRAMME_AREAS, MEETING_TYPES,
  PRIORITIES, STATUSES, STAGE_META, PRIORITY_META, timelineStage, programmeLabel,
  meetingTypeLabel, dueDescription, needsReason,
} from "@/lib/actionTracker";

const ACCENT = "#0F7E4F";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

const EMPTY = (): Record<string, any> => ({
  meeting_title: "",
  meeting_date: new Date().toISOString().slice(0, 10),
  meeting_type: "coordination",
  programme_area: "ntd",
  action_point: "",
  responsible_person: "",
  responsible_email: "",
  priority: "medium" as ActionPriority,
  start_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  status: "not_started" as ActionStatus,
  progress_notes: "",
  non_implementation_reason: "",
});

export default function ActionTrackerView({ projectId, onClose }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<ActionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, any>>(EMPTY());
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meeting_action_points" as any)
      .select("*")
      .order("due_date", { ascending: true });
    if (error) {
      toast({ title: "Could not load action points", description: error.message, variant: "destructive" });
    } else {
      setRows((data as any) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const s = { total: rows.length, overdue: 0, dueSoon: 0, completed: 0, needReason: 0 };
    rows.forEach((r) => {
      const st = timelineStage(r);
      if (st === "overdue") s.overdue++;
      if (st === "due_soon" || st === "due_today") s.dueSoon++;
      if (st === "completed") s.completed++;
      if (needsReason(r) && !r.non_implementation_reason) s.needReason++;
    });
    return s;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stageFilter !== "all" && timelineStage(r) !== stageFilter) return false;
      if (!q) return true;
      return [r.meeting_title, r.action_point, r.responsible_person, programmeLabel(r.programme_area)]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [rows, search, stageFilter]);

  function openNew() {
    setEditId(null);
    setF(EMPTY());
    setFormOpen(true);
  }
  function openEdit(r: ActionPoint) {
    setEditId(r.id);
    setF({
      meeting_title: r.meeting_title,
      meeting_date: r.meeting_date ?? "",
      meeting_type: r.meeting_type ?? "coordination",
      programme_area: r.programme_area,
      action_point: r.action_point,
      responsible_person: r.responsible_person,
      responsible_email: r.responsible_email ?? "",
      priority: r.priority,
      start_date: r.start_date ?? "",
      due_date: r.due_date,
      status: r.status,
      progress_notes: r.progress_notes ?? "",
      non_implementation_reason: r.non_implementation_reason ?? "",
    });
    setFormOpen(true);
  }

  const reasonRequired = useMemo(
    () => f.status !== "completed" && f.status !== "deferred" && f.due_date &&
      timelineStage({ status: f.status as ActionStatus, due_date: f.due_date }) === "overdue",
    [f.status, f.due_date],
  );

  async function submit() {
    if (!f.meeting_title.trim() || !f.action_point.trim() || !f.responsible_person.trim() || !f.due_date) {
      toast({ title: "Please complete the required fields", description: "Meeting, action point, responsible person and due date are required.", variant: "destructive" });
      return;
    }
    if (reasonRequired && !f.non_implementation_reason.trim()) {
      toast({ title: "Reason required", description: "This action is past its due date and not yet implemented. Please document why.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      project_id: projectId || null,
      meeting_title: f.meeting_title.trim(),
      meeting_date: f.meeting_date || null,
      meeting_type: f.meeting_type || null,
      programme_area: f.programme_area,
      action_point: f.action_point.trim(),
      responsible_person: f.responsible_person.trim(),
      responsible_email: f.responsible_email.trim() || null,
      priority: f.priority,
      start_date: f.start_date || null,
      due_date: f.due_date,
      status: f.status,
      progress_notes: f.progress_notes.trim() || null,
      non_implementation_reason: f.non_implementation_reason.trim() || null,
      reason_provided_at: f.non_implementation_reason.trim() ? new Date().toISOString() : null,
      completed_at: f.status === "completed" ? new Date().toISOString() : null,
    };
    try {
      if (editId) {
        const { error } = await supabase.from("meeting_action_points" as any).update(payload).eq("id", editId);
        if (error) throw error;
        toast({ title: "Action point updated" });
      } else {
        const { error } = await supabase.from("meeting_action_points" as any).insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast({ title: "Action point logged", description: "Implementation tracking has started." });
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: ActionPoint) {
    if (!confirm("Delete this action point? This cannot be undone.")) return;
    const { error } = await supabase.from("meeting_action_points" as any).delete().eq("id", r.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Action point deleted" });
    load();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-50">
      <div className="bg-white border-b border-border/60 sticky top-0 z-30 px-3 sm:px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold truncate">Meeting Action Points Tracker</h1>
          <p className="hidden sm:block text-xs text-muted-foreground">Capture decisions, assign owners & track implementation against timelines.</p>
        </div>
        <Button size="sm" onClick={openNew} style={{ background: ACCENT }} className="text-white hover:opacity-90">
          <Plus className="h-4 w-4 mr-1.5" /> New Action Point
        </Button>
      </div>

      <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-4">
        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard icon={ClipboardList} label="Total Actions" value={stats.total} tint="bg-[#E3ECFB]" fg="text-[#1656BA]" />
          <StatCard icon={CalendarClock} label="Due Soon" value={stats.dueSoon} tint="bg-[#FFF3D6]" fg="text-[#9A6B00]" />
          <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdue} tint="bg-[#FCE9E9]" fg="text-[#B23636]" />
          <StatCard icon={MessageSquareWarning} label="Awaiting Reason" value={stats.needReason} tint="bg-[#FCE9DA]" fg="text-[#B8651A]" />
          <StatCard icon={CheckCircle2} label="Implemented" value={stats.completed} tint="bg-[#E2F5EC]" fg="text-[#1F7A3A]" />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by meeting, action, owner or programme…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="due_today">Due Today</SelectItem>
              <SelectItem value="due_soon">Due Soon</SelectItem>
              <SelectItem value="on_track">On Track</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="deferred">Deferred</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <Target className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-medium">No action points yet</p>
            <p className="text-sm text-muted-foreground mt-1">Log the agreed actions from your last meeting to begin tracking implementation.</p>
            <Button className="mt-4" onClick={openNew} style={{ background: ACCENT }} variant="default">
              <Plus className="h-4 w-4 mr-1.5" /> Add the first action point
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const stage = timelineStage(r);
              const sm = STAGE_META[stage];
              const pm = PRIORITY_META[r.priority];
              const reasonMissing = needsReason(r) && !r.non_implementation_reason;
              return (
                <Card key={r.id} className="p-4 border border-border/60 hover:shadow-sm transition-shadow">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${sm.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${sm.chip}`}>{sm.label}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${pm.chip}`}>{pm.label} priority</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">{programmeLabel(r.programme_area)}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-foreground">{r.action_point}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {r.meeting_title} · {meetingTypeLabel(r.meeting_type)}{r.meeting_date ? ` · ${r.meeting_date}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="text-foreground/80"><strong className="font-medium">Owner:</strong> {r.responsible_person}</span>
                        <span className="text-foreground/80"><strong className="font-medium">Due:</strong> {r.due_date}</span>
                        <span className={stage === "overdue" ? "font-semibold text-[#B23636]" : "text-muted-foreground"}>{dueDescription(r)}</span>
                      </div>
                      {r.progress_notes && <p className="mt-2 text-xs text-muted-foreground italic">“{r.progress_notes}”</p>}
                      {r.non_implementation_reason && (
                        <div className="mt-2 rounded-md bg-[#FCE9DA]/60 border border-[#F08A2A]/30 px-3 py-2 text-xs">
                          <span className="font-semibold text-[#B8651A]">Reason not implemented by due date: </span>
                          <span className="text-foreground/80">{r.non_implementation_reason}</span>
                        </div>
                      )}
                      {reasonMissing && (
                        <div className="mt-2 rounded-md bg-[#FCE9E9] border border-[#E25555]/30 px-3 py-2 text-xs flex items-center gap-2">
                          <MessageSquareWarning className="h-4 w-4 text-[#B23636] shrink-0" />
                          <span className="text-[#B23636] font-medium">This action is overdue — a reason for non-implementation is required.</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} title="Update / record reason"><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(r)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Form dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Update Action Point" : "New Meeting Action Point"}</DialogTitle>
            <DialogDescription>
              Record the agreed action, assign an owner and set the implementation timeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <SectionTitle>Meeting Details</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Fld label="Meeting Title / Subject" required cls="sm:col-span-2">
                <Input value={f.meeting_title} onChange={(e) => set("meeting_title", e.target.value)} placeholder="e.g. State NTD Coordination Meeting – Q2" />
              </Fld>
              <Fld label="Meeting Date">
                <Input type="date" value={f.meeting_date} onChange={(e) => set("meeting_date", e.target.value)} />
              </Fld>
              <Fld label="Meeting Type">
                <Select value={f.meeting_type} onValueChange={(v) => set("meeting_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MEETING_TYPES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </Fld>
              <Fld label="Programme Area" cls="sm:col-span-2">
                <Select value={f.programme_area} onValueChange={(v) => set("programme_area", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROGRAMME_AREAS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </Fld>
            </div>

            <SectionTitle>Action & Accountability</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Fld label="Action Point / Agreed Decision" required cls="sm:col-span-2">
                <Textarea rows={3} value={f.action_point} onChange={(e) => set("action_point", e.target.value)} placeholder="Describe the specific action to be implemented…" />
              </Fld>
              <Fld label="Responsible Person" required>
                <Input value={f.responsible_person} onChange={(e) => set("responsible_person", e.target.value)} placeholder="Full name" />
              </Fld>
              <Fld label="Responsible Email">
                <Input type="email" value={f.responsible_email} onChange={(e) => set("responsible_email", e.target.value)} placeholder="name@handsnigeria.org" />
              </Fld>
              <Fld label="Priority">
                <Select value={f.priority} onValueChange={(v) => set("priority", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </Fld>
              <Fld label="Implementation Status">
                <Select value={f.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </Fld>
            </div>

            <SectionTitle>Timeline</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Fld label="Start Date">
                <Input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} />
              </Fld>
              <Fld label="Due Date" required>
                <Input type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} />
              </Fld>
              <Fld label="Progress Notes" cls="sm:col-span-2">
                <Textarea rows={2} value={f.progress_notes} onChange={(e) => set("progress_notes", e.target.value)} placeholder="Optional update on progress so far…" />
              </Fld>
            </div>

            {reasonRequired && (
              <div className="rounded-lg bg-[#FCE9E9] border border-[#E25555]/30 p-3">
                <Label className="text-xs font-semibold text-[#B23636] flex items-center gap-1.5">
                  <MessageSquareWarning className="h-4 w-4" /> Reason for non-implementation by due date <span className="text-destructive">*</span>
                </Label>
                <Textarea rows={3} className="mt-2 bg-white" value={f.non_implementation_reason}
                  onChange={(e) => set("non_implementation_reason", e.target.value)}
                  placeholder="This action is past its due date and not yet implemented. Please explain why and the proposed way forward…" />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} style={{ background: ACCENT }} className="text-white hover:opacity-90">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {editId ? "Save Changes" : "Log Action Point"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tint, fg }: { icon: any; label: string; value: number; tint: string; fg: string }) {
  return (
    <Card className="p-3 border border-border/60">
      <div className="flex items-center gap-2.5">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tint}`}><Icon className={`h-4.5 w-4.5 ${fg}`} /></div>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-none">{value}</p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60 pb-1.5">{children}</h3>;
}

function Fld({ label, required, children, cls }: { label: string; required?: boolean; children: React.ReactNode; cls?: string }) {
  return (
    <div className={cls}>
      <Label className="text-xs font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
