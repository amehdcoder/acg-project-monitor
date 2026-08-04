import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Ban, CheckCircle2, CircleDashed, Loader, PauseCircle,
} from "lucide-react";
import { resolveChecklistValue } from "./checklistSchema";

export type StatusKey = "completed" | "ongoing" | "halted" | "not_started" | "unknown";

export const STATUS_META: Record<
  StatusKey,
  { label: string; color: string; icon: React.ElementType; badge: string }
> = {
  completed: {
    label: "Completed", color: "hsl(142,71%,38%)", icon: CheckCircle2,
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  ongoing: {
    label: "Ongoing", color: "hsl(214,85%,48%)", icon: Loader,
    badge: "bg-blue-100 text-blue-800 border-blue-200",
  },
  halted: {
    label: "Halted", color: "hsl(45,95%,50%)", icon: PauseCircle,
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  not_started: {
    label: "Not Started", color: "hsl(0,72%,48%)", icon: Ban,
    badge: "bg-rose-100 text-rose-800 border-rose-200",
  },
  unknown: {
    label: "Unspecified", color: "hsl(215,15%,55%)", icon: CircleDashed,
    badge: "bg-muted text-muted-foreground border-border",
  },
};

/** Map a raw / resolved Status of MDA value onto a canonical bucket. */
export function statusKey(raw: unknown): StatusKey {
  const label = String(resolveChecklistValue("Status_of_MDA", raw) || raw || "").trim();
  if (!label) return "unknown";
  if (/complete|finish|conclud/i.test(label)) return "completed";
  if (/not\s*start|no[t]?\s*commenc|yet\s*to|never/i.test(label)) return "not_started";
  if (/halt|stopp|suspend|paus|abort/i.test(label)) return "halted";
  if (/ongoing|on-?going|progress|started|commenc|active/i.test(label)) return "ongoing";
  return "unknown";
}

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? "—" : s;
};

const fmtDate = (v: unknown) => {
  const s = String(v ?? "").slice(0, 10);
  return s || "—";
};

export interface StatusRecord extends Record<string, unknown> {
  respondent_count?: number;
}

/** Professional table of checklist records for one MDA status. */
export function StatusRecordsTable({
  rows, dense,
}: { rows: StatusRecord[]; dense?: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">
        No communities in this status
      </div>
    );
  }
  return (
    <div className={`overflow-auto rounded-md border ${dense ? "max-h-[300px]" : "max-h-[420px]"}`}>
      <table className="w-full min-w-[980px] text-xs">
        <thead className="bg-muted/60 sticky top-0 z-10">
          <tr>
            <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">#</th>
            <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">State</th>
            <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">LGA</th>
            <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Ward</th>
            <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">FLHF</th>
            <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Community</th>
            <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Independent Monitor</th>
            <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Designation</th>
            <th className="text-right px-2 py-2 font-semibold whitespace-nowrap">Respondents</th>
            <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r._uuid ?? i}`} className="border-t hover:bg-muted/30">
              <td className="px-2 py-1.5 tabular-nums text-muted-foreground align-top">{i + 1}</td>
              <td className="px-2 py-1.5 align-top whitespace-normal break-words">{txt(resolveChecklistValue("State", r.State))}</td>
              <td className="px-2 py-1.5 align-top whitespace-normal break-words">{txt(resolveChecklistValue("LGA", r.LGA))}</td>
              <td className="px-2 py-1.5 align-top whitespace-normal break-words">{txt(resolveChecklistValue("Ward", r.Ward))}</td>
              <td className="px-2 py-1.5 align-top whitespace-normal break-words">{txt(r.FLHF)}</td>
              <td className="px-2 py-1.5 font-medium align-top whitespace-normal break-words">{txt(r.COMMUNITIES)}</td>
              <td className="px-2 py-1.5 align-top whitespace-normal break-words">{txt(r.Independent_Monitor_s_Name)}</td>
              <td className="px-2 py-1.5 align-top whitespace-normal break-words">{txt(resolveChecklistValue("Designation", r.Designation))}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.respondent_count ?? 0)}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(r._submission_time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One card per status with icon, count and its own community table. */
export function StatusCommunityTables({ parents }: { parents: StatusRecord[] }) {
  const groups = useMemo(() => {
    const m: Record<StatusKey, StatusRecord[]> = {
      not_started: [], halted: [], ongoing: [], completed: [], unknown: [],
    };
    for (const p of parents) m[statusKey(p.Status_of_MDA)].push(p);
    return m;
  }, [parents]);

  const order: StatusKey[] = ["not_started", "halted", "ongoing", "completed"];
  if (groups.unknown.length) order.push("unknown");

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {order.map((k) => {
        const meta = STATUS_META[k];
        const Icon = meta.icon;
        const rows = groups[k];
        const communities = new Set(
          rows.map((r) => `${String(r.Ward ?? "").toLowerCase()}|${String(r.COMMUNITIES ?? "").toLowerCase()}`),
        );
        return (
          <Card key={k} className="overflow-hidden">
            <CardHeader
              className="py-3 px-4 border-b flex-row items-center justify-between space-y-0"
              style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
            >
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Icon className="h-4 w-4" style={{ color: meta.color }} />
                Communities — MDA {meta.label}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={meta.badge}>{rows.length} record{rows.length === 1 ? "" : "s"}</Badge>
                <Badge variant="outline">{communities.size} communit{communities.size === 1 ? "y" : "ies"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <StatusRecordsTable rows={rows} dense />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Drill-down dialog opened by clicking a Status of MDA bar. */
export function StatusDrilldownDialog({
  statusLabel, rows, onClose,
}: { statusLabel: string | null; rows: StatusRecord[]; onClose: () => void }) {
  const key = statusLabel ? statusKey(statusLabel) : "unknown";
  const meta = STATUS_META[key];
  const Icon = meta.icon;
  const communities = new Set(
    rows.map((r) => `${String(r.Ward ?? "").toLowerCase()}|${String(r.COMMUNITIES ?? "").toLowerCase()}`),
  );
  const respondents = rows.reduce((s, r) => s + (Number(r.respondent_count) || 0), 0);
  return (
    <Dialog open={!!statusLabel} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" style={{ color: meta.color }} />
            Status of MDA — {statusLabel}
          </DialogTitle>
          <DialogDescription>
            {rows.length} checklist record{rows.length === 1 ? "" : "s"} · {communities.size} distinct
            communit{communities.size === 1 ? "y" : "ies"} · {respondents} respondents interviewed
          </DialogDescription>
        </DialogHeader>
        <StatusRecordsTable rows={rows} />
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small hook wrapper for drill-down state. */
export function useStatusDrilldown() {
  const [status, setStatus] = useState<string | null>(null);
  return { status, open: setStatus, close: () => setStatus(null) };
}
