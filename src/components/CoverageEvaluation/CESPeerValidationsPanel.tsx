import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle2, XCircle, AlertTriangle, Footprints, FileSearch,
  Loader2, ShieldCheck, ChevronDown, ChevronUp, User as UserIcon,
  Pencil, Save, X, History, TrendingUp, Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Scatter, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { toast } from "@/hooks/use-toast";

type Verdict = "confirmed" | "disputed" | "needs_resample";
type Mode = "revisit" | "desk_review";

export interface PeerValidationRow {
  id: string;
  survey_id: string;
  validator_id: string;
  mode: Mode;
  verdict: Verdict;
  households_revisited: number | null;
  households_agreed: number | null;
  agreement_pct: number | null;
  notes: string | null;
  created_at: string;
  validator_name?: string;
  validator_email?: string;
}

interface NoteAudit {
  id: string;
  validation_id: string;
  edited_by: string;
  previous_notes: string | null;
  new_notes: string | null;
  edited_at: string;
  editor_name?: string;
}

const verdictStyle: Record<Verdict, { label: string; cls: string; Icon: any; chartColor: string; ord: number }> = {
  confirmed:      { label: "Pass — confirmed",      cls: "bg-green-100 text-green-800 border-green-300", Icon: CheckCircle2,    chartColor: "hsl(142 70% 45%)", ord: 2 },
  disputed:       { label: "Fail — disputed",       cls: "bg-amber-100 text-amber-800 border-amber-300", Icon: AlertTriangle,   chartColor: "hsl(38 92% 50%)",  ord: 1 },
  needs_resample: { label: "Fail — needs resample", cls: "bg-red-100 text-red-800 border-red-300",       Icon: XCircle,         chartColor: "hsl(0 72% 51%)",   ord: 0 },
};

interface Props {
  surveyId: string;
  collapsible?: boolean;
  realtime?: boolean;
}

