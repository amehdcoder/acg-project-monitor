import { useEffect, useState, useCallback } from "react";
import { History, RefreshCw, ArrowRight, User, Clock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AuditRow {
  id: string;
  field_key: string;
  field_label: string | null;
  old_value: string | null;
  new_value: string | null;
  source: string;
  changed_by_name: string | null;
  changed_at: string;
}

const fmt = (v?: string | null) => {
  if (v === null || v === undefined || v === "") return "—";
  return v;
};

const fmtDate = (v: string) => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString();
};

/**
 * Shows the full field-level edit history for one submission:
 * who changed which field, from what to what, and when.
 */
export default function SubmissionEditHistory({
  submissionId,
  tableName = "form_submissions",
}: {
  submissionId: string;
  tableName?: string;
}) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("submission_edit_audit" as any)
        .select("id, field_key, field_label, old_value, new_value, source, changed_by_name, changed_at")
        .eq("submission_id", submissionId)
        .eq("table_name", tableName)
        .order("changed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e) {
      console.warn("Failed to load edit history:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [submissionId, tableName]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mt-6 border-t pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-medium text-foreground">
          <History className="h-4 w-4 text-primary" />
          Edit history
          {rows.length > 0 && (
            <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
          )}
        </h4>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          {loading ? "Loading…" : "No edits recorded yet for this submission."}
        </p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => {
            const isSmart = r.source?.includes("smart_count");
            return (
              <li
                key={r.id}
                className="rounded-lg border border-border bg-muted/30 p-3 text-sm"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {r.field_label || r.field_key}
                  </span>
                  {isSmart && (
                    <Badge variant="outline" className="gap-1 border-cyan-400 text-cyan-600 dark:text-cyan-300">
                      <Sparkles className="h-3 w-3" /> Smart Count
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-600 line-through dark:text-red-300">
                    {fmt(r.old_value)}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                    {fmt(r.new_value)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" /> {r.changed_by_name || "Unknown"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {fmtDate(r.changed_at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
