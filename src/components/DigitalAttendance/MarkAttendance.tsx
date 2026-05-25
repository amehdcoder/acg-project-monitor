import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Clock, Info, Slash, Search, ArrowLeft, Calendar, MapPin, Filter, Save, FileCheck2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AttendanceRecord, AttendanceStatus, Participant, Session, STATUS_META } from "./types";
import { format } from "date-fns";

interface Props {
  session: Session;
  participants: Participant[];
  records: AttendanceRecord[];
  onBack: () => void;
  onRecordsChange: () => Promise<void>;
  onSessionStatusChange?: (s: Session) => void;
}

const STATUSES: { key: AttendanceStatus; icon: any; aria: string }[] = [
  { key: "present", icon: Check, aria: "Mark present" },
  { key: "absent", icon: X, aria: "Mark absent" },
  { key: "late", icon: Clock, aria: "Mark late" },
  { key: "excused", icon: Info, aria: "Mark excused" },
  { key: "not_marked", icon: Slash, aria: "Clear mark" },
];

export default function MarkAttendance({ session, participants, records, onBack, onRecordsChange, onSessionStatusChange }: Props) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const recordMap = useMemo(() => {
    const m = new Map<string, AttendanceRecord>();
    records.forEach(r => { if (r.session_id === session.id) m.set(r.participant_id, r); });
    return m;
  }, [records, session.id]);

  const roles = useMemo(() => {
    const set = new Set<string>();
    participants.forEach(p => p.role && set.add(p.role));
    return Array.from(set).sort();
  }, [participants]);

  const filtered = useMemo(() => {
    return participants.filter(p => {
      if (!p.is_active) return false;
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (q.trim()) {
        const t = q.toLowerCase();
        if (!p.full_name.toLowerCase().includes(t) && !p.participant_code.toLowerCase().includes(t)) return false;
      }
      if (statusFilter !== "all") {
        const r = recordMap.get(p.id);
        const s = r?.status || "not_marked";
        if (s !== statusFilter) return false;
      }
      return true;
    });
  }, [participants, roleFilter, statusFilter, q, recordMap]);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0, not_marked: 0 };
    participants.forEach(p => {
      const r = recordMap.get(p.id);
      const s = (r?.status || "not_marked") as AttendanceStatus;
      c[s]++;
    });
    return c;
  }, [participants, recordMap]);

  async function setStatus(p: Participant, status: AttendanceStatus) {
    setBusy(p.id);
    const existing = recordMap.get(p.id);
    if (existing) {
      const { error } = await supabase
        .from("attendance_records" as any)
        .update({ status, marked_at: new Date().toISOString(), marked_by: user?.id, method: "manual" })
        .eq("id", existing.id);
      if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase
        .from("attendance_records" as any)
        .insert({
          session_id: session.id,
          participant_id: p.id,
          status,
          marked_at: new Date().toISOString(),
          marked_by: user?.id,
          method: "manual",
        });
      if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    }
    await onRecordsChange();
    setBusy(null);
  }

  async function markAllPresent() {
    const targets = filtered.filter(p => (recordMap.get(p.id)?.status || "not_marked") !== "present");
    if (targets.length === 0) return;
    const rows = targets.map(p => {
      const existing = recordMap.get(p.id);
      return {
        id: existing?.id,
        session_id: session.id,
        participant_id: p.id,
        status: "present" as const,
        marked_at: new Date().toISOString(),
        marked_by: user?.id,
        method: "manual",
      };
    });
    const { error } = await supabase.from("attendance_records" as any).upsert(rows as any, { onConflict: "session_id,participant_id" });
    if (error) toast({ title: "Bulk failed", description: error.message, variant: "destructive" });
    else toast({ title: `Marked ${targets.length} present` });
    await onRecordsChange();
  }

  async function clearAll() {
    const ids = participants.map(p => recordMap.get(p.id)?.id).filter(Boolean) as string[];
    if (ids.length === 0) return;
    if (!confirm("Clear all attendance marks for this session?")) return;
    const { error } = await supabase.from("attendance_records" as any).delete().in("id", ids);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    await onRecordsChange();
  }

  async function submitSession() {
    setSubmitting(true);
    const { data, error } = await supabase
      .from("attendance_sessions" as any)
      .update({ status: "submitted" })
      .eq("id", session.id)
      .select()
      .single();
    setSubmitting(false);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Attendance submitted", description: `${counts.present + counts.late} marked attending of ${participants.length}` });
      if (data) onSessionStatusChange?.(data as unknown as Session);
    }
  }

  return (
    <div className="space-y-4">
      {/* Session header */}
      <Card className="border border-border/60 shadow-sm">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold truncate">{session.activity_name}</h2>
                <span className="font-mono text-[10px] font-semibold uppercase bg-muted px-1.5 py-0.5 rounded">{session.session_code}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(session.session_date), "dd MMM yyyy")}</span>
                {session.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{session.location}</span>}
                {session.facilitator && <span>· {session.facilitator}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-4 sm:px-5 pb-4">
          <CounterPill label="Total" value={participants.length} color="bg-slate-100 text-slate-700" />
          <CounterPill label="Present" value={counts.present} color="bg-emerald-100 text-emerald-700" />
          <CounterPill label="Absent" value={counts.absent} color="bg-rose-100 text-rose-700" />
          <CounterPill label="Late" value={counts.late} color="bg-amber-100 text-amber-700" />
          <CounterPill label="Excused" value={counts.excused} color="bg-sky-100 text-sky-700" />
          <CounterPill label="Not Marked" value={counts.not_marked} color="bg-muted text-foreground" />
        </div>
      </Card>

      {/* Filters */}
      <Card className="border border-border/60 shadow-sm">
        <div className="p-3 sm:p-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search participant by name or ID…" className="pl-9 h-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="excused">Excused</SelectItem>
              <SelectItem value="not_marked">Not Marked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9"><Filter className="h-3.5 w-3.5 mr-1.5" />Filter</Button>
        </div>
      </Card>

      {/* Participant list */}
      <Card className="border border-border/60 shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[40px_60px_1fr_120px_180px_160px] gap-2 px-4 py-2 border-b border-border/60 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>#</div>
          <div>PID</div>
          <div>Participant</div>
          <div>Role</div>
          <div>Organization</div>
          <div className="text-right">Status</div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No participants match your filters.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((p, i) => {
              const r = recordMap.get(p.id);
              const s = (r?.status || "not_marked") as AttendanceStatus;
              const meta = STATUS_META[s];
              return (
                <div key={p.id} className={`grid grid-cols-[1fr_auto] md:grid-cols-[40px_60px_1fr_120px_180px_auto] gap-2 px-3 sm:px-4 py-2.5 items-center hover:bg-muted/30 transition-colors ${busy === p.id ? "opacity-60" : ""}`}>
                  <div className="hidden md:block text-xs text-muted-foreground">{i + 1}</div>
                  <div className="hidden md:block font-mono text-xs text-muted-foreground">{p.participant_code}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {p.photo_url
                        ? <img src={p.photo_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                        : <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">{p.full_name.charAt(0)}</div>
                      }
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{p.full_name}</div>
                        <div className="text-[10px] text-muted-foreground md:hidden truncate">{p.participant_code} · {p.role}</div>
                      </div>
                    </div>
                  </div>
                  <div className="hidden md:block text-xs text-muted-foreground truncate">{p.role || "—"}</div>
                  <div className="hidden md:block text-xs text-muted-foreground truncate">{p.organization || "—"}</div>
                  <div className="flex items-center justify-end gap-1">
                    {STATUSES.map(({ key, icon: Icon, aria }) => {
                      const active = s === key;
                      const c = STATUS_META[key];
                      return (
                        <button
                          key={key}
                          aria-label={aria}
                          title={c.label}
                          onClick={() => setStatus(p, key)}
                          className={`h-8 w-8 rounded-md border flex items-center justify-center transition-all ${
                            active ? `${c.bg} ${c.color} border-current shadow-sm scale-105` : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 justify-end sticky bottom-2">
        <Button variant="outline" onClick={clearAll} className="text-rose-600 border-rose-200 hover:bg-rose-50">
          <X className="h-4 w-4 mr-1.5" /> Clear Attendance
        </Button>
        <Button variant="outline" onClick={markAllPresent} className="text-emerald-700 border-emerald-200 hover:bg-emerald-50">
          <Check className="h-4 w-4 mr-1.5" /> Mark All Present
        </Button>
        <Button variant="outline">
          <Save className="h-4 w-4 mr-1.5" /> Save Draft
        </Button>
        <Button onClick={submitSession} disabled={submitting} className="bg-violet-600 hover:bg-violet-700">
          <FileCheck2 className="h-4 w-4 mr-1.5" />
          Review & Submit ({participants.length})
        </Button>
      </div>
    </div>
  );
}

function CounterPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg ${color} px-3 py-2 text-center`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg sm:text-xl font-bold leading-tight">{value}</div>
    </div>
  );
}
