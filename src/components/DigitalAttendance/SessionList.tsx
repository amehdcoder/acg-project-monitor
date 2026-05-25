import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar, MapPin, Users, ClipboardCheck, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Session } from "./types";
import { format } from "date-fns";

interface Props {
  sessions: Session[];
  participantCount: number;
  onSessionCreated: (s: Session) => void;
  onOpenSession: (s: Session) => void;
  openDialogControlled?: { open: boolean; onClose: () => void };
  projectId?: string | null;
}

export default function SessionList({ sessions, participantCount, onSessionCreated, onOpenSession, openDialogControlled, projectId }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({
    activity_name: "",
    session_type: "training",
    description: "",
    session_date: format(new Date(), "yyyy-MM-dd"),
    start_time: "09:00",
    end_time: "13:00",
    location: "",
    state: "",
    lga: "",
    ward: "",
    facilitator: "",
    expected_count: participantCount,
  });

  const dlgOpen = openDialogControlled ? openDialogControlled.open : open;
  const closeDlg = () => {
    if (openDialogControlled) openDialogControlled.onClose();
    else setOpen(false);
  };

  async function createSession() {
    if (!form.activity_name.trim()) {
      toast({ title: "Activity name required", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("attendance_sessions" as any)
      .insert({
        activity_name: form.activity_name.trim(),
        session_type: form.session_type,
        description: form.description || null,
        session_date: form.session_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location || null,
        state: form.state || null,
        lga: form.lga || null,
        ward: form.ward || null,
        facilitator: form.facilitator || null,
        expected_count: form.expected_count,
        status: "open",
        project_id: projectId || null,
        created_by: user?.id,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    const s = data as unknown as Session;
    onSessionCreated(s);
    closeDlg();
    toast({ title: "Session created", description: s.session_code });
    onOpenSession(s);
  }

  const filtered = sessions.filter(s =>
    !q.trim() || s.activity_name.toLowerCase().includes(q.toLowerCase()) || s.session_code.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card className="border border-border/60 shadow-sm">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h2 className="text-lg font-semibold">Attendance Sessions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">All meetings, trainings & activities</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search session…" className="pl-9 h-9" />
            </div>
            <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 h-9">
              <Plus className="h-4 w-4 mr-1.5" /> New Session
            </Button>
          </div>
        </div>

        <div className="border-t border-border/60">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No sessions yet. Click "New Session" to create one.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map(s => (
                <button
                  key={s.id}
                  onClick={() => onOpenSession(s)}
                  className="w-full px-4 sm:px-5 py-3.5 text-left hover:bg-muted/40 transition-colors flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] font-semibold uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {s.session_code}
                      </span>
                      <span className="font-medium text-sm text-foreground">{s.activity_name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(s.session_date), "dd MMM yyyy")}</span>
                      {s.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.location}</span>}
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{s.expected_count} expected</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      s.status === "open" ? "bg-emerald-100 text-emerald-700"
                      : s.status === "submitted" ? "bg-sky-100 text-sky-700"
                      : s.status === "closed" ? "bg-slate-100 text-slate-600"
                      : "bg-amber-100 text-amber-700"
                    }`}>{s.status}</span>
                    <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Dialog open={dlgOpen} onOpenChange={(v) => !v && closeDlg()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Attendance Session</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Activity Name *</Label>
              <Input value={form.activity_name} onChange={e => setForm({ ...form, activity_name: e.target.value })} placeholder="e.g. M&E Training for Ward Focal Persons" className="mt-1" />
            </div>
            <div>
              <Label>Session Type</Label>
              <Select value={form.session_type} onValueChange={v => setForm({ ...form, session_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="training">Training</SelectItem>
                  <SelectItem value="workshop">Workshop</SelectItem>
                  <SelectItem value="activity">Activity / Event</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.session_date} onChange={e => setForm({ ...form, session_date: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Start Time</Label>
              <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>End Time</Label>
              <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label>Location</Label>
              <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Dutse LGA Secretariat" className="mt-1" />
            </div>
            <div>
              <Label>State</Label>
              <Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>LGA</Label>
              <Input value={form.lga} onChange={e => setForm({ ...form, lga: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Ward</Label>
              <Input value={form.ward} onChange={e => setForm({ ...form, ward: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Facilitator / Supervisor</Label>
              <Input value={form.facilitator} onChange={e => setForm({ ...form, facilitator: e.target.value })} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label>Description (optional)</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description of the activity" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDlg}>Cancel</Button>
            <Button onClick={createSession} className="bg-blue-600 hover:bg-blue-700">Create & Open</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
