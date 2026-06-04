import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Plus, CalendarRange, AlertTriangle, CalendarClock, CheckCircle2,
  Search, Loader2, Pencil, Trash2, Target, MessageSquareWarning, ListChecks,
  Building2, FolderKanban, ChevronRight, Layers, Users, GanttChartSquare,
  Table2, LayoutList,
} from "lucide-react";
import WorkplanGrid from "./WorkplanGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Workplan, WorkplanActivity, ActivityPriority, ActivityStatus, PROGRAMME_AREAS,
  PRIORITIES, STATUSES, STAGE_META, PRIORITY_META, STATUS_META, QUARTERS,
  timelineStage, programmeLabel, dueDescription, needsReason, planProgress,
} from "@/lib/workplan";

const ACCENT = "#0F7E4F";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

const EMPTY_PLAN = (): Record<string, any> => ({
  working_title: "",
  project_no: "",
  developed_by: "Health And Development Support Programme (HANDS)",
  programme_area: "eye_health",
  donor_partner: "",
  start_year: new Date().getFullYear(),
  end_year: new Date().getFullYear(),
  notes: "",
});

const EMPTY_ACT = (): Record<string, any> => ({
  result: "Result 1",
  activity: "",
  responsible_person: "",
  responsible_email: "",
  target: "",
  support_needed: false,
  priority: "medium" as ActivityPriority,
  start_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  quarters: [] as string[],
  status: "not_started" as ActivityStatus,
  progress: 0,
  comment: "",
  non_implementation_reason: "",
});

