import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, FileSpreadsheet, Filter } from "lucide-react";
import { AttendanceRecord, Participant, Session, STATUS_META } from "./types";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface Props {
  sessions: Session[];
  participants: Participant[];
  records: AttendanceRecord[];
}

export default function AttendanceReports({ sessions, participants, records }: Props) {
  const [from, setFrom] = useState(format(new Date(new Date().setDate(1)), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activity, setActivity] = useState("all");
  const [state, setState] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const participantMap = useMemo(() => new Map(participants.map(p => [p.id, p])), [participants]);
  const sessionMap = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (s.session_date < from || s.session_date > to) return false;
      if (activity !== "all" && s.activity_name !== activity) return false;
      if (state !== "all" && s.state !== state) return false;
      return true;
    });
  }, [sessions, from, to, activity, state]);

  const filteredSessionIds = new Set(filteredSessions.map(s => s.id));

  const rows = useMemo(() => {
    return records
      .filter(r => filteredSessionIds.has(r.session_id))
      .filter(r => statusFilter === "all" || r.status === statusFilter)
      .map(r => {
        const p = participantMap.get(r.participant_id);
        const s = sessionMap.get(r.session_id);
        return { r, p, s };
      })
      .filter(x => x.p && x.s)
      .sort((a, b) => (b.s!.session_date.localeCompare(a.s!.session_date)));
  }, [records, filteredSessionIds, statusFilter, participantMap, sessionMap]);

  const activities = useMemo(() => Array.from(new Set(sessions.map(s => s.activity_name))).sort(), [sessions]);
  const states = useMemo(() => Array.from(new Set(sessions.map(s => s.state).filter(Boolean))).sort(), [sessions]);

  function exportCSV() {
    const headers = ["Activity Name", "Date", "Location", "Session ID", "Participant ID", "Participant Name", "Sex", "Organization", "Status", "Time Marked", "Remarks"];
    const csv = [
      headers.join(","),
      ...rows.map(({ r, p, s }) => [
        s!.activity_name,
        s!.session_date,
        s!.location || "",
        s!.session_code,
        p!.participant_code,
        p!.full_name,
        p!.sex || "",
        p!.organization || "",
        r.status,
        r.marked_at ? new Date(r.marked_at).toISOString() : "",
        r.remarks || "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    download(`attendance_${from}_to_${to}.csv`, csv, "text/csv");
  }

  function exportPDF() {
    const w = window.open("", "_blank");
    if (!w) return toast({ title: "Allow popups to export PDF", variant: "destructive" });
    w.document.write(`
      <html><head><title>Attendance Report</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;color:#0f172a}
        h1{font-size:18px;margin:0 0 4px}
        .meta{font-size:11px;color:#64748b;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}
        th{background:#f1f5f9;font-weight:600}
        .present{color:#059669}.absent{color:#e11d48}.late{color:#d97706}.excused{color:#0284c7}.not_marked{color:#64748b}
      </style></head><body>
      <h1>Attendance Report</h1>
      <div class="meta">Date range: ${from} – ${to} · ${rows.length} records · Generated ${new Date().toLocaleString()}</div>
      <table><thead><tr>
        <th>Activity</th><th>Date</th><th>Location</th><th>PID</th><th>Participant</th><th>Sex</th><th>Organization</th><th>Status</th>
      </tr></thead><tbody>
      ${rows.map(({ r, p, s }) => `<tr>
        <td>${esc(s!.activity_name)}</td>
        <td>${s!.session_date}</td>
        <td>${esc(s!.location || "")}</td>
        <td>${p!.participant_code}</td>
        <td>${esc(p!.full_name)}</td>
        <td>${esc(p!.sex || "")}</td>
        <td>${esc(p!.organization || "")}</td>
        <td class="${r.status}">${STATUS_META[r.status]?.label || r.status}</td>
      </tr>`).join("")}
      </tbody></table>
      <script>window.print()</script>
      </body></html>
    `);
    w.document.close();
  }

  return (
    <div className="space-y-4">
      <Card className="border border-border/60 shadow-sm">
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Attendance Report</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Filter, review and export attendance records</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Date From</label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Date To</label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Activity</label>
              <Select value={activity} onValueChange={setActivity}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  {activities.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">State</label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {states.map(s => <SelectItem key={s!} value={s!}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="excused">Excused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-4">
            <Button variant="outline" size="sm"><Filter className="h-3.5 w-3.5 mr-1.5" />Filter</Button>
            <Button variant="outline" size="sm" onClick={exportCSV}><FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
            <Button size="sm" onClick={exportPDF} className="bg-blue-600 hover:bg-blue-700"><FileText className="h-3.5 w-3.5 mr-1.5" />Export PDF</Button>
          </div>
        </div>
      </Card>

      <Card className="border border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border/60">
                {["Activity Name", "Date", "Location", "PID", "Participant", "Sex", "Organization", "Status", "Time"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="p-10 text-center text-muted-foreground text-sm">No records match these filters.</td></tr>
              ) : rows.map(({ r, p, s }) => {
                const meta = STATUS_META[r.status];
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs">{s!.activity_name}</td>
                    <td className="px-3 py-2 text-xs">{format(new Date(s!.session_date), "dd MMM yyyy")}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s!.location || "—"}</td>
                    <td className="px-3 py-2 text-xs font-mono">{p!.participant_code}</td>
                    <td className="px-3 py-2 text-xs font-medium">{p!.full_name}</td>
                    <td className="px-3 py-2 text-xs">{p!.sex || "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p!.organization || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.marked_at ? format(new Date(r.marked_at), "HH:mm") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function esc(s: string) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)); }

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
