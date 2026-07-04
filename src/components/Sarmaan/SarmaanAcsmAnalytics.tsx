// SARMAAN ACSM & MDA Supervision Dashboard — Accountability, Statistical &
// Thematic analysis section. Rendered at the foot of SarmaanAcsmDashboard.
//
// - Supervisor Accountability: per-supervisor productivity chart + drill-down
//   table (mirrors the Integrated MDA Supervisory dashboard).
// - Statistical Analysis: descriptive stats for numeric fields, categorical
//   frequency tables and correlations — all computed in-browser, realtime.
// - Thematic Analysis: AI thematic analysis of free-text checklist fields with
//   a robust local fallback when the AI gateway is unavailable.
// - Admin submission editor (owners): full-field editing of every submission.

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import {
  Users, Sigma, Sparkles, Loader2, Quote, TrendingUp, TrendingDown, Minus,
  MessageSquareText, BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import AccountabilityTable from "@/components/shared/AccountabilityTable";
import AdminSubmissionEditor from "@/components/AdminSubmissionEditor";
import type { ProfileLite } from "@/lib/accountability";
import type { QuestionLabelMap } from "@/lib/formLabelUtils";
import {
  buildAcsmAccountability, computeAcsmStatistics, buildThematicDocs,
  localThematicAnalysis, type LocalThematicResult,
} from "@/lib/sarmaan/acsmAnalytics";
import { readStr } from "@/lib/sarmaan/acsmDashboardData";
import type { AcsmSub, NameToId } from "@/lib/sarmaan/acsmDashboardData";
import { ACSM_FIELD } from "@/lib/sarmaan/acsmChecklist";

const C = {
  green: "#1E9E52", greenDeep: "#0E7A3B", amber: "#F59E0B", red: "#DC2626",
  blue: "#2563EB", purple: "#7C3AED", ink: "#1E293B", sub: "#64748B", line: "#E5E9EF",
};

const SENT_META = {
  positive: { color: C.green, Icon: TrendingUp, label: "Positive" },
  negative: { color: C.red, Icon: TrendingDown, label: "Negative" },
  neutral: { color: C.sub, Icon: Minus, label: "Neutral" },
  mixed: { color: C.amber, Icon: Minus, label: "Mixed" },
} as const;

function Panel({ title, icon, children, right }: { title: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: C.line }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: C.ink }}>
          {icon} {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

interface Props {
  subs: AcsmSub[];
  maps: Record<string, NameToId>;
  profiles: Map<string, ProfileLite>;
  form: { id: string; name: string; questions: unknown };
  canEdit: boolean;
  questionLabels: QuestionLabelMap;
  onChanged: () => void | Promise<void>;
}

export default function SarmaanAcsmAnalytics({ subs, maps, profiles, form, canEdit, questionLabels, onChanged }: Props) {
  const accountability = useMemo(() => buildAcsmAccountability(subs, maps, profiles), [subs, maps, profiles]);
  const stats = useMemo(() => computeAcsmStatistics(subs, maps), [subs, maps]);
  const thematicDocs = useMemo(() => buildThematicDocs(subs, maps), [subs, maps]);

  const [thematic, setThematic] = useState<LocalThematicResult | null>(null);
  const [thematizing, setThematizing] = useState(false);

  const chartData = useMemo(
    () => accountability.slice(0, 12).map((u) => ({ name: u.name.split(" ")[0] || u.name, full: u.name, visits: u.visitCount, days: u.daysWorked })),
    [accountability],
  );

  const runThematic = async () => {
    if (thematicDocs.length === 0) {
      toast({ title: "No narratives yet", description: "Thematic analysis needs free-text answers (issues, corrective actions, reasons).", variant: "destructive" });
      return;
    }
    setThematizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("thematic-analysis", {
        body: { documents: thematicDocs, focus: "SARMAAN ACSM & MDA supervision field challenges, refusals, dosing and documentation" },
      });
      if (error || data?.fallback || data?.error || !data?.themes) {
        setThematic(localThematicAnalysis(thematicDocs));
        toast({ title: "Thematic analysis ready", description: "AI engine unavailable — showing robust local analysis." });
      } else {
        setThematic({ ...data, local: false } as any);
        toast({ title: "AI Thematic Analysis complete", description: `${(data.themes || []).length} themes across ${thematicDocs.length} narratives.` });
      }
    } catch {
      setThematic(localThematicAnalysis(thematicDocs));
      toast({ title: "Thematic analysis ready", description: "Showing local analysis." });
    } finally {
      setThematizing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Supervisor Accountability ── */}
      <Panel
        title="Supervisor Accountability"
        icon={<Users className="h-4 w-4" style={{ color: C.green }} />}
        right={<span className="text-[11px] font-semibold" style={{ color: C.sub }}>{accountability.length} supervisor{accountability.length === 1 ? "" : "s"} · {subs.length} visit{subs.length === 1 ? "" : "s"}</span>}
      >
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: C.sub }}>No supervision submissions yet.</p>
        ) : (
          <>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.sub }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.sub }} />
                  <Tooltip
                    formatter={(v: number, n: string) => [v, n === "visits" ? "Visits reported" : "Days worked"]}
                    labelFormatter={(_l, p: any) => p?.[0]?.payload?.full || _l}
                    contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: C.line }}
                  />
                  <Bar dataKey="visits" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={[C.green, C.blue, C.purple, C.amber, "#0EA5A5"][i % 5]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4">
              <AccountabilityTable users={accountability} unitLabel="Ward" unitLabelPlural="Wards" accent={C.green} />
            </div>
          </>
        )}
      </Panel>

      {/* ── Statistical Analysis ── */}
      <Panel title="Statistical Analysis" icon={<Sigma className="h-4 w-4" style={{ color: C.blue }} />}
        right={<span className="text-[11px] font-semibold" style={{ color: C.sub }}>n = {stats.sampleSize} submissions</span>}>
        {stats.sampleSize === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: C.sub }}>No data to analyse yet.</p>
        ) : (
          <div className="space-y-5">
            {/* Numeric descriptives */}
            {stats.numeric.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold" style={{ color: C.ink }}>
                  <BarChart3 className="h-3.5 w-3.5" style={{ color: C.blue }} /> Descriptive Statistics
                </div>
                <div className="overflow-x-auto rounded-lg border" style={{ borderColor: C.line }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left" style={{ background: "#F8FAFC", color: C.sub }}>
                        <th className="px-3 py-2 font-semibold">Field</th>
                        {["n", "Mean", "Median", "Std Dev", "Min", "Max", "Sum"].map((h) => (
                          <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.numeric.map((s) => (
                        <tr key={s.key} className="border-t" style={{ borderColor: C.line }}>
                          <td className="px-3 py-2 font-semibold" style={{ color: C.ink }}>{s.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.n}</td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: C.ink }}>{s.mean}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.median}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.sd}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.min}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.max}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.sum}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Correlations */}
            {stats.correlations.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-bold" style={{ color: C.ink }}>Correlations (Pearson r)</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {stats.correlations.map((c, i) => {
                    const col = Math.abs(c.r) >= 0.7 ? C.green : Math.abs(c.r) >= 0.4 ? C.amber : C.sub;
                    return (
                      <div key={i} className="rounded-lg border p-3" style={{ borderColor: C.line }}>
                        <div className="text-[10px]" style={{ color: C.sub }}>{c.a} ↔ {c.b}</div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-xl font-extrabold" style={{ color: col }}>{c.r}</span>
                          <span className="text-[10px] font-semibold" style={{ color: col }}>{c.strength}</span>
                        </div>
                        <div className="text-[10px]" style={{ color: C.sub }}>n = {c.n} paired</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Categorical frequencies */}
            {stats.categorical.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-bold" style={{ color: C.ink }}>Frequency Distributions</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {stats.categorical.map((cat) => (
                    <div key={cat.key} className="rounded-lg border p-3" style={{ borderColor: C.line }}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-bold" style={{ color: C.ink }}>{cat.label}</span>
                        <span className="text-[10px]" style={{ color: C.sub }}>n = {cat.n}</span>
                      </div>
                      <div className="space-y-1.5">
                        {cat.entries.slice(0, 6).map((e, i) => (
                          <div key={e.name} className="flex items-center gap-2 text-[11px]">
                            <span className="w-28 shrink-0 truncate" style={{ color: C.ink }}>{e.name}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "#EEF2F6" }}>
                              <div className="h-full rounded-full" style={{ width: `${e.pct}%`, background: [C.blue, C.green, C.purple, C.amber, C.red, C.sub][i % 6] }} />
                            </div>
                            <span className="w-14 text-right font-bold tabular-nums" style={{ color: C.ink }}>{e.count} ({e.pct}%)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* ── Thematic Analysis ── */}
      <Panel title="Thematic Analysis" icon={<MessageSquareText className="h-4 w-4" style={{ color: C.purple }} />}
        right={
          <button onClick={runThematic} disabled={thematizing}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${C.purple}, ${C.blue})` }}>
            {thematizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {thematizing ? "Analysing…" : thematic ? "Re-run analysis" : "Run thematic analysis"}
          </button>
        }>
        {!thematic ? (
          <p className="py-6 text-center text-sm" style={{ color: C.sub }}>
            {thematicDocs.length > 0
              ? `${thematicDocs.length} narrative field entr${thematicDocs.length === 1 ? "y" : "ies"} ready — run the analysis to surface recurring themes, sentiment and recommendations.`
              : "No free-text answers captured yet (issues identified, corrective actions, reasons)."}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border p-3" style={{ borderColor: C.line, background: "#FBFAFF" }}>
              <p className="text-[12px] leading-relaxed" style={{ color: C.ink }}>{thematic.overview}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {(["positive", "neutral", "negative"] as const).map((k) => (
                  <div key={k} className="flex items-center gap-1.5 text-[11px]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: SENT_META[k].color }} />
                    <span className="font-semibold capitalize" style={{ color: C.ink }}>{k}</span>
                    <span className="font-bold" style={{ color: SENT_META[k].color }}>{thematic.sentiment[k]}%</span>
                  </div>
                ))}
                {thematic.local && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold" style={{ color: C.sub }}>Local engine</span>}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {thematic.themes.map((t, i) => {
                const meta = SENT_META[t.sentiment] || SENT_META.neutral;
                return (
                  <div key={i} className="rounded-lg border p-3" style={{ borderColor: C.line }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold" style={{ color: C.ink }}>{t.name}</span>
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${meta.color}1a`, color: meta.color }}>
                        <meta.Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px]" style={{ color: C.sub }}>{t.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(t.keywords || []).map((k) => (
                        <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium" style={{ color: C.sub }}>{k}</span>
                      ))}
                    </div>
                    {(t.quotes || []).slice(0, 2).map((q, qi) => (
                      <div key={qi} className="mt-2 flex gap-1.5 rounded-md bg-slate-50 p-2 text-[10px] italic" style={{ color: C.ink }}>
                        <Quote className="h-3 w-3 shrink-0" style={{ color: meta.color }} /> {q}
                      </div>
                    ))}
                    <div className="mt-2 text-[10px] font-semibold" style={{ color: C.sub }}>Appears in {t.prevalence} narrative{t.prevalence === 1 ? "" : "s"}</div>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {thematic.insights?.length > 0 && (
                <div className="rounded-lg border p-3" style={{ borderColor: C.line }}>
                  <div className="mb-2 text-xs font-bold" style={{ color: C.ink }}>Key Insights</div>
                  <ul className="space-y-1.5">
                    {thematic.insights.map((x, i) => <li key={i} className="flex gap-1.5 text-[11px]" style={{ color: C.ink }}><TrendingUp className="mt-0.5 h-3 w-3 shrink-0" style={{ color: C.blue }} />{x}</li>)}
                  </ul>
                </div>
              )}
              {thematic.recommendations?.length > 0 && (
                <div className="rounded-lg border p-3" style={{ borderColor: C.line }}>
                  <div className="mb-2 text-xs font-bold" style={{ color: C.ink }}>Recommendations</div>
                  <ul className="space-y-1.5">
                    {thematic.recommendations.map((x, i) => <li key={i} className="flex gap-1.5 text-[11px]" style={{ color: C.ink }}><Sparkles className="mt-0.5 h-3 w-3 shrink-0" style={{ color: C.green }} />{x}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* ── Owner: full-field submission editor ── */}
      {canEdit && (
        <AdminSubmissionEditor
          submissions={subs.map((s) => ({
            id: s.id,
            data: s.data || {},
            submitter: profiles.get(s.user_id || "")?.name || readStr(s, ACSM_FIELD.supervisorName, maps) || null,
            submittedAt: s.created_at,
            state: readStr(s, ACSM_FIELD.state, maps),
            lga: readStr(s, ACSM_FIELD.lga, maps),
            ward: readStr(s, ACSM_FIELD.ward, maps),
          }))}
          questionLabels={questionLabels}
          table="form_submissions"
          dataColumn="data"
          title="ACSM & MDA Supervision — Owner submission editor"
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
