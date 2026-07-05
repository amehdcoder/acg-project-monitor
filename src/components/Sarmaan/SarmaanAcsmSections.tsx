// SARMAAN ACSM & MDA Supervision Dashboard — section deep-dive views.
// ---------------------------------------------------------------------------
// Renders, per checklist section, the response distribution of every question
// broken down BY LGA, plus the requested community listings and statistical
// analyses. All computed in-browser from the live submissions.

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend as RLegend, Cell,
} from "recharts";
import {
  ShieldAlert, Megaphone, Pill, HeartPulse, ClipboardCheck, Users2, Activity, ListChecks,
} from "lucide-react";
import type { AcsmSub, NameToId } from "@/lib/sarmaan/acsmDashboardData";
import {
  buildQuestionByLga, buildAwarenessCoverage, buildAdverseStats,
  buildRefusalCommunities, buildAdverseCommunities, buildSummaryActions,
  IEC_QUESTIONS, MOBILIZATION_QUESTIONS, DRUG_QUESTIONS, ELIGIBILITY_QUESTIONS,
  DOCUMENTATION_QUESTIONS, type CommunityRow, type ActionRow,
} from "@/lib/sarmaan/acsmSectionAnalytics";

const C = {
  green: "#1E9E52", greenDeep: "#0E7A3B", amber: "#F59E0B", red: "#DC2626",
  blue: "#2563EB", purple: "#7C3AED", teal: "#0EA5A5", ink: "#1E293B", sub: "#64748B", line: "#E5E9EF",
};
const YN_COLORS = { Yes: C.green, No: C.red, Partly: C.amber, "N/A": "#CBD5E1" } as const;

