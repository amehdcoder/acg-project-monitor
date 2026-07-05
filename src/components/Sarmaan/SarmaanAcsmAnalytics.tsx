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
  MessageSquareText, BarChart3, Filter, X, ChevronDown, ChevronRight,
  MapPin, CalendarDays, Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import AccountabilityTable from "@/components/shared/AccountabilityTable";
import AdminSubmissionEditor from "@/components/AdminSubmissionEditor";
import type { ProfileLite } from "@/lib/accountability";
import { formatDay } from "@/lib/accountability";
import type { QuestionLabelMap } from "@/lib/formLabelUtils";
import {
  buildAcsmAccountability, computeAcsmStatistics, buildThematicDocs,
  localThematicAnalysis, buildSupervisorDrilldown, type LocalThematicResult,
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

/** One drill-down row: a supervisor's exact visit submission, expandable to
 *  reveal the free-text issues & corrective actions captured on the visit. */
function FragmentRow({
  row, isOpen, hasNarrative, canEdit, onToggle, onEdit,
}: {
  row: import("@/lib/sarmaan/acsmAnalytics").SupervisorVisitRow;
  isOpen: boolean;
  hasNarrative: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <>
      <tr className="border-t" style={{ borderColor: C.line }}>
        <td className="px-3 py-2">
          {hasNarrative ? (
            <button onClick={onToggle} className="inline-flex h-5 w-5 items-center justify-center rounded" style={{ color: C.sub }} title="Show narratives">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : null}
        </td>
        <td className="px-3 py-2">
          <div className="font-semibold" style={{ color: C.ink }}>{row.ward}</div>
          <div style={{ color: C.sub }}>{row.lga} · {row.state}</div>
        </td>
        <td className="px-3 py-2" style={{ color: C.sub }}>
          <CalendarDays className="mr-1 inline h-3 w-3" />{formatDay(row.date)}
        </td>
        <td className="px-3 py-2 text-center tabular-nums" style={{ color: C.ink }}>
          {row.teamsWentOut ?? "—"}/{row.teamsPlanned ?? "—"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums" style={{ color: C.ink }}>
          {row.deploymentRate != null ? `${row.deploymentRate}%` : "—"}
        </td>
        <td className="px-3 py-2 text-center">
          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: row.bandColor }}>
            {row.score}%
          </span>
        </td>
        {canEdit && (
          <td className="px-3 py-2 text-right">
            <button onClick={onEdit} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold" style={{ borderColor: C.line, color: C.blue }}>
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </td>
        )}
      </tr>
      {isOpen && hasNarrative && (
        <tr style={{ background: "#F8FAFC" }}>
          <td colSpan={canEdit ? 7 : 6} className="px-3 py-2">
            {row.issues && (
              <div className="mb-1.5">
                <span className="text-[10px] font-bold uppercase" style={{ color: C.red }}>Issues identified: </span>
                <span className="text-[11px]" style={{ color: C.ink }}>{row.issues}</span>
              </div>
            )}
            {row.corrective && (
              <div>
                <span className="text-[10px] font-bold uppercase" style={{ color: C.green }}>Corrective actions: </span>
                <span className="text-[11px]" style={{ color: C.ink }}>{row.corrective}</span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
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
  const drilldown = useMemo(() => buildSupervisorDrilldown(subs, maps, profiles), [subs, maps, profiles]);

  const [thematic, setThematic] = useState<LocalThematicResult | null>(null);
  const [thematizing, setThematizing] = useState(false);
  // Interactive accountability filter / drill-down state
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [editSub, setEditSub] = useState<AcsmSub | null>(null);

  const BAR_COLORS = [C.green, C.blue, C.purple, C.amber, "#0EA5A5"];
  const chartData = useMemo(
    () => accountability.slice(0, 12).map((u) => ({ uid: u.userId, name: u.name.split(" ")[0] || u.name, full: u.name, visits: u.visitCount, days: u.daysWorked })),
    [accountability],
  );
  const selected = selectedUid ? drilldown.get(selectedUid) || null : null;
  const toggleRow = (id: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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
        right={
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5" style={{ color: C.sub }} />
            <select
              value={selectedUid ?? ""}
              onChange={(e) => { setSelectedUid(e.target.value || null); setOpenRows(new Set()); }}
              className="rounded-lg border bg-white px-2 py-1.5 text-[11px] font-semibold outline-none"
              style={{ borderColor: C.line, color: C.ink }}
            >
              <option value="">All supervisors ({accountability.length})</option>
              {accountability.map((u) => (
                <option key={u.userId} value={u.userId}>{u.name} · {u.visitCount}</option>
              ))}
            </select>
          </div>
        }
      >
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: C.sub }}>No supervision submissions yet.</p>
        ) : (
          <>
            <p className="mb-2 text-[11px]" style={{ color: C.sub }}>
              Tap a bar (or use the filter) to drill into the exact visits behind a supervisor's metrics.
            </p>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.sub }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.sub }} />
                  <Tooltip
                    cursor={{ fill: "rgba(30,158,82,0.06)" }}
                    formatter={(v: number, n: string) => [v, n === "visits" ? "Visits reported" : "Days worked"]}
                    labelFormatter={(_l, p: any) => p?.[0]?.payload?.full || _l}
                    contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: C.line }}
                  />
                  <Bar
                    dataKey="visits"
                    radius={[6, 6, 0, 0]}
                    cursor="pointer"
                    onClick={(d: any) => {
                      const uid = d?.uid || d?.payload?.uid;
                      if (uid) { setSelectedUid((prev) => (prev === uid ? null : uid)); setOpenRows(new Set()); }
                    }}
                  >
                    {chartData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={BAR_COLORS[i % BAR_COLORS.length]}
                        fillOpacity={selectedUid && selectedUid !== d.uid ? 0.3 : 1}
                        stroke={selectedUid === d.uid ? C.ink : "none"}
                        strokeWidth={selectedUid === d.uid ? 2 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Drill-down: exact submissions behind the selected supervisor ── */}
            {selected && (
              <div className="mt-4 rounded-xl border p-4" style={{ borderColor: C.green, background: "#F4FBF6" }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold" style={{ color: C.greenDeep }}>{selected.name}</div>
                    {selected.email && <div className="text-[11px]" style={{ color: C.sub }}>{selected.email}</div>}
                    <div className="mt-1 flex flex-wrap gap-3 text-[11px] font-semibold" style={{ color: C.sub }}>
                      <span><MapPin className="mr-1 inline h-3 w-3" />{selected.visitCount} visit{selected.visitCount === 1 ? "" : "s"}</span>
                      <span>{selected.wards} ward{selected.wards === 1 ? "" : "s"}</span>
                      <span>Avg score <b style={{ color: C.ink }}>{selected.avgScore}%</b></span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedUid(null); setOpenRows(new Set()); }}
                    className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-[11px] font-semibold"
                    style={{ borderColor: C.line, color: C.sub }}
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </button>
                </div>

                <div className="overflow-x-auto rounded-lg border bg-white" style={{ borderColor: C.line }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left" style={{ background: "#F8FAFC", color: C.sub }}>
                        <th className="px-3 py-2 font-semibold w-8"></th>
                        <th className="px-3 py-2 font-semibold">Ward / LGA</th>
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 text-center font-semibold">Teams (out/plan)</th>
                        <th className="px-3 py-2 text-right font-semibold">Deployment</th>
                        <th className="px-3 py-2 text-center font-semibold">Score</th>
                        {canEdit && <th className="px-3 py-2 text-right font-semibold">Edit</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.rows.map((r) => {
                        const isOpen = openRows.has(r.id);
                        const hasNarrative = !!(r.issues || r.corrective);
                        return (
                          <FragmentRow
                            key={r.id}
                            row={r}
                            isOpen={isOpen}
                            hasNarrative={hasNarrative}
                            canEdit={canEdit}
                            onToggle={() => hasNarrative && toggleRow(r.id)}
                            onEdit={() => {
                              const sub = subs.find((s) => s.id === r.id);
                              if (sub) setEditSub(sub);
                            }}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Enhanced accountability summary: LGA worked, communities, wards, quality */}
            <div className="mt-4 overflow-x-auto rounded-xl border" style={{ borderColor: C.line }}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left" style={{ background: "#F1F5F9", color: C.sub }}>
                    <th className="px-3 py-2 font-bold">Supervisor</th>
                    <th className="px-3 py-2 font-bold">LGA(s) Worked</th>
                    <th className="px-3 py-2 text-center font-bold">Communities</th>
                    <th className="px-3 py-2 text-center font-bold">Wards</th>
                    <th className="px-3 py-2 text-center font-bold">Visits</th>
                    <th className="px-3 py-2 text-center font-bold">Overall Quality (MDA &amp; ACSM)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...drilldown.values()]
                    .sort((a, b) => b.visitCount - a.visitCount)
                    .map((u, i) => (
                      <tr key={u.userId} className="border-t" style={{ borderColor: C.line, background: i % 2 ? "#FBFDFC" : "#fff" }}>
                        <td className="px-3 py-2">
                          <div className="font-semibold" style={{ color: C.ink }}>{u.name}</div>
                          {u.email && <div className="text-[10px]" style={{ color: C.sub }}>{u.email}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {u.lgas.length ? u.lgas.map((l) => (
                              <span key={l} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                                style={{ background: `${C.green}14`, color: C.greenDeep }}>
                                <MapPin className="h-2.5 w-2.5" /> {l}
                              </span>
                            )) : <span style={{ color: C.sub }}>—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center font-bold tabular-nums" style={{ color: C.ink }}>{u.communities}</td>
                        <td className="px-3 py-2 text-center font-bold tabular-nums" style={{ color: C.ink }}>{u.wards}</td>
                        <td className="px-3 py-2 text-center font-bold tabular-nums" style={{ color: C.ink }}>{u.visitCount}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold text-white" style={{ background: u.qualityColor }}>
                            {u.avgScore}% · {u.qualityLabel.split(" ")[0]}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <AccountabilityTable users={accountability} unitLabel="Ward" unitLabelPlural="Wards" accent={C.green} />
            </div>
          </>
        )}
      </Panel>

      {/* ── Single-submission editor modal (drill-down edit) ── */}
      {canEdit && editSub && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onClick={() => setEditSub(null)}>
          <div className="w-full max-w-3xl rounded-xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold" style={{ color: C.ink }}>Edit visit submission</div>
              <button onClick={() => setEditSub(null)} className="rounded-lg border p-1.5" style={{ borderColor: C.line, color: C.sub }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <AdminSubmissionEditor
              submissions={[{
                id: editSub.id,
                data: editSub.data || {},
                submitter: profiles.get(editSub.user_id || "")?.name || readStr(editSub, ACSM_FIELD.supervisorName, maps) || null,
                submittedAt: editSub.created_at,
                state: readStr(editSub, ACSM_FIELD.state, maps),
                lga: readStr(editSub, ACSM_FIELD.lga, maps),
                ward: readStr(editSub, ACSM_FIELD.ward, maps),
              }]}
              questionLabels={questionLabels}
              table="form_submissions"
              dataColumn="data"
              title="ACSM & MDA Supervision — edit visit"
              onChanged={async () => { await onChanged(); }}
            />
          </div>
        </div>
      )}

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
