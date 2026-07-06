// Shared "After-hours submissions" log for dashboards.
//
// Surfaces every submission that was attempted during the locked evening window
// (see the after-hours gate), so supervisors can see — right on the dashboard —
// WHO submitted after hours, WHEN, the REASON they gave, and the outcome.
// Collapsed by default; refreshes live as new requests arrive.

import { useCallback, useEffect, useMemo, useState } from "react";
import { MoonStar, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { gatedTableLabel } from "@/lib/afterHours/tables";

interface Row {
  id: string;
  requested_by_name: string | null;
  target_table: string;
  form_label: string | null;
  reason: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

const statusStyle: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
};

function fmt(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

interface Props {
  /** Restrict to the submission tables relevant to this dashboard. */
  tables?: string[];
  accent?: string;
  className?: string;
}

export default function AfterHoursSubmissionsLog({ tables, accent = "#6366F1", className }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("after_hours_submission_requests")
        .select("id, requested_by_name, target_table, form_label, reason, status, created_at, reviewed_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (tables && tables.length) q = q.in("target_table", tables);
      const { data } = await q;
      setRows((data as Row[]) || []);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [tables]);

  // Load once expanded; keep live via realtime while the panel is open.
  useEffect(() => {
    if (!open) return;
    if (!loaded) void load();
    const ch = supabase
      .channel("afterhours-log-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "after_hours_submission_requests" },
        () => void load(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [open, loaded, load]);

  const summary = useMemo(() => {
    const pending = rows.filter((r) => r.status === "pending").length;
    return { total: rows.length, pending };
  }, [rows]);

  return (
    <Card className={`overflow-hidden border-l-4 ${className || ""}`} style={{ borderLeftColor: accent }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 p-4 text-left"
        aria-expanded={open}
      >
        <MoonStar className="h-4 w-4" style={{ color: accent }} />
        <span className="text-sm font-semibold text-foreground">After-hours submissions log</span>
        {loaded && (
          <span className="text-[11px] text-muted-foreground">
            {summary.total} entr{summary.total === 1 ? "y" : "ies"}
            {summary.pending > 0 ? ` · ${summary.pending} awaiting review` : ""}
          </span>
        )}
        <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t p-4 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Records who submitted after the 7&nbsp;PM lock, when, the reason given, and the outcome.
            </p>
            <Button size="sm" variant="outline" className="h-7" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {loading && rows.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No after-hours submissions recorded.</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted/70 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">User</th>
                    <th className="px-3 py-2 font-medium">Form</th>
                    <th className="px-3 py-2 font-medium">Submitted at</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="px-3 py-2 font-medium text-foreground">{r.requested_by_name || "Unknown user"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.form_label || gatedTableLabel(r.target_table)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmt(r.created_at)}</td>
                      <td className="px-3 py-2 text-foreground">{r.reason || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 capitalize ${statusStyle[r.status] || "bg-muted text-muted-foreground"}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