function Panel({ title, icon, children, right, accent = C.green }: {
  title: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: C.line }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: C.line }}>
        <div className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide" style={{ color: accent }}>
          {icon} {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/* One small stacked bar chart for a single question, split by LGA. */
function QuestionChart({ q }: { q: ReturnType<typeof buildQuestionByLga>[number] }) {
  const has = q.data.length > 0;
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: C.line, background: "#FBFDFC" }}>
      <div className="mb-2 text-[12px] font-bold leading-snug" style={{ color: C.ink }}>{q.label}</div>
      {!has ? (
        <p className="py-8 text-center text-[11px]" style={{ color: C.sub }}>No responses yet.</p>
      ) : (
        <div style={{ height: Math.max(150, q.data.length * 34 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={q.data} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: C.sub }} allowDecimals={false} />
              <YAxis type="category" dataKey="lga" width={78} tick={{ fontSize: 10, fill: C.ink }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: C.line }} />
              <RLegend wrapperStyle={{ fontSize: 10 }} />
              {(["Yes", "No", "Partly", "N/A"] as const).map((k) => (
                <Bar key={k} dataKey={k} stackId="a" fill={YN_COLORS[k]} radius={k === "N/A" ? [0, 4, 4, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function QuestionSection({ title, icon, subs, maps, items, accent }: {
  title: string; icon: React.ReactNode; subs: AcsmSub[]; maps: Record<string, NameToId>;
  items: typeof IEC_QUESTIONS; accent: string;
}) {
  const charts = useMemo(() => buildQuestionByLga(subs, maps, items), [subs, maps, items]);
  return (
    <Panel title={title} icon={icon} accent={accent}
      right={<span className="text-[11px] font-semibold" style={{ color: C.sub }}>Responses by LGA</span>}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {charts.map((q) => <QuestionChart key={q.name} q={q} />)}
      </div>
    </Panel>
  );
}

/* Reusable community listing table with the standard location columns. */
function CommunityTable({ rows, extraCols, empty }: {
  rows: CommunityRow[]; extraCols: { key: string; label: string; render?: (r: CommunityRow) => React.ReactNode }[]; empty: string;
}) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm" style={{ color: C.sub }}>{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: C.line }}>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left" style={{ background: "#F1F5F9", color: C.sub }}>
            <th className="px-3 py-2 font-bold">LGA</th>
            <th className="px-3 py-2 font-bold">Ward</th>
            <th className="px-3 py-2 font-bold">Ward Apex Facility</th>
            <th className="px-3 py-2 font-bold">Community</th>
            <th className="px-3 py-2 font-bold">Team Code</th>
            {extraCols.map((c) => <th key={c.key} className="px-3 py-2 font-bold">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t" style={{ borderColor: C.line, background: i % 2 ? "#FBFDFC" : "#fff" }}>
              <td className="px-3 py-2 font-semibold" style={{ color: C.ink }}>{r.lga}</td>
              <td className="px-3 py-2" style={{ color: C.ink }}>{r.ward}</td>
              <td className="px-3 py-2" style={{ color: C.sub }}>{r.apex}</td>
              <td className="px-3 py-2" style={{ color: C.ink }}>{r.community}</td>
              <td className="px-3 py-2" style={{ color: C.sub }}>{r.team}</td>
              {extraCols.map((c) => (
                <td key={c.key} className="px-3 py-2 align-top" style={{ color: C.ink }}>
                  {c.render ? c.render(r) : String((r as any).extra?.[c.key] ?? (r as any)[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  subs: AcsmSub[];
  maps: Record<string, NameToId>;
}

export default function SarmaanAcsmSections({ subs, maps }: Props) {
  const awareness = useMemo(() => buildAwarenessCoverage(subs, maps), [subs, maps]);
  const adverse = useMemo(() => buildAdverseStats(subs, maps), [subs, maps]);
  const refusalRows = useMemo(() => buildRefusalCommunities(subs, maps), [subs, maps]);
  const adverseRows = useMemo(() => buildAdverseCommunities(subs, maps), [subs, maps]);
  const actionRows = useMemo<ActionRow[]>(() => buildSummaryActions(subs, maps), [subs, maps]);

  return (
    <div className="space-y-5">
      {/* Communities with refusals */}
      <Panel title="Communities with Refusals / Hesitancy" accent={C.red}
        icon={<ShieldAlert className="h-4 w-4" style={{ color: C.red }} />}
        right={<span className="text-[11px] font-semibold" style={{ color: C.sub }}>{refusalRows.length} communit{refusalRows.length === 1 ? "y" : "ies"}</span>}>
        <CommunityTable rows={refusalRows}
          extraCols={[
            { key: "Refusals", label: "Refusals / Gaps" },
            { key: "Sample", label: "Sample" },
          ]}
          empty="No refusals or awareness gaps detected in the caregiver samples." />
      </Panel>

      {/* B. IEC Materials & Visibility */}
      <QuestionSection title="IEC Materials & Visibility" accent={C.green}
        icon={<ListChecks className="h-4 w-4" style={{ color: C.green }} />}
        subs={subs} maps={maps} items={IEC_QUESTIONS} />

      {/* C. Town Announcers & Mobilization */}
      <QuestionSection title="Town Announcers & Mobilization" accent={C.amber}
        icon={<Megaphone className="h-4 w-4" style={{ color: C.amber }} />}
        subs={subs} maps={maps} items={MOBILIZATION_QUESTIONS} />

      {/* D. Community Awareness Validation — coverage statistics by LGA */}
      <Panel title="Community Awareness Validation — Coverage by LGA" accent={C.purple}
        icon={<Users2 className="h-4 w-4" style={{ color: C.purple }} />}
        right={<span className="text-[11px] font-semibold" style={{ color: C.sub }}>n = {awareness.overall.sample} caregivers</span>}>
        {awareness.byLga.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: C.sub }}>No awareness validation responses yet.</p>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
            <div style={{ height: Math.max(220, awareness.byLga.length * 46 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={awareness.byLga} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: C.sub }} unit="%" />
                  <YAxis type="category" dataKey="lga" width={90} tick={{ fontSize: 11, fill: C.ink }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: C.line }}
                    formatter={(v: number, n: string) => [`${v}%`, n]} />
                  <RLegend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="awarePct" name="Fully aware" fill={C.green} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="agePct" name="Knows age" fill={C.blue} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="freePct" name="Knows free" fill={C.purple} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: C.line }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left" style={{ background: "#F1F5F9", color: C.sub }}>
                    <th className="px-2 py-2 font-bold">LGA</th>
                    <th className="px-2 py-2 text-center font-bold">Sample</th>
                    <th className="px-2 py-2 text-center font-bold">Aware %</th>
                    <th className="px-2 py-2 text-center font-bold">95% CI</th>
                    <th className="px-2 py-2 text-center font-bold">Age %</th>
                    <th className="px-2 py-2 text-center font-bold">Free %</th>
                  </tr>
                </thead>
                <tbody>
                  {awareness.byLga.map((r, i) => (
                    <tr key={r.lga} className="border-t" style={{ borderColor: C.line, background: i % 2 ? "#FBFDFC" : "#fff" }}>
                      <td className="px-2 py-1.5 font-semibold" style={{ color: C.ink }}>{r.lga}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{r.sample}</td>
                      <td className="px-2 py-1.5 text-center font-bold tabular-nums" style={{ color: r.awarePct >= 80 ? C.green : r.awarePct >= 50 ? C.amber : C.red }}>{r.awarePct}%</td>
                      <td className="px-2 py-1.5 text-center tabular-nums" style={{ color: C.sub }}>{r.ciLow}–{r.ciHigh}%</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{r.agePct}%</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{r.freePct}%</td>
                    </tr>
                  ))}
                  <tr className="border-t-2" style={{ borderColor: C.purple, background: "#FAF5FF" }}>
                    <td className="px-2 py-2 font-extrabold" style={{ color: C.purple }}>Overall</td>
                    <td className="px-2 py-2 text-center font-bold tabular-nums">{awareness.overall.sample}</td>
                    <td className="px-2 py-2 text-center font-extrabold tabular-nums" style={{ color: C.purple }}>{awareness.overall.awarePct}%</td>
                    <td className="px-2 py-2 text-center tabular-nums" style={{ color: C.sub }}>{awareness.overall.ciLow}–{awareness.overall.ciHigh}%</td>
                    <td className="px-2 py-2 text-center font-bold tabular-nums">{awareness.overall.agePct}%</td>
                    <td className="px-2 py-2 text-center font-bold tabular-nums">{awareness.overall.freePct}%</td>
                  </tr>
                </tbody>
              </table>
              <p className="px-3 py-2 text-[10px] leading-relaxed" style={{ color: C.sub }}>
                Awareness % = caregivers who heard of the campaign AND know both the eligible age and that the medicine is free. 95% CI is the Wald confidence interval for that proportion; wider intervals indicate smaller samples.
              </p>
            </div>
          </div>
        )}
      </Panel>

      {/* E. Drug Management & Administration */}
      <QuestionSection title="Drug Management & Administration" accent={C.teal}
        icon={<Pill className="h-4 w-4" style={{ color: C.teal }} />}
        subs={subs} maps={maps} items={DRUG_QUESTIONS} />

      {/* F. Eligibility & Safety */}
      <QuestionSection title="Eligibility & Safety" accent={C.blue}
        icon={<HeartPulse className="h-4 w-4" style={{ color: C.blue }} />}
        subs={subs} maps={maps} items={ELIGIBILITY_QUESTIONS} />

      {/* Adverse events statistics */}
      <Panel title="Adverse Events — Observed vs Referred" accent={C.red}
        icon={<Activity className="h-4 w-4" style={{ color: C.red }} />}>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total observed", value: `${adverse.totalObserved}`, color: C.red },
            { label: "Referred to facility", value: `${adverse.totalReferred}`, color: C.blue },
            { label: "Referral rate", value: `${adverse.referralPct}%`, color: adverse.referralPct >= 90 ? C.green : C.amber },
            { label: "Visits with AE", value: `${adverse.visitsWithObserved}/${adverse.visits}`, color: C.purple },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border p-3 text-center" style={{ borderColor: C.line, background: "#FBFDFC" }}>
              <div className="text-2xl font-extrabold tabular-nums" style={{ color: s.color }}>{s.value}</div>
              <div className="mt-1 text-[11px] font-semibold" style={{ color: C.sub }}>{s.label}</div>
            </div>
          ))}
        </div>
        {adverse.byLga.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: C.sub }}>No adverse events recorded yet.</p>
        ) : (
          <div style={{ height: Math.max(200, adverse.byLga.length * 44 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={adverse.byLga} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="lga" tick={{ fontSize: 10, fill: C.ink }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: C.sub }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: C.line }} />
                <RLegend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="observed" name="Observed" fill={C.red} radius={[4, 4, 0, 0]} />
                <Bar dataKey="referred" name="Referred" fill={C.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: C.sub }}>
          Mean of {adverse.meanPerVisit} adverse event(s) per supervised visit. A referral rate at or above 90% indicates strong safety follow-up; gaps warrant CDD re-training on referral protocols.
        </p>
      </Panel>

      {/* Communities where adverse events were observed */}
      <Panel title="Communities with Adverse Events Observed" accent={C.red}
        icon={<HeartPulse className="h-4 w-4" style={{ color: C.red }} />}
        right={<span className="text-[11px] font-semibold" style={{ color: C.sub }}>{adverseRows.length} communit{adverseRows.length === 1 ? "y" : "ies"}</span>}>
        <CommunityTable rows={adverseRows}
          extraCols={[
            { key: "Observed", label: "AE Observed" },
            { key: "Referred", label: "Referred" },
          ]}
          empty="No communities reported adverse events." />
      </Panel>

      {/* G. Documentation & House Marking */}
      <QuestionSection title="Documentation & House Marking" accent={C.greenDeep}
        icon={<ClipboardCheck className="h-4 w-4" style={{ color: C.greenDeep }} />}
        subs={subs} maps={maps} items={DOCUMENTATION_QUESTIONS} />

      {/* H. Summary & Corrective Actions */}
      <Panel title="Summary & Corrective Actions" accent={C.blue}
        icon={<ListChecks className="h-4 w-4" style={{ color: C.blue }} />}
        right={<span className="text-[11px] font-semibold" style={{ color: C.sub }}>{actionRows.length} record{actionRows.length === 1 ? "" : "s"}</span>}>
        <CommunityTable rows={actionRows}
          extraCols={[
            { key: "issues", label: "Issues Identified", render: (r) => <span className="text-[11px]">{(r as ActionRow).issues}</span> },
            { key: "corrective", label: "Corrective Actions", render: (r) => <span className="text-[11px]">{(r as ActionRow).corrective}</span> },
            { key: "responsible", label: "Responsible", render: (r) => <span className="text-[11px]">{(r as ActionRow).responsible}</span> },
            { key: "deadline", label: "Deadline", render: (r) => <span className="text-[11px]">{(r as ActionRow).deadline}</span> },
          ]}
          empty="No issues or corrective actions recorded yet." />
      </Panel>
    </div>
  );
}
