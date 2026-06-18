import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Moon, AlertTriangle, RefreshCw, Loader2, CheckCircle2, Send,
  FolderKanban, FileText, User, UserCheck, Clock,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

interface Anomaly {
  id: string;
  submission_id: string;
  form_name: string | null;
  project_name: string | null;
  collector_name: string | null;
  collector_email: string | null;
  submitted_at: string | null;
  local_time: string | null;
  anomaly_type: string;
  status: string;
  reason: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
}

const ANOMALY_LABEL: Record<string, string> = {
  after_hours_submission: "After-Hours Submission (6:59 PM – 6:59 AM)",
};

const AfterHoursAnomaliesPanel = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchAnomalies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("submission_anomalies")
      .select("*")
      .order("submitted_at", { ascending: false });
    if (error) {
      toast({ title: "Error loading anomalies", description: error.message, variant: "destructive" });
    } else {
      setItems((data || []) as Anomaly[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAnomalies(); }, []);

  const saveReason = async (a: Anomaly) => {
    const reason = (drafts[a.id] || "").trim();
    if (!reason) {
      toast({ title: "Enter a reason", description: "Please record the follow-up insight before saving.", variant: "destructive" });
      return;
    }
    setSaving(a.id);
    let resolverName = "An admin";
    if (user) {
      const { data: p } = await supabase
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (p) resolverName = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "An admin";
    }
    const { error } = await supabase
      .from("submission_anomalies")
      .update({
        reason,
        status: "resolved",
        resolved_by: user?.id ?? null,
        resolved_by_name: resolverName,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", a.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Follow-up saved", description: "The anomaly analysis is now recorded." });
      setDrafts((d) => { const n = { ...d }; delete n[a.id]; return n; });
      fetchAnomalies();
    }
    setSaving(null);
  };

  const pending = items.filter((a) => a.status !== "resolved");
  const resolved = items.filter((a) => a.status === "resolved");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <Moon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">After-Hours Data-Quality Follow-ups</h2>
            <p className="text-xs text-muted-foreground">Submissions captured between 6:59 PM and 6:59 AM Nigerian time</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAnomalies} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 py-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
          <p className="text-sm font-medium text-foreground">No after-hours submissions flagged</p>
          <p className="text-xs text-muted-foreground">All data was collected within normal field hours.</p>
        </div>
      ) : (
        <>
          {/* Pending follow-ups */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" /> Awaiting follow-up ({pending.length})
              </p>
              {pending.map((a) => (
                <div key={a.id} className="overflow-hidden rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2 border-b border-amber-200/70 bg-amber-100/50 px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                      <Moon className="h-3 w-3" /> {ANOMALY_LABEL[a.anomaly_type] || a.anomaly_type}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                      <Clock className="h-3 w-3" /> {a.local_time || (a.submitted_at ? format(new Date(a.submitted_at), "dd MMM yyyy, hh:mm a") : "—")}
                    </span>
                  </div>
                  <div className="grid gap-2 px-4 py-3 sm:grid-cols-3">
                    <Field icon={FolderKanban} label="Project" value={a.project_name} tint="text-violet-600" />
                    <Field icon={FileText} label="Form" value={a.form_name} tint="text-blue-600" />
                    <Field icon={User} label="Collector" value={a.collector_name} tint="text-emerald-600" />
                  </div>
                  <div className="px-4 pb-4">
                    <label className="mb-1.5 block text-xs font-semibold text-amber-800">Follow-up insight — why was this submitted after hours?</label>
                    <Textarea
                      value={drafts[a.id] || ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                      placeholder="Record what the collector explained when you followed up…"
                      className="min-h-[70px] resize-none border-amber-300 bg-white/90"
                    />
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" onClick={() => saveReason(a)} disabled={saving === a.id}
                        className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-90">
                        {saving === a.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Save analysis
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Resolved analyses */}
          {resolved.length > 0 && (
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Follow-up analysis ({resolved.length})
              </p>
              {resolved.map((a) => (
                <div key={a.id} className="overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-teal-50/60 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2 border-b border-emerald-200/70 bg-emerald-100/40 px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                      <Moon className="h-3 w-3" /> {ANOMALY_LABEL[a.anomaly_type] || a.anomaly_type}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2.5 py-0.5 text-[11px] font-medium text-white">
                      <Clock className="h-3 w-3" /> {a.local_time || "—"}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                      <CheckCircle2 className="h-3 w-3" /> Resolved
                    </span>
                  </div>
                  <div className="grid gap-2 px-4 py-3 sm:grid-cols-4">
                    <Field icon={FolderKanban} label="Project" value={a.project_name} tint="text-violet-600" />
                    <Field icon={FileText} label="Form" value={a.form_name} tint="text-blue-600" />
                    <Field icon={User} label="Collector" value={a.collector_name} tint="text-emerald-600" />
                    <Field icon={UserCheck} label="Followed up by" value={a.resolved_by_name} tint="text-indigo-600" />
                  </div>
                  <div className="px-4 pb-4">
                    <div className="rounded-lg border border-emerald-200 bg-white/80 p-3">
                      <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                        Anomaly &amp; Admin Feedback
                      </p>
                      <p className="text-sm text-foreground">{a.reason}</p>
                      {a.resolved_at && (
                        <p className="mt-2 text-[11px] text-muted-foreground">Recorded {format(new Date(a.resolved_at), "dd MMM yyyy, hh:mm a")}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const Field = ({ icon: Icon, label, value, tint }: { icon: any; label: string; value: string | null; tint: string }) => (
  <div className="flex items-start gap-2 rounded-lg bg-white/70 px-2.5 py-1.5">
    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tint}`} />
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground" title={value || undefined}>{value || "—"}</p>
    </div>
  </div>
);

export default AfterHoursAnomaliesPanel;
