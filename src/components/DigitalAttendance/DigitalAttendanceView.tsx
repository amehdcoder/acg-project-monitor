import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LayoutDashboard, UserPlus, CalendarRange, ClipboardCheck, BarChart3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Participant, Session, AttendanceRecord } from "./types";
import AttendanceDashboard from "./AttendanceDashboard";
import ParticipantRegister from "./ParticipantRegister";
import ParticipantsView from "./ParticipantsView";
import SessionList from "./SessionList";
import MarkAttendance from "./MarkAttendance";
import AttendanceReports from "./AttendanceReports";
import { toast } from "@/hooks/use-toast";

type Tab = "dashboard" | "participants" | "register" | "sessions" | "mark" | "reports";

interface Props {
  projectId?: string | null;
  onClose: () => void;
}

export default function DigitalAttendanceView({ projectId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [openCreateSession, setOpenCreateSession] = useState(false);

  const load = useCallback(async () => {
    const [p, s, r] = await Promise.all([
      supabase.from("attendance_participants" as any).select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("attendance_sessions" as any).select("*").order("session_date", { ascending: false }).limit(500),
      supabase.from("attendance_records" as any).select("*").limit(5000),
    ]);
    if (p.error) toast({ title: "Failed loading participants", description: p.error.message, variant: "destructive" });
    setParticipants((p.data as unknown as Participant[]) || []);
    setSessions((s.data as unknown as Session[]) || []);
    setRecords((r.data as unknown as AttendanceRecord[]) || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const reloadRecords = useCallback(async () => {
    const { data } = await supabase.from("attendance_records" as any).select("*").limit(5000);
    setRecords((data as unknown as AttendanceRecord[]) || []);
  }, []);

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "participants", label: "Participants", icon: Users },
    { id: "register", label: "Register", icon: UserPlus },
    { id: "sessions", label: "Activities", icon: CalendarRange },
    { id: "mark", label: "Mark Attendance", icon: ClipboardCheck },
    { id: "reports", label: "Reports", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-border/60 sticky top-0 z-30">
        <div className="px-3 sm:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold text-foreground truncate">Digital Attendance</h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block">Staff attendance & meeting/activity participant capture</p>
          </div>
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full hidden sm:inline">Standard Form</span>
        </div>
        {/* Tabs */}
        <div className="px-2 sm:px-6 border-t border-border/60 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {TABS.map(t => {
              const active = tab === t.id || (tab === "mark" && t.id === "mark");
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); if (t.id !== "mark") setActiveSession(null); }}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
                    active ? "border-blue-600 text-blue-700 font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-6 max-w-[1400px] mx-auto">
        {tab === "dashboard" && (
          <AttendanceDashboard
            participants={participants}
            sessions={sessions}
            records={records}
            onTab={(t) => {
              if (t === "register") setTab("register");
              else if (t === "sessions") setTab("sessions");
              else if (t === "mark") setTab("sessions");
              else setTab("reports");
            }}
            onCreateSession={() => { setTab("sessions"); setOpenCreateSession(true); }}
          />
        )}
        {tab === "participants" && (
          <ParticipantsView participants={participants} onAdd={() => setTab("register")} />
        )}
        {tab === "register" && (
          <ParticipantRegister
            projectId={projectId}
            onSaved={(p) => setParticipants(prev => [p, ...prev])}
          />
        )}
        {tab === "sessions" && !activeSession && (
          <SessionList
            sessions={sessions}
            participantCount={participants.filter(p => p.is_active).length}
            projectId={projectId}
            onSessionCreated={(s) => setSessions(prev => [s, ...prev])}
            onOpenSession={(s) => { setActiveSession(s); setTab("mark"); }}
            openDialogControlled={{ open: openCreateSession, onClose: () => setOpenCreateSession(false) }}
          />
        )}
        {tab === "mark" && activeSession && (
          <MarkAttendance
            session={activeSession}
            participants={participants}
            records={records}
            onBack={() => { setActiveSession(null); setTab("sessions"); }}
            onRecordsChange={reloadRecords}
            onSessionStatusChange={(s) => setSessions(prev => prev.map(x => x.id === s.id ? s : x))}
          />
        )}
        {tab === "mark" && !activeSession && (
          <Card className="p-10 text-center border border-border/60 shadow-sm">
            <ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">Pick an activity to mark attendance</p>
            <Button className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={() => setTab("sessions")}>Go to Activities</Button>
          </Card>
        )}
        {tab === "reports" && (
          <AttendanceReports participants={participants} sessions={sessions} records={records} />
        )}
      </div>
    </div>
  );
}
