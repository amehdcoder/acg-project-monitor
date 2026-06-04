import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Workplan, WorkplanActivity, ActivityPriority, ActivityStatus,
  PRIORITIES, STATUSES, QUARTERS, STAGE_META, timelineStage, needsReason,
} from "@/lib/workplan";

const ACCENT = "#0F7E4F";

interface Props {
  plan: Workplan;
  activities: WorkplanActivity[];
  userId: string;
  onChanged: () => void;
}

type Row = Partial<WorkplanActivity> & { _tmp?: string };

const blankRow = (sort: number): Row => ({
  _tmp: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  result: "Result 1",
  activity: "",
  responsible_person: "",
  target: "",
  start_date: null,
  due_date: "",
  priority: "medium",
  status: "not_started",
  quarters: [],
  progress: 0,
  support_needed: false,
  comment: "",
  non_implementation_reason: "",
  sort_order: sort,
});

/** Column definitions for the spreadsheet. */
const COLS = [
  { key: "result", label: "Result / Objective", w: "min-w-[150px]" },
  { key: "activity", label: "Activity", w: "min-w-[240px]" },
  { key: "responsible_person", label: "Responsible", w: "min-w-[140px]" },
  { key: "target", label: "Target", w: "min-w-[90px]" },
  { key: "start_date", label: "Start", w: "min-w-[140px]" },
  { key: "due_date", label: "Due *", w: "min-w-[140px]" },
  { key: "priority", label: "Priority", w: "min-w-[120px]" },
  { key: "status", label: "Status", w: "min-w-[140px]" },
  { key: "quarters", label: "Quarters", w: "min-w-[150px]" },
  { key: "progress", label: "Progress", w: "min-w-[120px]" },
  { key: "non_implementation_reason", label: "Reason (if overdue)", w: "min-w-[200px]" },
  { key: "comment", label: "Comment", w: "min-w-[180px]" },
] as const;