export default function WorkplanView({ projectId, onClose }: Props) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Workplan[]>([]);
  const [activities, setActivities] = useState<WorkplanActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlan, setActivePlan] = useState<Workplan | null>(null);

  // plan dialog
  const [planOpen, setPlanOpen] = useState(false);
  const [planEditId, setPlanEditId] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [pf, setPf] = useState<Record<string, any>>(EMPTY_PLAN());
  const setP = (k: string, v: any) => setPf((p) => ({ ...p, [k]: v }));

  // activity dialog
  const [actOpen, setActOpen] = useState(false);
  const [actEditId, setActEditId] = useState<string | null>(null);
  const [savingAct, setSavingAct] = useState(false);
  const [af, setAf] = useState<Record<string, any>>(EMPTY_ACT());
  const setA = (k: string, v: any) => setAf((p) => ({ ...p, [k]: v }));

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "cards">("grid");

  const loadPlans = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("workplans" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Could not load work plans", description: error.message, variant: "destructive" });
    else setPlans((data as any) || []);
    setLoading(false);
  }, []);

  const loadActivities = useCallback(async (planId: string) => {
    const { data, error } = await supabase
      .from("workplan_activities" as any)
      .select("*")
      .eq("workplan_id", planId)
      .order("sort_order", { ascending: true })
      .order("due_date", { ascending: true });
    if (error) toast({ title: "Could not load activities", description: error.message, variant: "destructive" });
    else setActivities((data as any) || []);
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => { if (activePlan) loadActivities(activePlan.id); }, [activePlan, loadActivities]);

  /* ---------------- Plan CRUD ---------------- */
  const openNewPlan = () => { setPlanEditId(null); setPf(EMPTY_PLAN()); setPlanOpen(true); };
  const openEditPlan = (p: Workplan) => {
    setPlanEditId(p.id);
    setPf({
      working_title: p.working_title, project_no: p.project_no ?? "", developed_by: p.developed_by ?? "",
      programme_area: p.programme_area, donor_partner: p.donor_partner ?? "",
      start_year: p.start_year, end_year: p.end_year, notes: p.notes ?? "",
    });
    setPlanOpen(true);
  };

  const savePlan = async () => {
    if (!pf.working_title.trim()) { toast({ title: "Working title is required", variant: "destructive" }); return; }
    if (Number(pf.end_year) < Number(pf.start_year)) { toast({ title: "End year must be after start year", variant: "destructive" }); return; }
    setSavingPlan(true);
    const payload = {
      working_title: pf.working_title.trim(), project_no: pf.project_no || null,
      developed_by: pf.developed_by || null, programme_area: pf.programme_area,
      donor_partner: pf.donor_partner || null, start_year: Number(pf.start_year),
      end_year: Number(pf.end_year), notes: pf.notes || null,
      project_id: projectId ?? null, created_by: user!.id,
    };
    let error;
    if (planEditId) ({ error } = await supabase.from("workplans" as any).update(payload).eq("id", planEditId));
    else ({ error } = await supabase.from("workplans" as any).insert(payload));
    setSavingPlan(false);
    if (error) { toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
    toast({ title: planEditId ? "Work plan updated" : "Work plan created" });
    setPlanOpen(false);
    loadPlans();
  };

  const deletePlan = async (p: Workplan) => {
    if (!confirm(`Delete "${p.working_title}" and all its activities?`)) return;
    const { error } = await supabase.from("workplans" as any).delete().eq("id", p.id);
    if (error) { toast({ title: "Could not delete", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Work plan deleted" });
    if (activePlan?.id === p.id) setActivePlan(null);
    loadPlans();
  };

  /* ---------------- Activity CRUD ---------------- */
  const openNewAct = () => { setActEditId(null); setAf(EMPTY_ACT()); setActOpen(true); };
  const openEditAct = (a: WorkplanActivity) => {
    setActEditId(a.id);
    setAf({
      result: a.result, activity: a.activity, responsible_person: a.responsible_person ?? "",
      responsible_email: a.responsible_email ?? "", target: a.target ?? "", support_needed: a.support_needed,
      priority: a.priority, start_date: a.start_date ?? "", due_date: a.due_date,
      quarters: a.quarters ?? [], status: a.status, progress: a.progress,
      comment: a.comment ?? "", non_implementation_reason: a.non_implementation_reason ?? "",
    });
    setActOpen(true);
  };

  const toggleQuarter = (q: string) => {
    setAf((p) => {
      const has = (p.quarters as string[]).includes(q);
      return { ...p, quarters: has ? p.quarters.filter((x: string) => x !== q) : [...p.quarters, q] };
    });
  };

  const saveAct = async () => {
    if (!activePlan) return;
    if (!af.activity.trim()) { toast({ title: "Activity description is required", variant: "destructive" }); return; }
    if (!af.due_date) { toast({ title: "Due date is required", variant: "destructive" }); return; }
    const stage = timelineStage({ status: af.status, due_date: af.due_date });
    if (stage === "overdue" && af.status !== "completed" && !af.non_implementation_reason.trim()) {
      toast({ title: "Reason required", description: "This activity is past its due date — please document why it was not implemented on time.", variant: "destructive" });
      return;
    }
    setSavingAct(true);
    const payload: any = {
      workplan_id: activePlan.id, result: af.result.trim() || "Result 1", activity: af.activity.trim(),
      responsible_person: af.responsible_person || null, responsible_email: af.responsible_email || null,
      target: af.target || null, support_needed: !!af.support_needed, priority: af.priority,
      start_date: af.start_date || null, due_date: af.due_date, quarters: af.quarters,
      status: af.status, progress: af.status === "completed" ? 100 : Number(af.progress) || 0,
      completed_at: af.status === "completed" ? new Date().toISOString() : null,
      comment: af.comment || null,
      non_implementation_reason: af.non_implementation_reason || null,
      reason_provided_at: af.non_implementation_reason ? new Date().toISOString() : null,
      created_by: user!.id,
    };
    let error;
    if (actEditId) ({ error } = await supabase.from("workplan_activities" as any).update(payload).eq("id", actEditId));
    else ({ error } = await supabase.from("workplan_activities" as any).insert({ ...payload, sort_order: activities.length }));
    setSavingAct(false);
    if (error) { toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
    toast({ title: actEditId ? "Activity updated" : "Activity added" });
    setActOpen(false);
    loadActivities(activePlan.id);
  };

  const deleteAct = async (a: WorkplanActivity) => {
    if (!confirm("Delete this activity?")) return;
    const { error } = await supabase.from("workplan_activities" as any).delete().eq("id", a.id);
    if (error) { toast({ title: "Could not delete", description: error.message, variant: "destructive" }); return; }
    if (activePlan) loadActivities(activePlan.id);
  };

  /* ---------------- Detail view derived ---------------- */
  const filteredActs = useMemo(() => {
    return activities.filter((a) => {
      if (stageFilter !== "all" && timelineStage(a) !== stageFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (a.activity + " " + (a.responsible_person ?? "") + " " + a.result).toLowerCase().includes(q);
      }
      return true;
    });
  }, [activities, stageFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkplanActivity[]>();
    filteredActs.forEach((a) => {
      const k = a.result || "Result 1";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    });
    return Array.from(map.entries());
  }, [filteredActs]);

  const stats = useMemo(() => {
    const s = { total: activities.length, overdue: 0, dueSoon: 0, completed: 0, needReason: 0 };
    activities.forEach((a) => {
      const st = timelineStage(a);
      if (st === "overdue") s.overdue++;
      if (st === "due_soon" || st === "due_today") s.dueSoon++;
      if (st === "completed") s.completed++;
      if (needsReason(a) && a.status !== "completed" && !a.non_implementation_reason) s.needReason++;
    });
    return s;
  }, [activities]);

  /* ===================== LIST VIEW ===================== */
  if (!activePlan) {
    return (
      <div className="min-h-full bg-[#F4F6F8]">
        <div className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#DCF3E8" }}>
              <GanttChartSquare className="h-5 w-5" style={{ color: ACCENT }} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold sm:text-lg">Work Plan Tracker</h1>
              <p className="truncate text-xs text-muted-foreground">Plan activity schedules and track implementation against timelines</p>
            </div>
            <Button onClick={openNewPlan} style={{ background: ACCENT }} className="shrink-0 text-white hover:opacity-90">
              <Plus className="mr-1.5 h-4 w-4" /> New Plan
            </Button>
          </div>
        </div>

        <div className="mx-auto max-w-5xl p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading work plans…
            </div>
          ) : plans.length === 0 ? (
            <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "#DCF3E8" }}>
                <GanttChartSquare className="h-7 w-7" style={{ color: ACCENT }} />
              </div>
              <h3 className="text-lg font-semibold">Create your first work plan</h3>
              <p className="max-w-md text-sm text-muted-foreground">
                Build a professional activity schedule (GANTT) for your programme — NTDs, Inclusive Eye Health,
                Disability Inclusive Development and more — and track every activity to completion.
              </p>
              <Button onClick={openNewPlan} style={{ background: ACCENT }} className="mt-2 text-white hover:opacity-90">
                <Plus className="mr-1.5 h-4 w-4" /> New Work Plan
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {plans.map((p) => (
                <Card key={p.id} className="group overflow-hidden transition-shadow hover:shadow-card">
                  <button onClick={() => setActivePlan(p)} className="block w-full p-5 text-left">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "#DCF3E8" }}>
                        <FolderKanban className="h-5 w-5" style={{ color: ACCENT }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">{p.working_title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">{programmeLabel(p.programme_area)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {p.project_no && <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{p.project_no}</span>}
                      <span className="inline-flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" />{p.start_year}–{p.end_year}</span>
                      {p.donor_partner && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{p.donor_partner}</span>}
                    </div>
                  </button>
                  <div className="flex items-center justify-end gap-1 border-t bg-muted/20 px-3 py-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditPlan(p)} className="text-muted-foreground">
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deletePlan(p)} className="text-destructive hover:text-destructive">
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <PlanDialog
          open={planOpen} onOpenChange={setPlanOpen} pf={pf} setP={setP}
          saving={savingPlan} onSave={savePlan} isEdit={!!planEditId}
        />
      </div>
    );
  }

  /* ===================== DETAIL VIEW ===================== */
  const overall = planProgress(activities);
  return (
    <div className="min-h-full bg-[#F4F6F8]">
      <div className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setActivePlan(null)} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold sm:text-lg">{activePlan.working_title}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {programmeLabel(activePlan.programme_area)} · {activePlan.start_year}–{activePlan.end_year}
              {activePlan.project_no ? ` · ${activePlan.project_no}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center rounded-lg border bg-muted/40 p-0.5 sm:flex">
              <button
                onClick={() => setViewMode("grid")}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "grid" ? "bg-white shadow-sm" : "text-muted-foreground"}`}
                style={viewMode === "grid" ? { color: ACCENT } : undefined}
              >
                <Table2 className="h-3.5 w-3.5" /> Spreadsheet
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "cards" ? "bg-white shadow-sm" : "text-muted-foreground"}`}
                style={viewMode === "cards" ? { color: ACCENT } : undefined}
              >
                <LayoutList className="h-3.5 w-3.5" /> Cards
              </button>
            </div>
            {viewMode === "cards" && (
              <Button onClick={openNewAct} style={{ background: ACCENT }} className="text-white hover:opacity-90">
                <Plus className="mr-1.5 h-4 w-4" /> Activity
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiCard icon={ListChecks} label="Activities" value={stats.total} tint="#E3ECFB" fg="#1656BA" />
          <KpiCard icon={CalendarClock} label="Due Soon" value={stats.dueSoon} tint="#FFF3D6" fg="#9A6B00" />
          <KpiCard icon={AlertTriangle} label="Overdue" value={stats.overdue} tint="#FCE9E9" fg="#B23636" />
          <KpiCard icon={CheckCircle2} label="Completed" value={stats.completed} tint="#E2F5EC" fg="#1F7A3A" />
          <KpiCard icon={MessageSquareWarning} label="Need Reason" value={stats.needReason} tint="#FCE9DA" fg="#B8651A" />
        </div>

        {/* Overall progress */}
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Overall implementation</span>
            <span className="font-semibold" style={{ color: ACCENT }}>{overall}%</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${overall}%`, background: ACCENT }} />
          </div>
        </Card>

        {/* Filters */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activities, owners, results…" className="pl-9" />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="due_today">Due today</SelectItem>
              <SelectItem value="due_soon">Due soon</SelectItem>
              <SelectItem value="on_track">On track</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="deferred">Deferred</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Grouped activities */}
        {activities.length === 0 ? (
          <Card className="mt-4 flex flex-col items-center gap-3 border-dashed py-16 text-center">
            <Layers className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No activities yet. Add your first activity to begin tracking.</p>
            <Button onClick={openNewAct} style={{ background: ACCENT }} className="text-white hover:opacity-90">
              <Plus className="mr-1.5 h-4 w-4" /> Add Activity
            </Button>
          </Card>
        ) : (
          <div className="mt-4 space-y-5">
            {grouped.map(([result, acts]) => (
              <div key={result}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold" style={{ background: "#DCF3E8", color: ACCENT }}>
                    <Target className="h-3.5 w-3.5" /> {result}
                  </span>
                  <span className="text-xs text-muted-foreground">{acts.length} activit{acts.length === 1 ? "y" : "ies"}</span>
                </div>
                <div className="space-y-2.5">
                  {acts.map((a) => <ActivityRow key={a.id} a={a} onEdit={() => openEditAct(a)} onDelete={() => deleteAct(a)} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ActivityDialog
        open={actOpen} onOpenChange={setActOpen} af={af} setA={setA} toggleQuarter={toggleQuarter}
        saving={savingAct} onSave={saveAct} isEdit={!!actEditId}
      />
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function KpiCard({ icon: Icon, label, value, tint, fg }: { icon: any; label: string; value: number; tint: string; fg: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: tint }}>
          <Icon className="h-4 w-4" style={{ color: fg }} />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-bold leading-none">{value}</div>
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
        </div>
      </div>
    </Card>
  );
}

function ActivityRow({ a, onEdit, onDelete }: { a: WorkplanActivity; onEdit: () => void; onDelete: () => void }) {
  const stage = timelineStage(a);
  const sm = STAGE_META[stage];
  const pm = PRIORITY_META[a.priority];
  const progress = a.status === "completed" ? 100 : a.progress || 0;
  const reasonMissing = needsReason(a) && a.status !== "completed" && !a.non_implementation_reason;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${sm.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sm.chip}`}>{sm.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pm.chip}`}>{pm.label}</span>
            {a.support_needed && <span className="rounded-full bg-[#EDE7FE] px-2 py-0.5 text-[11px] font-medium text-[#5B3FD0]">Support needed</span>}
            {a.quarters?.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {a.quarters.join(" · ")}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm font-medium leading-snug">{a.activity}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {a.responsible_person && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{a.responsible_person}</span>}
            {a.target && <span className="inline-flex items-center gap-1"><Target className="h-3.5 w-3.5" />Target: {a.target}</span>}
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Due {new Date(a.due_date + "T00:00:00").toLocaleDateString()} · {dueDescription(a)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: stage === "overdue" ? "#E25555" : ACCENT }} />
            </div>
            <span className="w-9 text-right text-[11px] font-medium text-muted-foreground">{progress}%</span>
          </div>
          {a.non_implementation_reason && (
            <div className="mt-2 rounded-md bg-[#FCE9DA]/60 p-2 text-xs text-[#8a4f15]">
              <span className="font-semibold">Reason not implemented on time: </span>{a.non_implementation_reason}
            </div>
          )}
          {reasonMissing && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#FCE9E9] px-2 py-1 text-xs font-medium text-[#B23636]">
              <MessageSquareWarning className="h-3.5 w-3.5" /> Overdue — a reason is required
            </div>
          )}
          {a.comment && <p className="mt-2 text-xs italic text-muted-foreground">“{a.comment}”</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8 text-muted-foreground"><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </Card>
  );
}

function PlanDialog({ open, onOpenChange, pf, setP, saving, onSave, isEdit }: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Work Plan" : "New Work Plan"}</DialogTitle>
          <DialogDescription>Define the overall activity schedule for your programme.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <Field label="Working title *">
            <Input value={pf.working_title} onChange={(e) => setP("working_title", e.target.value)} placeholder="e.g. Inclusive Eye Health Project" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project number">
              <Input value={pf.project_no} onChange={(e) => setP("project_no", e.target.value)} placeholder="e.g. P 3930" />
            </Field>
            <Field label="Programme area">
              <Select value={pf.programme_area} onValueChange={(v) => setP("programme_area", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROGRAMME_AREAS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Developed by">
            <Input value={pf.developed_by} onChange={(e) => setP("developed_by", e.target.value)} />
          </Field>
          <Field label="Donor / Funding partner">
            <Input value={pf.donor_partner} onChange={(e) => setP("donor_partner", e.target.value)} placeholder="e.g. CBM" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start year">
              <Input type="number" value={pf.start_year} onChange={(e) => setP("start_year", e.target.value)} />
            </Field>
            <Field label="End year">
              <Input type="number" value={pf.end_year} onChange={(e) => setP("end_year", e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={pf.notes} onChange={(e) => setP("notes", e.target.value)} placeholder="Optional context, goal or scope" rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving} style={{ background: ACCENT }} className="text-white hover:opacity-90">
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{isEdit ? "Save changes" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivityDialog({ open, onOpenChange, af, setA, toggleQuarter, saving, onSave, isEdit }: any) {
  const overdue = af.due_date && timelineStage({ status: af.status, due_date: af.due_date }) === "overdue" && af.status !== "completed";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Activity" : "New Activity"}</DialogTitle>
          <DialogDescription>Schedule an activity and track its implementation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <Field label="Result / Objective">
            <Input value={af.result} onChange={(e) => setA("result", e.target.value)} placeholder="e.g. Result 1" />
          </Field>
          <Field label="Activity *">
            <Textarea value={af.activity} onChange={(e) => setA("activity", e.target.value)} rows={2} placeholder="Describe the activity to be implemented" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Responsible person">
              <Input value={af.responsible_person} onChange={(e) => setA("responsible_person", e.target.value)} placeholder="e.g. HANDS/State team" />
            </Field>
            <Field label="Target">
              <Input value={af.target} onChange={(e) => setA("target", e.target.value)} placeholder="e.g. 4" />
            </Field>
          </div>
          <Field label="Responsible email (for reminders)">
            <Input type="email" value={af.responsible_email} onChange={(e) => setA("responsible_email", e.target.value)} placeholder="name@example.org" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <Input type="date" value={af.start_date} onChange={(e) => setA("start_date", e.target.value)} />
            </Field>
            <Field label="Due date *">
              <Input type="date" value={af.due_date} onChange={(e) => setA("due_date", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <Select value={af.priority} onValueChange={(v) => setA("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={af.status} onValueChange={(v) => setA("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Scheduled quarter(s)">
            <div className="flex flex-wrap gap-2">
              {QUARTERS.map((q) => {
                const active = (af.quarters as string[]).includes(q);
                return (
                  <button
                    key={q} type="button" onClick={() => toggleQuarter(q)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${active ? "border-transparent text-white" : "border-input bg-background text-muted-foreground hover:bg-accent"}`}
                    style={active ? { background: ACCENT } : undefined}
                  >{q}</button>
                );
              })}
            </div>
          </Field>
          {af.status !== "completed" && (
            <Field label={`Progress: ${af.progress}%`}>
              <input type="range" min={0} max={100} step={5} value={af.progress} onChange={(e) => setA("progress", Number(e.target.value))} className="w-full accent-[#0F7E4F]" />
            </Field>
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">Support needed from partner</Label>
              <p className="text-xs text-muted-foreground">Requires external/donor support (Y/N)</p>
            </div>
            <Switch checked={af.support_needed} onCheckedChange={(v) => setA("support_needed", v)} />
          </div>
          <Field label="Comment">
            <Textarea value={af.comment} onChange={(e) => setA("comment", e.target.value)} rows={2} placeholder="Optional progress note or comment" />
          </Field>
          {overdue && (
            <Field label="Reason for non-implementation by due date *">
              <Textarea
                value={af.non_implementation_reason} onChange={(e) => setA("non_implementation_reason", e.target.value)}
                rows={2} placeholder="This activity is past its due date — explain why it was not implemented on time."
                className="border-[#E25555]/50 focus-visible:ring-[#E25555]/40"
              />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving} style={{ background: ACCENT }} className="text-white hover:opacity-90">
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{isEdit ? "Save changes" : "Add activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
