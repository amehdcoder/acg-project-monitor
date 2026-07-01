import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  RefreshCw,
  FileSpreadsheet,
  BarChart3,
  Users,
  MapPin,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { FormGroup, Question } from "@/components/FormBuilder/types";
import type { DashboardConfig, DashboardWidget } from "@/lib/specialStudio/presets";
import { ensureWidgets, reconcileWidgets } from "@/lib/specialStudio/dashboardSync";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

interface Props {
  form: { id: string; name: string; questions: unknown; settings: unknown };
  onClose: () => void;
}

interface SubmissionRow {
  id: string;
  data: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
}

function sectionsFrom(questions: unknown): FormGroup[] {
  if (Array.isArray(questions)) {
    const groups = questions.filter((r: unknown) => Array.isArray((r as FormGroup)?.questions));
    if (groups.length) return groups as FormGroup[];
  }
  return [];
}

export default function SpecialFormDashboard({ form, onClose }: Props) {
  // Live copy of the form structure/settings so the dashboard restructures
  // itself the moment the linked form is edited in the Studio.
  const [liveForm, setLiveForm] = useState(form);
  useEffect(() => setLiveForm(form), [form]);

  const settings = (liveForm.settings || {}) as Record<string, unknown>;
  const config = (settings.dashboardConfig || {}) as Partial<DashboardConfig>;
  const accent = config.accent || "#6366f1";

  const sections = useMemo(() => sectionsFrom(liveForm.questions), [liveForm.questions]);
  const questions = useMemo(() => sections.flatMap((s) => s.questions), [sections]);
  const nameToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of questions) if (q.name) m.set(q.name, q.id);
    return m;
  }, [questions]);
  const idToLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of questions) m.set(q.id, q.label || q.name || q.id);
    return m;
  }, [questions]);

  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const cfgKey = `sfstudio_export_${form.id}`;
  const [sheetId, setSheetId] = useState(() => localStorage.getItem(`${cfgKey}_sheet`) || "");
  const [lookerUrl, setLookerUrl] = useState(() => localStorage.getItem(`${cfgKey}_looker`) || "");
  const [email, setEmail] = useState(() => localStorage.getItem(`${cfgKey}_email`) || "");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("form_submissions")
      .select("id,data,submitted_at,created_at")
      .eq("form_id", form.id)
      .order("created_at", { ascending: false })
      .limit(1000);
    setRows((data || []) as unknown as SubmissionRow[]);
    setLoading(false);
  }, [form.id]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`sfstudio-dash-${form.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "form_submissions", filter: `form_id=eq.${form.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "forms", filter: `id=eq.${form.id}` },
        (payload) => {
          const next = payload.new as { questions?: unknown; settings?: unknown } | null;
          if (next) {
            setLiveForm((prev) => ({
              ...prev,
              questions: next.questions ?? prev.questions,
              settings: next.settings ?? prev.settings,
            }));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [form.id, load]);


  const readVal = (row: SubmissionRow, name?: string): unknown => {
    if (!name) return undefined;
    const id = nameToId.get(name);
    return id ? row.data?.[id] : undefined;
  };

  const kpis = useMemo(() => {
    return (config.kpiFields || []).map((name) => {
      const q = questions.find((x) => x.name === name);
      let sum = 0;
      for (const r of rows) {
        const v = Number(readVal(r, name));
        if (!Number.isNaN(v)) sum += v;
      }
      return { label: q?.label || name, value: sum };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.kpiFields, rows, questions]);

  const statusBreakdown = useMemo(() => {
    if (!config.statusField) return [];
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = String(readVal(r, config.statusField) ?? "—");
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [config.statusField, rows]);

  const geoBreakdown = useMemo(() => {
    if (!config.geoField) return [];
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = String(readVal(r, config.geoField) ?? "—");
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [config.geoField, rows]);

  const columns = useMemo(() => questions.slice(0, 6), [questions]);

  const runExport = async () => {
    if (!sheetId.trim() && !email.trim()) {
      toast.error("Provide a Google Sheet ID and/or an email to notify.");
      return;
    }
    localStorage.setItem(`${cfgKey}_sheet`, sheetId.trim());
    localStorage.setItem(`${cfgKey}_looker`, lookerUrl.trim());
    localStorage.setItem(`${cfgKey}_email`, email.trim());
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("special-form-export", {
        body: {
          formId: form.id,
          formName: form.name,
          spreadsheetId: sheetId.trim() || null,
          lookerStudioUrl: lookerUrl.trim() || null,
          notifyEmail: email.trim() || null,
        },
      });
      if (error) throw error;
      const res = data as { sheetRows?: number; emailed?: boolean; message?: string };
      toast.success(
        res?.message ||
          `Export complete${res?.sheetRows != null ? ` — ${res.sheetRows} rows synced` : ""}${res?.emailed ? " — email sent" : ""}.`,
      );
    } catch (e) {
      toast.error(
        (e as { message?: string })?.message ||
          "Export failed. Ensure a Google Sheets & Gmail connection is linked.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3" style={{ background: accent }}>
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1 text-white hover:bg-white/20 hover:text-white">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-white">{form.name}</div>
          <div className="text-[11px] text-white/80">Live monitoring dashboard</div>
        </div>
        <Button variant="ghost" size="icon" onClick={load} className="text-white hover:bg-white/20 hover:text-white">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1">
              <FileSpreadsheet className="h-4 w-4" /> Google export
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Google Sheets & Looker Studio
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Sync every submission to a Google Sheet (the data source for Looker Studio) and email the linked
                dashboard via Gmail. Requires a linked Google Sheets &amp; Gmail connection.
              </p>
              <div>
                <Label className="text-xs">Google Sheet ID</Label>
                <Input value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder="1BxiMVs0XRA5..." className="mt-1 h-8" />
              </div>
              <div>
                <Label className="text-xs">Looker Studio report URL</Label>
                <Input value={lookerUrl} onChange={(e) => setLookerUrl(e.target.value)} placeholder="https://lookerstudio.google.com/..." className="mt-1 h-8" />
              </div>
              <div>
                <Label className="text-xs">Notify email (Gmail)</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="lead@org.org" className="mt-1 h-8" />
              </div>
              <Button onClick={runExport} disabled={exporting} className="w-full gap-2">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Sync &amp; email now
              </Button>
              {lookerUrl && (
                <a href={lookerUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Open Looker Studio report
                </a>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-5xl space-y-4 p-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Users className="h-3.5 w-3.5" /> Submissions</div>
              <div className="mt-1 text-2xl font-bold" style={{ color: accent }}>{rows.length}</div>
            </div>
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><BarChart3 className="h-3.5 w-3.5" /> {k.label}</div>
                <div className="mt-1 text-2xl font-bold" style={{ color: accent }}>{k.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* Breakdown */}
          <div className="grid gap-4 md:grid-cols-2">
            {statusBreakdown.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">Status breakdown</h3>
                <div className="space-y-2">
                  {statusBreakdown.map(([label, count]) => {
                    const pct = rows.length ? Math.round((count / rows.length) * 100) : 0;
                    return (
                      <div key={label}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span className="truncate">{label}</span>
                          <span className="text-muted-foreground">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: accent }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {geoBreakdown.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-3 flex items-center gap-1 text-sm font-semibold"><MapPin className="h-4 w-4" /> By location</h3>
                <div className="space-y-1.5">
                  {geoBreakdown.map(([label, count]) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="truncate">{label}</span>
                      <span className="font-semibold" style={{ color: accent }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent submissions */}
          <div className="rounded-xl border border-border bg-card">
            <h3 className="border-b border-border p-3 text-sm font-semibold">Recent submissions</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-2 font-medium">Date</th>
                    {columns.map((c) => (
                      <th key={c.id} className="p-2 font-medium">{idToLabel.get(c.id)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="whitespace-nowrap p-2 text-muted-foreground">
                        {new Date(r.submitted_at || r.created_at).toLocaleDateString()}
                      </td>
                      {columns.map((c) => {
                        const v = r.data?.[c.id];
                        return (
                          <td key={c.id} className="max-w-[160px] truncate p-2">
                            {v == null ? "—" : Array.isArray(v) ? v.join(", ") : String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {rows.length === 0 && !loading && (
                    <tr><td colSpan={columns.length + 1} className="p-6 text-center text-muted-foreground">No submissions yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
