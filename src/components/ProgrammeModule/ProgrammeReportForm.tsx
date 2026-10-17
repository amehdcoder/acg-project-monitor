// Programme Report Form — CiSKuLA-2 logframe reporting inside the
// Longitudinal Beneficiary Records. Programme Officers enter indicator values
// per reporting period; values aggregatable from beneficiary records are
// pre-filled (editable), targets show live progress, risks are captured per
// indicator, and every report is kept as history.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BarChart3, CalendarRange, CheckCircle2, ChevronDown, ChevronRight,
  ClipboardList, History, Loader2, RefreshCw, Save, Sparkles, Target, Trash2,
  UserPlus, Users, Search, ChevronsDownUp, ChevronsUpDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LOGFRAME, LOGFRAME_PROJECT, flatIndicators, numericTarget, type AutoKey, type FlatIndicator } from "@/lib/programmeModule/logframe";
import { aggregateIndicators } from "@/lib/programmeModule/programmeReport";
import DisaggregationEditor from "./DisaggregationEditor";

const db = supabase as unknown as {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

interface EntryDraft {
  value: string;
  disaggregation: Record<string, string>;
  risk: string;
  auto: boolean;
}

interface ReportRow {
  id: string;
  period_label: string;
  report_year: number;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
}

interface OfficerRow {
  id: string;
  user_id: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

const TONES = {
  blue: { bar: "bg-health-blue", soft: "bg-health-blue/10 text-health-blue", border: "border-health-blue/25" },
  teal: { bar: "bg-health-teal", soft: "bg-health-teal/10 text-health-teal", border: "border-health-teal/25" },
  amber: { bar: "bg-status-warning", soft: "bg-status-warning/10 text-status-warning", border: "border-status-warning/25" },
} as const;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Props {
  projectId: string;
  canManage: boolean; // owner / super admin — designates Programme Officers
}

const ProgrammeReportForm = ({ projectId, canManage }: Props) => {
  const { toast } = useToast();
  const now = new Date();
  const [period, setPeriod] = useState(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`);
  const [reportYear, setReportYear] = useState("1");
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<Record<string, EntryDraft>>({});
  const [autoValues, setAutoValues] = useState<Partial<Record<AutoKey, number>>>({});
  const [autoLoading, setAutoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<Record<string, { indicator_code: string; value: number | null; risk: string | null }[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "so1-outcome": true });
  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [officersOpen, setOfficersOpen] = useState(false);
  const [officerEmail, setOfficerEmail] = useState("");
  const [officerBusy, setOfficerBusy] = useState(false);
  const [teamMembers, setTeamMembers] = useState<{ user_id: string; full_name: string; email: string | null }[]>([]);
  const [search, setSearch] = useState("");

  const indicators = useMemo(() => flatIndicators(), []);

  const loadReports = useCallback(async () => {
    const { data } = await db.from("programme_reports").select("id, period_label, report_year, notes, created_at, created_by, status, reviewed_by, reviewed_at, resolution_note").eq("project_id", projectId).order("created_at", { ascending: false });
    setReports((data || []) as ReportRow[]);
  }, [projectId]);

  const loadOfficers = useCallback(async () => {
    const { data } = await db.from("programme_report_officers").select("id, user_id, profiles(full_name, email)").eq("project_id", projectId);
    setOfficers((data || []) as OfficerRow[]);
  }, [projectId]);

  // Project users — everyone assigned to the project (user_project_assignments)
  // plus the team register, resolved to names/emails from profiles.
  const loadTeamMembers = useCallback(async () => {
    const [{ data: assignments }, { data: team }] = await Promise.all([
      db.from("user_project_assignments").select("user_id").eq("project_id", projectId),
      db.from("programme_team_members").select("user_id, full_name, email").eq("project_id", projectId),
    ]);
    const ids = new Set<string>();
    for (const a of (assignments || []) as { user_id: string | null }[]) if (a.user_id) ids.add(a.user_id);
    const teamRows = ((team || []) as { user_id: string | null; full_name: string; email: string | null }[]).filter((m) => !!m.user_id);
    for (const m of teamRows) ids.add(m.user_id as string);
    if (ids.size === 0) { setTeamMembers([]); return; }
    const { data: profiles } = await db.from("profiles").select("id, full_name, email").in("id", [...ids]);
    const byId = new Map(((profiles || []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [p.id, p]));
    const merged = [...ids].map((id) => {
      const p = byId.get(id);
      const t = teamRows.find((m) => m.user_id === id);
      return { user_id: id, full_name: p?.full_name || t?.full_name || "Unnamed user", email: p?.email || t?.email || null };
    }).sort((a, b) => a.full_name.localeCompare(b.full_name));
    setTeamMembers(merged);
  }, [projectId]);

  const runAggregation = useCallback(async () => {
    setAutoLoading(true);
    try {
      const values = await aggregateIndicators(projectId);
      setAutoValues(values);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const ind of indicators) {
          if (!ind.autoKey) continue;
          const v = values[ind.autoKey];
          if (v === undefined) continue;
          const existing = next[ind.code];
          if (!existing || existing.auto) {
            next[ind.code] = {
              value: String(v),
              disaggregation: existing?.disaggregation || {},
              risk: existing?.risk || "",
              auto: true,
            };
          }
        }
        return next;
      });
    } catch {
      // Aggregation is a convenience — officers can still type values manually.
    } finally {
      setAutoLoading(false);
    }
  }, [projectId, indicators]);

  useEffect(() => {
    void loadReports();
    void loadOfficers();
    void loadTeamMembers();
    void runAggregation();
  }, [loadReports, loadOfficers, loadTeamMembers, runAggregation]);

  const setDraft = (code: string, patch: Partial<EntryDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [code]: { value: "", disaggregation: {}, risk: "", auto: false, ...prev[code], ...patch },
    }));
  };

  const filledCount = Object.values(drafts).filter((d) => d.value.trim() !== "").length;
  const riskCount = Object.values(drafts).filter((d) => d.risk.trim() !== "").length;
  const autoCount = Object.values(drafts).filter((d) => d.auto && d.value.trim() !== "").length;

  // Cumulative progress: sum of saved values for an indicator across all past
  // reports, plus the current draft value, against the selected year's target.
  const cumulativeFor = (code: string): number => {
    let sum = 0;
    for (const entries of Object.values(historyEntries)) {
      for (const e of entries) {
        if (e.indicator_code === code && e.value !== null) sum += Number(e.value);
      }
    }
    const draftVal = Number(drafts[code]?.value);
    if (Number.isFinite(draftVal)) sum += draftVal;
    return sum;
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    if (reports.length === 0) return;
    const ids = reports.map((r) => r.id);
    const { data } = await db.from("programme_report_entries").select("report_id, indicator_code, value, risk").in("report_id", ids);
    const grouped: Record<string, { indicator_code: string; value: number | null; risk: string | null }[]> = {};
    for (const e of (data || []) as { report_id: string; indicator_code: string; value: number | null; risk: string | null }[]) {
      (grouped[e.report_id] ||= []).push(e);
    }
    setHistoryEntries(grouped);
  };

  const save = async () => {
    const entries = indicators
      .map((ind) => ({ ind, draft: drafts[ind.code] }))
      .filter(({ draft }) => draft && (draft.value.trim() !== "" || draft.risk.trim() !== ""));
    if (entries.length === 0) {
      toast({ title: "Nothing to save", description: "Enter at least one indicator value or risk first.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data: report, error } = await db
        .from("programme_reports")
        .insert({ project_id: projectId, period_label: period.trim() || "Unnamed period", report_year: Number(reportYear), notes: notes.trim() || null, created_by: auth.user?.id })
        .select("id")
        .single();
      if (error) throw error;
      const rows = entries.map(({ ind, draft }) => ({
        report_id: report.id,
        indicator_code: ind.code,
        value: draft.value.trim() === "" ? null : Number(draft.value),
        disaggregation: draft.disaggregation,
        risk: draft.risk.trim() || null,
      }));
      const { error: eErr } = await db.from("programme_report_entries").insert(rows);
      if (eErr) throw eErr;
      toast({ title: "Programme report saved", description: `${rows.length} indicator entries recorded for ${period}.` });
      setDrafts({});
      setNotes("");
      await loadReports();
      void runAggregation();
    } catch (e) {
      toast({ title: "Could not save report", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const designateOfficer = async (userId: string, label: string) => {
    setOfficerBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("programme_report_officers").insert({ project_id: projectId, user_id: userId, granted_by: auth.user?.id });
      if (error) throw error;
      toast({ title: "Programme Officer designated", description: label });
      await loadOfficers();
    } catch (e) {
      toast({ title: "Could not designate officer", description: (e as Error).message, variant: "destructive" });
    } finally {
      setOfficerBusy(false);
    }
  };

  const addOfficer = async () => {
    const email = officerEmail.trim().toLowerCase();
    if (!email) return;
    setOfficerBusy(true);
    try {
      const { data: profile } = await db.from("profiles").select("id, full_name").ilike("email", email).maybeSingle();
      if (!profile) {
        toast({ title: "No user with that email", description: "The person must have an Amehnities account first.", variant: "destructive" });
        return;
      }
      setOfficerEmail("");
      await designateOfficer(profile.id, profile.full_name || email);
    } catch (e) {
      toast({ title: "Could not designate officer", description: (e as Error).message, variant: "destructive" });
    } finally {
      setOfficerBusy(false);
    }
  };

  const removeOfficer = async (id: string) => {
    const { error } = await db.from("programme_report_officers").delete().eq("id", id);
    if (error) {
      toast({ title: "Could not remove officer", description: error.message, variant: "destructive" });
      return;
    }
    await loadOfficers();
  };

  const renderIndicator = (ind: FlatIndicator, tone: keyof typeof TONES) => {
    const draft = drafts[ind.code];
    const yearIdx = Math.min(Math.max(Number(reportYear) - 1, 0), 3);
    const yearTarget = numericTarget(ind.targets[yearIdx]);
    const totalTarget = numericTarget(ind.totalTarget);
    const cumulative = cumulativeFor(ind.code);
    const pct = yearTarget && yearTarget > 0 ? Math.min(100, Math.round((cumulative / yearTarget) * 100)) : null;
    const t = TONES[tone];
    return (
      <div key={ind.code} className={cn("rounded-lg border border-l-4 bg-card p-4 shadow-soft sm:p-5", t.border)}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-bold", t.soft)}>{ind.code}</span>
              {draft?.auto && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-status-success">
                  <Sparkles className="h-3 w-3" /> Auto-aggregated from records
                </span>
              )}
            </div>
            <p className="mt-2 text-base font-semibold leading-relaxed text-foreground">{ind.title}</p>
            {ind.mov && <p className="mt-0.5 text-xs text-muted-foreground">MoV: {ind.mov}</p>}
          </div>
          <div className="flex w-full flex-col gap-2 border-t border-border/60 pt-3 xl:w-auto xl:items-end xl:border-0 xl:pt-0">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Baseline: <span className="font-semibold text-health-ink">{ind.baseline || "0"}</span></span>
              <span>Year {reportYear} target: <span className="font-semibold text-health-ink">{ind.targets[yearIdx] ?? "—"}</span></span>
              {ind.totalTarget && <span>Total: <span className="font-semibold text-health-ink">{ind.totalTarget}</span></span>}
            </div>
            {pct !== null && (
              <div className="w-full max-w-xs">
                <div className="flex items-center justify-between text-[10px] font-semibold">
                  <span className="text-muted-foreground">Progress to Year {reportYear} target</span>
                  <span className={pct >= 100 ? "text-status-success" : "text-health-blue"}>{pct}%</span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-status-success" : t.bar)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[200px_1fr]">
          <div>
            <Label htmlFor={`report-value-${ind.code}`} className="text-sm font-medium text-foreground">Value this period{ind.isPercent ? " (% / proportion)" : ""}</Label>
            <Input
              id={`report-value-${ind.code}`}
              type="number"
              value={draft?.value || ""}
              onChange={(e) => setDraft(ind.code, { value: e.target.value, auto: false })}
              placeholder={ind.autoKey ? "Auto from records" : "Enter value"}
              className={cn("mt-2 h-[52px] text-lg font-semibold tabular-nums", draft?.auto && "border-status-success/40 bg-status-success/5")}
            />
          </div>
          {ind.disaggregation && ind.disaggregation.length > 0 && (
            <DisaggregationEditor
              labels={ind.disaggregation}
              values={draft?.disaggregation || {}}
              onChange={(next) => setDraft(ind.code, { disaggregation: next })}
              idPrefix={`report-${ind.code}`}
            />
          )}
        </div>
        <div className="mt-3">
          <Label htmlFor={`report-risk-${ind.code}`} className="inline-flex items-center gap-2 text-sm font-medium text-status-warning"><AlertTriangle className="h-3 w-3" /> Risks / challenges encountered</Label>
          <Textarea
            id={`report-risk-${ind.code}`}
            value={draft?.risk || ""}
            onChange={(e) => setDraft(ind.code, { risk: e.target.value })}
            placeholder="e.g. stock-outs delayed outreach; insecurity limited access to 2 wards…"
            className="mt-2 min-h-20 text-sm"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden border-b border-border">
        <div className="border-t-4 border-health-teal bg-health-surface px-4 py-6 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-4 lg:flex-row">
            <div className="flex min-w-0 w-full flex-1 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-health-teal/10 text-health-teal"><ClipboardList className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase text-health-blue">Programme Report — {LOGFRAME_PROJECT.id}</p>
                <h3 className="text-2xl font-bold text-foreground">Programme Report</h3>
                <p className="mt-1 text-sm font-semibold text-health-teal">{LOGFRAME_PROJECT.name}</p>
                <p className="text-xs text-muted-foreground">{LOGFRAME_PROJECT.impact}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManage && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOfficersOpen(true)}>
                  <Users className="h-4 w-4" /> Programme Officers
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openHistory}>
                <History className="h-4 w-4" /> Report history ({reports.length})
              </Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Logframe indicators", value: indicators.length, icon: BarChart3, tone: "bg-health-blue/10 text-health-blue" },
              { label: "Filled this period", value: filledCount, icon: CheckCircle2, tone: "bg-health-teal/10 text-health-teal" },
              { label: "Auto-aggregated", value: autoCount, icon: Sparkles, tone: "bg-records-cyan/10 text-records-cyan" },
              { label: "Risks logged", value: riskCount, icon: AlertTriangle, tone: "bg-status-warning/10 text-status-warning" },
            ].map((s) => (
              <div key={s.label} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", s.tone)}><s.icon className="h-5 w-5" /></span>
                <div><p className="text-2xl font-bold tabular-nums text-foreground">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-border px-4 py-5 sm:px-6">
          <div>
            <Label htmlFor="programme-report-period" className="text-sm font-medium">Reporting period</Label>
            <Input id="programme-report-period" value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-2 h-[52px] w-full sm:w-52" placeholder="e.g. October 2026" />
          </div>
          <div>
            <Label htmlFor="programme-report-year" className="text-sm font-medium">Programme year</Label>
            <Select value={reportYear} onValueChange={setReportYear}>
              <SelectTrigger id="programme-report-year" className="mt-2 h-[52px] w-36"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[1200] bg-popover">
                {["1", "2", "3", "4"].map((y) => <SelectItem key={y} value={y}>Year {y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void runAggregation()} disabled={autoLoading}>
            {autoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-aggregate from records
          </Button>
          <Button size="sm" className="gap-1.5" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save report
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="absolute left-3 top-4 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Search report indicators" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search indicator or code…" className="h-[52px] pl-10" />
        </div>
        <Button variant="outline" className="min-h-[52px] gap-2" onClick={() => setExpanded(Object.fromEntries(LOGFRAME.flatMap((obj) => obj.results.map((res) => [res.key, true]))))}><ChevronsUpDown className="h-4 w-4" /> Expand all</Button>
        <Button variant="ghost" className="min-h-[52px] gap-2" onClick={() => setExpanded({})}><ChevronsDownUp className="h-4 w-4" /> Collapse all</Button>
      </div>

      {LOGFRAME.map((obj) => {
        const t = TONES[obj.tone];
        const matches = (ind: { code: string; title: string; indicator?: string }) => `${ind.code} ${ind.title} ${ind.indicator || ""}`.toLowerCase().includes(search.trim().toLowerCase());
        const results = obj.results.filter((res) => [...res.indicators, ...res.activities].some(matches));
        if (!results.length) return null;
        return (
          <section key={obj.key} className="space-y-4">
            <div className={cn("flex items-start gap-3 rounded-lg border-l-4 px-5 py-4", t.soft, t.border)}>
              <Target className="mt-1 h-6 w-6 shrink-0" /><div>
              <p className="text-[10px] font-bold uppercase">{obj.title}</p>
              <p className="mt-1 text-base font-semibold leading-relaxed">{obj.statement}</p>
              </div>
            </div>
            <div className="space-y-4">
              {results.map((res) => {
                const isOpen = search.trim() ? true : expanded[res.key] ?? false;
                const count = res.indicators.length + res.activities.length;
                return (
                  <div key={res.key} className="space-y-3">
                    <Button variant="ghost" aria-expanded={isOpen}
                      className="flex min-h-[52px] h-auto w-full items-center gap-3 whitespace-normal px-2 py-3 text-left"
                      onClick={() => setExpanded((p) => ({ ...p, [res.key]: !isOpen }))}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="flex-1 text-sm font-semibold text-health-ink">{res.title}</span>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">{[...res.indicators, ...res.activities].filter((ind) => drafts[ind.code]?.value.trim()).length}/{count}</span>
                    </Button>
                    {isOpen && (
                      <div className="space-y-4">
                        {res.indicators.filter(matches).map((ind) =>
                          renderIndicator(
                            { ...ind, objectiveKey: obj.key, objectiveTitle: obj.title, resultKey: res.key, resultTitle: res.title, kind: res.key.endsWith("outcome") ? "outcome" : "result" },
                            obj.tone,
                          ),
                        )}
                        {res.activities.filter(matches).map((act) =>
                          renderIndicator(
                            {
                              code: act.code, title: `${act.title} — ${act.indicator}`, mov: act.mov,
                              targets: act.targets, totalTarget: act.totalTarget, disaggregation: act.disaggregation,
                              autoKey: act.autoKey, isPercent: act.isPercent,
                              objectiveKey: obj.key, objectiveTitle: obj.title, resultKey: res.key, resultTitle: res.title, kind: "activity",
                            },
                            obj.tone,
                          ),
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="border-t border-border pt-5">
        <Label htmlFor="programme-report-notes" className="text-base font-semibold">Overall narrative notes for this period</Label>
        <Textarea id="programme-report-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-3 min-h-28" placeholder="Summary of progress, cross-cutting risks, and support needed…" />
        <div className="mt-3 flex justify-end">
          <Button className="gap-1.5" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save report
          </Button>
        </div>
      </section>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-health-blue" /> Programme report history</DialogTitle>
            <DialogDescription>Every saved report is kept — nothing is overwritten.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {reports.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No reports saved yet.</p>}
            {reports.map((r) => {
              const entries = historyEntries[r.id] || [];
              return (
                <div key={r.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-health-ink"><CalendarRange className="h-4 w-4 text-health-blue" />{r.period_label} <Badge variant="secondary" className="text-[10px]">Year {r.report_year}</Badge></p>
                      <p className="text-xs text-muted-foreground">Saved {new Date(r.created_at).toLocaleString()}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{entries.length} entries</Badge>
                  </div>
                  {r.notes && <p className="mt-1.5 text-xs text-muted-foreground">{r.notes}</p>}
                  {entries.length > 0 && (
                    <div className="mt-2 grid gap-1">
                      {entries.map((e) => (
                        <div key={e.indicator_code} className="flex items-center justify-between rounded-sm bg-muted/50 px-2 py-1 text-xs">
                          <span className="font-mono font-semibold">{e.indicator_code}</span>
                          <span className="font-semibold text-health-ink">{e.value ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={officersOpen} onOpenChange={setOfficersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-health-blue" /> Programme Officers</DialogTitle>
            <DialogDescription>Only designated Programme Officers (and the Owner / Super Admins) can see and fill the Programme Report Form.</DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Project users</p>
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border/60 p-2">
              {teamMembers.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">No project team members with user accounts yet.</p>}
              {teamMembers.map((m) => {
                const already = officers.some((o) => o.user_id === m.user_id);
                return (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-health-ink">{m.full_name || "Unnamed user"}</p>
                      {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                    </div>
                    {already ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-status-success"><CheckCircle2 className="h-3.5 w-3.5" /> Officer</span>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1" disabled={officerBusy} onClick={() => designateOfficer(m.user_id, m.full_name || m.email || "user")}>
                        <UserPlus className="h-3.5 w-3.5" /> Designate
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Add by email</p>
            <div className="flex gap-2">
              <Input value={officerEmail} onChange={(e) => setOfficerEmail(e.target.value)} placeholder="officer@example.org" type="email" />
              <Button onClick={addOfficer} disabled={officerBusy} className="gap-1.5">
                {officerBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
              </Button>
            </div>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {officers.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No Programme Officers designated yet.</p>}
            {officers.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-health-ink">{o.profiles?.full_name || "Unnamed user"}</p>
                  <p className="text-xs text-muted-foreground">{o.profiles?.email}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeOfficer(o.id)} aria-label="Remove officer"><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
          </div>
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProgrammeReportForm;
