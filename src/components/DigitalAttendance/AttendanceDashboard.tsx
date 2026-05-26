import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserCheck, UserX, TrendingUp, CalendarRange, UserPlus, ClipboardCheck, BarChart3, Plus } from "lucide-react";
import { Participant, Session, AttendanceRecord } from "./types";
import { format } from "date-fns";

interface Props {
  participants: Participant[];
  sessions: Session[];
  records: AttendanceRecord[];
  onTab: (t: "register" | "sessions" | "mark" | "reports") => void;
  onCreateSession: () => void;
}

export default function AttendanceDashboard({ participants, sessions, records, onTab, onCreateSession }: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const todaySessions = sessions.filter(s => s.session_date === today);
  const todaySessionIds = new Set(todaySessions.map(s => s.id));
  const todayRecords = records.filter(r => todaySessionIds.has(r.session_id));

  const stats = useMemo(() => {
    const present = todayRecords.filter(r => r.status === "present").length;
    const absent = todayRecords.filter(r => r.status === "absent").length;
    const late = todayRecords.filter(r => r.status === "late").length;
    const excused = todayRecords.filter(r => r.status === "excused").length;
    const total = todayRecords.length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : 0;
    return { present, absent, late, excused, total, rate };
  }, [todayRecords]);

  const breakdown = [
    { label: "Present", value: stats.present, color: "bg-emerald-500", textColor: "text-emerald-600" },
    { label: "Absent", value: stats.absent, color: "bg-rose-500", textColor: "text-rose-600" },
    { label: "Late", value: stats.late, color: "bg-amber-500", textColor: "text-amber-600" },
    { label: "Excused", value: stats.excused, color: "bg-sky-500", textColor: "text-sky-600" },
  ];

  const recent = [...sessions].sort((a, b) => b.session_date.localeCompare(a.session_date)).slice(0, 6);

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <KPI icon={Users} label="Total Participants" value={participants.length} sub="Registered" tint="indigo" />
        <KPI icon={UserCheck} label="Present Today" value={stats.present} sub="Participants" tint="emerald" />
        <KPI icon={UserX} label="Absent Today" value={stats.absent} sub="Participants" tint="rose" />
        <KPI icon={TrendingUp} label="Attendance Rate" value={`${stats.rate}%`} sub="Today" tint="amber" />
        <KPI icon={CalendarRange} label="Total Activities" value={sessions.length} sub="This Month" tint="violet" />
      </div>

      {/* Quick actions */}
      <Card className="border border-border/60 shadow-sm">
        <div className="p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <QuickAction icon={UserPlus} label="Register Participant" tint="from-sky-500 to-blue-600" onClick={() => onTab("register")} />
            <QuickAction icon={Plus} label="Create Activity" tint="from-emerald-500 to-teal-600" onClick={onCreateSession} />
            <QuickAction icon={ClipboardCheck} label="Mark Attendance" tint="from-violet-500 to-purple-600" onClick={() => onTab("mark")} />
            <QuickAction icon={BarChart3} label="View Reports" tint="from-orange-500 to-amber-600" onClick={() => onTab("reports")} />
          </div>
        </div>
      </Card>

      {/* Two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border border-border/60 shadow-sm">
          <div className="px-4 sm:px-5 py-3 border-b border-border/60 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent Attendance Activities</h3>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onTab("sessions")}>View all</Button>
          </div>
          <div className="divide-y divide-border/60">
            {recent.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No activities yet — create your first one.</div>

            ) : recent.map(s => (
              <div key={s.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">{s.activity_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(s.session_date), "dd MMM yyyy")} · {s.location || "—"}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  s.status === "open" ? "bg-emerald-100 text-emerald-700"
                  : s.status === "submitted" ? "bg-sky-100 text-sky-700"
                  : s.status === "closed" ? "bg-slate-100 text-slate-600"
                  : "bg-amber-100 text-amber-700"
                }`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border border-border/60 shadow-sm">
          <div className="px-4 sm:px-5 py-3 border-b border-border/60">
            <h3 className="text-sm font-semibold">Attendance Summary (Today)</h3>
          </div>
          <div className="p-4 sm:p-5 flex items-center gap-6">
            {/* Donut */}
            <DonutChart total={stats.total} segments={breakdown} />
            <div className="flex-1 space-y-2">
              {breakdown.map(b => {
                const pct = stats.total > 0 ? Math.round((b.value / stats.total) * 1000) / 10 : 0;
                return (
                  <div key={b.label} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${b.color}`} />
                      <span className="text-foreground">{b.label}</span>
                    </div>
                    <span className={`font-medium ${b.textColor}`}>{b.value} ({pct}%)</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between text-sm pt-2 mt-2 border-t border-border/60">
                <span className="text-muted-foreground">Not Marked</span>
                <span className="font-medium text-slate-600">{Math.max(participants.length - stats.total, 0)}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, sub, tint }: { icon: any; label: string; value: any; sub: string; tint: string }) {
  const tints: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <Card className="p-3 sm:p-4 border border-border/60 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${tints[tint]}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1 leading-none">{value}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{sub}</p>
        </div>
      </div>
    </Card>
  );
}

function QuickAction({ icon: Icon, label, tint, onClick }: { icon: any; label: string; tint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${tint} p-4 text-left text-white shadow-md hover:shadow-lg active:scale-[0.98] transition-all`}
    >
      <Icon className="h-5 w-5 mb-2 opacity-90" />
      <div className="text-sm font-semibold leading-tight">{label}</div>
    </button>
  );
}

function DonutChart({ total, segments }: { total: number; segments: { label: string; value: number; color: string }[] }) {
  const size = 120;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const colorHex: Record<string, string> = {
    "bg-emerald-500": "#10b981",
    "bg-rose-500": "#f43f5e",
    "bg-amber-500": "#f59e0b",
    "bg-sky-500": "#0ea5e9",
  };
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
        {total > 0 && segments.map(s => {
          if (s.value === 0) return null;
          const len = (s.value / total) * c;
          const seg = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colorHex[s.color] || "#94a3b8"}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-foreground leading-none">{total}</div>
        <div className="text-[10px] text-muted-foreground mt-1">Total</div>
      </div>
    </div>
  );
}
