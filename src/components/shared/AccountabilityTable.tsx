import { Fragment, useState } from "react";
import { Users, Plus, Minus, CalendarDays, Clock, MapPin, Timer } from "lucide-react";
import {
  AccountabilityUser,
  formatDuration,
  formatClock,
  formatDay,
} from "@/lib/accountability";

interface Props {
  /** Per-user accountability rows. */
  users: AccountabilityUser[];
  /** Singular unit label, e.g. "School" or "Health Facility". */
  unitLabel: string;
  /** Plural unit label, e.g. "Schools" or "Health Facilities". */
  unitLabelPlural: string;
  /** Accent color for the section header / bars. */
  accent?: string;
}

const StatusPill = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    sent: { label: "Submitted", bg: "#dcfce7", fg: "#15803d" },
    finalized: { label: "Finalized", bg: "#dbeafe", fg: "#1d4ed8" },
    draft: { label: "Draft", bg: "#fef3c7", fg: "#b45309" },
  };
  const s = map[status] || { label: status, bg: "#f1f5f9", fg: "#475569" };
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
};

export default function AccountabilityTable({ users, unitLabel, unitLabelPlural, accent = "#2563eb" }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const totalUnits = users.reduce((s, u) => s + u.visitCount, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Users className="h-4 w-4" style={{ color: accent }} />
        <h3 className="text-sm font-semibold text-foreground">Field Worker Accountability</h3>
        <span className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: `${accent}1a`, color: accent }}>
          {users.length} {users.length === 1 ? "user" : "users"}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Every user assigned to the form, the days they worked, start &amp; end time and total time spent on each {unitLabel.toLowerCase()},
        and the number of {unitLabelPlural.toLowerCase()} visited &amp; reported. Tap the &ldquo;+&rdquo; to drill into the actual list.
      </p>

      {users.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No reported {unitLabelPlural.toLowerCase()} yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2 w-8"></th>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 px-3 text-center">Days Worked</th>
                <th className="py-2 px-3 text-center">{unitLabelPlural} Visited &amp; Reported</th>
                <th className="py-2 px-3 text-right">Total Time</th>
                <th className="py-2 px-3 text-right">Avg / {unitLabel}</th>
                <th className="py-2 pl-3">Active Period</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const expanded = open.has(u.userId);
                const stripe = i % 2 === 0 ? "bg-card" : "bg-muted/30";
                return (
                  <>
                    <tr key={u.userId} className={`border-b border-border/50 ${stripe} hover:bg-muted/50 transition-colors`}>
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => toggle(u.userId)}
                          title={expanded ? "Collapse" : `Show ${unitLabelPlural.toLowerCase()} visited`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white shadow-sm transition-transform hover:scale-110"
                          style={{ background: accent }}
                        >
                          {expanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-foreground">{u.name}</div>
                        {u.email && <div className="text-[11px] text-muted-foreground">{u.email}</div>}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                          <CalendarDays className="h-3 w-3" /> {u.daysWorked}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: `${accent}1a`, color: accent }}>
                          <MapPin className="h-3 w-3" /> {u.visitCount}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums text-foreground">{formatDuration(u.totalTimeMs)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatDuration(u.avgTimeMs)}</td>
                      <td className="py-2 pl-3 text-xs text-muted-foreground">
                        {u.firstDay ? formatDay(u.firstDay) : "—"}
                        {u.lastDay && u.lastDay !== u.firstDay ? ` → ${formatDay(u.lastDay)}` : ""}
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${u.userId}-detail`} className="border-b border-border/50">
                        <td colSpan={7} className="bg-muted/20 p-0">
                          <div className="px-4 py-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                              <Timer className="h-3.5 w-3.5" style={{ color: accent }} />
                              {unitLabelPlural} visited &amp; reported by {u.name}
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-border bg-card">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                                    <th className="py-2 px-3">#</th>
                                    <th className="py-2 px-3">{unitLabel}</th>
                                    <th className="py-2 px-3">State / LGA</th>
                                    <th className="py-2 px-3">Date</th>
                                    <th className="py-2 px-3 text-center"><Clock className="inline h-3 w-3" /> Start</th>
                                    <th className="py-2 px-3 text-center"><Clock className="inline h-3 w-3" /> End</th>
                                    <th className="py-2 px-3 text-right">Time Spent</th>
                                    <th className="py-2 px-3">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {u.visits.map((v, vi) => (
                                    <tr key={vi} className={`border-b border-border/40 last:border-0 ${vi % 2 ? "bg-muted/20" : ""}`}>
                                      <td className="py-2 px-3 text-muted-foreground">{vi + 1}</td>
                                      <td className="py-2 px-3 font-medium text-foreground">{v.unitName}</td>
                                      <td className="py-2 px-3">{v.state}<span className="text-muted-foreground"> / {v.lga}</span></td>
                                      <td className="py-2 px-3 text-muted-foreground">{formatDay(v.start || v.end)}</td>
                                      <td className="py-2 px-3 text-center tabular-nums">{formatClock(v.start)}</td>
                                      <td className="py-2 px-3 text-center tabular-nums">{formatClock(v.end)}</td>
                                      <td className="py-2 px-3 text-right font-semibold tabular-nums" style={{ color: accent }}>{formatDuration(v.durationMs)}</td>
                                      <td className="py-2 px-3"><StatusPill status={v.status} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border text-xs font-semibold text-foreground">
                <td></td>
                <td className="py-2 pr-3">Total ({users.length} users)</td>
                <td className="py-2 px-3 text-center">{users.reduce((s, u) => s + u.daysWorked, 0)}</td>
                <td className="py-2 px-3 text-center">{totalUnits}</td>
                <td className="py-2 px-3 text-right">{formatDuration(users.reduce((s, u) => s + u.totalTimeMs, 0))}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