export default function CESPeerValidationsPanel({ surveyId, collapsible = true, realtime = true }: Props) {
  const [rows, setRows] = useState<PeerValidationRow[]>([]);
  const [audits, setAudits] = useState<Record<string, NoteAudit[]>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(!collapsible);
  const [me, setMe] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setMe(u.user?.id ?? null);

    const { data: pv } = await supabase
      .from("ces_peer_validations" as any)
      .select("*")
      .eq("survey_id", surveyId)
      .order("created_at", { ascending: false });
    const list = ((pv as any) ?? []) as PeerValidationRow[];

    const ids = Array.from(new Set(list.map(r => r.validator_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles" as any)
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      const map = new Map((profs as any[] ?? []).map(p => [p.user_id, p]));
      list.forEach(r => {
        const p: any = map.get(r.validator_id);
        if (p) {
          const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
          r.validator_name = name || p.email || r.validator_id.slice(0, 8);
          r.validator_email = p.email;
        }
      });
    }
    setRows(list);

    // Fetch note audits for all validations
    if (list.length) {
      const { data: aud } = await supabase
        .from("ces_peer_validation_note_audits" as any)
        .select("*")
        .in("validation_id", list.map(r => r.id))
        .order("edited_at", { ascending: false });
      const auditList = ((aud as any) ?? []) as NoteAudit[];
      // resolve editor names
      const editorIds = Array.from(new Set(auditList.map(a => a.edited_by)));
      if (editorIds.length) {
        const { data: ep } = await supabase
          .from("profiles" as any)
          .select("user_id, first_name, last_name, email")
          .in("user_id", editorIds);
        const epm = new Map((ep as any[] ?? []).map(p => [p.user_id, p]));
        auditList.forEach(a => {
          const p: any = epm.get(a.edited_by);
          if (p) a.editor_name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email;
        });
      }
      const grouped: Record<string, NoteAudit[]> = {};
      auditList.forEach(a => { (grouped[a.validation_id] ||= []).push(a); });
      setAudits(grouped);
    } else {
      setAudits({});
    }

    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [surveyId]);

  useEffect(() => {
    if (!realtime) return;
    const ch = supabase
      .channel(`pv-${surveyId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "ces_peer_validations", filter: `survey_id=eq.${surveyId}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "ces_peer_validation_note_audits" },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [surveyId, realtime]);

  const passes = rows.filter(r => r.verdict === "confirmed").length;
  const fails = rows.length - passes;
  const latest = rows[0]; // already sorted desc
  const needsResampleHighlight = latest && latest.verdict === "needs_resample";

  // Suggested next QC action
  const suggestion = useMemo(() => {
    if (!latest) return null;
    if (latest.verdict === "needs_resample") {
      const pct = latest.agreement_pct ?? 0;
      if (latest.mode === "revisit" && pct < 50) {
        return {
          title: "Resample required — interviewer mismatch is severe",
          body: "Field agreement fell below 50% on revisit. Recommend opening a new full CES survey for this community with a different surveyor and supervisor present, then re-enroll households for QC.",
          cta: "Open a fresh CES survey for this community",
        };
      }
      if (latest.mode === "desk_review") {
        return {
          title: "Desk review flagged structural issues",
          body: "Switch to physical revisit mode and visit at least 10% of sampled households to confirm the photographic and metadata gaps before resubmission.",
          cta: "Run a Revisit-mode validation now",
        };
      }
      return {
        title: "Resample at least one segment",
        body: "Identify the segments with the highest disagreement, request resampling from the original surveyor, and re-validate after corrections.",
        cta: "Request a segment resample",
      };
    }
    if (latest.verdict === "disputed") {
      return {
        title: "Disputed — collect more evidence",
        body: "Spot-check 2–3 disputed households via desk review or a short revisit, then reconcile. If patterns persist, escalate to needs_resample.",
        cta: "Run a quick desk review",
      };
    }
    return null;
  }, [latest]);

  // Chart data: oldest → newest
  const chartData = useMemo(() => {
    return [...rows].reverse().map((r, i) => ({
      idx: i + 1,
      ts: new Date(r.created_at).toLocaleDateString(),
      agreement_pct: r.agreement_pct ?? null,
      verdictOrd: verdictStyle[r.verdict].ord,
      verdict: r.verdict,
      mode: r.mode,
      validator: r.validator_name ?? r.validator_id.slice(0, 8),
    }));
  }, [rows]);

  const startEdit = (r: PeerValidationRow) => {
    setEditingId(r.id);
    setEditText(r.notes ?? "");
  };

  const saveEdit = async (r: PeerValidationRow) => {
    if (!me) return;
    const next = editText.trim();
    const prev = r.notes ?? "";
    if (next === prev) { setEditingId(null); return; }
    setSavingEdit(true);
    const { error: upErr } = await supabase
      .from("ces_peer_validations" as any)
      .update({ notes: next || null })
      .eq("id", r.id);
    if (upErr) {
      setSavingEdit(false);
      toast({ title: "Could not update notes", description: upErr.message, variant: "destructive" });
      return;
    }
    const { error: aErr } = await supabase
      .from("ces_peer_validation_note_audits" as any)
      .insert({
        validation_id: r.id,
        edited_by: me,
        previous_notes: prev || null,
        new_notes: next || null,
      });
    setSavingEdit(false);
    if (aErr) {
      toast({ title: "Notes updated, audit log failed", description: aErr.message, variant: "destructive" });
    } else {
      toast({ title: "Notes updated", description: "Edit recorded in audit trail." });
    }
    setEditingId(null);
    load();
  };

  return (
    <div className="border rounded-md bg-card">
      <div
        className={`flex items-center justify-between gap-2 p-2 ${collapsible ? "cursor-pointer hover:bg-muted/40" : ""}`}
        onClick={() => collapsible && setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-xs font-semibold">Peer validations</span>
          <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
          {rows.length > 0 && (
            <>
              <Badge className="bg-green-600 text-white text-[10px]">{passes} pass</Badge>
              {fails > 0 && <Badge variant="destructive" className="text-[10px]">{fails} fail</Badge>}
              {needsResampleHighlight && (
                <Badge variant="destructive" className="text-[10px] animate-pulse">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Latest: needs resample
                </Badge>
              )}
            </>
          )}
        </div>
        {collapsible && (open
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />)}
      </div>

      {open && (
        <div className="border-t">
          {loading && <div className="p-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>}
          {!loading && rows.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">No peer validations recorded yet for this survey.</p>
          )}

          {!loading && suggestion && (
            <div className="p-2">
              <Alert variant={needsResampleHighlight ? "destructive" : "default"}>
                <Sparkles className="h-4 w-4" />
                <AlertTitle className="text-xs">{suggestion.title}</AlertTitle>
                <AlertDescription className="text-[11px] space-y-1">
                  <p>{suggestion.body}</p>
                  <p className="font-semibold">Suggested next QC action: {suggestion.cta}</p>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {!loading && rows.length >= 2 && (
            <div className="p-2 border-t">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground mb-1">
                <TrendingUp className="h-3 w-3" /> Agreement % &amp; verdict over time
              </div>
              <div style={{ width: "100%", height: 160 }}>
                <ResponsiveContainer>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[-0.5, 2.5]} ticks={[0, 1, 2]}
                      tickFormatter={(v) => v === 2 ? "Pass" : v === 1 ? "Disp." : "Resmp."} tick={{ fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{ fontSize: 11, padding: 6 }}
                      formatter={(value: any, name: any) => {
                        if (name === "Agreement %") return [`${value}%`, name];
                        if (name === "Verdict") return [chartData.find(d => d.verdictOrd === value)?.verdict ?? value, name];
                        return [value, name];
                      }}
                      labelFormatter={(_, payload) => {
                        const p: any = payload?.[0]?.payload;
                        return p ? `#${p.idx} • ${p.ts} • ${p.validator}` : "";
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <ReferenceLine yAxisId="left" y={80} stroke="hsl(142 70% 45%)" strokeDasharray="3 3" />
                    <Line yAxisId="left" type="monotone" dataKey="agreement_pct" name="Agreement %" stroke="hsl(var(--primary))" strokeWidth={2} dot connectNulls />
                    <Scatter yAxisId="right" dataKey="verdictOrd" name="Verdict" fill="hsl(var(--primary))" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="divide-y border-t">
            {rows.map((r, i) => {
              const v = verdictStyle[r.verdict];
              const ModeIcon = r.mode === "revisit" ? Footprints : FileSearch;
              const isLatest = i === 0;
              const highlight = isLatest && r.verdict === "needs_resample";
              const isMine = me === r.validator_id;
              const isEditing = editingId === r.id;
              const myAudits = audits[r.id] ?? [];
              const showHist = showHistoryFor === r.id;
              return (
                <div
                  key={r.id}
                  className={`p-2.5 space-y-1.5 ${highlight ? "bg-red-50/70 dark:bg-red-950/20 border-l-4 border-red-500" : isLatest ? "bg-muted/30 border-l-4 border-primary" : ""}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {isLatest && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/40">Latest</Badge>}
                    <Badge variant="outline" className={`text-[10px] ${v.cls}`}>
                      <v.Icon className="h-3 w-3 mr-1" />{v.label}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      <ModeIcon className="h-3 w-3 mr-1" />{r.mode === "revisit" ? "Revisit" : "Desk review"}
                    </Badge>
                    {r.agreement_pct != null && (
                      <Badge variant="outline" className="text-[10px]">{r.agreement_pct}% agreement</Badge>
                    )}
                    {r.households_revisited != null && (
                      <span className="text-[10px] text-muted-foreground">
                        {r.households_agreed ?? 0}/{r.households_revisited} households
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1 min-w-0">
                      <UserIcon className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{r.validator_name || r.validator_id.slice(0, 8)}</span>
                    </div>
                    <span className="flex-shrink-0">{new Date(r.created_at).toLocaleString()}</span>
                  </div>

                  {isEditing ? (
                    <div className="space-y-1.5">
                      <Textarea value={editText} onChange={e => setEditText(e.target.value)} className="text-xs min-h-[70px]" placeholder="Reviewer notes…" />
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setEditingId(null)} disabled={savingEdit}>
                          <X className="h-3 w-3 mr-1" />Cancel
                        </Button>
                        <Button size="sm" className="h-7 text-[11px]" onClick={() => saveEdit(r)} disabled={savingEdit}>
                          {savingEdit ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                          Save &amp; record edit
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {r.notes && (
                        <p className="text-xs bg-muted/40 rounded px-2 py-1 whitespace-pre-wrap">{r.notes}</p>
                      )}
                      {(isMine || myAudits.length > 0) && (
                        <div className="flex items-center gap-2 text-[10px]">
                          {isMine && (
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => startEdit(r)}>
                              <Pencil className="h-3 w-3 mr-1" />{r.notes ? "Edit notes" : "Add notes"}
                            </Button>
                          )}
                          {myAudits.length > 0 && (
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => setShowHistoryFor(showHist ? null : r.id)}>
                              <History className="h-3 w-3 mr-1" />{myAudits.length} edit{myAudits.length === 1 ? "" : "s"}
                            </Button>
                          )}
                        </div>
                      )}
                      {showHist && myAudits.length > 0 && (
                        <div className="border rounded-md bg-background/60 p-1.5 space-y-1">
                          {myAudits.map(a => (
                            <div key={a.id} className="text-[10px] space-y-0.5">
                              <div className="flex justify-between text-muted-foreground">
                                <span>{a.editor_name || a.edited_by.slice(0, 8)}</span>
                                <span>{new Date(a.edited_at).toLocaleString()}</span>
                              </div>
                              <div className="grid sm:grid-cols-2 gap-1">
                                <div className="bg-red-50 dark:bg-red-950/20 rounded px-1.5 py-1 line-through text-muted-foreground">
                                  {a.previous_notes || <em>(empty)</em>}
                                </div>
                                <div className="bg-green-50 dark:bg-green-950/20 rounded px-1.5 py-1">
                                  {a.new_notes || <em>(empty)</em>}
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
            })}
          </div>
        </div>
      )}
    </div>
  );
}