export default function WorkplanGrid({ plan, activities, userId, onChanged }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRows([...activities, blankRow(activities.length)]);
  }, [activities]);

  const rowKey = (r: Row) => r.id ?? r._tmp ?? "";

  const flashSaved = useCallback((key: string) => {
    setSavedId(key);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedId(null), 1500);
  }, []);

  const updateLocal = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (rowKey(r) === key ? { ...r, ...patch } : r)));
  };

  /** Persist a row (insert or update). Returns true if saved. */
  const persist = useCallback(async (row: Row): Promise<boolean> => {
    // require the essentials before saving anything
    if (!row.activity?.trim() || !row.due_date) return false;

    const stage = timelineStage({ status: row.status as ActivityStatus, due_date: row.due_date });
    if (stage === "overdue" && row.status !== "completed" && !row.non_implementation_reason?.trim()) {
      // don't block typing, but warn once on blur of the due/status cell
      return false;
    }

    const key = rowKey(row);
    setSavingId(key);
    const payload: any = {
      workplan_id: plan.id,
      result: row.result?.trim() || "Result 1",
      activity: row.activity.trim(),
      responsible_person: row.responsible_person || null,
      responsible_email: row.responsible_email || null,
      target: row.target || null,
      support_needed: !!row.support_needed,
      priority: row.priority || "medium",
      start_date: row.start_date || null,
      due_date: row.due_date,
      quarters: row.quarters || [],
      status: row.status || "not_started",
      progress: row.status === "completed" ? 100 : Number(row.progress) || 0,
      completed_at: row.status === "completed" ? new Date().toISOString() : null,
      comment: row.comment || null,
      non_implementation_reason: row.non_implementation_reason || null,
      reason_provided_at: row.non_implementation_reason ? new Date().toISOString() : null,
      created_by: userId,
    };

    let error;
    if (row.id) {
      ({ error } = await supabase.from("workplan_activities" as any).update(payload).eq("id", row.id));
    } else {
      payload.sort_order = row.sort_order ?? rows.length;
      ({ error } = await supabase.from("workplan_activities" as any).insert(payload));
    }
    setSavingId(null);
    if (error) {
      toast({ title: "Could not save row", description: error.message, variant: "destructive" });
      return false;
    }
    flashSaved(key);
    onChanged();
    return true;
  }, [plan.id, userId, rows.length, onChanged, flashSaved]);

  const handleBlur = async (row: Row) => {
    const isNew = !row.id;
    const ok = await persist(row);
    if (!ok && isNew && row.activity?.trim() && !row.due_date) {
      // user typed an activity but no due date yet — silent, will save when due set
    }
    if (!ok && row.due_date && row.activity?.trim()) {
      const stage = timelineStage({ status: row.status as ActivityStatus, due_date: row.due_date });
      if (stage === "overdue" && row.status !== "completed" && !row.non_implementation_reason?.trim()) {
        toast({
          title: "Reason required",
          description: "This activity is past its due date — add a reason in the Reason column to save it.",
          variant: "destructive",
        });
      }
    }
  };

  const deleteRow = async (row: Row) => {
    if (!row.id) {
      setRows((prev) => prev.filter((r) => rowKey(r) !== rowKey(row)));
      return;
    }
    if (!confirm("Delete this activity?")) return;
    const { error } = await supabase.from("workplan_activities" as any).delete().eq("id", row.id);
    if (error) { toast({ title: "Could not delete", description: error.message, variant: "destructive" }); return; }
    onChanged();
  };

  const addRow = () => setRows((prev) => [...prev, blankRow(prev.length)]);

  const cellBase = "h-full w-full bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-[#EAF6F0] focus:ring-1 focus:ring-inset focus:ring-[#0F7E4F]";

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#F1F5F3]">
              <th className="sticky left-0 z-20 w-10 border border-border bg-[#F1F5F3] px-1 py-2 text-center text-[11px] font-semibold text-muted-foreground">#</th>
              {COLS.map((c) => (
                <th key={c.key} className={cn("border border-border px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", c.w)}>
                  {c.label}
                </th>
              ))}
              <th className="w-12 border border-border px-1 py-2 text-center text-[11px] font-semibold text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const key = rowKey(row);
              const isNew = !row.id;
              const stage = row.due_date ? timelineStage({ status: row.status as ActivityStatus, due_date: row.due_date }) : null;
              const reasonNeeded = row.id ? needsReason(row as WorkplanActivity) && row.status !== "completed" && !row.non_implementation_reason : false;
              return (
                <tr key={key} className={cn("group transition-colors", isNew ? "bg-[#FAFCFB]" : "even:bg-muted/20", "hover:bg-[#F5FAF8]")}>
                  {/* row number / status dot */}
                  <td className="sticky left-0 z-10 border border-border bg-inherit px-1 text-center align-middle">
                    <div className="flex items-center justify-center gap-1">
                      {stage && <span className={cn("h-2 w-2 rounded-full", STAGE_META[stage].dot)} />}
                      <span className="text-[11px] text-muted-foreground">{isNew ? "+" : idx + 1}</span>
                    </div>
                  </td>

                  {/* result */}
                  <td className="border border-border p-0 align-top">
                    <input className={cellBase} value={row.result ?? ""} placeholder="Result 1"
                      onChange={(e) => updateLocal(key, { result: e.target.value })} onBlur={() => handleBlur(row)} />
                  </td>

                  {/* activity */}
                  <td className="border border-border p-0 align-top">
                    <textarea rows={1} className={cn(cellBase, "resize-none")} value={row.activity ?? ""} placeholder="Describe the activity…"
                      onChange={(e) => updateLocal(key, { activity: e.target.value })} onBlur={() => handleBlur(row)} />
                  </td>

                  {/* responsible */}
                  <td className="border border-border p-0 align-top">
                    <input className={cellBase} value={row.responsible_person ?? ""} placeholder="Owner / team"
                      onChange={(e) => updateLocal(key, { responsible_person: e.target.value })} onBlur={() => handleBlur(row)} />
                  </td>

                  {/* target */}
                  <td className="border border-border p-0 align-top">
                    <input className={cellBase} value={row.target ?? ""} placeholder="e.g. 4"
                      onChange={(e) => updateLocal(key, { target: e.target.value })} onBlur={() => handleBlur(row)} />
                  </td>

                  {/* start date */}
                  <td className="border border-border p-0 align-top">
                    <input type="date" className={cellBase} value={row.start_date ?? ""}
                      onChange={(e) => updateLocal(key, { start_date: e.target.value })} onBlur={() => handleBlur(row)} />
                  </td>

                  {/* due date */}
                  <td className={cn("border border-border p-0 align-top", stage === "overdue" && "bg-[#FCE9E9]/60")}>
                    <input type="date" className={cellBase} value={row.due_date ?? ""}
                      onChange={(e) => updateLocal(key, { due_date: e.target.value })} onBlur={() => handleBlur(row)} />
                  </td>

                  {/* priority */}
                  <td className="border border-border p-0 align-top">
                    <select className={cn(cellBase, "cursor-pointer")} value={row.priority ?? "medium"}
                      onChange={(e) => { updateLocal(key, { priority: e.target.value as ActivityPriority }); }}
                      onBlur={() => handleBlur(row)}>
                      {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </td>

                  {/* status */}
                  <td className="border border-border p-0 align-top">
                    <select className={cn(cellBase, "cursor-pointer")} value={row.status ?? "not_started"}
                      onChange={(e) => updateLocal(key, { status: e.target.value as ActivityStatus })}
                      onBlur={() => handleBlur(row)}>
                      {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>

                  {/* quarters */}
                  <td className="border border-border px-2 py-1.5 align-middle">
                    <div className="flex flex-wrap gap-1">
                      {QUARTERS.map((q) => {
                        const active = (row.quarters ?? []).includes(q);
                        return (
                          <button key={q} type="button"
                            onClick={() => {
                              const cur = row.quarters ?? [];
                              const next = active ? cur.filter((x) => x !== q) : [...cur, q];
                              updateLocal(key, { quarters: next });
                              // persist after toggle for existing rows
                              setTimeout(() => persist({ ...row, quarters: next }), 0);
                            }}
                            className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
                              active ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/70")}
                            style={active ? { background: ACCENT } : undefined}>
                            {q}
                          </button>
                        );
                      })}
                    </div>
                  </td>

                  {/* progress */}
                  <td className="border border-border px-2 py-1.5 align-middle">
                    {row.status === "completed" ? (
                      <span className="text-xs font-semibold" style={{ color: ACCENT }}>100%</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input type="range" min={0} max={100} step={5} value={row.progress ?? 0}
                          onChange={(e) => updateLocal(key, { progress: Number(e.target.value) })}
                          onMouseUp={() => handleBlur(row)} onTouchEnd={() => handleBlur(row)}
                          className="h-1 w-full accent-[#0F7E4F]" />
                        <span className="w-8 text-right text-[10px] font-medium text-muted-foreground">{row.progress ?? 0}%</span>
                      </div>
                    )}
                  </td>

                  {/* reason */}
                  <td className={cn("border border-border p-0 align-top", reasonNeeded && "bg-[#FCE9E9]/50")}>
                    <textarea rows={1} className={cn(cellBase, "resize-none")} value={row.non_implementation_reason ?? ""}
                      placeholder={stage === "overdue" ? "Why was it not implemented on time?" : "—"}
                      onChange={(e) => updateLocal(key, { non_implementation_reason: e.target.value })} onBlur={() => handleBlur(row)} />
                  </td>

                  {/* comment */}
                  <td className="border border-border p-0 align-top">
                    <textarea rows={1} className={cn(cellBase, "resize-none")} value={row.comment ?? ""} placeholder="Optional note"
                      onChange={(e) => updateLocal(key, { comment: e.target.value })} onBlur={() => handleBlur(row)} />
                  </td>

                  {/* actions */}
                  <td className="border border-border px-1 text-center align-middle">
                    <div className="flex items-center justify-center">
                      {savingId === key ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : savedId === key ? (
                        <Check className="h-4 w-4" style={{ color: ACCENT }} />
                      ) : (
                        <button onClick={() => deleteRow(row)} className="text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-[#F8FAF9] px-3 py-2">
        <button onClick={addRow} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: ACCENT }}>
          <Plus className="h-4 w-4" /> Add row
        </button>
        <span className="text-[11px] text-muted-foreground">Tip: changes save automatically when you leave a cell.</span>
      </div>
    </div>
  );
}
